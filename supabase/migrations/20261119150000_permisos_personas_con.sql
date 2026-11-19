-- Épica roles y permisos, T3: personas activas que tienen alguno de estos permisos.
-- Reemplaza las consultas que armaban listas con rol = 'admin' o modulos_permitidos
-- (a quién avisar de una solicitud de compra, a quién se le puede asignar una tarea).

create or replace function public.personas_con_alguno(p_claves text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select pr.id
  from profiles pr
  where pr.estado = 'activo'
    and exists (select 1 from unnest(p_claves) as c(clave) where persona_tiene_permiso(pr.id, c.clave));
$$;

revoke all on function public.personas_con_alguno(text[]) from public, anon;
grant execute on function public.personas_con_alguno(text[]) to authenticated, service_role;
