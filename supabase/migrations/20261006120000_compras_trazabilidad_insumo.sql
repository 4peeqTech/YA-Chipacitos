-- ============================================================================
-- A2c — Trazabilidad por insumo (docs/bloque2/plan-A2c.md §3).
--
-- Qué agrega:
--   1. Índices por fecha para el reporte "Por insumo" (sin insumo filtra solo
--      por período) y el del ledger por factura.
--   2. v_compras_stock_movimientos expone factura_id y discrepancia_id (al
--      final: create or replace no deja reordenar).
--   3. v_compras_insumo_documentos: una fila por línea de remito y por línea
--      de factura confirmada (esta rama, solo admin). Se consulta siempre con
--      item_id y limit.
--   4. compras_trazabilidad_insumo(desde, hasta, insumo?): cuánto se pidió,
--      recibió, facturó y pagó de cada insumo en el período, a qué precio, y
--      el puente de stock. Todo lo de facturas sale null si no es admin.
--
-- Solo lectura: no mueve stock, no agrega triggers ni toca RPCs de escritura.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Índices
-- ----------------------------------------------------------------------------
create index if not exists idx_compras_facturas_fecha_confirmadas on compras_facturas (fecha) where estado = 'confirmada';
create index if not exists idx_compras_remitos_fecha on compras_remitos (fecha);
create index if not exists idx_compras_pedidos_enviado_en on compras_pedidos (enviado_en) where enviado_en is not null;
create index if not exists idx_compras_stock_movimientos_created_at on compras_stock_movimientos (created_at);
create index if not exists idx_compras_stock_movimientos_factura on compras_stock_movimientos (factura_id) where factura_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Vista de movimientos: factura_id y discrepancia_id al final
--    (cuerpo idéntico a 20260925120000 §5).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_stock_movimientos as
select
  m.id,
  m.item_id,
  m.delta,
  m.tipo,
  m.remito_id,
  m.conteo_id,
  m.created_at,
  ci.nombre as item_nombre,
  p.nombre as creado_por_nombre,
  m.motivo,
  m.cantidad_antes,
  m.cantidad_despues,
  m.anula_movimiento_id,
  exists (select 1 from compras_stock_movimientos r where r.anula_movimiento_id = m.id) as revertido,
  case when rem.id is not null
    then 'R-' || lpad(ped.numero::text, 4, '0') || '-' || lpad(rem.secuencia::text, 2, '0')
  end as remito_codigo,
  m.factura_id,
  m.discrepancia_id
from compras_stock_movimientos m
left join compras_items ci on ci.id = m.item_id
left join profiles p on p.id = m.creado_por
left join compras_remitos rem on rem.id = m.remito_id
left join compras_pedidos ped on ped.id = rem.pedido_id
where (tiene_acceso_compras() or tiene_acceso_fabrica());

-- ----------------------------------------------------------------------------
-- 3. Documentos del insumo (listas y gráfico de la ficha)
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_insumo_documentos as
select
  'remito'::text as tipo, ri.id as linea_id, ri.item_id, r.id as documento_id, r.fecha,
  'R-' || lpad(p.numero::text, 4, '0') || '-' || lpad(r.secuencia::text, 2, '0') as codigo,
  r.origen, null::text as tipo_comprobante,
  p.id as pedido_id, p.numero as pedido_numero, p.proveedor_id, pr.nombre as proveedor_nombre,
  ri.cantidad, ri.cantidad_base,
  null::text as precio_por, null::numeric as precio_unitario, null::numeric as subtotal,
  r.created_at as cargado_en
from compras_remito_items ri
join compras_remitos r   on r.id = ri.remito_id
join compras_pedidos p   on p.id = r.pedido_id
left join proveedores pr on pr.id = p.proveedor_id
where ri.item_id is not null and tiene_acceso_compras()
union all
select
  'factura', fi.id, fi.item_id, f.id, f.fecha, f.numero, null, f.tipo_comprobante,
  f.pedido_id, p.numero, f.proveedor_id, pr.nombre,
  fi.cantidad, fi.cantidad_base, fi.precio_por, fi.precio_unitario, fi.subtotal,
  f.confirmada_en
from compras_factura_items fi
join compras_facturas f  on f.id = fi.factura_id and f.estado = 'confirmada'
left join compras_pedidos p on p.id = f.pedido_id
left join proveedores pr on pr.id = f.proveedor_id
where fi.item_id is not null and es_admin();

grant select on public.v_compras_insumo_documentos to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Trazabilidad por insumo y período
-- ----------------------------------------------------------------------------
create or replace function public.compras_trazabilidad_insumo(
  p_desde date,
  p_hasta date,
  p_item_id uuid default null
)
returns table (
  item_id uuid, item_nombre text, item_estado text, categoria_nombre text,
  unidad text, unidad_base text, contenido numeric,
  pedido_cantidad numeric, pedidos integer,
  recibido_cantidad numeric, recibido_base_real numeric, recibido_sin_pesar integer, remitos integer,
  facturado_cantidad numeric, facturado_base numeric, facturado_neto numeric, facturado_total numeric,
  facturas integer, proveedores_facturados integer,
  precio_prom_unidad numeric, precio_prom_base numeric,
  ultimo_precio numeric, ultimo_precio_por text, ultimo_precio_fecha date,
  ultimo_precio_factura_id uuid, ultimo_precio_proveedor text,
  stock_inicio numeric, stock_fin numeric, stock_actual numeric,
  mov_remitos numeric, mov_conteo numeric, mov_factura numeric, mov_manual numeric,
  mov_devolucion numeric, mov_otros numeric, consumido_produccion numeric,
  pendiente_recibir numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin boolean := es_admin();
  v_ini   timestamptz;
  v_fin   timestamptz;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Elegí desde y hasta.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha "hasta" es anterior a "desde".';
  end if;
  if p_hasta - p_desde > 731 then
    raise exception 'El período puede tener hasta 2 años. Achicalo.';
  end if;

  -- Días de Argentina: [desde 00:00, hasta+1 00:00).
  v_ini := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_fin := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  with
  -- Pedido: líneas de pedidos ENVIADOS en el período (enviado_en no cambia con el reenvío).
  pe as (
    select pi.item_id, sum(pi.cantidad) as cantidad, count(distinct p.id)::int as pedidos
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.enviado_en >= v_ini and p.enviado_en < v_fin
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  ),
  -- Recibido: líneas de remitos con fecha en el período (incluye los "desde factura").
  re as (
    select ri.item_id, sum(ri.cantidad) as cantidad, sum(ri.cantidad_base) as base_real,
           count(*) filter (where ri.cantidad_base is null)::int as sin_pesar,
           count(distinct r.id)::int as remitos
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    where ri.item_id is not null and r.fecha between p_desde and p_hasta
      and (p_item_id is null or ri.item_id = p_item_id)
    group by ri.item_id
  ),
  -- Líneas de factura confirmadas del período. Solo admin: si no, ni se leen.
  fl as (
    select fi.item_id, f.id as factura_id, f.fecha, f.confirmada_en, f.proveedor_id, f.tipo_comprobante,
           fi.cantidad, fi.cantidad_base, fi.precio_unitario, fi.precio_por, fi.orden, fi.id as linea_id,
           coalesce(fi.subtotal, 0) as subtotal, coalesce(fi.iva, 0) as iva,
           case when f.tipo_comprobante = 'nota_credito' then -1 else 1 end as signo,
           coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad) as base
    from compras_factura_items fi
    join compras_facturas f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where v_admin and fi.item_id is not null and f.estado = 'confirmada'
      and f.fecha between p_desde and p_hasta
      and (p_item_id is null or fi.item_id = p_item_id)
  ),
  fa as (
    select fl.item_id,
      sum(fl.signo * fl.cantidad) as cantidad,
      sum(fl.signo * fl.base) as base,
      sum(fl.signo * fl.subtotal) as neto,
      sum(fl.signo * (fl.subtotal + fl.iva)) as total,
      count(distinct fl.factura_id)::int as facturas,
      count(distinct fl.proveedor_id)::int as proveedores,
      -- E4: ponderado, solo facturas (no NC), con cantidad y subtotal > 0.
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0)
        / nullif(sum(fl.cantidad) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0), 0) as prom_unidad,
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0)
        / nullif(sum(fl.base) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0), 0) as prom_base
    from fl
    group by fl.item_id
  ),
  -- E5: último precio del período (mismo orden que v_compras_insumos_resumen).
  uf as (
    select distinct on (fl.item_id) fl.item_id, fl.precio_unitario, fl.precio_por, fl.fecha, fl.factura_id,
           pr.nombre as proveedor
    from fl
    left join proveedores pr on pr.id = fl.proveedor_id
    where fl.signo = 1 and fl.precio_unitario > 0
    order by fl.item_id, fl.fecha desc, fl.confirmada_en desc nulls last, fl.orden desc, fl.linea_id desc
  ),
  -- E7: puente de stock. La reversión cuenta en el grupo del movimiento que anula.
  mv as (
    select m.item_id,
      sum(m.delta) filter (where m.created_at < v_ini) as inicio,
      sum(m.delta) filter (where m.created_at < v_fin) as fin,
      count(*) filter (where m.created_at >= v_ini and m.created_at < v_fin) as en_periodo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('entrada_remito', 'salida_remito_anulado')) as remitos,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('ajuste_conteo', 'conteo_fabrica')) as conteo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_factura') as factura,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_manual') as manual,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'devolucion_proveedor') as devolucion,
      -- A4 suma el tipo 'consumo_produccion' al check: este número aparece solo.
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'consumo_produccion') as consumo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) not in ('entrada_remito', 'salida_remito_anulado', 'ajuste_conteo',
          'conteo_fabrica', 'ajuste_factura', 'ajuste_manual', 'devolucion_proveedor', 'consumo_produccion')) as otros
    from compras_stock_movimientos m
    left join compras_stock_movimientos o on o.id = m.anula_movimiento_id and m.tipo = 'reversion'
    where m.created_at < v_fin
      and (p_item_id is null or m.item_id = p_item_id)
    group by m.item_id
  ),
  -- Pendiente de recibir hoy (no depende del período; mismo cálculo que v_compras_insumos_resumen).
  pa as (
    select pi.item_id,
           sum(greatest(pi.cantidad - coalesce((select sum(ri.cantidad) from compras_remito_items ri
                                                where ri.pedido_item_id = pi.id), 0), 0)) as pendiente
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.estado_recepcion in ('enviado', 'parcial')
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  )
  select
    i.id, i.nombre, i.estado, cat.nombre, i.unidad, i.unidad_base, i.cantidad_por_unidad,
    coalesce(pe.cantidad, 0), coalesce(pe.pedidos, 0),
    coalesce(re.cantidad, 0), re.base_real, coalesce(re.sin_pesar, 0), coalesce(re.remitos, 0),
    case when v_admin then coalesce(fa.cantidad, 0) end,
    case when v_admin then coalesce(fa.base, 0) end,
    case when v_admin then coalesce(fa.neto, 0) end,
    case when v_admin then coalesce(fa.total, 0) end,
    case when v_admin then coalesce(fa.facturas, 0) end,
    case when v_admin then coalesce(fa.proveedores, 0) end,
    fa.prom_unidad, fa.prom_base,
    uf.precio_unitario, uf.precio_por, uf.fecha, uf.factura_id, uf.proveedor,
    coalesce(mv.inicio, 0), coalesce(mv.fin, 0), coalesce(sa.cantidad, 0),
    coalesce(mv.remitos, 0), coalesce(mv.conteo, 0), coalesce(mv.factura, 0), coalesce(mv.manual, 0),
    coalesce(mv.devolucion, 0), coalesce(mv.otros, 0), -coalesce(mv.consumo, 0),
    coalesce(pa.pendiente, 0)
  from compras_items i
  left join compras_categorias cat on cat.id = i.categoria_id
  left join pe on pe.item_id = i.id
  left join re on re.item_id = i.id
  left join fa on fa.item_id = i.id
  left join uf on uf.item_id = i.id
  left join mv on mv.item_id = i.id
  left join pa on pa.item_id = i.id
  left join compras_stock_actual sa on sa.item_id = i.id
  where (p_item_id is not null and i.id = p_item_id)
     or (p_item_id is null and (pe.item_id is not null or re.item_id is not null
                                or fa.item_id is not null or coalesce(mv.en_periodo, 0) > 0))
  order by coalesce(fa.neto, 0) desc, i.nombre;
end;
$$;

revoke execute on function public.compras_trazabilidad_insumo(date, date, uuid) from public, anon;
grant execute on function public.compras_trazabilidad_insumo(date, date, uuid) to authenticated;
