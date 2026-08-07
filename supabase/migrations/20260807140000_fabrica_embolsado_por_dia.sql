-- Fábrica: hora Argentina real, ventana hoy/ayer con guard en la base, y el
-- embolsado deja de ser hijo de una producción para pasar a ser un pool del
-- día (fecha × tamaño × sabor). Motivo completo en el plan de la sesión:
-- producción se corrige seguido al día siguiente, y la presentación
-- (1/2, 2, 5, 10 Kg) del congelado se decide después de juntar masa de
-- varios lotes — para entonces el lote de origen ya no es recuperable, así
-- que es imposible atribuir una presentación a una fila de
-- fabrica_producciones, que es justo lo que el esquema viejo exigía
-- (fabrica_embolsados.produccion_id NOT NULL).
--
-- Se reestructura fabrica_embolsados EN EL LUGAR, no con una tabla nueva,
-- porque fabrica_stock_terminado_mov.embolsado_id la referencia con
-- "on delete set null" — una tabla nueva dejaría todo el historial de
-- movimientos sin origen.

-- ─── 1. Hora Argentina + guard de fecha ────────────────────────────────────
-- El server de Vercel corre en UTC: entre las 21:00 y las 00:00 ART ya cree
-- que es el día siguiente. dia_fabrica() reemplaza a current_date en todo lo
-- que toca fabrica_producciones/fabrica_embolsados.
create or replace function public.dia_fabrica()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

alter table fabrica_producciones alter column fecha set default dia_fabrica();

-- Hasta esta migración las RPC aceptaban cualquier p_fecha con solo
-- tiene_acceso_fabrica(). Ahora que la ventana hoy/ayer se abre a propósito,
-- se cierra a hoy/ayer (admin sin restricción). Se COMPONE con
-- tiene_acceso_fabrica(), no lo reemplaza: ese helper ya exige
-- estado='activo' y rol in ('fabrica','admin'). El coalesce importa: en
-- PL/pgSQL "if null then" no ejecuta la rama, así que sin él un perfil sin
-- rol se saltearía la ventana en vez de ser rechazado.
create or replace function public.fabrica_puede_editar_fecha(p_fecha date)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(get_user_rol(), '') = 'admin'
      or (p_fecha is not null and p_fecha between dia_fabrica() - 1 and dia_fabrica());
$$;

-- ─── 2. Columnas nuevas de fabrica_embolsados ──────────────────────────────
alter table fabrica_embolsados
  add column if not exists fecha date,
  add column if not exists tamanio_id uuid references fabrica_tamanios(id),
  add column if not exists cargado_por uuid references profiles(id),
  add column if not exists updated_at timestamptz;

-- ─── 3. Backfill + consolidación ────────────────────────────────────────────
-- Todo en un solo do $$ que retorna temprano si produccion_id ya no existe,
-- así el archivo queda re-ejecutable: PL/pgSQL planea las sentencias de
-- forma perezosa, así que las que mencionan la columna borrada no se
-- parsean si el flujo no las alcanza.
do $$
declare
  v_col_exists boolean;
  r record;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fabrica_embolsados' and column_name = 'produccion_id'
  ) into v_col_exists;

  if not v_col_exists then
    return;
  end if;

  -- Heredar fecha/tamanio_id del padre vía produccion_id.
  update fabrica_embolsados e
    set fecha = p.fecha, tamanio_id = p.tamanio_id
    from fabrica_producciones p
    where p.id = e.produccion_id;

  -- Líneas cuyo padre era masa_locales (tamanio_id null): el CHECK de
  -- fabrica_producciones impide que ese padre tenga tamaño, pero no que
  -- tenga hijos de embolsado, y guardar_produccion_fabrica insertaba
  -- p_embolsados sin mirar p_destino. Nunca movieron stock — la resolución
  -- de producto exige tamanio_id = p_tamanio_id, y con null eso nunca es
  -- true — pero el loop de reversa es defensivo por si acaso. Debería
  -- iterar cero veces.
  for r in
    select id, producto_id, cantidad_kg from fabrica_embolsados
    where tamanio_id is null and producto_id is not null
  loop
    raise warning 'fabrica_embolsados % tenía producto_id % con tamanio_id null — revirtiendo stock antes de borrar', r.id, r.producto_id;
    perform mover_stock_terminado(r.producto_id, -r.cantidad_kg, 'produccion_embolsado', r.id, null);
  end loop;

  delete from fabrica_embolsados where tamanio_id is null;

  -- Consolidar por (fecha, tamanio_id, sabor_id, presentacion_id) sumando
  -- cantidad_kg. El sobreviviente se elige para que conserve un producto_id
  -- real si alguna fila del grupo lo tenía.
  for r in
    select fecha, tamanio_id, sabor_id, presentacion_id,
           sum(cantidad_kg) as total_kg,
           (array_agg(id order by (producto_id is null), id))[1] as id_sobreviviente,
           array_agg(id) as ids
    from fabrica_embolsados
    group by fecha, tamanio_id, sabor_id, presentacion_id
    having count(*) > 1
  loop
    -- Antes de borrar las perdedoras hay que re-apuntar sus movimientos al
    -- sobreviviente: dejarlas caer en embolsado_id = null preserva el
    -- asiento contable pero destruye la atribución al pool, y la reversa de
    -- guardar_embolsado_fabrica se calcula justamente sobre esa atribución.
    update fabrica_stock_terminado_mov
      set embolsado_id = r.id_sobreviviente
      where embolsado_id = any(r.ids) and embolsado_id <> r.id_sobreviviente;

    update fabrica_embolsados
      set cantidad_kg = r.total_kg
      where id = r.id_sobreviviente;

    delete from fabrica_embolsados
      where id = any(r.ids) and id <> r.id_sobreviviente;
  end loop;
end $$;

-- ─── 4. Esquema final de fabrica_embolsados ────────────────────────────────
alter table fabrica_embolsados drop column if exists produccion_id;
alter table fabrica_embolsados alter column fecha set not null;
alter table fabrica_embolsados alter column tamanio_id set not null;

-- Arranca por fecha, así que ya cubre los filtros por día del reporte y del
-- módulo de embolsado — no hace falta índice extra.
create unique index if not exists idx_fabrica_embolsados_pool
  on fabrica_embolsados (fecha, tamanio_id, sabor_id, presentacion_id);

-- Sin esto, la reversa de guardar_embolsado_fabrica hace un seq scan del
-- historial completo de movimientos en cada guardado.
create index if not exists idx_fabrica_stock_terminado_mov_embolsado_id
  on fabrica_stock_terminado_mov (embolsado_id) where embolsado_id is not null;

-- ─── 5. guardar_produccion_fabrica sin p_embolsados (8 args) ───────────────
-- El drop es obligatorio, no cosmético: create or replace solo reemplaza si
-- la lista de tipos es idéntica, así que 9→8 args crearía una SOBRECARGA y
-- dejaría viva la de 9 — y PostgREST resuelve por nombre de parámetro, así
-- que un bundle viejo cacheado seguiría pegándole a la de 9 args, que
-- insertaría en una columna que ya no existe. Bug intermitente, no error de
-- deploy.
drop function if exists public.guardar_produccion_fabrica(uuid, date, text, uuid, text, numeric, numeric, uuid, jsonb);

create or replace function public.guardar_produccion_fabrica(
  p_id uuid,
  p_fecha date,
  p_turno text,
  p_sabor_id uuid,
  p_destino text,
  p_fecula_kg numeric,
  p_masa_kg numeric,
  p_tamanio_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_fecha_actual date;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  -- Red de seguridad: un bundle viejo cacheado que todavía calcule la fecha
  -- en UTC no se come un rechazo por eso — cae al día de hoy en ART.
  p_fecha := coalesce(p_fecha, dia_fabrica());

  if not fabrica_puede_editar_fecha(p_fecha) then
    raise exception 'Solo se puede cargar producción de hoy o de ayer';
  end if;

  if p_id is null then
    insert into fabrica_producciones
      (fecha, turno, operario_id, cargado_por, fecula_kg, masa_kg, sabor_id, destino, tamanio_id)
    values
      (p_fecha, p_turno, auth.uid(), auth.uid(), p_fecula_kg, p_masa_kg, p_sabor_id, p_destino, p_tamanio_id)
    returning id into v_id;
  else
    -- Hay que validar la fecha GUARDADA, no solo p_fecha: si no, con el id
    -- de una producción de hace tres meses se la edita mandando
    -- p_fecha = hoy, el update matchea por id, la fecha nueva pasa el guard
    -- y la fila vieja se muta y se trae al presente.
    select fecha into v_fecha_actual from fabrica_producciones where id = p_id for update;

    if not found then
      raise exception 'Producción no encontrada';
    end if;

    if not fabrica_puede_editar_fecha(v_fecha_actual) then
      raise exception 'Esa producción es del % y ya no se puede editar', v_fecha_actual;
    end if;

    update fabrica_producciones set
      fecha      = p_fecha,
      turno      = p_turno,
      sabor_id   = p_sabor_id,
      destino    = p_destino,
      fecula_kg  = p_fecula_kg,
      masa_kg    = p_masa_kg,
      tamanio_id = p_tamanio_id,
      updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ─── 6. eliminar_produccion_fabrica: mismo guard, sin reversa de embolsados ─
-- La firma no cambia (create or replace alcanza). Pierde el loop de reversa
-- de fabrica_embolsados: ya no hay FK produccion_id que los ligue.
create or replace function public.eliminar_produccion_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_fecha date;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select fecha into v_fecha from fabrica_producciones where id = p_id for update;

  if not found then
    raise exception 'Producción no encontrada';
  end if;

  if not fabrica_puede_editar_fecha(v_fecha) then
    raise exception 'Esa producción es del % y ya no se puede editar', v_fecha;
  end if;

  delete from fabrica_producciones where id = p_id;
end;
$$;

-- ─── 7. guardar_embolsado_fabrica: reemplazo atómico de un pool ────────────
-- Devuelve cuántas líneas no encontraron producto con esa terna (se guardan
-- igual pero no mueven stock, mismo criterio que Fase 5).
create or replace function public.guardar_embolsado_fabrica(
  p_fecha date,
  p_tamanio_id uuid,
  p_sabor_id uuid,
  p_lineas jsonb
)
returns integer
language plpgsql
security definer
as $$
declare
  r record;
  v_producto_id uuid;
  v_embolsado_id uuid;
  v_sin_producto integer := 0;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e
    where (e->>'cantidad_kg')::numeric < 0
  ) then
    raise exception 'No se aceptan cantidades negativas';
  end if;

  -- Ya no hay fila ancla que lockear (antes lo era la producción): en READ
  -- COMMITTED, dos guardados concurrentes del mismo pool leerían el mismo
  -- neto de reversa, el segundo se bloquearía en el delete del primero y al
  -- liberarse revertiría stock ya revertido.
  perform pg_advisory_xact_lock(hashtextextended(p_fecha::text || '|' || p_tamanio_id::text || '|' || p_sabor_id::text, 0));

  -- Reversa por el NETO de los movimientos del pool, no por cantidad_kg de
  -- cada fila — desviación deliberada del patrón de guardar_produccion_fabrica
  -- (Fase 5). Una fila puede declarar kg que nunca entraron al stock: si el
  -- producto de esa terna no existía en el catálogo al cargarla, producto_id
  -- quedó null y no se movió nada. Revertir por fila restaría más de lo que
  -- entró y el saldo queda corto para siempre, sin rastro. Por neto es
  -- exacto y además auto-sanador.
  for r in
    select producto_id, sum(delta_kg) as neto
    from fabrica_stock_terminado_mov
    where tipo = 'produccion_embolsado'
      and embolsado_id in (
        select id from fabrica_embolsados
        where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id
      )
    group by producto_id
  loop
    if r.neto <> 0 then
      perform mover_stock_terminado(r.producto_id, -r.neto, 'produccion_embolsado', null, null);
    end if;
  end loop;

  delete from fabrica_embolsados
    where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id;

  -- group by + having > 0: la UI permite dos líneas con la misma
  -- presentación y el unique las rechazaría con un 23505 crudo en la cara
  -- del operario. Los ceros se descartan acá.
  for r in
    select presentacion_id, sum(cantidad_kg) as cantidad_kg
    from jsonb_to_recordset(coalesce(p_lineas, '[]'::jsonb)) as x(presentacion_id uuid, cantidad_kg numeric)
    group by presentacion_id
    having sum(cantidad_kg) > 0
  loop
    select id into v_producto_id from productos
      where presentacion_id = r.presentacion_id
        and sabor_id = p_sabor_id
        and tamanio_id = p_tamanio_id
      limit 1;

    if v_producto_id is null then
      v_sin_producto := v_sin_producto + 1;
    end if;

    insert into fabrica_embolsados (fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg, producto_id, cargado_por, updated_at)
    values (p_fecha, p_tamanio_id, p_sabor_id, r.presentacion_id, r.cantidad_kg, v_producto_id, auth.uid(), now())
    returning id into v_embolsado_id;

    if v_producto_id is not null then
      -- mover_stock_terminado tiene EXECUTE revocado a public/anon/authenticated;
      -- funciona porque el owner conserva el privilegio y dentro de un
      -- SECURITY DEFINER el chequeo va contra el definer. Sin grants —
      -- mismo criterio que ajustar_stock_terminado_manual().
      perform mover_stock_terminado(v_producto_id, r.cantidad_kg, 'produccion_embolsado', v_embolsado_id, null);
    end if;
  end loop;

  return v_sin_producto;
end;
$$;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────
-- Sin cambios: fabrica_embolsados conserva su única policy de SELECT
-- ("fabrica_embolsados_lectura", tiene_acceso_fabrica()) — no referencia
-- produccion_id, no le afecta el cambio de esquema.
