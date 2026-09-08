-- ============================================================================
-- Consolidación de navegación de Compras (11 entradas -> 5): esta migración
-- remapea los usuarios squad/personalizados que tenían alguna de las 6 keys
-- de módulo retiradas por la reorganización de rutas a su key sobreviviente,
-- sin duplicar si ya tenían la destino, y redefine tiene_acceso_compras()
-- con el set nuevo. Nadie pierde acceso: cada key retirada mapea a una
-- destino que ya estaba en el array del chequeo any-of.
-- ============================================================================

-- 1. Remapear profiles.modulos_permitidos.
update profiles
set modulos_permitidos = (
  select array_agg(distinct m)
  from unnest(modulos_permitidos) as u(k)
  cross join lateral (
    select case u.k
      when 'compras-remitos'      then 'compras-pedidos'
      when 'compras-solicitudes'  then 'compras-pedidos'
      when 'compras-pedido-base'  then 'compras-pedidos'
      when 'compras-conteos'      then 'compras-insumos'
      when 'compras-facturacion'  then 'proveedores'
      when 'proveedores_plantillas' then 'proveedores'
      else u.k
    end as m
  ) mapeo
)
where modulos_permitidos && array[
  'compras-remitos', 'compras-solicitudes', 'compras-pedido-base',
  'compras-conteos', 'compras-facturacion', 'proveedores_plantillas'
];

-- 2. tiene_acceso_compras(): set nuevo de 4 keys (reemplaza la versión de
--    20260810130000_fabrica_conteos_parametrizables.sql:171-190). Como (1)
--    garantiza que nadie pierde una key destino, nadie pierde acceso.
--    compras-facturacion nunca estuvo en este array, así que tampoco hay
--    pérdida por ese lado.
create or replace function public.tiene_acceso_compras()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'
        ]
      )
  );
$$;
