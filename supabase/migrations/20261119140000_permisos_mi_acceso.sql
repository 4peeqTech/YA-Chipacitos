-- Épica roles y permisos, T3: el acceso efectivo de quien está logueado, en una
-- sola llamada. Lo usan proxy.ts y lib/permisos/servidor.ts, así la app decide
-- con la misma regla que las reglas de la base (persona_tiene_permiso).
-- Persona inactiva o sin sesión: null.

create or replace function public.mi_acceso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', pr.id,
    'nombre', pr.nombre,
    'rol', pr.rol,
    'es_admin', pr.rol = 'admin',
    'areas', coalesce((select jsonb_agg(ra.area order by ra.area) from rol_areas ra where ra.rol_key = pr.rol), '[]'::jsonb),
    'permisos', coalesce((select jsonb_agg(c.clave order by c.clave) from permisos_catalogo c where persona_tiene_permiso(pr.id, c.clave)), '[]'::jsonb),
    'sucursales', coalesce((select jsonb_agg(ps.local_config_id) from persona_sucursales ps where ps.persona_id = pr.id), '[]'::jsonb)
  )
  from profiles pr
  where pr.id = auth.uid() and pr.estado = 'activo';
$$;

revoke all on function public.mi_acceso() from public, anon;
grant execute on function public.mi_acceso() to authenticated;
