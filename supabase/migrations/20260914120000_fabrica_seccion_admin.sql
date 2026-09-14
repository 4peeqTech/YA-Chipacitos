-- Mudanza de "Conteos de fábrica" de Compras > Stock a la sección propia
-- Fábrica (ver plan sección Fábrica en admin). La key de módulo cambia de
-- 'compras-stock' a 'fabrica-conteos'; sin esta migración, los roles
-- custom (coordinador, gerencias) que hoy ven la pantalla vía
-- 'compras-stock' la perderían al mudarse de ruta.

-- Quien hoy ve "Conteos de fábrica" dentro de Compras > Stock la sigue
-- viendo después de la mudanza a la sección Fábrica.
update profiles
   set modulos_permitidos = modulos_permitidos || array['fabrica-conteos']
 where 'compras-stock' = any(modulos_permitidos)
   and not ('fabrica-conteos' = any(modulos_permitidos));

-- Y que el gate de la vista (v_compras_conteos_historial, ver
-- 20260908120000_compras_nav_consolidacion_modulos.sql) siga pasando aunque
-- en el futuro se le quite 'compras-stock' y le quede solo la key nueva.
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
          'compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes', 'fabrica-conteos'
        ]
      )
  );
$$;
