-- ============================================================================
-- A1 (Bloque 2) — El conteo de fábrica controla, no pisa el stock.
-- Especificación: docs/bloque2/plan-A1.md.
--
-- Hasta acá el conteo escribía compras_stock_actual desde el navegador
-- (upsert + movimiento con un delta calculado contra lo que tenía la pantalla).
-- Desde A1:
--   * el conteo guarda solo lo contado (fabrica_guardar_cantidad_conteo);
--   * al cerrarlo se sella el stock teórico y la diferencia;
--   * Compras decide qué hacer con cada diferencia: aplicar (ajuste_conteo vía
--     compras_mover_stock), ignorar o revertir (compras_resolver_diferencias_conteo).
-- Cierra la excepción del ledger anotada en 20260925120000_compras_stock_ledger.sql.
--
-- compras_mover_stock NO se redefine: su rama de auto-curación queda como red
-- de seguridad; con las policies de §11 ya no hay escritores fuera de las RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config: umbral para resaltar una diferencia grande (D11).
-- ----------------------------------------------------------------------------
insert into public.compras_config (clave, valor, descripcion) values
  ('conteo.diferencia_resaltar_pct', '20'::jsonb,
   'Una diferencia de conteo se resalta en ámbar si supera este % del stock esperado.')
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Columnas nuevas en fabrica_conteo_items.
-- ----------------------------------------------------------------------------
alter table public.fabrica_conteo_items
  add column if not exists contado_en              timestamptz,
  add column if not exists stock_teorico           numeric,
  add column if not exists diferencia_estado       text,
  add column if not exists diferencia_mov_id       uuid references public.compras_stock_movimientos(id),
  add column if not exists diferencia_nota         text,
  add column if not exists diferencia_resuelta_por uuid references public.profiles(id),
  add column if not exists diferencia_resuelta_en  timestamptz;

-- Solo hay diferencia si el ítem se contó y el cierre selló el teórico.
alter table public.fabrica_conteo_items
  add column if not exists diferencia numeric
  generated always as (
    case when contado_en is not null and stock_teorico is not null then cantidad - stock_teorico end
  ) stored;

alter table public.fabrica_conteo_items
  drop constraint if exists fabrica_conteo_items_diferencia_estado_check,
  add  constraint fabrica_conteo_items_diferencia_estado_check
    check (diferencia_estado is null or diferencia_estado in ('pendiente', 'aplicada', 'ignorada')),
  drop constraint if exists fabrica_conteo_items_aplicada_con_movimiento,
  add  constraint fabrica_conteo_items_aplicada_con_movimiento
    check (diferencia_estado is distinct from 'aplicada' or diferencia_mov_id is not null);

create index if not exists idx_fabrica_conteo_items_dif_pendiente
  on public.fabrica_conteo_items (item_id) where diferencia_estado = 'pendiente';

comment on column public.fabrica_conteo_items.contado_en is
  'Cuándo Fábrica cargó la cantidad. Null = sin contar (al cerrar toma el stock del sistema y no genera diferencia).';
comment on column public.fabrica_conteo_items.stock_teorico is
  'Stock del sistema (compras_stock_actual) sellado al cerrar el conteo. Fábrica no lo ve.';
comment on column public.fabrica_conteo_items.diferencia is
  'contado - stock_teorico. Null si el ítem no se contó o el conteo es anterior a A1.';
comment on column public.fabrica_conteo_items.diferencia_estado is
  'pendiente | aplicada | ignorada. La resuelve Compras con compras_resolver_diferencias_conteo.';
comment on column public.fabrica_conteo_items.diferencia_mov_id is
  'Movimiento ajuste_conteo que aplicó la diferencia (solo si está aplicada).';

-- Backfill de contado_en.
-- Conteos viejos (cerrados o descartados): se toman como contados. stock_teorico
-- queda null, así que no generan diferencias (ya pisaron el stock en su momento).
update public.fabrica_conteo_items fci
  set contado_en = coalesce(c.cerrado_en, c.descartado_en, c.created_at)
  from public.fabrica_conteos c
  where c.id = fci.conteo_id and c.estado in ('cerrado', 'descartado') and fci.contado_en is null;

-- Borradores en curso: cuentan como contados solo los ítems que el sistema viejo
-- ya movió (tienen movimiento con este conteo). El resto queda "sin contar".
update public.fabrica_conteo_items fci
  set contado_en = now()
  from public.fabrica_conteos c
  where c.id = fci.conteo_id and c.estado = 'borrador' and fci.contado_en is null
    and exists (select 1 from public.compras_stock_movimientos m
                where m.conteo_id = fci.conteo_id and m.item_id = fci.item_id);

-- ----------------------------------------------------------------------------
-- 3. fabrica_guardar_cantidad_conteo: lo único que escribe lo contado.
--    Reemplaza las escrituras del navegador (stock, movimiento e ítem).
-- ----------------------------------------------------------------------------
create or replace function public.fabrica_guardar_cantidad_conteo(
  p_conteo_item_id uuid default null,
  p_cantidad numeric default null   -- null = "lo borré, queda sin contar"
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo_id uuid;
  v_estado    text;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;
  if p_cantidad is not null and p_cantidad < 0 then
    raise exception 'La cantidad no puede ser negativa.';
  end if;

  select conteo_id into v_conteo_id from fabrica_conteo_items where id = p_conteo_item_id;
  if not found then
    raise exception 'No encontramos ese ítem del conteo. Recargá la página.';
  end if;

  -- Orden de bloqueo: conteo → ítem (igual que cerrar_conteo_fabrica).
  select estado into v_estado from fabrica_conteos where id = v_conteo_id for update;
  if v_estado <> 'borrador' then
    raise exception 'Este conteo ya se cerró: no se puede cambiar lo contado. Recargá la página.';
  end if;

  update fabrica_conteo_items
    set cantidad   = coalesce(p_cantidad, 0),
        contado_en = case when p_cantidad is null then null else now() end
    where id = p_conteo_item_id;
end;
$$;

comment on function public.fabrica_guardar_cantidad_conteo(uuid, numeric) is
  'A1: guarda lo contado de un ítem de un conteo en borrador. No toca el stock.';

revoke execute on function public.fabrica_guardar_cantidad_conteo(uuid, numeric) from public, anon;
grant  execute on function public.fabrica_guardar_cantidad_conteo(uuid, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. cerrar_conteo_fabrica: cuerpo de 20260924170000_insumos_a_demanda.sql
--    + sellado de A1 (stock teórico, lo no contado y diferencias pendientes).
--    Espejo en TS del sugerido/sobrestock: lib/fabrica/calculoSugerido.ts.
-- ----------------------------------------------------------------------------
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas         numeric;
  v_definicion_id uuid;
  v_solicitud_id  uuid;
  v_umbral        numeric;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select masas_proyectadas, definicion_id
    into v_masas, v_definicion_id
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  select coalesce((select (valor #>> '{}')::numeric from compras_config where clave = 'sobrestock.umbral_unidades'), 1)
    into v_umbral;

  -- A1: el conteo controla, no pisa. Se bloquea el stock de los insumos del
  -- conteo (for share, ordenado) para que un remito en vuelo termine antes del
  -- sellado o espere a que termine el cierre.
  perform 1
    from compras_stock_actual a
    where a.item_id in (select item_id from fabrica_conteo_items where conteo_id = p_conteo_id)
    order by a.item_id
    for share;

  -- Se sella el teórico. Lo no contado toma el stock del sistema (con piso 0)
  -- para que el sugerido y el sobrestock se calculen igual que siempre, y no
  -- genera diferencia (diferencia es null porque contado_en es null).
  update fabrica_conteo_items fci set
    stock_teorico = coalesce(a.cantidad, 0),
    cantidad      = case when fci.contado_en is null then greatest(coalesce(a.cantidad, 0), 0) else fci.cantidad end
  from fabrica_conteo_items f
  left join compras_stock_actual a on a.item_id = f.item_id
  where f.id = fci.id and fci.conteo_id = p_conteo_id;

  update fabrica_conteo_items fci set
    cantidad_por_masa   = ci.cantidad_por_masa,
    cantidad_por_unidad = ci.cantidad_por_unidad,
    redondeo            = ci.redondeo,
    modo_calculo        = dci.modo_calculo,
    meta                = dci.meta,
    cantidad_fija       = dci.cantidad_fija,
    necesidad           = ci.cantidad_por_masa * v_masas,
    sugerido            = case
                            when ci.redondeo = 'sin_calculo' then 0
                            when dci.modo_calculo = 'cantidad_fija' then dci.cantidad_fija
                            when dci.modo_calculo = 'meta_semanal' then greatest(0, dci.meta - fci.cantidad)
                            when dci.modo_calculo = 'por_masa' and ci.cantidad_por_unidad > 0 then greatest(
                              case ci.redondeo
                                when 'siempre_arriba' then
                                  ceil(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                when 'siempre_abajo' then
                                  floor(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                else
                                  round(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                              end,
                              case when dci.meta > 0 then greatest(0, dci.meta - fci.cantidad) else 0 end
                            )
                            else 0
                          end
  from compras_items ci
  join fabrica_conteo_definicion_items dci on dci.item_id = ci.id and dci.definicion_id = v_definicion_id
  where ci.id = fci.item_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteo_items fci set
    exceso                  = x.exceso,
    sobrestock              = coalesce(x.exceso >= v_umbral, false),
    descuento_base_sugerido = case
                                when x.exceso >= v_umbral and x.en_base > 0 then least(floor(x.exceso), x.en_base)
                              end
  from (
    select
      f.id,
      round(case
        when ci.a_demanda then
          case when ci.stock_maximo is not null then f.cantidad - ci.stock_maximo end
        when f.modo_calculo = 'por_masa' and coalesce(f.cantidad_por_masa, 0) <= 0 then
          null  -- por masa sin receta y sin la marca: no hay con qué comparar (Insumos lo avisa)
        when f.modo_calculo = 'por_masa' and f.cantidad_por_unidad > 0 and v_masas > 0 then
          f.cantidad - greatest(f.necesidad / f.cantidad_por_unidad, case when f.meta > 0 then f.meta else 0 end)
        when f.modo_calculo = 'meta_semanal' and f.meta > 0 then
          f.cantidad - f.meta
      end, 2) as exceso,
      coalesce((select sum(pb.cantidad) from compras_plantilla_base pb
                where pb.item_id = f.item_id and pb.activo), 0) as en_base
    from fabrica_conteo_items f
    join compras_items ci on ci.id = f.item_id
    where f.conteo_id = p_conteo_id
      and f.modo_calculo is not null
  ) x
  where x.id = fci.id;

  -- A1: las diferencias quedan pendientes hasta que Compras las resuelva.
  update fabrica_conteo_items
    set diferencia_estado = 'pendiente'
    where conteo_id = p_conteo_id and diferencia is not null and diferencia <> 0;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, stock_actual, orden)
  select v_solicitud_id, fci.item_id, cip.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0, fci.cantidad, coalesce(dci.orden, 0)
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  left join compras_item_proveedores cip on cip.item_id = ci.id and cip.es_principal
  left join fabrica_conteo_definicion_items dci on dci.item_id = fci.item_id and dci.definicion_id = v_definicion_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. compras_resolver_diferencias_conteo: Compras aplica, ignora o revierte.
-- ----------------------------------------------------------------------------
create or replace function public.compras_resolver_diferencias_conteo(
  p_conteo_id uuid default null,
  p_item_ids  uuid[] default null,   -- ids de fabrica_conteo_items; null = todas las pendientes (no vale para revertir)
  p_accion    text default null,     -- 'aplicar' | 'ignorar' | 'revertir'
  p_nota      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo   fabrica_conteos%rowtype;
  v_lista    text;
  v_etiqueta text;
  v_fci      fabrica_conteo_items%rowtype;
  v_nombre   text;
  v_mov      compras_stock_movimientos%rowtype;
  v_mov_id   uuid;
  v_superado text;
  v_hechas   int := 0;
  v_omitidas int := 0;
  v_detalle  jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if p_accion is null or p_accion not in ('aplicar', 'ignorar', 'revertir') then
    raise exception 'Elegí qué hacer con la diferencia.';
  end if;
  if p_accion = 'revertir' and (p_item_ids is null or cardinality(p_item_ids) = 0) then
    raise exception 'Elegí qué diferencia revertir.';
  end if;

  select * into v_conteo from fabrica_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'No encontramos ese conteo. Recargá la página.';
  end if;
  if v_conteo.estado = 'descartado' then
    raise exception 'Este conteo se descartó: sus diferencias ya no se aplican. Fábrica lo vuelve a contar.';
  elsif v_conteo.estado <> 'cerrado' then
    raise exception 'Este conteo todavía no se cerró.';
  end if;

  select nombre into v_lista from fabrica_conteo_definiciones where id = v_conteo.definicion_id;
  v_etiqueta := 'Conteo ' || v_lista || ' ' || to_char(v_conteo.fecha, 'DD/MM');

  if p_item_ids is not null and (
       select count(*) from fabrica_conteo_items where conteo_id = p_conteo_id and id = any(p_item_ids)
     ) <> cardinality(p_item_ids) then
    raise exception 'Alguna de esas diferencias ya no está en el conteo. Recargá la página.';
  end if;

  for v_fci in
    select * from fabrica_conteo_items
    where conteo_id = p_conteo_id
      and (case when p_item_ids is null then diferencia_estado = 'pendiente' else id = any(p_item_ids) end)
    order by item_id
    for update
  loop
    select nombre into v_nombre from compras_items where id = v_fci.item_id;

    -- ¿Hay un conteo cerrado más nuevo que contó este insumo? (D5)
    v_superado := null;
    select d.nombre || ' ' || to_char(c2.fecha, 'DD/MM') into v_superado
      from fabrica_conteo_items f2
      join fabrica_conteos c2 on c2.id = f2.conteo_id
      join fabrica_conteo_definiciones d on d.id = c2.definicion_id
      where f2.item_id = v_fci.item_id and c2.estado = 'cerrado'
        and c2.cerrado_en > v_conteo.cerrado_en and f2.contado_en is not null
      order by c2.cerrado_en limit 1;

    if p_accion = 'aplicar' then
      if v_fci.diferencia_estado is distinct from 'pendiente' then
        raise exception '%: esa diferencia ya se resolvió. Recargá la página para ver cómo quedó.', v_nombre;
      end if;
      if v_superado is not null then
        if p_item_ids is null then v_omitidas := v_omitidas + 1; continue; end if;
        raise exception '%: hay un conteo más nuevo (%). Aplicá la diferencia de ese conteo; esta quedó vieja.', v_nombre, v_superado;
      end if;
      v_mov_id := compras_mover_stock(
        v_fci.item_id, v_fci.diferencia, 'ajuste_conteo',
        v_etiqueta || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
        null, p_conteo_id
      );
      update fabrica_conteo_items set
        diferencia_estado = 'aplicada', diferencia_mov_id = v_mov_id,
        diferencia_nota = nullif(btrim(p_nota), ''),
        diferencia_resuelta_por = auth.uid(), diferencia_resuelta_en = now()
        where id = v_fci.id;

    elsif p_accion = 'ignorar' then
      if v_fci.diferencia_estado is distinct from 'pendiente' then
        raise exception '%: esa diferencia ya se resolvió. Recargá la página.', v_nombre;
      end if;
      update fabrica_conteo_items set
        diferencia_estado = 'ignorada', diferencia_nota = nullif(btrim(p_nota), ''),
        diferencia_resuelta_por = auth.uid(), diferencia_resuelta_en = now()
        where id = v_fci.id;

    else -- revertir
      if v_fci.diferencia_estado is null or v_fci.diferencia_estado not in ('aplicada', 'ignorada') then
        raise exception '%: esa diferencia ya está pendiente. Recargá la página.', v_nombre;
      end if;
      if v_fci.diferencia_estado = 'aplicada' then
        select * into v_mov from compras_stock_movimientos where id = v_fci.diferencia_mov_id;
        perform compras_mover_stock(
          v_mov.item_id, -v_mov.delta, 'reversion',
          'Se revirtió el ajuste del ' || v_etiqueta || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
          null, p_conteo_id, v_mov.id
        );
      end if;
      update fabrica_conteo_items set
        diferencia_estado = 'pendiente', diferencia_mov_id = null, diferencia_nota = null,
        diferencia_resuelta_por = null, diferencia_resuelta_en = null
        where id = v_fci.id;
    end if;

    v_hechas := v_hechas + 1;
    v_detalle := v_detalle || jsonb_build_object(
      'item_id', v_fci.item_id, 'nombre', v_nombre,
      'cantidad_despues', (select cantidad from compras_stock_actual where item_id = v_fci.item_id)
    );
  end loop;

  return jsonb_build_object('accion', p_accion, 'hechas', v_hechas, 'omitidas_superadas', v_omitidas, 'items', v_detalle);
end;
$$;

comment on function public.compras_resolver_diferencias_conteo(uuid, uuid[], text, text) is
  'A1: Compras aplica (ajuste_conteo por la diferencia sellada), ignora o revierte diferencias de un conteo cerrado.';

revoke execute on function public.compras_resolver_diferencias_conteo(uuid, uuid[], text, text) from public, anon;
grant  execute on function public.compras_resolver_diferencias_conteo(uuid, uuid[], text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. compras_revertir_movimiento: cuerpo de 20260929120000 + bloqueo D9
--    (un ajuste_conteo que salió de un conteo se revierte desde el conteo).
-- ----------------------------------------------------------------------------
create or replace function public.compras_revertir_movimiento(
  p_movimiento_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov     compras_stock_movimientos%rowtype;
  v_id      uuid;
  v_despues numeric;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué revertís el ajuste: queda en el historial del insumo.';
  end if;

  select * into v_mov from compras_stock_movimientos where id = p_movimiento_id for update;
  if not found then
    raise exception 'No encontramos ese movimiento. Recargá la página.';
  end if;
  if v_mov.tipo not in ('ajuste_manual', 'ajuste_conteo', 'ajuste_factura') then
    raise exception 'Solo se pueden revertir ajustes. Un remito se corrige editándolo o eliminándolo.';
  end if;
  if v_mov.discrepancia_id is not null then
    raise exception 'Ese ajuste salió de una diferencia con la factura: revertilo desde la factura, en "Diferencias con lo recibido".';
  end if;
  if v_mov.tipo = 'ajuste_conteo' and v_mov.conteo_id is not null then
    raise exception 'Ese ajuste salió de un conteo de fábrica: revertilo desde el conteo, en Fábrica › Conteos.';
  end if;
  if exists (select 1 from compras_stock_movimientos where anula_movimiento_id = v_mov.id) then
    raise exception 'Ese ajuste ya se revirtió.';
  end if;
  -- Los movimientos anteriores al saldo inicial (sin cantidad_despues) ya
  -- quedaron absorbidos por la apertura: revertirlos descuadraría el stock.
  if v_mov.cantidad_despues is null then
    raise exception 'Ese ajuste es anterior al registro de movimientos: si el stock no coincide, cargá un ajuste nuevo.';
  end if;

  v_id := compras_mover_stock(
    v_mov.item_id, -v_mov.delta, 'reversion', p_motivo, null, null, v_mov.id
  );
  select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;

  return jsonb_build_object('movimiento_id', v_id, 'delta', -v_mov.delta, 'despues', v_despues);
end;
$$;

revoke execute on function public.compras_revertir_movimiento(uuid, text) from public, anon;
grant execute on function public.compras_revertir_movimiento(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. eliminar_conteo_fabrica: cuerpo de 20260806110000 + D7. Un borrador con
--    movimientos del sistema viejo no se borra (la FK conteo_id no se toca).
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_conteo_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if exists (select 1 from compras_stock_movimientos where conteo_id = p_id) then
    raise exception 'Este conteo ya movió stock con el sistema anterior y no se puede borrar: cerralo y Compras revisa las diferencias.';
  end if;

  delete from fabrica_conteos where id = p_id and estado = 'borrador';

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. descartar_solicitud: cuerpo de 20260911100000 + D6. No se descarta una
--    solicitud cuyo conteo tiene diferencias aplicadas (el raise deshace
--    también el update de la solicitud).
-- ----------------------------------------------------------------------------
create or replace function public.descartar_solicitud(p_solicitud_id uuid, p_motivo text default null)
returns void language plpgsql security definer as $$
declare v_conteo_id uuid;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  update compras_solicitudes
    set estado = 'descartada', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id and estado = 'abierta'
    returning conteo_id into v_conteo_id;

  if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;

  if v_conteo_id is not null and exists (
       select 1 from fabrica_conteo_items where conteo_id = v_conteo_id and diferencia_estado = 'aplicada') then
    raise exception 'Este conteo tiene diferencias aplicadas al stock. Revertilas en Fábrica › Conteos antes de descartar la solicitud.';
  end if;

  -- El índice fabrica_conteos_definicion_fecha_cerrado_unique es parcial sobre
  -- estado='cerrado': sacar el conteo de ese estado lo libera y deja que Fábrica
  -- lo rehaga el mismo día, sin borrar el conteo ni su snapshot de ítems.
  -- Una solicitud 'base' no tiene conteo_id: por eso el if.
  if v_conteo_id is not null then
    update fabrica_conteos
      set estado          = 'descartado',
          descartado_por  = auth.uid(),
          descartado_en   = now(),
          motivo_descarte = nullif(trim(p_motivo), '')
      where id = v_conteo_id and estado = 'cerrado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Vistas.
-- ----------------------------------------------------------------------------

-- Diferencias de conteo para Compras. Vista plana (sin security_invoker): el
-- where con tiene_acceso_compras() es el gate real. Fábrica no la ve (D10).
create or replace view public.v_fabrica_conteo_diferencias as
select
  fci.id,
  fci.conteo_id,
  fci.item_id,
  ci.nombre                as item_nombre,
  ci.unidad,
  fci.cantidad             as contado,
  fci.contado_en,
  fci.stock_teorico,
  fci.diferencia,
  fci.diferencia_estado,
  fci.diferencia_mov_id,
  fci.diferencia_nota,
  fci.diferencia_resuelta_en,
  rp.nombre                as diferencia_resuelta_por_nombre,
  c.estado                 as conteo_estado,
  c.fecha                  as conteo_fecha,
  c.cerrado_en             as conteo_cerrado_en,
  d.nombre                 as definicion_nombre,
  coalesce(sa.cantidad, 0) as stock_hoy,
  -- D4: lo que se movió desde el cierre, sin contar lo que este conteo aplicó o revirtió.
  case when fci.stock_teorico is not null then
    coalesce(sa.cantidad, 0) - fci.stock_teorico - coalesce((
      select sum(m.delta) from compras_stock_movimientos m
      where m.conteo_id = c.id and m.item_id = fci.item_id and m.tipo in ('ajuste_conteo', 'reversion')
    ), 0)
  end                      as movido_desde_cierre,
  sup.conteo_id            as superado_por_conteo_id,
  sup.etiqueta             as superado_por
from fabrica_conteo_items fci
join fabrica_conteos c on c.id = fci.conteo_id
join fabrica_conteo_definiciones d on d.id = c.definicion_id
join compras_items ci on ci.id = fci.item_id
left join compras_stock_actual sa on sa.item_id = fci.item_id
left join profiles rp on rp.id = fci.diferencia_resuelta_por
left join lateral (
  select c2.id as conteo_id, d2.nombre || ' ' || to_char(c2.fecha, 'DD/MM') as etiqueta
  from fabrica_conteo_items f2
  join fabrica_conteos c2 on c2.id = f2.conteo_id
  join fabrica_conteo_definiciones d2 on d2.id = c2.definicion_id
  where f2.item_id = fci.item_id and c2.estado = 'cerrado' and f2.contado_en is not null
    and c.cerrado_en is not null and c2.cerrado_en > c.cerrado_en
  order by c2.cerrado_en
  limit 1
) sup on true
where c.estado in ('cerrado', 'descartado')
  and tiene_acceso_compras();

grant select on public.v_fabrica_conteo_diferencias to authenticated;

-- Historial de conteos: columnas de 20260908130000 en el mismo orden + las
-- nuevas al final. Suma los descartados (un deep link a uno tiene que abrir).
create or replace view public.v_compras_conteos_historial as
select
  c.id,
  c.fecha,
  c.semana_desde,
  c.semana_hasta,
  c.masas_proyectadas,
  c.cerrado_en,
  d.id as definicion_id,
  d.nombre as definicion_nombre,
  d.icono as definicion_icono,
  cp.nombre as cerrado_por_nombre,
  c.estado,
  (select s.id     from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_id,
  (select s.estado from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_estado,
  case when tiene_acceso_compras() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado = 'pendiente'
  )::int end as diferencias_pendientes
from fabrica_conteos c
join fabrica_conteo_definiciones d on d.id = c.definicion_id
left join profiles cp on cp.id = c.cerrado_por
where c.estado in ('cerrado', 'descartado')
  and (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_conteos_historial to authenticated;

-- ----------------------------------------------------------------------------
-- 10. RLS: el stock solo se escribe por RPC (security definer).
-- ----------------------------------------------------------------------------
drop policy if exists compras_stock_actual_acceso on public.compras_stock_actual;
drop policy if exists compras_stock_actual_lectura on public.compras_stock_actual;
create policy compras_stock_actual_lectura on public.compras_stock_actual
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy if exists compras_stock_movimientos_acceso on public.compras_stock_movimientos;
drop policy if exists compras_stock_movimientos_lectura on public.compras_stock_movimientos;
create policy compras_stock_movimientos_lectura on public.compras_stock_movimientos
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

-- Lo contado lo escribe solo fabrica_guardar_cantidad_conteo.
drop policy if exists fabrica_conteo_items_modificacion on public.fabrica_conteo_items;

-- El alta (siembra del borrador desde /fabrica/stock) queda acotada a borradores y sin datos del cierre.
drop policy if exists fabrica_conteo_items_alta on public.fabrica_conteo_items;
create policy fabrica_conteo_items_alta on public.fabrica_conteo_items
  for insert with check (
    tiene_acceso_fabrica()
    and contado_en is null and stock_teorico is null and diferencia_estado is null
    and exists (select 1 from fabrica_conteos c where c.id = conteo_id and c.estado = 'borrador')
  );

-- ----------------------------------------------------------------------------
-- 11. Conciliación del ledger (D12): lo que el conteo viejo escribió en la
--     caché sin movimiento se registra una vez. Aborta si no queda en 0.
-- ----------------------------------------------------------------------------
do $$
declare v_fuera int;
begin
  insert into compras_stock_movimientos (item_id, delta, tipo, motivo, cantidad_antes, cantidad_despues)
  select a.item_id, a.cantidad - l.saldo, 'conteo_fabrica',
         'Diferencia del conteo de fábrica sin registrar (antes de A1)', l.saldo, a.cantidad
  from compras_stock_actual a
  cross join lateral (select coalesce(sum(m.delta), 0) as saldo from compras_stock_movimientos m where m.item_id = a.item_id) l
  where a.cantidad <> l.saldo;

  select count(*) into v_fuera from compras_stock_actual a
  where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id);
  if v_fuera <> 0 then
    raise exception 'A1: quedaron % insumos fuera del invariante del ledger', v_fuera;
  end if;
end $$;
