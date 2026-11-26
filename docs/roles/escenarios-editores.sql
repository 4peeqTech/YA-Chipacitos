-- Escenarios de los editores de Roles y de la ficha (épica roles y permisos, T5/T6).
--
-- Entra como distintas personas (rol authenticated + su JWT), llama a
-- roles_vista_previa, roles_guardar y persona_guardar_acceso, y anota si cada
-- regla se cumple. Todo dentro de begin … rollback: no cambia nada.
--
-- Uso (con la migración todavía sin aplicar, la antepone scripts/permisos-editores-prueba.sh):
--   supabase db query --remote=<ref> -f docs/roles/escenarios-editores.sql --yes
-- Resultado: una fila por caso con ok = true. Cualquier false es un error.

begin;

create temp table _caso (n serial, caso text, ok boolean, detalle text) on commit drop;
grant insert, select on _caso to authenticated;
grant usage on sequence _caso_n_seq to authenticated;

do $$
declare
  v_admin uuid := (select id from profiles where rol = 'admin' and estado = 'activo' order by nombre limit 1);
  v_gerente uuid := (select id from profiles where rol = 'gerencia_operativa' and estado = 'activo' order by nombre limit 1);
  v_directivo uuid := (select id from profiles where rol = 'gerencia_directiva' and estado = 'activo' order by nombre limit 1);
  v_local uuid := (select cuenta_local_id from locales_config where cuenta_local_id is not null and activo order by orden limit 1);
  v_suc uuid := (select id from locales_config where activo and cuenta_local_id is not null order by orden limit 1);
  v_res jsonb;
  v_err text;
  v_n int;
  v_pant text;
  v_admin2 uuid := (select id from profiles where rol = 'admin' and estado = 'activo' order by nombre offset 1 limit 1);
  v_libre uuid := (select id from locales_config where activo and cuenta_local_id is null and tiene_fudo order by orden limit 1);
  v_otra uuid := (select id from locales_config where activo and cuenta_local_id is not null order by orden offset 1 limit 1);
  v_locales int;
begin
  -- Helpers locales: entrar como alguien / volver a postgres.
  create or replace function pg_temp.como(p uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p::text, true);
    execute 'set local role authenticated';
  end $f$;
  create or replace function pg_temp.yo() returns void language plpgsql as $f$
  begin
    execute 'reset role';
  end $f$;
  create or replace function pg_temp.caso(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as $f$
    insert into _caso (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle);
  $f$;

  -- 1. Vista previa: Admin suma "Ver la plata" a Gerencia Directiva.
  perform pg_temp.como(v_admin);
  v_res := roles_vista_previa('gerencia_directiva',
    array(select area from rol_areas where rol_key = 'gerencia_directiva'),
    array(select permiso from rol_permisos where rol_key = 'gerencia_directiva') || array['compras.ver_plata']);
  perform pg_temp.caso('vista previa: cada persona del rol gana Ver la plata',
    (select bool_and(p->'gana' ? 'compras.ver_plata') from jsonb_array_elements(v_res->'personas') p)
      and jsonb_array_length(v_res->'personas') = (v_res->>'total')::int,
    v_res::text);
  perform pg_temp.caso('vista previa: no guarda',
    not exists (select 1 from rol_permisos where rol_key = 'gerencia_directiva' and permiso = 'compras.ver_plata'));

  -- 2. Admin no se edita.
  begin
    perform roles_guardar('admin', array['administracion'], array[]::text[]);
    perform pg_temp.caso('Admin no se edita', false);
  exception when others then perform pg_temp.caso('Admin no se edita', sqlerrm like '%no se edita%', sqlerrm); end;

  -- 3. Pantalla solo Admin no se da a un rol.
  begin
    perform roles_guardar('gerencia_directiva', array['administracion'], array['pantalla:proveedores']);
    perform pg_temp.caso('solo Admin no se da a un rol', false);
  exception when others then perform pg_temp.caso('solo Admin no se da a un rol', sqlerrm like '%solo de Admin%', sqlerrm); end;

  -- 4. Facturas sin Ver la plata.
  begin
    perform roles_guardar('gerencia_directiva', array['administracion'], array['compras.facturas']);
    perform pg_temp.caso('Facturas exige Ver la plata (rol)', false);
  exception when others then perform pg_temp.caso('Facturas exige Ver la plata (rol)', sqlerrm like '%necesita%', sqlerrm); end;

  -- 5. Guardar un rol: defaults nuevos, historial por persona y del rol.
  select count(*) into v_n from permisos_historial;
  perform roles_guardar('gerencia_directiva',
    array(select area from rol_areas where rol_key = 'gerencia_directiva'),
    array(select permiso from rol_permisos where rol_key = 'gerencia_directiva') || array['compras.ver_plata', 'compras.facturas']);
  perform pg_temp.caso('roles_guardar: el rol queda con los defaults',
    exists (select 1 from rol_permisos where rol_key = 'gerencia_directiva' and permiso = 'compras.facturas'));
  perform pg_temp.caso('roles_guardar: la persona del rol lo tiene',
    persona_tiene_permiso(v_directivo, 'compras.ver_plata'));
  perform pg_temp.caso('roles_guardar: historial del rol y de cada persona',
    (select count(*) from permisos_historial) = v_n + 1 + (select count(*) from profiles where rol = 'gerencia_directiva' and estado = 'activo'));

  -- 6. Sin cambios no escribe historial.
  select count(*) into v_n from permisos_historial;
  perform roles_guardar('gerencia_directiva',
    array(select area from rol_areas where rol_key = 'gerencia_directiva'),
    array(select permiso from rol_permisos where rol_key = 'gerencia_directiva'));
  perform pg_temp.caso('roles_guardar sin cambios no escribe historial', (select count(*) from permisos_historial) = v_n);

  -- 7. Ficha: quitar una pantalla del rol a una persona.
  v_pant := (select min(permiso) from rol_permisos where rol_key = 'gerencia_directiva' and permiso like 'pantalla:%');
  perform persona_guardar_acceso(v_directivo, 'gerencia_directiva',
    jsonb_build_array(jsonb_build_object('permiso', v_pant, 'efecto', 'quitar'),
                      jsonb_build_object('permiso', 'pantalla:dashboard', 'efecto', 'agregar')),
    null);
  perform pg_temp.yo();
  perform pg_temp.caso('ficha: el "quitar" saca la pantalla', not persona_tiene_permiso(v_directivo, v_pant), v_pant);
  perform pg_temp.caso('ficha: un "agregar" igual al rol se descarta',
    not exists (select 1 from persona_permisos pp join rol_permisos rp on rp.permiso = pp.permiso and rp.rol_key = 'gerencia_directiva'
                where pp.persona_id = v_directivo and pp.efecto = 'agregar'));
  perform pg_temp.caso('ficha: historial con quién',
    exists (select 1 from permisos_historial where persona_id = v_directivo and hecho_por = v_admin and cambio->>'tipo' = 'persona'));

  -- 8. Ficha: solo Admin no se agrega a una persona.
  perform pg_temp.como(v_admin);
  begin
    perform persona_guardar_acceso(v_directivo, 'gerencia_directiva',
      jsonb_build_array(jsonb_build_object('permiso', 'pantalla:proveedores', 'efecto', 'agregar')), null);
    perform pg_temp.caso('ficha: solo Admin no se agrega', false);
  exception when others then perform pg_temp.caso('ficha: solo Admin no se agrega', sqlerrm like '%solo de Admin%', sqlerrm); end;

  -- 9. Ficha: quitar Ver la plata dejando Facturas.
  begin
    perform persona_guardar_acceso(v_directivo, 'gerencia_directiva',
      jsonb_build_array(jsonb_build_object('permiso', 'compras.ver_plata', 'efecto', 'quitar')), null);
    perform pg_temp.caso('Facturas exige Ver la plata (persona)', false);
  exception when others then perform pg_temp.caso('Facturas exige Ver la plata (persona)', sqlerrm like '%necesita%', sqlerrm); end;

  -- 10. Ficha: rol con Locales exige al menos una sucursal; con una, guarda.
  perform pg_temp.yo();
  insert into rol_areas (rol_key, area) values ('gerencia_operativa', 'locales') on conflict do nothing;
  delete from persona_sucursales where persona_id = v_gerente;
  perform pg_temp.como(v_admin);
  begin
    perform persona_guardar_acceso(v_gerente, 'gerencia_operativa', '[]'::jsonb, array[]::uuid[]);
    perform pg_temp.caso('Locales exige sucursal', false);
  exception when others then perform pg_temp.caso('Locales exige sucursal', sqlerrm like '%al menos una sucursal%', sqlerrm); end;
  perform persona_guardar_acceso(v_gerente, 'gerencia_operativa', '[]'::jsonb, array[v_suc]);
  perform pg_temp.yo();
  perform pg_temp.caso('con una sucursal, guarda',
    exists (select 1 from persona_sucursales where persona_id = v_gerente and local_config_id = v_suc));

  -- 11. Cuenta de local: conserva la suya aunque se mande otra cosa.
  perform pg_temp.como(v_admin);
  perform persona_guardar_acceso(v_local, 'local', '[]'::jsonb, array[]::uuid[]);
  perform pg_temp.yo();
  perform pg_temp.caso('cuenta de local conserva su sucursal',
    (select array_agg(local_config_id) from persona_sucursales where persona_id = v_local)
      = array[(select id from locales_config where cuenta_local_id = v_local)]);

  -- 12. Un gestor que no es Admin: no da lo que no tiene, ni el rol Admin.
  perform pg_temp.como(v_admin);
  perform persona_guardar_acceso(v_gerente, 'gerencia_operativa',
    jsonb_build_array(jsonb_build_object('permiso', 'usuarios.gestionar', 'efecto', 'agregar'))
      || coalesce((select jsonb_agg(jsonb_build_object('permiso', permiso, 'efecto', 'quitar'))
                   from rol_permisos where rol_key = 'gerencia_operativa' and permiso = 'compras.ver_plata'), '[]'::jsonb),
    array[v_suc]);
  perform pg_temp.yo();
  perform pg_temp.caso('gestor de prueba listo',
    persona_tiene_permiso(v_gerente, 'usuarios.gestionar') and not persona_tiene_permiso(v_gerente, 'compras.ver_plata'));

  perform pg_temp.como(v_gerente);
  begin
    perform roles_guardar('gerencia_directiva',
      array(select area from rol_areas where rol_key = 'gerencia_directiva'),
      array['compras.ver_plata', 'compras.facturas', 'pantalla:tareas', 'pantalla:fudo_inexistente']);
    perform pg_temp.caso('gestor: clave desconocida', false);
  exception when others then perform pg_temp.caso('gestor: clave desconocida', sqlerrm like '%desconocido%', sqlerrm); end;
  -- Gerencia Directiva ya tiene Ver la plata (paso 5): lo que no tenía se da; sacar el rol de Supervisor no.
  perform pg_temp.yo();
  delete from rol_permisos where rol_key = 'supervisor_locales' and permiso = 'compras.ver_plata';
  insert into rol_areas (rol_key, area) values ('supervisor_locales', 'administracion') on conflict do nothing;
  perform pg_temp.como(v_gerente);
  begin
    perform roles_guardar('supervisor_locales',
      array(select area from rol_areas where rol_key = 'supervisor_locales'),
      array(select permiso from rol_permisos where rol_key = 'supervisor_locales') || array['compras.ver_plata']);
    perform pg_temp.caso('gestor sin Ver la plata no se la da a un rol', false);
  exception when others then perform pg_temp.caso('gestor sin Ver la plata no se la da a un rol', sqlerrm like '%no lo tenés%', sqlerrm); end;
  begin
    perform persona_guardar_acceso(v_directivo, 'admin', '[]'::jsonb, null);
    perform pg_temp.caso('gestor no da el rol Admin', false);
  exception when others then perform pg_temp.caso('gestor no da el rol Admin', sqlerrm like '%Solo Admin%', sqlerrm); end;
  begin
    perform persona_guardar_acceso(v_gerente, 'gerencia_directiva', '[]'::jsonb, null);
    perform pg_temp.caso('nadie cambia su propio rol', false);
  exception when others then perform pg_temp.caso('nadie cambia su propio rol', sqlerrm like '%propio rol%', sqlerrm); end;
  perform pg_temp.caso('rol_puedo_asignar: gestor no asigna Admin', not rol_puedo_asignar('admin'));
  -- Lo único del rol que el gestor no tiene es Ver la plata (se la quitamos arriba).
  perform pg_temp.caso('rol_puedo_asignar: Gerencia Operativa solo si el rol no trae Ver la plata',
    rol_puedo_asignar('gerencia_operativa')
      = not exists (select 1 from rol_permisos where rol_key = 'gerencia_operativa' and permiso = 'compras.ver_plata'));

  -- 13. Sin usuarios.gestionar no se guarda nada.
  perform pg_temp.como(v_directivo);
  begin
    perform roles_guardar('gerencia_operativa', array['administracion'], array[]::text[]);
    perform pg_temp.caso('sin gestionar no guarda', false);
  exception when others then perform pg_temp.caso('sin gestionar no guarda', sqlerrm like '%No tenés permiso%', sqlerrm); end;
  begin
    perform roles_vista_previa('gerencia_operativa', array['administracion'], array[]::text[]);
    perform pg_temp.caso('sin gestionar no ve la vista previa', false);
  exception when others then perform pg_temp.caso('sin gestionar no ve la vista previa', sqlerrm like '%No tenés permiso%', sqlerrm); end;
  perform pg_temp.caso('sin gestionar no lee el historial', (select count(*) from permisos_historial) = 0);

  -- 14. El puente ya no está: tocar modulos_permitidos no cambia ajustes.
  perform pg_temp.yo();
  select count(*) into v_n from persona_permisos where persona_id = v_directivo;
  update profiles set modulos_permitidos = array['tareas'] where id = v_directivo;
  perform pg_temp.caso('sin puente: modulos_permitidos no cambia ajustes',
    (select count(*) from persona_permisos where persona_id = v_directivo) = v_n);
  -- 15. Revisión (20261126100000).
  -- Admin no necesita sucursal.
  perform pg_temp.como(v_admin);
  begin
    perform persona_guardar_acceso(v_admin2, 'admin', '[]'::jsonb, null);
    perform pg_temp.caso('Admin se guarda sin sucursales', true);
  exception when others then perform pg_temp.caso('Admin se guarda sin sucursales', false, sqlerrm); end;

  -- Gestor no da una sucursal que no tiene (ni a sí mismo).
  perform pg_temp.como(v_gerente);
  begin
    perform persona_guardar_acceso(v_gerente, 'gerencia_operativa', '[]'::jsonb, array[v_suc, v_otra]);
    perform pg_temp.caso('gestor no se da otra sucursal', false);
  exception when others then perform pg_temp.caso('gestor no se da otra sucursal', sqlerrm like '%no la tenés%', sqlerrm); end;

  -- Pasar a Local vincula la sucursal elegida, sin crear ninguna; salir de Local desvincula.
  perform pg_temp.como(v_admin);
  select count(*) into v_locales from locales_config;
  begin
    perform persona_guardar_acceso(v_directivo, 'local', '[]'::jsonb, array[]::uuid[]);
    perform pg_temp.caso('a Local sin sucursal pide elegir', false);
  exception when others then perform pg_temp.caso('a Local sin sucursal pide elegir', sqlerrm like '%elegí cuál%', sqlerrm); end;
  begin
    perform persona_guardar_acceso(v_directivo, 'local', '[]'::jsonb, array[v_otra]);
    perform pg_temp.caso('a Local con una sucursal que ya tiene cuenta', false);
  exception when others then perform pg_temp.caso('a Local con una sucursal que ya tiene cuenta', sqlerrm like '%ya tiene su cuenta%', sqlerrm); end;
  perform persona_guardar_acceso(v_directivo, 'local', '[]'::jsonb, array[v_libre]);
  perform pg_temp.yo();
  perform pg_temp.caso('a Local: vincula la elegida y no crea sucursales',
    (select cuenta_local_id from locales_config where id = v_libre) = v_directivo
    and (select count(*) from locales_config) = v_locales);
  perform pg_temp.como(v_admin);
  perform persona_guardar_acceso(v_directivo, 'gerencia_directiva', '[]'::jsonb, null);
  perform pg_temp.yo();
  perform pg_temp.caso('salir de Local desvincula',
    (select cuenta_local_id from locales_config where id = v_libre) is null
    and not exists (select 1 from persona_sucursales where persona_id = v_directivo));

  -- Ajustes de áreas que el rol no tiene se conservan al guardar.
  insert into persona_permisos (persona_id, permiso, efecto) values (v_directivo, 'fabrica.corregir_cargas_viejas', 'agregar') on conflict do nothing;
  perform pg_temp.como(v_admin);
  perform persona_guardar_acceso(v_directivo, 'gerencia_directiva', '[]'::jsonb, null);
  perform pg_temp.yo();
  perform pg_temp.caso('ajuste de otra área se conserva',
    exists (select 1 from persona_permisos where persona_id = v_directivo and permiso = 'fabrica.corregir_cargas_viejas'));

  -- Vista previa: un "agregar" que el rol pasa a traer no figura como ajuste que sigue.
  v_pant := (select clave from permisos_catalogo c where tipo = 'pantalla' and area = 'administracion' and not solo_admin
             and not exists (select 1 from rol_permisos where rol_key = 'gerencia_directiva' and permiso = c.clave) order by clave limit 1);
  insert into persona_permisos (persona_id, permiso, efecto) values (v_directivo, v_pant, 'agregar') on conflict do nothing;
  perform pg_temp.como(v_admin);
  v_res := roles_vista_previa('gerencia_directiva',
    array(select area from rol_areas where rol_key = 'gerencia_directiva'),
    array(select permiso from rol_permisos where rol_key = 'gerencia_directiva') || array[v_pant]);
  perform pg_temp.caso('vista previa: agregar redundante no figura como ajuste que sigue',
    not exists (select 1 from jsonb_array_elements(v_res->'personas') p where p->>'id' = v_directivo::text and p->'ajustes' ? v_pant), v_pant);

  -- roles_guardar: Facturas sin Ver la plata en una persona del rol (por su "quitar").
  perform pg_temp.yo();
  insert into persona_permisos (persona_id, permiso, efecto) values (v_gerente, 'compras.ver_plata', 'quitar')
  on conflict (persona_id, permiso) do update set efecto = 'quitar';
  perform pg_temp.como(v_admin);
  begin
    perform roles_guardar('gerencia_operativa',
      array(select area from rol_areas where rol_key = 'gerencia_operativa'),
      array(select permiso from rol_permisos where rol_key = 'gerencia_operativa') || array['compras.ver_plata', 'compras.facturas']);
    perform pg_temp.caso('roles_guardar: Facturas sin Ver la plata en una persona', false);
  exception when others then perform pg_temp.caso('roles_guardar: Facturas sin Ver la plata en una persona', sqlerrm like '%quedaría con%', sqlerrm); end;

  -- Gestores leen locales_config.
  perform pg_temp.como(v_gerente);
  perform pg_temp.caso('gestor lee locales_config', (select count(*) from locales_config) > 0);
  perform pg_temp.yo();
end $$;

reset role;
select n, caso, ok, detalle from _caso order by n;

rollback;
