-- ============================================================================
-- Fase 7 (cont.): "Movimiento de stock" en Reportes necesita mostrar quién
-- generó cada movimiento. Mismo patrón que v_compras_conteos_historial /
-- v_compras_stock_actual: vista plana (corre con privilegios del owner,
-- bypassea RLS de `profiles`) gateada explícitamente en el WHERE por
-- tiene_acceso_compras() OR tiene_acceso_fabrica() — el mismo criterio que
-- ya protege compras_stock_movimientos_acceso.
-- ============================================================================

create view public.v_compras_stock_movimientos as
select
  m.id,
  m.item_id,
  m.delta,
  m.tipo,
  m.remito_id,
  m.conteo_id,
  m.created_at,
  ci.nombre as item_nombre,
  p.nombre as creado_por_nombre
from compras_stock_movimientos m
left join compras_items ci on ci.id = m.item_id
left join profiles p on p.id = m.creado_por
where (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_stock_movimientos to authenticated;
