-- Down de 20261126140000_permisos_ver_como (T7): sin acceso_de ni rpc_de_lectura; mi_acceso como en T3.

begin;

drop function if exists public.acceso_de(uuid);
drop function if exists public.rpc_de_lectura();

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

drop function if exists public._acceso_json(uuid);

delete from supabase_migrations.schema_migrations where version = '20261126140000';

commit;
