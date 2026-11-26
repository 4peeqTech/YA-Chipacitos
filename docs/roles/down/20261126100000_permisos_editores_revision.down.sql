-- Down de 20261126100000_permisos_editores_revision: vuelve a las funciones de
-- 20261119160000_permisos_editores y saca la lectura de locales_config a gestores.

begin;

drop policy if exists "gestores ven locales_config" on public.locales_config;

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

delete from supabase_migrations.schema_migrations where version = '20261126100000';

commit;
