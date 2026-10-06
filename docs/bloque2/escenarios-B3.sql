-- Escenarios de B3 (docs/bloque2/plan-B3.md §10.2). Se corren en dev, SIN pushear:
-- el lote es la migración 20261005190000 completa + este bloque, que termina con
-- raise exception 'RESULTADO: …' y así revierte todo.
--
--   cat supabase/migrations/20261005190000_proveedores_archivar.sql docs/bloque2/escenarios-B3.sql > <scratchpad>/b3_escenarios.sql
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b3_escenarios.sql
--
-- S20 (concurrencia) va aparte, con dos sesiones y pg_sleep.

do $$
declare
  c_admin uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  c_squad uuid := (select id from auth.users where email = 'qa-squad@chipacitos.test');
  c_global uuid := (select id from proveedores where lower(btrim(nombre)) = 'global' limit 1);
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_err text;
  v_n int;
  v_prov uuid;    -- QA B3 Prov
  v_prov2 uuid;   -- QA B3 Activo (sin pedidos)
  v_prov3 uuid;   -- QA B3 Set (S6)
  v_tmp uuid;
  v_ped uuid;
  v_sol uuid;
  v_upd1 timestamptz;
  v_upd2 timestamptz;
  v_s6 jsonb := '[]'::jsonb;
  c record;
  v_item uuid := (select id from compras_items where estado = 'activo' order by nombre limit 1);
begin
  -- ===== S1 migración (sin rollback de por medio: lo que dejó la migración del lote)
  v_res := v_res || jsonb_build_object('S1', jsonb_build_object(
    'con_local_facturacion', (select count(*) from proveedores where local_facturacion_id is not null),
    'por_local', (select jsonb_object_agg(lf.nombre, n) from (select local_facturacion_id, count(*) n from proveedores group by 1) x join locales_facturacion lf on lf.id = x.local_facturacion_id),
    'columna_local', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proveedores' and column_name = 'local'),
    'fks', (select jsonb_object_agg(conrelid::regclass::text || '.' || conname, confdeltype) from pg_constraint where contype = 'f' and confrelid = 'public.proveedores'::regclass),
    'policies', (select jsonb_agg(policyname) from pg_policies where tablename = 'proveedores')));

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ===== S2 alta
  r := proveedores_guardar(null, '{"nombre":"QA B3 Prov"}'::jsonb);
  v_prov := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S2', jsonb_build_object('resp', r, 'estado', (select estado from proveedores where id = v_prov)));

  -- ===== S3 nombre repetido (mayúsculas y espacios)
  begin
    r := proveedores_guardar(null, '{"nombre":"qa b3 prov "}'::jsonb);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S3', v_err);

  -- ===== S4 editar solo cuit, dos veces
  select updated_at into v_upd1 from proveedores where id = v_prov;
  perform pg_sleep(0.01);
  r := proveedores_guardar(v_prov, '{"cuit":"30-11111111-1"}'::jsonb);
  select updated_at into v_upd2 from proveedores where id = v_prov;
  v_res := v_res || jsonb_build_object('S4a', jsonb_build_object('resp', r, 'updated_se_movio', v_upd2 > v_upd1));
  r := proveedores_guardar(v_prov, '{"cuit":"30-11111111-1"}'::jsonb);
  v_res := v_res || jsonb_build_object('S4b', jsonb_build_object('resp', r, 'updated_igual', (select updated_at from proveedores where id = v_prov) = v_upd2));

  -- ===== S5 campos no permitidos
  begin r := proveedores_guardar(v_prov, '{"estado":"archivado"}'::jsonb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S5a', v_err);
  begin r := proveedores_guardar(v_prov, '{"local":"x"}'::jsonb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S5b', v_err);

  -- ===== S6 _compras_pedidos_abiertos_de contra la tabla de _check_estado.ts
  perform set_config('role', 'postgres', true);
  insert into proveedores (nombre, estado) values ('QA B3 Set', 'activo') returning id into v_prov3;
  for c in select * from (values
      ('sin_enviar', 'sin_facturar', false, true),
      ('sin_enviar', 'facturado', false, true),
      ('enviado', 'sin_facturar', false, true),
      ('enviado', 'facturado', false, true),
      ('parcial', 'sin_facturar', true, true),
      ('parcial', 'facturado', true, true),
      ('recibido', 'sin_facturar', true, true),
      ('recibido', 'facturado', true, false),
      ('cerrado_manual', 'sin_facturar', true, true),
      ('cerrado_manual', 'sin_facturar', false, false),
      ('cerrado_manual', 'facturado', true, false),
      ('devuelto', 'sin_facturar', true, false),
      ('devuelto', 'facturado', true, false)
    ) t(er, ef, remito, abierto)
  loop
    insert into compras_pedidos (proveedor_id, estado, estado_recepcion, estado_facturacion, creado_por)
    values (v_prov3, 'borrador', c.er, c.ef, c_admin) returning id into v_ped;
    if c.remito then
      insert into compras_remitos (pedido_id, secuencia, fecha, creado_por) values (v_ped, 1, current_date, c_admin);
    end if;
    v_s6 := v_s6 || jsonb_build_object('caso', c.er || '+' || c.ef || case when c.remito then '+remito' else '' end,
      'ok', (exists (select 1 from _compras_pedidos_abiertos_de(v_prov3) a where a.id = v_ped)) = c.abierto);
  end loop;
  v_res := v_res || jsonb_build_object('S6', jsonb_build_object(
    'todos_ok', not exists (select 1 from jsonb_array_elements(v_s6) e where not (e->>'ok')::boolean),
    'casos', v_s6));
  perform set_config('role', 'authenticated', true);

  -- ===== S7 impacto de GLOBAL
  r := proveedores_impacto(c_global);
  v_res := v_res || jsonb_build_object('S7', jsonb_build_object(
    'abiertos', r->'abiertos', 'principal_de', jsonb_array_length(r->'principal_de'),
    'referencias', r->'referencias', 'puede_eliminar', r->'puede_eliminar'));

  -- ===== S8 archivar GLOBAL (si tiene abiertos, falla)
  begin r := proveedores_archivar(c_global, true); v_err := 'NO FALLÓ: ' || r::text;
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S8', jsonb_build_object('err', v_err, 'estado', (select estado from proveedores where id = c_global)));

  -- ===== S9 archivar QA B3 Prov, doble clic, reactivar, volver a archivar
  r := proveedores_archivar(v_prov, true);
  v_res := v_res || jsonb_build_object('S9', jsonb_build_object(
    'primera', r, 'segunda', proveedores_archivar(v_prov, true),
    'reactivar', proveedores_archivar(v_prov, false), 'archivar_otra_vez', proveedores_archivar(v_prov, true)));

  -- ===== S10 pedido nuevo para un archivado
  begin
    r := compras_guardar_pedido(null, v_prov, null, '[{"descripcion":"QA","cantidad":1}]'::jsonb);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S10', v_err);

  -- ===== S11 cambiar a un archivado el proveedor de un pedido sin enviar
  r := proveedores_guardar(null, '{"nombre":"QA B3 Activo"}'::jsonb);
  v_prov2 := (r->>'id')::uuid;
  r := compras_guardar_pedido(null, v_prov2, null, '[{"descripcion":"QA","cantidad":1}]'::jsonb);
  v_ped := (r->>'id')::uuid;
  begin
    r := compras_guardar_pedido(v_ped, v_prov, null, '[{"descripcion":"QA","cantidad":1}]'::jsonb);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S11', jsonb_build_object('cambio_a_archivado', v_err,
    'editar_lineas', compras_guardar_pedido(v_ped, v_prov2, null,
       jsonb_build_array(jsonb_build_object('id', (select id from compras_pedido_items where pedido_id = v_ped), 'descripcion', 'QA', 'cantidad', 2)))));

  -- ===== S12 reabrir un cerrado a mano de un proveedor archivado
  perform set_config('role', 'postgres', true);
  insert into proveedores (nombre, estado) values ('QA B3 Cerrado', 'activo') returning id into v_tmp;
  insert into compras_pedidos (proveedor_id, estado, estado_recepcion, estado_facturacion, creado_por, enviado_en)
  values (v_tmp, 'borrador', 'cerrado_manual', 'sin_facturar', c_admin, now()) returning id into v_ped;
  perform set_config('role', 'authenticated', true);
  r := proveedores_archivar(v_tmp, true);
  begin perform compras_reabrir_pedido(v_ped); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S12', jsonb_build_object('archivar', r, 'reabrir', v_err));

  -- ===== S13 convertir una solicitud con una línea de un archivado
  perform set_config('role', 'postgres', true);
  insert into compras_solicitudes (tipo, estado) values ('complementario', 'abierta') returning id into v_sol;
  insert into compras_solicitud_items (solicitud_id, item_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, proveedor_id, orden)
  values (v_sol, v_item, 'QA activo', 'u', 1, 1, true, v_prov2, 0),
         (v_sol, v_item, 'QA archivado', 'u', 1, 1, true, v_prov, 1);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from compras_pedidos where solicitud_id = v_sol;
  begin perform convertir_solicitud_a_pedidos(v_sol); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S13', jsonb_build_object('err', v_err,
    'pedidos_nuevos', (select count(*) from compras_pedidos where solicitud_id = v_sol) - v_n,
    'solicitud', (select estado from compras_solicitudes where id = v_sol)));

  -- ===== S14 eliminar GLOBAL
  begin perform proveedores_eliminar(c_global); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S14', v_err);

  -- ===== S15 eliminar uno sin nada
  r := proveedores_guardar(null, '{"nombre":"QA B3 Borrar"}'::jsonb);
  v_tmp := (r->>'id')::uuid;
  r := proveedores_impacto(v_tmp);
  perform proveedores_eliminar(v_tmp);
  v_res := v_res || jsonb_build_object('S15', jsonb_build_object('borrado', not exists (select 1 from proveedores where id = v_tmp),
    'puede_eliminar_antes', r->'puede_eliminar'));

  -- ===== S16 RESTRICT por SQL directo (gasto, par, historial)
  perform set_config('role', 'postgres', true);
  insert into proveedores (nombre, estado) values ('QA B3 FK gasto', 'activo') returning id into v_tmp;
  update gastos set proveedor_id = v_tmp where id = (select id from gastos order by created_at limit 1);
  begin delete from proveedores where id = v_tmp; v_err := 'NO FALLÓ';
  exception when foreign_key_violation then v_err := 'fk: ' || sqlerrm; when others then v_err := 'otro: ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S16_gasto', v_err);

  insert into proveedores (nombre, estado) values ('QA B3 FK par', 'activo') returning id into v_tmp;
  insert into compras_item_proveedores (item_id, proveedor_id, activo, es_principal) values (v_item, v_tmp, false, false);
  begin delete from proveedores where id = v_tmp; v_err := 'NO FALLÓ';
  exception when foreign_key_violation then v_err := 'fk: ' || sqlerrm; when others then v_err := 'otro: ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S16_par', v_err);

  insert into proveedores (nombre, estado) values ('QA B3 FK historial', 'activo') returning id into v_tmp;
  insert into compras_items_historial (item_id, lote, campo, proveedor_id) values (v_item, gen_random_uuid(), 'qa', v_tmp);
  begin delete from proveedores where id = v_tmp; v_err := 'NO FALLÓ';
  exception when foreign_key_violation then v_err := 'fk: ' || sqlerrm; when others then v_err := 'otro: ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S16_historial', v_err);

  -- ===== S17 qa-squad (Compras, no admin)
  perform set_config('request.jwt.claims', json_build_object('sub', c_squad, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := '{}'::jsonb;
  begin perform proveedores_guardar(null, '{"nombre":"x"}'::jsonb); exception when others then r := r || jsonb_build_object('guardar', sqlerrm); end;
  begin perform proveedores_impacto(c_global); exception when others then r := r || jsonb_build_object('impacto', sqlerrm); end;
  begin perform proveedores_archivar(c_global, true); exception when others then r := r || jsonb_build_object('archivar', sqlerrm); end;
  begin perform proveedores_eliminar(c_global); exception when others then r := r || jsonb_build_object('eliminar', sqlerrm); end;
  update proveedores set notas = notas where id = c_global;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('S17', jsonb_build_object('rpcs', r, 'update_directo_filas', v_n,
    'vista_filas', (select count(*) from v_compras_proveedor_insumos),
    'vista_con_ultimo_precio', (select count(*) from v_compras_proveedor_insumos where ultimo_precio is not null)));

  -- ===== S18 anon
  perform set_config('role', 'postgres', true);
  v_res := v_res || jsonb_build_object('S18', jsonb_build_object(
    'guardar', has_function_privilege('anon', 'public.proveedores_guardar(uuid, jsonb)', 'execute'),
    'impacto', has_function_privilege('anon', 'public.proveedores_impacto(uuid)', 'execute'),
    'archivar', has_function_privilege('anon', 'public.proveedores_archivar(uuid, boolean)', 'execute'),
    'eliminar', has_function_privilege('anon', 'public.proveedores_eliminar(uuid)', 'execute'),
    'exigir', has_function_privilege('anon', 'public._compras_exigir_proveedor_activo(uuid, text)', 'execute'),
    'abiertos', has_function_privilege('anon', 'public._compras_pedidos_abiertos_de(uuid)', 'execute'),
    'referencias', has_function_privilege('anon', 'public._proveedores_referencias(uuid)', 'execute'),
    'authenticated_exigir', has_function_privilege('authenticated', 'public._compras_exigir_proveedor_activo(uuid, text)', 'execute')));

  -- ===== S19 vista como admin: el último precio de cada par con factura
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := v_res || jsonb_build_object('S19', (
    select jsonb_agg(jsonb_build_object('insumo', item_nombre, 'proveedor', proveedor_id, 'ultimo', ultimo_precio,
      'por', ultimo_precio_por, 'fecha', ultima_factura_fecha, 'cobra_por', cobra_por, 'unidad_base', unidad_base))
    from v_compras_proveedor_insumos where ultimo_precio is not null));

  raise exception 'RESULTADO: %', v_res;
end $$;
