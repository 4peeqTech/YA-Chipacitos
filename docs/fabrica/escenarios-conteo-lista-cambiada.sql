-- Escenarios de 20261110150000_fabrica_conteo_lista_cambiada.sql (hotfix 10-11).
-- Arma su propia lista de prueba (3 insumos, un borrador y un cerrado viejo)
-- dentro de la transacción, así no depende de los datos de cada base. Corre
-- las acciones como qa-admin (lista) y qa-fabrica (conteo) con role
-- authenticated si la tabla tiene RLS, igual que la pantalla. El raise final
-- deshace todo.
--
-- Contra DEV:
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/fabrica/escenarios-conteo-lista-cambiada.sql
--
-- Antes de aplicar la migración: armar un archivo con "begin;", el contenido
-- de la migración y este archivo. Sin la migración, L2, L3 y L4 dan false
-- (es el error que vio Marcos).
do $$
declare
  c_fab   uuid := (select id from auth.users where email = 'qa-fabrica@chipacitos.test');
  c_adm   uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  v_rls   boolean := (select relrowsecurity from pg_class where oid = 'public.fabrica_conteo_items'::regclass);
  v_hoy   int := extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires'))::int;
  v_def   uuid;
  v_a     uuid;  -- se borra de la lista
  v_b     uuid;  -- se desactiva en la lista
  v_c     uuid;  -- queda
  v_bor   uuid;
  v_cer   uuid;
  v_sol   uuid;
  v_n     int;
  v_err   text;
  v_res   jsonb := '{}'::jsonb;
begin
  -- Datos de prueba (como dueño de la base, antes de bajar a authenticated).
  insert into compras_items (nombre, unidad, cantidad_por_masa, cantidad_por_unidad)
    values ('ZZ prueba A', 'Caja', 1, 1) returning id into v_a;
  insert into compras_items (nombre, unidad, cantidad_por_masa, cantidad_por_unidad)
    values ('ZZ prueba B', 'Caja', 1, 1) returning id into v_b;
  insert into compras_items (nombre, unidad, cantidad_por_masa, cantidad_por_unidad)
    values ('ZZ prueba C', 'Caja', 1, 1) returning id into v_c;
  insert into fabrica_conteo_definiciones (nombre, dia_semana, pide_masas)
    values ('ZZ lista de prueba', v_hoy, true) returning id into v_def;
  insert into fabrica_conteo_definicion_items (definicion_id, item_id, modo_calculo, orden)
    values (v_def, v_a, 'por_masa', 0), (v_def, v_b, 'por_masa', 1), (v_def, v_c, 'por_masa', 2);
  insert into fabrica_conteos (definicion_id, fecha, semana_desde, semana_hasta, estado, masas_proyectadas)
    values (v_def, current_date - 7, current_date - 7, current_date - 1, 'cerrado', 10) returning id into v_cer;
  insert into fabrica_conteos (definicion_id, fecha, semana_desde, semana_hasta, estado, masas_proyectadas)
    values (v_def, current_date, current_date, current_date + 6, 'borrador', 10) returning id into v_bor;
  insert into fabrica_conteo_items (conteo_id, item_id, cantidad)
    select c, i, 3 from unnest(array[v_cer, v_bor]) c, unnest(array[v_a, v_b, v_c]) i;

  -- La lista la edita Admin.
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  if v_rls then perform set_config('role', 'authenticated', true); end if;

  -- L1 cambiar meta/orden de un ítem que sigue en la lista: no se quita nada
  update fabrica_conteo_definicion_items set meta = 5, orden = 9 where definicion_id = v_def and item_id = v_a;
  v_res := v_res || jsonb_build_object('L1_ok',
    (select count(*) from fabrica_conteo_items where conteo_id = v_bor) = 3);

  -- L2 borrar A de la lista: sale del borrador, el cerrado viejo no se toca
  delete from fabrica_conteo_definicion_items where definicion_id = v_def and item_id = v_a;
  v_res := v_res || jsonb_build_object('L2_ok',
    not exists (select 1 from fabrica_conteo_items where conteo_id = v_bor and item_id = v_a)
    and exists (select 1 from fabrica_conteo_items where conteo_id = v_cer and item_id = v_a));

  -- L3 desactivar B en la lista: también sale del borrador
  update fabrica_conteo_definicion_items set activo = false where definicion_id = v_def and item_id = v_b;
  v_res := v_res || jsonb_build_object('L3_ok',
    not exists (select 1 from fabrica_conteo_items where conteo_id = v_bor and item_id = v_b)
    and (select count(*) from fabrica_conteo_items where conteo_id = v_cer) = 3);

  -- L4 Fábrica cierra: cierra y la solicitud trae solo lo que quedó en la lista
  perform set_config('request.jwt.claims', json_build_object('sub', c_fab, 'role', 'authenticated')::text, true);
  begin
    v_sol := cerrar_conteo_fabrica(v_bor);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_rls then perform set_config('role', 'none', true); end if;  -- Fábrica no lee solicitudes (RLS)
  v_res := v_res || jsonb_build_object('L4', coalesce(v_err, 'cerró'), 'L4_ok', v_err is null
    and (select estado from fabrica_conteos where id = v_bor) = 'cerrado'
    and (select array_agg(item_id) from compras_solicitud_items where solicitud_id = v_sol) = array[v_c]);

  -- L5 eliminar un borrador que ya movió stock: mensaje claro, no el error de FK
  -- (si L4 no cerró, su borrador sigue abierto y hay uno solo por lista)
  update fabrica_conteos set estado = 'descartado' where definicion_id = v_def and estado = 'borrador';
  insert into fabrica_conteos (definicion_id, fecha, semana_desde, semana_hasta, estado)
    values (v_def, current_date + 7, current_date + 7, current_date + 13, 'borrador') returning id into v_bor;
  insert into compras_stock_movimientos (item_id, delta, tipo, conteo_id) values (v_c, 2, 'conteo_fabrica', v_bor);
  if v_rls then perform set_config('role', 'authenticated', true); end if;
  begin
    perform eliminar_conteo_fabrica(v_bor);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('L5', v_err, 'L5_ok', v_err like 'Este conteo ya movió stock%');

  -- L6 sin movimientos se elimina como siempre
  if v_rls then perform set_config('role', 'none', true); end if;
  delete from compras_stock_movimientos where conteo_id = v_bor;
  if v_rls then perform set_config('role', 'authenticated', true); end if;
  begin
    perform eliminar_conteo_fabrica(v_bor);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('L6_ok', v_err is null and not exists (select 1 from fabrica_conteos where id = v_bor));

  v_res := v_res || jsonb_build_object('TODO_OK',
    (v_res->>'L1_ok')::boolean and (v_res->>'L2_ok')::boolean and (v_res->>'L3_ok')::boolean
    and (v_res->>'L4_ok')::boolean and (v_res->>'L5_ok')::boolean and (v_res->>'L6_ok')::boolean);
  raise exception 'RESULTADO %', v_res;
end;
$$;
