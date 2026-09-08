-- ============================================================================
-- Fase 5 del plan de reorganización de Compras: la tab "Conteos de fábrica"
-- necesita mostrar quién cerró cada conteo. `fabrica_conteos`,
-- `fabrica_conteo_definiciones` y `fabrica_conteo_items` ya tienen policies
-- de lectura para tiene_acceso_compras() (ver 20260804150000 y posteriores),
-- así que no hace falta tocar esas RLS. Lo único que falta es resolver
-- `cerrado_por` -> nombre: `profiles` no le da a Compras lectura de perfiles
-- ajenos (solo el propio, o admin), y no vale la pena aflojar esa RLS para
-- esto. Se resuelve con una vista de solo lectura que ya trae el nombre
-- resuelto, en vez de abrir `profiles`.
--
-- Nota sobre por qué esto funciona sin RLS explícita en la vista: una vista
-- plana (sin `security_invoker`) corre con los privilegios del rol que la
-- crea (el rol de migraciones, que bypassea RLS), así que el WHERE de acá
-- abajo es el único gate real — sin él, cualquier autenticado con GRANT
-- vería todos los conteos cerrados sin importar su rol.
-- ============================================================================

create view public.v_compras_conteos_historial as
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
  cp.nombre as cerrado_por_nombre
from fabrica_conteos c
join fabrica_conteo_definiciones d on d.id = c.definicion_id
left join profiles cp on cp.id = c.cerrado_por
where c.estado = 'cerrado'
  and (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_conteos_historial to authenticated;
