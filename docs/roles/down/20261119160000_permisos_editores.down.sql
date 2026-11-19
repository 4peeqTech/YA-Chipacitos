-- Down de 20261119160000_permisos_editores (épica roles y permisos, T5/T6).
-- Vuelve al estado de T3: sin funciones de guardado, lectura solo Admin y el
-- puente de T2 (Usuarios y Roles viejos guardan modulos_permitidos).
-- Correr junto con el código anterior a roles/editores.

begin;

drop function if exists public.roles_vista_previa(text, text[], text[]);
drop function if exists public.roles_guardar(text, text[], text[]);
drop function if exists public.persona_guardar_acceso(uuid, text, jsonb, uuid[]);
drop function if exists public.rol_puedo_asignar(text);
drop function if exists public._rol_diferencias(text, text[], text[]);
drop function if exists public._rol_normalizar(text[], text[]);
drop function if exists public._permisos_actuales(uuid);
drop function if exists public._permisos_resolver(boolean, text[], text[], text[], text[]);
drop function if exists public._permisos_exigir_que_tenga(text[]);
drop function if exists public._permisos_exigir_areas(text[]);
drop function if exists public._permisos_validar(text[]);
drop function if exists public._permisos_exigir_facturas_con_plata(text[]);
drop function if exists public._permisos_exigir_gestion();
drop function if exists public._resta(text[], text[]);

alter table permisos_catalogo drop column if exists solo_admin;

drop policy if exists "persona_permisos_lectura" on persona_permisos;
create policy "persona_permisos_lectura" on persona_permisos for select
  using (persona_id = (select auth.uid()) or (select es_admin()));
drop policy if exists "persona_sucursales_lectura" on persona_sucursales;
create policy "persona_sucursales_lectura" on persona_sucursales for select
  using (persona_id = (select auth.uid()) or (select es_admin()));
drop policy if exists "permisos_historial_lectura" on permisos_historial;
create policy "permisos_historial_lectura" on permisos_historial for select using ((select es_admin()));
drop policy if exists "gestores ven perfiles" on public.profiles;
drop policy if exists "gestores crean roles" on public.roles;
drop policy if exists "gestores editan roles" on public.roles;
drop policy if exists "gestores borran roles" on public.roles;

grant execute on function public._permisos_vincular_cuenta_local(uuid) to public;

-- Puente de T2 (copiado de 20261119130000_permisos_base.sql)
create or replace function public._permisos_puente_persona()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solo_admin text[] := array['pantalla:gastos_recurrentes', 'pantalla:gastos_clasificar', 'pantalla:pedidos_locales', 'pantalla:integraciones_fudo', 'pantalla:proveedores', 'pantalla:compras-avisos', 'pantalla:compras-facturas', 'pantalla:fabrica-reportes', 'pantalla:fabrica-registros', 'pantalla:fabrica-stock-terminado', 'pantalla:fabrica_parametros'];
  v_operativo boolean := new.rol in ('local', 'deposito', 'supervisor_fabrica', 'mayorista');
begin
  delete from persona_permisos where persona_id = new.id and permiso like 'pantalla:%';
  if new.rol is null or new.rol = 'admin' then
    return new;
  end if;

  insert into persona_permisos (persona_id, permiso, efecto)
  with quiere as (
    select distinct 'pantalla:' || m as permiso
    from unnest(coalesce(new.modulos_permitidos, '{}'::text[])) as m
    where exists (select 1 from permisos_catalogo c where c.clave = 'pantalla:' || m)
      and case when v_operativo then m = 'tareas' else not ('pantalla:' || m = any (v_solo_admin)) end
  ), del_rol as (
    select permiso from rol_permisos where rol_key = new.rol and permiso like 'pantalla:%'
  )
  select new.id, permiso, 'agregar' from quiere where permiso not in (select permiso from del_rol)
  union all
  select new.id, permiso, 'quitar' from del_rol where permiso not in (select permiso from quiere);

  if new.rol = 'local' then
    perform _permisos_vincular_cuenta_local(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists permisos_puente_persona on public.profiles;
create trigger permisos_puente_persona
  after insert or update of rol, modulos_permitidos on public.profiles
  for each row execute function public._permisos_puente_persona();

create or replace function public._permisos_puente_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into rol_areas (rol_key, area)
  values (new.key, case new.key
    when 'local' then 'locales' when 'deposito' then 'deposito'
    when 'supervisor_fabrica' then 'fabrica' when 'mayorista' then 'mayorista'
    else 'administracion' end)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists permisos_puente_rol on public.roles;
create trigger permisos_puente_rol
  after insert on public.roles
  for each row execute function public._permisos_puente_rol();

delete from supabase_migrations.schema_migrations where version = '20261119160000';

commit;
