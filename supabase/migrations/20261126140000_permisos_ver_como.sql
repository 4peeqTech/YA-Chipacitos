-- Épica roles y permisos, T7: "Ver como".
--
-- Quien gestiona usuarios ve la app como otra persona, en solo lectura. Es a
-- nivel app: menús, pantallas, botones y sucursal salen del acceso de la
-- persona; los datos se leen con la sesión de quien mira (su RLS).
--
-- 1. acceso_de(persona): el mismo JSON que mi_acceso(), para otra persona.
--    Solo con usuarios.gestionar; si no, null.
-- 2. rpc_de_lectura(): las funciones que no escriben (STABLE / IMMUTABLE). En
--    "ver como" la app solo deja llamar a esas.

-- 1. ------------------------------------------------------------------------

create or replace function public._acceso_json(p_persona uuid)
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
  where pr.id = p_persona and pr.estado = 'activo';
$$;

create or replace function public.mi_acceso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select _acceso_json(auth.uid());
$$;

create or replace function public.acceso_de(p_persona uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when tiene_permiso('usuarios.gestionar') then _acceso_json(p_persona) end;
$$;

revoke all on function public._acceso_json(uuid) from public, anon, authenticated;
revoke all on function public.acceso_de(uuid) from public, anon;
grant execute on function public.acceso_de(uuid) to authenticated;

-- 2. ------------------------------------------------------------------------

create or replace function public.rpc_de_lectura()
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(p.proname::text order by p.proname), '{}')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.provolatile in ('s', 'i');
$$;

revoke all on function public.rpc_de_lectura() from public, anon;
grant execute on function public.rpc_de_lectura() to authenticated;
