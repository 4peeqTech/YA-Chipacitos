-- Escenarios de 20261006160000 (precio_correcto fuera del alcance de quien no es
-- admin). Se corren detrás de la migración en un lote begin/rollback. Arma una
-- corrección de precio propia (como admin) y lee como qa-squad y como admin.
do $$
declare
  c_admin  uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  c_squad  uuid := (select id from auth.users where email = 'qa-squad@chipacitos.test');
  c_fec    uuid := 'a360d424-8e73-4a7c-b75f-1c4522113d02';
  m_precio uuid := (select id from compras_devolucion_motivos where nombre = 'Precio mal facturado');
  m_mal    uuid := (select id from compras_devolucion_motivos where nombre = 'Mercadería en mal estado');
  v_res jsonb := '{}'::jsonb;
  r jsonb; v_err text; v_p uuid; v_f uuid; v_fi uuid; v_dev uuid; v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  r := compras_guardar_pedido(null, '6214db3f-40f3-46fb-ac8e-3a5a67170bf7', null,
        jsonb_build_array(jsonb_build_object('item_id', c_fec, 'descripcion', 'Fécula de Mandioca', 'unidad', 'Bolsa', 'cantidad', 3)));
  v_p := (r->>'id')::uuid;
  perform compras_marcar_pedido_enviado(v_p, false);
  perform compras_guardar_remito(null, v_p, current_date, jsonb_build_array(jsonb_build_object(
    'pedido_item_id', (select id from compras_pedido_items where pedido_id = v_p), 'descripcion', 'Fécula de Mandioca', 'cantidad', 3)), null);
  r := compras_guardar_factura(null, v_p, 'B4-QA-9201', current_date, null, null, null, jsonb_build_array(jsonb_build_object(
    'pedido_item_id', (select id from compras_pedido_items where pedido_id = v_p), 'item_id', c_fec, 'descripcion', 'Fécula de Mandioca',
    'unidad', 'Bolsa', 'cantidad', 3, 'precio_unitario', 2450, 'alicuota_iva', 21, 'precio_por', 'unidad')), null);
  v_f := (r->>'id')::uuid;
  perform compras_confirmar_factura(v_f, null, false, null, null);
  select id into v_fi from compras_factura_items where factura_id = v_f;
  r := compras_registrar_devolucion(v_p, m_precio, false,
        jsonb_build_array(jsonb_build_object('factura_item_id', v_fi, 'cantidad', 3, 'precio_correcto', 2400)), null, null, null);
  v_dev := (r->>'id')::uuid;

  -- ===== qa-squad
  perform set_config('request.jwt.claims', json_build_object('sub', c_squad, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform precio_correcto from compras_devolucion_items where devolucion_id = v_dev; v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('squad_columna', v_err);
  begin
    perform * from compras_devolucion_items limit 1; v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('squad_select_estrella', v_err);
  v_res := v_res || jsonb_build_object('squad_columnas_permitidas',
    (select count(*) from compras_devolucion_items where devolucion_id = v_dev and cantidad = 3 and factura_item_id = v_fi));
  v_res := v_res || jsonb_build_object('squad_vista_precio',
    (select lineas->0->'precio_correcto' from v_compras_devoluciones where id = v_dev));
  -- D6: Compras sigue registrando y anulando devoluciones con mercadería.
  begin
    r := compras_registrar_devolucion(v_p, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
    r := compras_anular_devolucion((r->>'id')::uuid, 'QA permisos');
    v_err := 'ok';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('squad_registra_y_anula', v_err);
  perform set_config('role', 'postgres', true);

  -- ===== admin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := v_res || jsonb_build_object('admin_vista_precio',
    (select lineas->0->'precio_correcto' from v_compras_devoluciones where id = v_dev));
  begin
    perform precio_correcto from compras_devolucion_items where devolucion_id = v_dev; v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('admin_columna_directa', v_err);
  perform set_config('role', 'postgres', true);

  v_res := v_res || jsonb_build_object('anon_select', has_table_privilege('anon', 'compras_devolucion_items', 'select')
    or has_any_column_privilege('anon', 'compras_devolucion_items', 'select'));
  v_res := v_res || jsonb_build_object('OK',
    v_res->>'squad_columna' like 'permission denied%' and v_res->>'squad_select_estrella' like 'permission denied%'
    and (v_res->>'squad_columnas_permitidas')::int = 1 and v_res->'squad_vista_precio' = 'null'::jsonb
    and v_res->>'squad_registra_y_anula' = 'ok' and (v_res->>'admin_vista_precio')::numeric = 2400
    and v_res->>'admin_columna_directa' like 'permission denied%' and not (v_res->>'anon_select')::boolean);
  raise exception 'RESULTADO_PERMISOS: %', v_res;
end $$;
