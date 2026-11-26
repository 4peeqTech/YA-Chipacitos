-- Épica roles y permisos, T5/T6: correcciones de la revisión de código.
--
-- 1. Quien gestiona usuarios lee locales_config (la ficha lista las sucursales).
-- 2. persona_guardar_acceso:
--    - Admin no necesita sucursales (entra a todas): se dejan como están.
--    - Pasar a una persona al rol Local la vincula a la sucursal elegida (una,
--      sin cuenta); ya no crea una sucursal por nombre. Sacarla de Local la
--      desvincula.
--    - Nadie da una sucursal que no tiene (Admin, todas).
--    - Los ajustes de áreas que su rol no tiene hoy se conservan.
-- 3. roles_guardar: "Facturas" sin "Ver la plata" tampoco en ninguna persona del rol.
-- 4. Vista previa: "lo ajustado no cambia" lista solo los ajustes que siguen
--    (un "agregar" que el rol pasa a traer se borra: ya viene del rol).

-- 1. ------------------------------------------------------------------------

drop policy if exists "gestores ven locales_config" on public.locales_config;
create policy "gestores ven locales_config" on public.locales_config for select
  using ((select tiene_permiso('usuarios.gestionar')));

-- 2. ------------------------------------------------------------------------

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
  v_vincular uuid;
  v_desvincular boolean := false;
  v_suc_antes uuid[];
  v_suc uuid[];
  v_pedidas uuid[] := array(select distinct s from unnest(coalesce(p_sucursales, '{}')) s order by s);
  v_falta text;
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

  -- Sucursales
  v_suc_antes := array(select local_config_id from persona_sucursales where persona_id = p_persona order by local_config_id);
  select id into v_cuenta from locales_config where cuenta_local_id = p_persona;
  if exists (select 1 from unnest(v_pedidas) s where not exists (select 1 from locales_config lc where lc.id = s)) then
    raise exception 'Sucursal desconocida.';
  end if;

  if p_rol = 'admin' then
    -- Admin entra a todas: no se le piden ni se le cambian.
    v_suc := v_suc_antes;
  elsif p_rol = 'local' then
    -- Una cuenta de local va con una sola sucursal, la suya.
    if v_cuenta is null then
      if cardinality(v_pedidas) <> 1 then
        raise exception 'Una cuenta de local va con una sola sucursal: elegí cuál.';
      end if;
      select lc.sucursal into v_falta from locales_config lc
      where lc.id = v_pedidas[1] and lc.cuenta_local_id is not null and lc.cuenta_local_id <> p_persona;
      if v_falta is not null then
        raise exception '"%" ya tiene su cuenta de local.', v_falta;
      end if;
      v_vincular := v_pedidas[1];
      v_suc := v_pedidas;
    else
      v_suc := array[v_cuenta];
    end if;
  else
    v_desvincular := v_cuenta is not null;
    if 'locales' = any (v_areas) then
      v_suc := v_pedidas;
      if cardinality(v_suc) = 0 then
        raise exception 'Elegí al menos una sucursal: su rol entra a Locales.';
      end if;
    else
      v_suc := '{}';
    end if;
  end if;

  -- Nadie da una sucursal que no tiene.
  if not es_admin() then
    select lc.sucursal into v_falta
    from locales_config lc
    where lc.id = any (v_suc) and not lc.id = any (v_suc_antes)
      and not exists (select 1 from mis_sucursales() m where m = lc.id)
    order by lc.orden
    limit 1;
    if v_falta is not null then
      raise exception 'No podés dar la sucursal "%": no la tenés.', v_falta;
    end if;
  end if;

  v_ajustes_antes := coalesce((select jsonb_agg(jsonb_build_object('permiso', permiso, 'efecto', efecto) order by permiso)
                               from persona_permisos where persona_id = p_persona), '[]');

  -- Escribir
  if p_rol is distinct from v_rol_antes then
    update profiles set rol = p_rol where id = p_persona;
    v_cambio := v_cambio || jsonb_build_object('rol', jsonb_build_array(v_rol_antes, p_rol));
  end if;

  -- Los ajustes de áreas que el rol no tiene hoy no se tocan (salvo Admin, que no lleva).
  delete from persona_permisos pp
  using permisos_catalogo c
  where pp.persona_id = p_persona and c.clave = pp.permiso
    and (p_rol = 'admin' or c.area is null or c.area = any (v_areas));
  insert into persona_permisos (persona_id, permiso, efecto)
  select p_persona, a, 'agregar' from unnest(v_agregar) a
  union all
  select p_persona, q, 'quitar' from unnest(v_quitar) q;

  if v_desvincular then
    update locales_config set cuenta_local_id = null where cuenta_local_id = p_persona;
  end if;
  if v_vincular is not null then
    update locales_config set cuenta_local_id = p_persona where id = v_vincular;
  end if;
  delete from persona_sucursales where persona_id = p_persona and not local_config_id = any (v_suc);
  insert into persona_sucursales (persona_id, local_config_id)
  select p_persona, s from unnest(v_suc) s on conflict do nothing;

  v_ajustes := coalesce((select jsonb_agg(jsonb_build_object('permiso', permiso, 'efecto', efecto) order by permiso)
                         from persona_permisos where persona_id = p_persona), '[]');

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

-- 3. ------------------------------------------------------------------------

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
  v_falta text;
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

  -- Facturas sin Ver la plata tampoco en ninguna persona del rol (por un ajuste "quitar").
  select pr.nombre into v_falta
  from profiles pr
  cross join lateral (
    select _permisos_resolver(false, v_areas, v_permisos,
      array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'agregar'),
      array(select permiso from persona_permisos where persona_id = pr.id and efecto = 'quitar')) as d
  ) x
  where pr.rol = p_rol and pr.estado = 'activo'
    and 'compras.facturas' = any (x.d) and not 'compras.ver_plata' = any (x.d)
  order by pr.nombre
  limit 1;
  if v_falta is not null then
    raise exception '% quedaría con "Facturas y notas de crédito" sin "Ver la plata de Compras" (tiene un ajuste en su ficha). Corregilo ahí primero.', v_falta;
  end if;

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

-- 4. ------------------------------------------------------------------------

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
         -- Ajustes sobre lo que cambia que siguen después de guardar (los que quedan
         -- iguales al rol se borran en roles_guardar).
         array(select pp.permiso from persona_permisos pp, cambiados
               where pp.persona_id = pr.id and pp.permiso = any (cambiados.claves)
                 and ((pp.efecto = 'quitar' and pp.permiso = any (p_permisos))
                   or (pp.efecto = 'agregar' and not pp.permiso = any (p_permisos)))
               order by pp.permiso),
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

revoke all on function public._rol_diferencias(text, text[], text[]) from public, anon, authenticated;
revoke all on function public.roles_guardar(text, text[], text[]) from public, anon;
revoke all on function public.persona_guardar_acceso(uuid, text, jsonb, uuid[]) from public, anon;
grant execute on function public.roles_guardar(text, text[], text[]) to authenticated;
grant execute on function public.persona_guardar_acceso(uuid, text, jsonb, uuid[]) to authenticated;
