-- Escenarios de A2c (plan-A2c.md §9.2). Se corren contra dev PEGADOS DETRÁS de
-- la migración 20261006120000, en un solo archivo envuelto en begin/rollback:
--   begin; <migración> <este archivo> rollback;
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp>
-- El raise final deshace todo, migración incluida.
do $$
declare
  c_admin  uuid := '37794588-426a-4699-85df-889b6b828e07';  -- qa-admin
  c_coord  uuid := '01e4dfd9-598f-49ac-87fd-15c538cc0ed9';  -- qa-coordinador
  c_fab    uuid := 'b716e74f-91c7-4fa7-a8e0-aab0ff2de18d';  -- fábrica
  c_qb     uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';  -- Queso Barra
  c_global uuid := '6214db3f-40f3-46fb-ac8e-3a5a67170bf7';  -- GLOBAL
  c_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_err text;
  v_n int;
  v_t1 jsonb;
  v_item uuid;
  v_ped uuid;
  v_pi uuid;
  v_fac uuid;
  v_mov uuid;
  v_dia date;
  v_t0 timestamptz;
begin
  -- ===== T14 (antes) invariante del ledger
  v_res := v_res || jsonb_build_object('T14_antes', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  -- ===== T9 columnas de v_compras_stock_movimientos
  v_res := v_res || jsonb_build_object('T9', jsonb_build_object(
    'columnas', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns
                 where table_schema = 'public' and table_name = 'v_compras_stock_movimientos'),
    'con_factura', (select count(*) from compras_stock_movimientos where factura_id is not null),
    'con_discrepancia', (select count(*) from compras_stock_movimientos where discrepancia_id is not null)));

  -- ===== T1 admin, Queso Barra, 01/09–31/10
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select to_jsonb(t) into v_t1 from compras_trazabilidad_insumo('2026-09-01', '2026-10-31', c_qb) t;
  v_res := v_res || jsonb_build_object('T1', v_t1);

  -- ===== T2 admin, sin insumo
  v_res := v_res || jsonb_build_object('T2', jsonb_build_object(
    'filas', (select count(*) from compras_trazabilidad_insumo('2026-09-01', '2026-10-31')),
    'top', (select jsonb_agg(jsonb_build_array(item_nombre, facturado_neto)) from
              (select * from compras_trazabilidad_insumo('2026-09-01', '2026-10-31') limit 5) x)));

  -- ===== T3 puente, 01/08 → hoy, todos
  v_res := v_res || jsonb_build_object('T3', jsonb_build_object(
    'filas', (select count(*) from compras_trazabilidad_insumo('2026-08-01', c_hoy)),
    'no_cuadran', (select count(*) from compras_trazabilidad_insumo('2026-08-01', c_hoy)
       where stock_inicio + mov_remitos + mov_conteo + mov_factura + mov_manual + mov_devolucion + mov_otros
             - consumido_produccion <> stock_fin)));

  -- ===== T4 hasta hoy: stock_fin = stock_actual
  v_res := v_res || jsonb_build_object('T4', (select count(*) from compras_trazabilidad_insumo('2026-08-01', c_hoy)
    where stock_fin <> stock_actual));

  -- ===== T11 período sin actividad
  v_res := v_res || jsonb_build_object('T11', (select jsonb_build_object('filas', count(*), 'pedido', max(pedido_cantidad),
      'recibido', max(recibido_cantidad), 'facturado', max(facturado_cantidad), 'ini', max(stock_inicio), 'fin', max(stock_fin))
    from compras_trazabilidad_insumo('2026-01-01', '2026-01-31', c_qb)));

  -- ===== T13 tiempo del reporte sin insumo
  v_t0 := clock_timestamp();
  perform count(*) from compras_trazabilidad_insumo('2026-09-01', '2026-10-31');
  v_res := v_res || jsonb_build_object('T13_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1));

  -- ===== T8 errores de período
  begin
    perform * from compras_trazabilidad_insumo('2024-01-01', '2026-03-11', c_qb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('T8', jsonb_build_object('800_dias', v_err));
  begin
    perform * from compras_trazabilidad_insumo('2026-10-02', '2026-10-01', c_qb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{T8,hasta_menor}', to_jsonb(v_err));
  begin
    perform * from compras_trazabilidad_insumo(null, '2026-10-01', c_qb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{T8,desde_null}', to_jsonb(v_err));

  -- ===== T12 corte de día: un movimiento cargado entre las 21:00 y las 23:59 de Argentina
  perform set_config('role', 'postgres', true);
  select m.id, m.item_id, (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date
    into v_mov, v_item, v_dia
  from compras_stock_movimientos m
  where (m.created_at at time zone 'America/Argentina/Buenos_Aires')::time >= '21:00'
  order by m.created_at desc limit 1;
  perform set_config('role', 'authenticated', true);
  if v_mov is not null then
    v_res := v_res || jsonb_build_object('T12', jsonb_build_object(
      'mov', v_mov, 'dia_local', v_dia,
      'delta_dia_ledger', (select sum(delta) from compras_stock_movimientos
                           where item_id = v_item and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_dia),
      'delta_dia_fn', (select stock_fin - stock_inicio from compras_trazabilidad_insumo(v_dia, v_dia, v_item)),
      'delta_dia_sig_ledger', (select coalesce(sum(delta), 0) from compras_stock_movimientos
                           where item_id = v_item and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_dia + 1),
      'delta_dia_sig_fn', (select stock_fin - stock_inicio from compras_trazabilidad_insumo(v_dia + 1, v_dia + 1, v_item))));
  else
    v_res := v_res || jsonb_build_object('T12', 'sin movimientos 21-24 h: ver T10');
  end if;

  -- ===== T5 coordinador, Queso Barra
  perform set_config('request.jwt.claims', json_build_object('sub', c_coord, 'role', 'authenticated')::text, true);
  v_res := v_res || jsonb_build_object('T5', (select jsonb_build_object(
      'facturado_cantidad', facturado_cantidad, 'facturado_neto', facturado_neto, 'facturas', facturas,
      'prom_unidad', precio_prom_unidad, 'prom_base', precio_prom_base, 'ultimo', ultimo_precio,
      'ultimo_por', ultimo_precio_por, 'ultimo_factura', ultimo_precio_factura_id,
      'recibido_igual_T1', recibido_cantidad = (v_t1->>'recibido_cantidad')::numeric,
      'puente_igual_T1', stock_fin = (v_t1->>'stock_fin')::numeric)
    from compras_trazabilidad_insumo('2026-09-01', '2026-10-31', c_qb)));

  -- ===== T6 coordinador, vista de documentos
  v_res := v_res || jsonb_build_object('T6', jsonb_build_object(
    'facturas', (select count(*) from v_compras_insumo_documentos where tipo = 'factura'),
    'remitos_qb', (select count(*) from v_compras_insumo_documentos where tipo = 'remito' and item_id = c_qb)));

  -- ===== T7 fábrica
  perform set_config('request.jwt.claims', json_build_object('sub', c_fab, 'role', 'authenticated')::text, true);
  begin
    perform * from compras_trazabilidad_insumo('2026-09-01', '2026-10-31', c_qb); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('T7', jsonb_build_object('fn', v_err,
    'documentos', (select count(*) from v_compras_insumo_documentos)));

  -- T6 (admin) para comparar remitos
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  v_res := jsonb_set(v_res, '{T6,remitos_qb_admin}', to_jsonb((select count(*) from v_compras_insumo_documentos where tipo = 'remito' and item_id = c_qb)));
  v_res := jsonb_set(v_res, '{T6,facturas_qb_admin}', to_jsonb((select count(*) from v_compras_insumo_documentos where tipo = 'factura' and item_id = c_qb)));

  -- ===== T10 insumo de prueba: ajuste + reversión, remito con kg, remito sin kg, factura por kg
  r := compras_guardar_insumo(null, '{"nombre":"QA A2c traza","unidad":"Caja","unidad_base":"kg","cantidad_por_unidad":10,"cobra_por_default":"base"}'::jsonb,
        jsonb_build_array(jsonb_build_object('proveedor_id', c_global, 'es_principal', true, 'activo', true)));
  v_item := (r->>'item_id')::uuid;
  r := compras_ajustar_stock(v_item, 5, 'QA A2c');
  r := compras_revertir_movimiento((r->>'movimiento_id')::uuid, 'QA A2c');
  r := compras_guardar_pedido(null, c_global, null,
        jsonb_build_array(jsonb_build_object('item_id', v_item, 'descripcion', 'QA A2c traza', 'unidad', 'Caja', 'cantidad', 4)));
  v_ped := (r->>'id')::uuid;
  perform compras_marcar_pedido_enviado(v_ped, false);
  select id into v_pi from compras_pedido_items where pedido_id = v_ped;
  r := compras_guardar_remito(null, v_ped, c_hoy,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'QA A2c traza', 'cantidad', 2, 'cantidad_base', 20.5)), null);
  r := compras_guardar_remito(null, v_ped, c_hoy,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'QA A2c traza', 'cantidad', 1)), null);
  r := compras_guardar_factura(null, v_ped, 'A2C-QA-T10', c_hoy, null, null, null,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'QA A2c traza', 'unidad', 'Caja', 'cantidad', 3,
          'precio_unitario', 100, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 31)), null);
  v_fac := (r->>'id')::uuid;
  r := compras_confirmar_factura(v_fac, null, false, null, null);
  v_res := v_res || jsonb_build_object('T10', (select jsonb_build_object(
      'pedido', pedido_cantidad, 'pedidos', pedidos,
      'recibido', recibido_cantidad, 'base_real', recibido_base_real, 'sin_pesar', recibido_sin_pesar, 'remitos', remitos,
      'facturado', facturado_cantidad, 'facturado_base', facturado_base, 'neto', facturado_neto, 'total', facturado_total,
      'prom_unidad', precio_prom_unidad, 'prom_base', precio_prom_base,
      'ultimo', ultimo_precio, 'ultimo_por', ultimo_precio_por, 'ultimo_factura_ok', ultimo_precio_factura_id = v_fac,
      'mov_manual', mov_manual, 'mov_remitos', mov_remitos, 'ini', stock_inicio, 'fin', stock_fin, 'actual', stock_actual,
      'pendiente', pendiente_recibir)
    from compras_trazabilidad_insumo(c_hoy, c_hoy, v_item)));
  v_res := jsonb_set(v_res, '{T10,docs}', to_jsonb((select count(*) from v_compras_insumo_documentos where item_id = v_item)));
  perform set_config('role', 'postgres', true);

  -- ===== T12b corte de día con el ajuste de T10 (dev no tiene movimientos 21-24 h):
  -- se lo corre a AYER 22:30 de Argentina (en UTC ya es hoy 01:30). Solo dentro del lote.
  begin
    update compras_stock_movimientos
       set created_at = ((c_hoy - 1)::timestamp + time '22:30') at time zone 'America/Argentina/Buenos_Aires'
     where item_id = v_item and tipo = 'ajuste_manual';
    perform set_config('role', 'authenticated', true);
    v_res := v_res || jsonb_build_object('T12b', jsonb_build_object(
      'utc', (select created_at at time zone 'UTC' from compras_stock_movimientos where item_id = v_item and tipo = 'ajuste_manual'),
      'ayer_manual', (select mov_manual from compras_trazabilidad_insumo(c_hoy - 1, c_hoy - 1, v_item)),
      'hoy_manual', (select mov_manual from compras_trazabilidad_insumo(c_hoy, c_hoy, v_item)),
      'hoy_inicio', (select stock_inicio from compras_trazabilidad_insumo(c_hoy, c_hoy, v_item))));
    perform set_config('role', 'postgres', true);
  exception when others then
    v_res := v_res || jsonb_build_object('T12b', 'no se pudo: ' || sqlerrm);
  end;

  -- ===== T14 (después)
  v_res := v_res || jsonb_build_object('T14_despues', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  raise exception 'RESULTADO: %', v_res;
end $$;
