-- Escenarios de los ajustes de B4 (20261006153000, salidos del code-review).
-- Se corren DETRÁS de escenarios-B4.sql (usan sus helpers pg_temp.b4_*), en el
-- mismo lote envuelto en begin/rollback. El raise final deshace todo.
do $$
declare
  c_admin  uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  c_qb     uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';
  c_fec    uuid := 'a360d424-8e73-4a7c-b75f-1c4522113d02';
  m_mal    uuid := (select id from compras_devolucion_motivos where nombre = 'Mercadería en mal estado');
  m_precio uuid := (select id from compras_devolucion_motivos where nombre = 'Precio mal facturado');
  v_res jsonb := '{}'::jsonb;
  r jsonb; v_err text;
  v_p uuid; v_f uuid; v_d1 uuid; v_d2 uuid; v_fi uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ===== AJ1 devolución ANTES de la factura: factura neta → no espera NC; factura completa → espera
  v_p := pg_temp.b4_pedido(0, 3);
  perform pg_temp.b4_remito(v_p, 0, null, 3);
  r := compras_registrar_devolucion(v_p, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
  v_d1 := (r->>'id')::uuid;
  v_f := pg_temp.b4_factura(v_p, 'B4-QA-9101', 0, null, 2, null);   -- neta: 2 de 3
  v_res := v_res || jsonb_build_object('AJ1_neta', jsonb_build_object(
    'espera', (select espera_nota_credito from v_compras_devoluciones where id = v_d1),
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_f)));
  v_p := pg_temp.b4_pedido(0, 3);
  perform pg_temp.b4_remito(v_p, 0, null, 3);
  r := compras_registrar_devolucion(v_p, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
  v_d1 := (r->>'id')::uuid;
  v_f := pg_temp.b4_factura(v_p, 'B4-QA-9102', 0, null, 3, null);   -- completa: cobra la devuelta
  v_res := v_res || jsonb_build_object('AJ1_completa', jsonb_build_object(
    'espera', (select espera_nota_credito from v_compras_devoluciones where id = v_d1),
    'dif', (select diferencia from compras_factura_discrepancias where factura_id = v_f)));
  v_res := v_res || jsonb_build_object('AJ1_ok', not (v_res #>> '{AJ1_neta,espera}')::boolean
    and (v_res #>> '{AJ1_neta,diferencias}')::int = 0 and (v_res #>> '{AJ1_completa,espera}')::boolean);

  -- ===== AJ2 una sola corrección de precio por línea
  v_p := pg_temp.b4_pedido(0, 3);
  perform pg_temp.b4_remito(v_p, 0, null, 3);
  v_f := pg_temp.b4_factura(v_p, 'B4-QA-9103', 0, null, 3, null);
  select id into v_fi from compras_factura_items where factura_id = v_f;
  r := compras_registrar_devolucion(v_p, m_precio, false, jsonb_build_array(jsonb_build_object('factura_item_id', v_fi, 'cantidad', 3, 'precio_correcto', 2400)), null, null, null);
  begin
    r := compras_registrar_devolucion(v_p, m_precio, false, jsonb_build_array(jsonb_build_object('factura_item_id', v_fi, 'cantidad', 3, 'precio_correcto', 2400)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('AJ2', v_err, 'AJ2_ok', v_err like 'El precio de Fécula de Mandioca ya tiene una corrección registrada (D-%');

  -- ===== AJ3 dos devoluciones esperando: la diferencia queda con la más vieja; anular la nueva no la suelta
  v_p := pg_temp.b4_pedido(0, 3);
  perform pg_temp.b4_remito(v_p, 0, null, 3);
  v_f := pg_temp.b4_factura(v_p, 'B4-QA-9104', 0, null, 3, null);
  r := compras_registrar_devolucion(v_p, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
  v_d1 := (r->>'id')::uuid;
  r := compras_registrar_devolucion(v_p, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
  v_d2 := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('AJ3_con_dos', (select jsonb_build_object('dif', diferencia, 'res', resolucion, 'de_la_vieja', devolucion_id = v_d1)
                                                      from compras_factura_discrepancias where factura_id = v_f));
  r := compras_anular_devolucion(v_d2, 'QA ajustes');
  v_res := v_res || jsonb_build_object('AJ3_anulada_nueva', (select jsonb_build_object('dif', diferencia, 'res', resolucion, 'de_la_vieja', devolucion_id = v_d1, 'nota', nota)
                                                            from compras_factura_discrepancias where factura_id = v_f));
  r := compras_anular_devolucion(v_d1, 'QA ajustes');
  v_res := v_res || jsonb_build_object('AJ3_anuladas_las_dos', (select count(*) from compras_factura_discrepancias where factura_id = v_f));
  v_res := v_res || jsonb_build_object('AJ3_ok',
    (v_res #>> '{AJ3_con_dos,de_la_vieja}')::boolean and v_res #>> '{AJ3_con_dos,res}' = 'reclamo_proveedor'
    and (v_res #>> '{AJ3_anulada_nueva,de_la_vieja}')::boolean and v_res #>> '{AJ3_anulada_nueva,res}' = 'reclamo_proveedor'
    and (v_res #>> '{AJ3_anulada_nueva,dif}')::numeric = 1 and (v_res->>'AJ3_anuladas_las_dos')::int = 0);

  v_res := v_res || jsonb_build_object('INVARIANTE', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));
  raise exception 'RESULTADO_AJUSTES: %', v_res;
end $$;
