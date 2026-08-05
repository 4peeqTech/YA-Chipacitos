-- Fase 5 del módulo Fábrica: stock de producto terminado. La terna
-- presentación×sabor×tamaño vive como atributos sobre `productos` (no una
-- tabla nueva) para que el pedido interno de los locales pida directamente
-- ese producto, igual que hoy pide cualquier otro. Un producto sin terna
-- nunca toca este stock — sigue siendo "masa a granel", no una unidad
-- discreta que se cuenta en bultos.

alter table productos
  add column if not exists presentacion_id uuid references fabrica_presentaciones(id),
  add column if not exists sabor_id        uuid references fabrica_sabores(id),
  add column if not exists tamanio_id      uuid references fabrica_tamanios(id);

create unique index if not exists idx_productos_terna
  on productos (presentacion_id, sabor_id, tamanio_id)
  where presentacion_id is not null;

create table if not exists fabrica_stock_terminado (
  producto_id     uuid primary key references productos(id) on delete cascade,
  cantidad_kg     numeric not null default 0,
  actualizado_en  timestamptz not null default now()
);

-- Historial completo de movimientos, para poder explicar cómo se llegó al
-- saldo actual (lo que compras_stock_actual nunca guardó — ver
-- 20260803210000_compras_fase4_stock_movimientos.sql). embolsado_id y
-- pedido_id van en "on delete set null": si se edita una producción y sus
-- embolsados viejos se borran, o un pedido se elimina, el movimiento ya
-- aplicado al stock queda en el historial aunque su origen desaparezca.
create table if not exists fabrica_stock_terminado_mov (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos(id) on delete cascade,
  delta_kg     numeric not null,
  tipo         text not null check (tipo in ('produccion_embolsado', 'salida_pedido', 'ajuste_pedido', 'ajuste_manual')),
  embolsado_id uuid references fabrica_embolsados(id) on delete set null,
  pedido_id    uuid references pedidos(id) on delete set null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_fabrica_stock_terminado_mov_producto_id on fabrica_stock_terminado_mov(producto_id);

-- Solo lectura vía RLS directa — igual que fabrica_producciones (Fase 4),
-- todo alta pasa por mover_stock_terminado() para que el incremento sea
-- atómico (insert ... on conflict do update) y no reproduzca la carrera
-- read-then-write que ya está señalada como deuda en compras_stock_actual.
alter table fabrica_stock_terminado enable row level security;
create policy "fabrica_stock_terminado_lectura" on fabrica_stock_terminado
  for select using (tiene_acceso_fabrica());

alter table fabrica_stock_terminado_mov enable row level security;
create policy "fabrica_stock_terminado_mov_lectura" on fabrica_stock_terminado_mov
  for select using (tiene_acceso_fabrica());

-- Motor único de todo movimiento de stock terminado. No se expone
-- directamente a los clientes (ver el revoke más abajo): lo llaman
-- funciones de más arriba que ya validaron el permiso adecuado para su
-- contexto — fábrica al producir, el operador de fábrica al enviar un
-- pedido interno, el local al confirmar recepción. El único caso que se
-- expone tal cual es 'ajuste_manual', a través de ajustar_stock_terminado_manual().
create or replace function public.mover_stock_terminado(
  p_producto_id uuid,
  p_delta_kg numeric,
  p_tipo text,
  p_embolsado_id uuid default null,
  p_pedido_id uuid default null
)
returns void
language plpgsql
security definer
as $$
begin
  if p_tipo not in ('produccion_embolsado', 'salida_pedido', 'ajuste_pedido', 'ajuste_manual') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;

  if p_tipo = 'ajuste_manual' and not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  insert into fabrica_stock_terminado_mov (producto_id, delta_kg, tipo, embolsado_id, pedido_id, creado_por)
  values (p_producto_id, p_delta_kg, p_tipo, p_embolsado_id, p_pedido_id, auth.uid());

  insert into fabrica_stock_terminado (producto_id, cantidad_kg, actualizado_en)
  values (p_producto_id, p_delta_kg, now())
  on conflict (producto_id) do update
    set cantidad_kg = fabrica_stock_terminado.cantidad_kg + excluded.cantidad_kg,
        actualizado_en = now();
end;
$$;

revoke execute on function public.mover_stock_terminado(uuid, numeric, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.ajustar_stock_terminado_manual(p_producto_id uuid, p_delta_kg numeric)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;
  perform mover_stock_terminado(p_producto_id, p_delta_kg, 'ajuste_manual');
end;
$$;

-- Redefine guardar_produccion_fabrica (Fase 4) para resolver, por cada línea
-- de embolsado, el producto con esa terna presentación×sabor×tamaño (el
-- tamaño es el de la producción entera, no viaja por línea) y mover el
-- stock terminado correspondiente. Si todavía no existe un producto con esa
-- terna en el catálogo, el embolsado se guarda igual pero no mueve stock.
create or replace function public.guardar_produccion_fabrica(
  p_id uuid,
  p_fecha date,
  p_turno text,
  p_sabor_id uuid,
  p_destino text,
  p_fecula_kg numeric,
  p_masa_kg numeric,
  p_tamanio_id uuid,
  p_embolsados jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_producto_id uuid;
  v_embolsado_id uuid;
  r record;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if p_id is null then
    insert into fabrica_producciones
      (fecha, turno, operario_id, cargado_por, fecula_kg, masa_kg, sabor_id, destino, tamanio_id)
    values
      (p_fecha, p_turno, auth.uid(), auth.uid(), p_fecula_kg, p_masa_kg, p_sabor_id, p_destino, p_tamanio_id)
    returning id into v_id;
  else
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

    if not found then
      raise exception 'Producción no encontrada';
    end if;

    -- Revierte el stock que habían sumado los embolsados anteriores antes
    -- de reemplazarlos: sin esto, editar una carga duplicaría el stock del
    -- producto terminado en vez de corregirlo.
    for r in
      select id, producto_id, cantidad_kg from fabrica_embolsados
      where produccion_id = v_id and producto_id is not null
    loop
      perform mover_stock_terminado(r.producto_id, -r.cantidad_kg, 'produccion_embolsado', r.id, null);
    end loop;

    delete from fabrica_embolsados where produccion_id = v_id;
  end if;

  for r in
    select (e->>'presentacion_id')::uuid as presentacion_id,
           (e->>'sabor_id')::uuid as sabor_id,
           (e->>'cantidad_kg')::numeric as cantidad_kg
    from jsonb_array_elements(coalesce(p_embolsados, '[]'::jsonb)) e
  loop
    select id into v_producto_id from productos
      where presentacion_id = r.presentacion_id
        and sabor_id = r.sabor_id
        and tamanio_id = p_tamanio_id
      limit 1;

    insert into fabrica_embolsados (produccion_id, presentacion_id, sabor_id, cantidad_kg, producto_id)
    values (v_id, r.presentacion_id, r.sabor_id, r.cantidad_kg, v_producto_id)
    returning id into v_embolsado_id;

    if v_producto_id is not null and r.cantidad_kg <> 0 then
      perform mover_stock_terminado(v_producto_id, r.cantidad_kg, 'produccion_embolsado', v_embolsado_id, null);
    end if;
  end loop;

  return v_id;
end;
$$;

-- Redefine eliminar_produccion_fabrica (Fase 4): revierte el stock de sus
-- embolsados antes de que el delete en cascada se los lleve.
create or replace function public.eliminar_produccion_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  for r in
    select id, producto_id, cantidad_kg from fabrica_embolsados
    where produccion_id = p_id and producto_id is not null
  loop
    perform mover_stock_terminado(r.producto_id, -r.cantidad_kg, 'produccion_embolsado', r.id, null);
  end loop;

  delete from fabrica_producciones where id = p_id;

  if not found then
    raise exception 'Producción no encontrada';
  end if;
end;
$$;

-- Integración 1/2: cuando un pedido interno destino='fabrica' pasa a
-- 'enviado', descuenta del stock terminado lo que efectivamente sale.
-- Mismo criterio de permisos que la policy "operadores actualizan pedidos"
-- (20260601000000_initial_schema.sql) — admin/fabrica/deposito, o el local
-- dueño del pedido.
create or replace function public.fabrica_marcar_pedido_enviado(p_pedido_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_destino text;
  v_local_id uuid;
  r record;
begin
  select destino, local_id into v_destino, v_local_id from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (get_user_rol() in ('admin', 'fabrica', 'deposito') or v_local_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update pedidos set estado = 'enviado', enviado_at = now() where id = p_pedido_id;

  if v_destino = 'fabrica' then
    for r in
      select pi.producto_id, pi.cantidad, fp.peso_kg
      from pedido_items pi
      join productos p on p.id = pi.producto_id
      join fabrica_presentaciones fp on fp.id = p.presentacion_id
      where pi.pedido_id = p_pedido_id
    loop
      perform mover_stock_terminado(r.producto_id, -(r.cantidad * r.peso_kg), 'salida_pedido', null, p_pedido_id);
    end loop;
  end if;
end;
$$;

-- Integración 2/2: al cargar el remito de recepción, ajusta el stock por la
-- diferencia entre lo pedido y lo realmente recibido (incluye ítems que el
-- local agrega en el momento, no pedidos originalmente — su "pedido" es 0,
-- así que toda la cantidad recibida es ajuste). Solo el local dueño del
-- pedido o admin puede confirmar su propia recepción.
create or replace function public.fabrica_confirmar_recepcion_pedido(
  p_pedido_id uuid,
  p_items jsonb,
  p_items_nuevos jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_destino text;
  v_local_id uuid;
  v_producto_id uuid;
  v_cantidad integer;
  v_peso_kg numeric;
  v_diferencia numeric;
  r record;
begin
  select destino, local_id into v_destino, v_local_id from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (v_local_id = auth.uid() or get_user_rol() = 'admin') then
    raise exception 'No autorizado';
  end if;

  for r in
    select (it->>'id')::uuid as item_id,
           (it->>'cantidad_recibida')::integer as cantidad_recibida,
           (it->>'valor_total')::numeric as valor_total
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
  loop
    update pedido_items
      set cantidad_recibida = r.cantidad_recibida, valor_total = r.valor_total
      where id = r.item_id and pedido_id = p_pedido_id
      returning producto_id, cantidad into v_producto_id, v_cantidad;

    if not found then
      continue;
    end if;

    if v_destino = 'fabrica' and v_producto_id is not null and r.cantidad_recibida is not null then
      select fp.peso_kg into v_peso_kg
        from productos p join fabrica_presentaciones fp on fp.id = p.presentacion_id
        where p.id = v_producto_id;
      if v_peso_kg is not null then
        -- El envío ya descontó `cantidad` (lo pedido). Si lo recibido difiere,
        -- la corrección es la diferencia en sentido contrario: si llegó menos
        -- de lo pedido se sobre-descontó y hay que devolver esa diferencia;
        -- si llegó más, se descontó de menos y hay que restar la diferencia.
        v_diferencia := v_cantidad - r.cantidad_recibida;
        if v_diferencia <> 0 then
          perform mover_stock_terminado(v_producto_id, v_diferencia * v_peso_kg, 'ajuste_pedido', null, p_pedido_id);
        end if;
      end if;
    end if;
  end loop;

  for r in
    select (it->>'producto_id')::uuid as producto_id,
           it->>'producto_nombre' as producto_nombre,
           (it->>'cantidad_recibida')::integer as cantidad_recibida,
           (it->>'valor_total')::numeric as valor_total
    from jsonb_array_elements(coalesce(p_items_nuevos, '[]'::jsonb)) it
  loop
    insert into pedido_items (pedido_id, producto_id, producto_nombre, cantidad, cantidad_recibida, valor_total)
    values (p_pedido_id, r.producto_id, r.producto_nombre, greatest(coalesce(r.cantidad_recibida, 1), 1), r.cantidad_recibida, r.valor_total);

    if v_destino = 'fabrica' and r.cantidad_recibida is not null and r.cantidad_recibida <> 0 then
      select fp.peso_kg into v_peso_kg
        from productos p join fabrica_presentaciones fp on fp.id = p.presentacion_id
        where p.id = r.producto_id;
      if v_peso_kg is not null then
        -- A diferencia del bloque anterior, este ítem nunca se descontó al
        -- enviar (no estaba en el pedido original) — toda la cantidad
        -- recibida sale de fábrica ahora, por eso el delta es negativo.
        perform mover_stock_terminado(r.producto_id, -(r.cantidad_recibida * v_peso_kg), 'ajuste_pedido', null, p_pedido_id);
      end if;
    end if;
  end loop;

  update pedidos set estado = 'recibido', recibido_at = now() where id = p_pedido_id;
end;
$$;
