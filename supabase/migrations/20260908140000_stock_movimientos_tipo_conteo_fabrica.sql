-- ============================================================================
-- Fase 7 del plan de reorganización de Compras: auditoría de quién y cuándo.
--
-- 1. v_compras_stock_actual: mismo patrón que v_compras_conteos_historial
--    (20260908130000) para resolver actualizado_por -> nombre sin abrir
--    profiles a Compras. Gateada por el mismo criterio que la policy
--    compras_stock_actual_acceso (tiene_acceso_compras() OR
--    tiene_acceso_fabrica()) — ver nota sobre vistas planas ahí.
--
-- 2. compras_stock_movimientos: hoy el conteo de fábrica y el ajuste manual
--    de Compras escriben el mismo tipo='ajuste_manual', así que en el
--    reporte de Movimiento de stock son indistinguibles. Se amplía el CHECK
--    para admitir 'conteo_fabrica' y se agrega conteo_id para poder saltar
--    del movimiento al conteo que lo originó. Las filas históricas quedan
--    como 'ajuste_manual' — no hay forma confiable de re-etiquetarlas
--    retroactivamente; el corte es la fecha de aplicación de esta migración.
-- ============================================================================

create view public.v_compras_stock_actual as
select
  s.item_id,
  s.cantidad,
  s.actualizado_en,
  s.actualizado_por,
  p.nombre as actualizado_por_nombre
from compras_stock_actual s
left join profiles p on p.id = s.actualizado_por
where (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_stock_actual to authenticated;

alter table compras_stock_movimientos drop constraint if exists compras_stock_movimientos_tipo_check;
alter table compras_stock_movimientos add constraint compras_stock_movimientos_tipo_check
  check (tipo in ('entrada_remito', 'ajuste_manual', 'conteo_fabrica'));

alter table compras_stock_movimientos add column if not exists conteo_id uuid references fabrica_conteos(id);
