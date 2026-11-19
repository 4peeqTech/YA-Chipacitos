-- Épica roles y permisos, T5 y T6: editores de Roles y de la ficha de usuario.
-- Plan: artifacts/roles-permisos/plan-tecnico; tickets t5-pantalla-roles y t6-ficha-usuario.
--
-- 1. Catálogo: marca de pantallas "solo Admin" (se ven en los editores, no se dan).
-- 2. Resolver en SQL (misma regla que lib/permisos/resolver.ts) para calcular
--    el antes y el después de un cambio sin guardarlo.
-- 3. roles_vista_previa, roles_guardar y persona_guardar_acceso: exigen
--    usuarios.gestionar, no dejan dar lo que quien guarda no tiene, no tocan
--    Admin y escriben permisos_historial.
-- 4. Quien gestiona usuarios lee perfiles, ajustes, sucursales e historial, y
--    crea o renombra roles que no son del sistema.
-- 5. Se borra el puente de T2: Usuarios y Roles ya guardan en las tablas nuevas.

-- 1. Pantallas solo Admin ----------------------------------------------------

alter table permisos_catalogo add column if not exists solo_admin boolean not null default false;

update permisos_catalogo
set solo_admin = clave = any (array[
  'pantalla:gastos_recurrentes', 'pantalla:gastos_clasificar', 'pantalla:pedidos_locales',
  'pantalla:integraciones_fudo', 'pantalla:proveedores', 'pantalla:compras-avisos',
  'pantalla:compras-facturas', 'pantalla:fabrica-reportes', 'pantalla:fabrica-registros',
  'pantalla:fabrica-stock-terminado', 'pantalla:fabrica_parametros'
]);

-- 2. Resolver ----------------------------------------------------------------

-- Permisos efectivos con estas áreas, defaults y ajustes (lib/permisos/resolver.ts).
create or replace function public._permisos_resolver(
  p_es_admin boolean, p_areas text[], p_rol_permisos text[], p_agregar text[], p_quitar text[]
)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(c.clave order by c.clave), '{}')
  from permisos_catalogo c
  where (c.area is null or c.area = any (coalesce(p_areas, '{}')))
    and (
      p_es_admin
      or ((c.clave = any (coalesce(p_rol_permisos, '{}')) or c.clave = any (coalesce(p_agregar, '{}')))
          and not c.clave = any (coalesce(p_quitar, '{}')))
    );
$$;

-- Lo que la persona tiene hoy (sin mirar si está activa: es para comparar).
create or replace function public._permisos_actuales(p_persona uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select _permisos_resolver(
    pr.rol = 'admin',
    array(select area from rol_areas where rol_key = pr.rol),
    array(select permiso from rol_permisos where rol_key = pr.rol),
    array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'agregar'),
    array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'quitar'))
  from profiles pr
  where pr.id = p_persona;
$$;

create or replace function public._resta(a text[], b text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(coalesce(a, '{}')) x where not x = any (coalesce(b, '{}'));
$$;

-- Corta si quien guarda no tiene alguno de estos permisos (Admin da todo).
create or replace function public._permisos_exigir_que_tenga(p_claves text[])
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_falta text;
begin
  if es_admin() then
    return;
  end if;
  select c.nombre into v_falta
  from permisos_catalogo c
  where c.clave = any (coalesce(p_claves, '{}')) and not tiene_permiso(c.clave)
  order by c.nombre
  limit 1;
  if v_falta is not null then
    raise exception 'No podés dar "%": no lo tenés.', v_falta;
  end if;
end;
$$;

create or replace function public._permisos_exigir_areas(p_areas text[])
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_falta text;
begin
  select a into v_falta from unnest(coalesce(p_areas, '{}')) a
  where a not in ('administracion', 'locales', 'fabrica', 'deposito', 'mayorista')
  limit 1;
  if v_falta is not null then
    raise exception 'Área desconocida: %', v_falta;
  end if;
  if es_admin() then
    return;
  end if;
  select a into v_falta from unnest(coalesce(p_areas, '{}')) a where not tiene_area(a) limit 1;
  if v_falta is not null then
    raise exception 'No podés dar el área "%": no la tenés.', v_falta;
  end if;
end;
$$;

-- Claves que se quieren dar: existen en el catálogo y no son pantallas solo Admin.
create or replace function public._permisos_validar(p_claves text[])
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_falta text;
begin
  select x into v_falta from unnest(coalesce(p_claves, '{}')) x
  where not exists (select 1 from permisos_catalogo c where c.clave = x)
  limit 1;
  if v_falta is not null then
    raise exception 'Permiso desconocido: %', v_falta;
  end if;

  select c.nombre into v_falta from permisos_catalogo c
  where c.clave = any (coalesce(p_claves, '{}')) and c.solo_admin
  limit 1;
  if v_falta is not null then
    raise exception '"%" es solo de Admin: no se puede dar.', v_falta;
  end if;
end;
$$;

create or replace function public._permisos_exigir_facturas_con_plata(p_efectivos text[])
returns void
language plpgsql
immutable
as $$
begin
  if 'compras.facturas' = any (p_efectivos) and not 'compras.ver_plata' = any (p_efectivos) then
    raise exception '"Facturas y notas de crédito" necesita "Ver la plata de Compras".';
  end if;
end;
$$;

create or replace function public._permisos_exigir_gestion()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not tiene_permiso('usuarios.gestionar') then
    raise exception 'No tenés permiso para gestionar usuarios y roles.';
  end if;
end;
$$;

-- Qué gana y qué pierde cada persona activa del rol si el rol pasa a tener estas
-- áreas y defaults (sus ajustes de hoy siguen).
create or replace function public._rol_diferencias(p_rol text, p_areas text[], p_permisos text[])
returns table (persona_id uuid, nombre text, gana text[], pierde text[], ajustes text[], sin_sucursal boolean)
language sql
stable
set search_path = public
as $$
  with cambiados as (
    select _resta(p_permisos, array(select permiso from rol_permisos where rol_key = p_rol))
        || _resta(array(select permiso from rol_permisos where rol_key = p_rol), p_permisos) as claves
  )
  select pr.id, pr.nombre,
         _resta(d.despues, d.antes),
         _resta(d.antes, d.despues),
         array(select pp.permiso from persona_permisos pp, cambiados
               where pp.persona_id = pr.id and pp.permiso = any (cambiados.claves) order by pp.permiso),
         'locales' = any (p_areas)
           and not exists (select 1 from rol_areas ra where ra.rol_key = p_rol and ra.area = 'locales')
           and not exists (select 1 from persona_sucursales ps where ps.persona_id = pr.id)
  from profiles pr
  cross join lateral (
    select _permisos_actuales(pr.id) as antes,
           _permisos_resolver(false, p_areas, p_permisos,
             array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'agregar'),
             array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'quitar')) as despues
  ) d
  where pr.rol = p_rol and pr.estado = 'activo'
  order by pr.nombre;
$$;

-- Defaults normalizados: solo claves del catálogo y de las áreas del rol.
create or replace function public._rol_normalizar(p_areas text[], p_permisos text[])
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(c.clave order by c.clave), '{}')
  from permisos_catalogo c
  where c.clave = any (coalesce(p_permisos, '{}'))
    and (c.area is null or c.area = any (coalesce(p_areas, '{}')));
$$;

-- 3. Guardado ----------------------------------------------------------------

create or replace function public.roles_vista_previa(p_rol text, p_areas text[], p_permisos text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_areas text[] := array(select distinct a from unnest(coalesce(p_areas, '{}')) a order by a);
  v_areas_antes text[] := array(select area from rol_areas where rol_key = p_rol order by area);
  v_permisos text[];
begin
  perform _permisos_exigir_gestion();
  v_permisos := _rol_normalizar(v_areas, p_permisos);
  return jsonb_build_object(
    'areas_gana', to_jsonb(_resta(v_areas, v_areas_antes)),
    'areas_pierde', to_jsonb(_resta(v_areas_antes, v_areas)),
    'agrega', to_jsonb(_resta(v_permisos, array(select permiso from rol_permisos where rol_key = p_rol))),
    'quita', to_jsonb(_resta(array(select permiso from rol_permisos where rol_key = p_rol), v_permisos)),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.persona_id, 'nombre', d.nombre, 'gana', d.gana, 'pierde', d.pierde,
        'ajustes', d.ajustes, 'sin_sucursal', d.sin_sucursal) order by d.nombre)
      from _rol_diferencias(p_rol, v_areas, v_permisos) d
    ), '[]'::jsonb),
    'total', (select count(*) from profiles where rol = p_rol and estado = 'activo')
  );
end;
$$;

create or replace function public.roles_guardar(p_rol text, p_areas text[], p_permisos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_areas text[] := array(select distinct a from unnest(coalesce(p_areas, '{}')) a order by a);
  v_areas_antes text[] := array(select area from rol_areas where rol_key = p_rol order by area);
  v_antes text[] := array(select permiso from rol_permisos where rol_key = p_rol order by permiso);
  v_permisos text[];
  v_afectadas int := 0;
  v_dif record;
begin
  perform _permisos_exigir_gestion();
  if not exists (select 1 from roles where key = p_rol) then
    raise exception 'El rol no existe.';
  end if;
  if p_rol = 'admin' then
    raise exception 'Admin tiene todo y no se edita.';
  end if;

  perform _permisos_exigir_areas(_resta(v_areas, v_areas_antes));
  perform _permisos_validar(_resta(p_permisos, v_antes));
  v_permisos := _rol_normalizar(v_areas, p_permisos);
  perform _permisos_exigir_facturas_con_plata(v_permisos);
  perform _permisos_exigir_que_tenga(_resta(v_permisos, v_antes));

  if v_areas = v_areas_antes and v_permisos = v_antes then
    return jsonb_build_object('afectadas', 0);
  end if;

  -- Historial por persona, con el antes calculado antes de escribir.
  for v_dif in select * from _rol_diferencias(p_rol, v_areas, v_permisos) loop
    if cardinality(v_dif.gana) > 0 or cardinality(v_dif.pierde) > 0 then
      v_afectadas := v_afectadas + 1;
      insert into permisos_historial (persona_id, rol_key, cambio, hecho_por)
      values (v_dif.persona_id, p_rol,
              jsonb_build_object('tipo', 'rol', 'gana', v_dif.gana, 'pierde', v_dif.pierde),
              auth.uid());
    end if;
  end loop;

  delete from rol_areas where rol_key = p_rol and not area = any (v_areas);
  insert into rol_areas (rol_key, area) select p_rol, a from unnest(v_areas) a on conflict do nothing;
  delete from rol_permisos where rol_key = p_rol and not permiso = any (v_permisos);
  insert into rol_permisos (rol_key, permiso) select p_rol, x from unnest(v_permisos) x on conflict do nothing;

  -- Ajustes que quedaron iguales al rol: no cambian el acceso, se borran.
  delete from persona_permisos pp
  using profiles pr
  where pr.id = pp.persona_id and pr.rol = p_rol
    and ((pp.efecto = 'agregar' and pp.permiso = any (v_permisos))
      or (pp.efecto = 'quitar' and not pp.permiso = any (v_permisos)));

  insert into permisos_historial (rol_key, cambio, hecho_por)
  values (p_rol, jsonb_build_object(
    'tipo', 'rol',
    'areas_gana', _resta(v_areas, v_areas_antes), 'areas_pierde', _resta(v_areas_antes, v_areas),
    'agrega', _resta(v_permisos, v_antes), 'quita', _resta(v_antes, v_permisos),
    'afectadas', v_afectadas), auth.uid());

  return jsonb_build_object('afectadas', v_afectadas);
end;
$$;

-- p_ajustes: [{ "permiso": "pantalla:gastos", "efecto": "agregar" | "quitar" }].
-- Los ajustes iguales al rol se descartan. Una cuenta de local conserva su sucursal.
create or replace function public.persona_guardar_acceso(p_persona uuid, p_rol text, p_ajustes jsonb, p_sucursales uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol_antes text;
  v_areas text[];
  v_areas_antes text[];
  v_rol_permisos text[];
  v_agregar text[];
  v_quitar text[];
  v_antes text[];
  v_despues text[];
  v_cuenta uuid;
  v_suc_antes uuid[];
  v_suc uuid[];
  v_ajustes_antes jsonb;
  v_ajustes jsonb;
  v_cambio jsonb := '{}'::jsonb;
begin
  perform _permisos_exigir_gestion();

  select rol into v_rol_antes from profiles where id = p_persona and estado = 'activo';
  if not found then
    raise exception 'La persona no existe o no está activa.';
  end if;
  if not exists (select 1 from roles where key = p_rol) then
    raise exception 'El rol no existe.';
  end if;
  if p_rol is distinct from v_rol_antes then
    if p_persona = auth.uid() then
      raise exception 'No podés cambiar tu propio rol.';
    end if;
    if (p_rol = 'admin' or v_rol_antes = 'admin') and not es_admin() then
      raise exception 'Solo Admin puede dar o sacar el rol Admin.';
    end if;
  end if;

  v_areas := array(select area from rol_areas where rol_key = p_rol order by area);
  v_areas_antes := array(select area from rol_areas where rol_key = v_rol_antes order by area);
  v_rol_permisos := array(select permiso from rol_permisos where rol_key = p_rol);

  -- Ajustes: solo los que difieren del rol y caen en sus áreas. Admin no lleva.
  if p_rol = 'admin' then
    v_agregar := '{}';
    v_quitar := '{}';
  else
    v_agregar := array(select distinct a->>'permiso' from jsonb_array_elements(coalesce(p_ajustes, '[]')) a
                       where a->>'efecto' = 'agregar');
    v_quitar := array(select distinct a->>'permiso' from jsonb_array_elements(coalesce(p_ajustes, '[]')) a
                      where a->>'efecto' = 'quitar');
    if exists (select 1 from jsonb_array_elements(coalesce(p_ajustes, '[]')) a
               where coalesce(a->>'efecto', '') not in ('agregar', 'quitar')) then
      raise exception 'Ajuste inválido: el efecto es "agregar" o "quitar".';
    end if;
    if exists (select 1 from unnest(v_quitar) x where not exists (select 1 from permisos_catalogo c where c.clave = x)) then
      raise exception 'Permiso desconocido.';
    end if;
    perform _permisos_validar(v_agregar);
    v_agregar := _resta(_rol_normalizar(v_areas, v_agregar), v_rol_permisos);
    v_quitar := array(select x from unnest(v_quitar) x where x = any (v_rol_permisos) order by x);
  end if;

  v_antes := _permisos_actuales(p_persona);
  v_despues := _permisos_resolver(p_rol = 'admin', v_areas, v_rol_permisos, v_agregar, v_quitar);
  perform _permisos_exigir_facturas_con_plata(v_despues);
  perform _permisos_exigir_areas(_resta(v_areas, v_areas_antes));
  perform _permisos_exigir_que_tenga(_resta(v_despues, v_antes));

  -- Sucursales: la cuenta de local tiene la suya; con Locales, al menos una; sin Locales, ninguna.
  v_suc_antes := array(select local_config_id from persona_sucursales where persona_id = p_persona order by local_config_id);
  if p_rol = 'local' and not exists (select 1 from locales_config where cuenta_local_id = p_persona) then
    perform _permisos_vincular_cuenta_local(p_persona);
  end if;
  select id into v_cuenta from locales_config where cuenta_local_id = p_persona;
  if v_cuenta is not null then
    v_suc := array[v_cuenta];
  elsif 'locales' = any (v_areas) then
    v_suc := array(select distinct s from unnest(coalesce(p_sucursales, '{}')) s order by s);
    if cardinality(v_suc) = 0 then
      raise exception 'Elegí al menos una sucursal: su rol entra a Locales.';
    end if;
    if exists (select 1 from unnest(v_suc) s where not exists (select 1 from locales_config lc where lc.id = s)) then
      raise exception 'Sucursal desconocida.';
    end if;
  else
    v_suc := '{}';
  end if;

  v_ajustes_antes := coalesce((select jsonb_agg(jsonb_build_object('permiso', permiso, 'efecto', efecto) order by permiso)
                               from persona_permisos where persona_id = p_persona), '[]');
  v_ajustes := coalesce((select jsonb_agg(x order by x->>'permiso') from (
                 select jsonb_build_object('permiso', a, 'efecto', 'agregar') x from unnest(v_agregar) a
                 union all
                 select jsonb_build_object('permiso', q, 'efecto', 'quitar') from unnest(v_quitar) q) t), '[]');

  -- Escribir
  if p_rol is distinct from v_rol_antes then
    update profiles set rol = p_rol where id = p_persona;
    v_cambio := v_cambio || jsonb_build_object('rol', jsonb_build_array(v_rol_antes, p_rol));
  end if;

  delete from persona_permisos where persona_id = p_persona;
  insert into persona_permisos (persona_id, permiso, efecto)
  select p_persona, a, 'agregar' from unnest(v_agregar) a
  union all
  select p_persona, q, 'quitar' from unnest(v_quitar) q;

  delete from persona_sucursales where persona_id = p_persona and not local_config_id = any (v_suc);
  insert into persona_sucursales (persona_id, local_config_id)
  select p_persona, s from unnest(v_suc) s on conflict do nothing;

  -- Historial: rol, lo que gana o pierde, y las sucursales (por nombre, para leerlo después).
  if cardinality(_resta(v_despues, v_antes)) > 0 then
    v_cambio := v_cambio || jsonb_build_object('gana', _resta(v_despues, v_antes));
  end if;
  if cardinality(_resta(v_antes, v_despues)) > 0 then
    v_cambio := v_cambio || jsonb_build_object('pierde', _resta(v_antes, v_despues));
  end if;
  if v_suc is distinct from v_suc_antes then
    v_cambio := v_cambio || jsonb_build_object(
      'sucursales_agrega', to_jsonb(array(select lc.sucursal from locales_config lc
                                          where lc.id = any (v_suc) and not lc.id = any (v_suc_antes) order by lc.orden)),
      'sucursales_quita', to_jsonb(array(select lc.sucursal from locales_config lc
                                         where lc.id = any (v_suc_antes) and not lc.id = any (v_suc) order by lc.orden)));
  end if;
  if v_cambio = '{}'::jsonb and v_ajustes is distinct from v_ajustes_antes then
    v_cambio := jsonb_build_object('ajustes', true);
  end if;

  if v_cambio <> '{}'::jsonb then
    insert into permisos_historial (persona_id, rol_key, cambio, hecho_por)
    values (p_persona, p_rol, v_cambio || jsonb_build_object('tipo', 'persona'), auth.uid());
  end if;
end;
$$;

-- Para crear usuarios (/api/usuarios): si quien gestiona puede dar este rol tal como está.
create or replace function public.rol_puedo_asignar(p_rol text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso('usuarios.gestionar')
     and exists (select 1 from roles where key = p_rol)
     and (es_admin() or (
       p_rol <> 'admin'
       and not exists (select 1 from rol_areas ra where ra.rol_key = p_rol and not tiene_area(ra.area))
       and not exists (
         select 1 from rol_permisos rp
         join permisos_catalogo c on c.clave = rp.permiso
         where rp.rol_key = p_rol
           and (c.area is null or exists (select 1 from rol_areas ra where ra.rol_key = p_rol and ra.area = c.area))
           and not tiene_permiso(rp.permiso))
     ));
$$;

revoke all on function public._permisos_resolver(boolean, text[], text[], text[], text[]) from public, anon, authenticated;
revoke all on function public._permisos_actuales(uuid) from public, anon, authenticated;
revoke all on function public._resta(text[], text[]) from public, anon, authenticated;
revoke all on function public._permisos_exigir_que_tenga(text[]) from public, anon, authenticated;
revoke all on function public._permisos_exigir_areas(text[]) from public, anon, authenticated;
revoke all on function public._permisos_validar(text[]) from public, anon, authenticated;
revoke all on function public._permisos_exigir_facturas_con_plata(text[]) from public, anon, authenticated;
revoke all on function public._permisos_exigir_gestion() from public, anon, authenticated;
revoke all on function public._rol_diferencias(text, text[], text[]) from public, anon, authenticated;
revoke all on function public._rol_normalizar(text[], text[]) from public, anon, authenticated;

revoke all on function public.roles_vista_previa(text, text[], text[]) from public, anon;
revoke all on function public.roles_guardar(text, text[], text[]) from public, anon;
revoke all on function public.persona_guardar_acceso(uuid, text, jsonb, uuid[]) from public, anon;
revoke all on function public.rol_puedo_asignar(text) from public, anon;
grant execute on function public.roles_vista_previa(text, text[], text[]) to authenticated;
grant execute on function public.roles_guardar(text, text[], text[]) to authenticated;
grant execute on function public.persona_guardar_acceso(uuid, text, jsonb, uuid[]) to authenticated;
grant execute on function public.rol_puedo_asignar(text) to authenticated;

-- Crea o vincula la sucursal de una cuenta de local: solo el servidor (alta de usuarios) y las funciones de arriba.
revoke all on function public._permisos_vincular_cuenta_local(uuid) from public, anon, authenticated;
grant execute on function public._permisos_vincular_cuenta_local(uuid) to service_role;

-- 4. Lectura y roles para quien gestiona usuarios ---------------------------

drop policy if exists "persona_permisos_lectura" on persona_permisos;
create policy "persona_permisos_lectura" on persona_permisos for select
  using (persona_id = (select auth.uid()) or (select tiene_permiso('usuarios.gestionar')));

drop policy if exists "persona_sucursales_lectura" on persona_sucursales;
create policy "persona_sucursales_lectura" on persona_sucursales for select
  using (persona_id = (select auth.uid()) or (select tiene_permiso('usuarios.gestionar')));

drop policy if exists "permisos_historial_lectura" on permisos_historial;
create policy "permisos_historial_lectura" on permisos_historial for select
  using ((select tiene_permiso('usuarios.gestionar')));

drop policy if exists "gestores ven perfiles" on public.profiles;
create policy "gestores ven perfiles" on public.profiles for select
  using ((select tiene_permiso('usuarios.gestionar')));

-- Crear, renombrar y borrar roles que no son del sistema (Admin sigue con "admin gestiona roles").
drop policy if exists "gestores crean roles" on public.roles;
create policy "gestores crean roles" on public.roles for insert
  with check ((select tiene_permiso('usuarios.gestionar')) and not es_sistema);
drop policy if exists "gestores editan roles" on public.roles;
create policy "gestores editan roles" on public.roles for update
  using ((select tiene_permiso('usuarios.gestionar')) and not es_sistema)
  with check (not es_sistema);
drop policy if exists "gestores borran roles" on public.roles;
create policy "gestores borran roles" on public.roles for delete
  using ((select tiene_permiso('usuarios.gestionar')) and not es_sistema);

-- 5. Sin puente --------------------------------------------------------------

drop trigger if exists permisos_puente_persona on public.profiles;
drop trigger if exists permisos_puente_rol on public.roles;
drop function if exists public._permisos_puente_persona();
drop function if exists public._permisos_puente_rol();
