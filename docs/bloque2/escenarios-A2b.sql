-- Escenarios de A2b (plan-A2b.md §9.2). Se corren contra dev PEGADOS DETRÁS de
-- la migración 20261005180000, en un solo archivo envuelto en begin/rollback:
--   begin; <migración> <este archivo> rollback;
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp>
-- El raise final deshace todo, migración incluida.
do $$
declare
  c_admin  uuid := '37794588-426a-4699-85df-889b6b828e07';  -- qa-admin
  c_qb     uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';  -- Queso Barra (Caja / 16,5)
  c_global uuid := '6214db3f-40f3-46fb-ac8e-3a5a67170bf7';  -- GLOBAL (único par de Queso Barra)
  c_p19    uuid := 'b3bdb8d1-adb5-4b68-9f57-99c38dacf8fb';  -- P-0019 enviado, sin remitos ni factura
  c_p18    uuid := 'da3243c5-933b-43c8-ad26-844fd95972b8';  -- P-0018 enviado, sin remitos ni factura
  c_p17    uuid := '0f6ee19a-1fbe-4645-872d-12c3b99f1f81';  -- P-0017 enviado, sin remitos ni factura
  c_p9     uuid := '7dda5d60-174a-46e8-b2c9-82128a8667c5';  -- P-0009 enviado, sin remitos ni factura
  c_f27    uuid := 'aca9d3a5-66c6-4b67-858f-df591c61a216';  -- factura de P-0027 (vieja, confirmada)
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_err text;
  v_pi uuid;
  v_rem uuid;
  v_lin uuid;
  v_fac uuid;
  v_s0 numeric;
  v_s1 numeric;
  v_n int;
  v_n2 int;
  v_dif uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ===== S1 migración
  v_res := v_res || jsonb_build_object('S1', jsonb_build_object(
    'kg', (select jsonb_agg(nombre order by nombre) from compras_items where unidad_base = 'kg'),
    'litros', (select count(*) from compras_items where unidad_base = 'litros'),
    'unidades', (select count(*) from compras_items where unidad_base = 'unidades'),
    'huevos', (select jsonb_agg(unidad_base) from compras_items where nombre ilike '%huevo%'),
    'cobra_por_pares_con_precio', (select jsonb_object_agg(cobra_por, n) from (select cobra_por, count(*) n from compras_item_proveedores where precio_ref is not null group by 1) x),
    'cobra_por_default', (select jsonb_object_agg(cobra_por_default, n) from (select cobra_por_default, count(*) n from compras_items group by 1) x),
    'backfill', (select count(*) from compras_pedido_eventos where tipo = 'remito_creado' and (detalle->>'backfill')::boolean),
    'remitos', (select count(*) from compras_remitos),
    'checks', (select count(*) from pg_constraint where conname in ('compras_items_unidad_base_valida','compras_items_cobra_por_default_valido',
               'compras_item_proveedores_cobra_por_valido','compras_remito_items_cantidad_base_positiva','compras_factura_items_precio_por_valido',
               'compras_factura_items_cantidad_base_positiva','compras_factura_items_base_con_cantidad'))));

  -- ===== S2 subtotales (la migración ya frena si cambian; además, cabecera = líneas)
  v_res := v_res || jsonb_build_object('S2', jsonb_build_object(
    'facturas_con_cabecera_distinta', (select count(*) from compras_facturas f
       where f.subtotal <> (select coalesce(sum(subtotal), 0) from compras_factura_items where factura_id = f.id)
          or f.iva <> (select coalesce(sum(iva), 0) from compras_factura_items where factura_id = f.id)),
    'lineas_base', (select count(*) from compras_factura_items where precio_por <> 'unidad')));

  -- ===== S3 guardar insumo: Queso Barra por kg, GLOBAL por kg con el precio convertido
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_insumo(c_qb, '{"unidad_base":"litros"}'::jsonb, null);
  r := compras_guardar_insumo(c_qb, '{"unidad_base":"kg","cobra_por_default":"base"}'::jsonb,
        jsonb_build_array(jsonb_build_object('proveedor_id', c_global, 'es_principal', true, 'activo', true,
          'precio_ref', 121.2121, 'precio_ref_anterior', 2000, 'cobra_por', 'base', 'cobra_por_anterior', 'unidad')));
  perform set_config('role', 'postgres', true);
  v_res := v_res || jsonb_build_object('S3', jsonb_build_object('resp', r,
    'item', (select jsonb_build_object('ub', unidad_base, 'cpd', cobra_por_default) from compras_items where id = c_qb),
    'par', (select jsonb_build_object('cobra', cobra_por, 'precio', precio_ref) from compras_item_proveedores where item_id = c_qb and proveedor_id = c_global),
    'hist', (select jsonb_agg(jsonb_build_array(campo, valor_anterior, valor_nuevo) order by creado_en)
             from compras_items_historial where item_id = c_qb and campo in ('unidad_base','cobra_por_default','proveedor.cobra_por','proveedor.precio_ref')
               and creado_en >= now())));
  perform set_config('role', 'authenticated', true);
  begin
    r := compras_guardar_insumo(c_qb, '{"unidad_base":"metros"}'::jsonb, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S3,err_metros}', to_jsonb(v_err));
  begin
    r := compras_guardar_insumo(c_qb, '{}'::jsonb,
          jsonb_build_array(jsonb_build_object('proveedor_id', c_global, 'es_principal', true, 'activo', true,
            'precio_ref', 121.2121, 'precio_ref_anterior', 121.2121, 'cobra_por', 'unidad', 'cobra_por_anterior', 'unidad')));
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S3,err_conflicto}', to_jsonb(v_err));
  begin
    r := compras_guardar_insumo(null, '{"nombre":"QA A2b sin base","unidad":"Caja"}'::jsonb,
          jsonb_build_array(jsonb_build_object('proveedor_id', c_global, 'es_principal', true, 'activo', true)));
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S3,err_crear_sin_base}', to_jsonb(v_err));
  r := compras_guardar_insumo(null, '{"nombre":"QA A2b nuevo","unidad":"Caja","unidad_base":"kg","cantidad_por_unidad":10,"cobra_por_default":"base"}'::jsonb,
          jsonb_build_array(jsonb_build_object('proveedor_id', c_global, 'es_principal', true, 'activo', true)));
  perform set_config('role', 'postgres', true);
  v_res := jsonb_set(v_res, '{S3,nuevo_par_cobra}', to_jsonb((select cobra_por from compras_item_proveedores where item_id = (r->>'item_id')::uuid)));

  -- ===== S4 remito nuevo en P-0019: Queso Barra 2 + 33,4 kg
  select id into v_pi from compras_pedido_items where pedido_id = c_p19 and item_id = c_qb;
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(null, c_p19, current_date,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 2, 'cantidad_base', 33.4)), null);
  perform set_config('role', 'postgres', true);
  v_rem := (r->>'id')::uuid;
  select id into v_lin from compras_remito_items where remito_id = v_rem;
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  v_res := v_res || jsonb_build_object('S4', jsonb_build_object('cambios', r->'cambios', 'delta_stock', v_s1 - v_s0,
    'cantidad_base', (select cantidad_base from compras_remito_items where id = v_lin),
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_creado' and detalle->>'remito_id' = v_rem::text)));

  -- ===== S5 editar: solo kg 33,4 → 32,9
  select count(*) into v_n from compras_stock_movimientos where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(v_rem, null, current_date,
        jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 2, 'cantidad_base', 32.9)), null);
  perform set_config('role', 'postgres', true);
  v_res := v_res || jsonb_build_object('S5', jsonb_build_object('cambios', r->'cambios', 'impacto', r->'impacto',
    'movs_nuevos', (select count(*) from compras_stock_movimientos where item_id = c_qb) - v_n,
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_editado' and detalle->>'remito_id' = v_rem::text order by creado_en desc limit 1)));

  -- ===== S6 editar: cajas 2 → 3 (y número del proveedor)
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(v_rem, null, current_date,
        jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 3, 'cantidad_base', 32.9)), '0001-123');
  perform set_config('role', 'postgres', true);
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  v_res := v_res || jsonb_build_object('S6', jsonb_build_object('cambios', r->'cambios', 'delta_stock', v_s1 - v_s0,
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_editado' and detalle->>'remito_id' = v_rem::text order by creado_en desc limit 1)));

  -- ===== S7 guardar igual
  select count(*) into v_n from compras_pedido_eventos where detalle->>'remito_id' = v_rem::text;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(v_rem, null, current_date,
        jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 3, 'cantidad_base', 32.9)), ' 0001-123 ');
  perform set_config('role', 'postgres', true);
  v_res := v_res || jsonb_build_object('S7', jsonb_build_object('cambios', r->'cambios',
    'eventos_nuevos', (select count(*) from compras_pedido_eventos where detalle->>'remito_id' = v_rem::text) - v_n));

  -- ===== S8 errores de kg
  perform set_config('role', 'authenticated', true);
  begin
    r := compras_guardar_remito(v_rem, null, current_date,
          jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 3, 'cantidad_base', -1)), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S8', jsonb_build_object('negativo', v_err));
  begin
    r := compras_guardar_remito(v_rem, null, current_date,
          jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 3),
                            jsonb_build_object('descripcion', 'Flete', 'cantidad', 1, 'cantidad_base', 5)), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S8,libre}', to_jsonb(v_err));
  perform set_config('role', 'postgres', true);

  -- ===== S18 vista de pendiente (P-0019, Queso Barra)
  v_res := v_res || jsonb_build_object('S18', (select jsonb_build_object('cobra_por', cobra_por, 'contenido', contenido,
      'unidad_base', unidad_base, 'recibido', recibido, 'recibido_base', recibido_base, 'completo', recibido_base_completo)
    from v_compras_pedido_pendiente where pedido_item_id = v_pi));

  -- ===== S16 eliminar el remito de S4
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_eliminar_remito(v_rem);
  perform set_config('role', 'postgres', true);
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  v_res := v_res || jsonb_build_object('S16', jsonb_build_object('delta_stock', v_s1 - v_s0,
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_eliminado' and detalle->>'remito_id' = v_rem::text),
    'vista_creado', (select count(*) from v_compras_pedido_eventos where pedido_id = c_p19 and tipo = 'remito_creado')));

  -- Para S11: GLOBAL vuelve a cobrar por Caja a $ 2.000 (el estado de dev antes de S3).
  update compras_item_proveedores set cobra_por = 'unidad', precio_ref = 2000 where item_id = c_qb and proveedor_id = c_global;

  -- ===== S9 factura borrador en P-0018: Queso Barra 2 Caja, por kg, 33,4 kg, $ 1.250
  select id into v_pi from compras_pedido_items where pedido_id = c_p18 and item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  begin
    r := compras_guardar_factura(null, c_p18, 'A2B-QA-1', current_date, null, null, null,
          jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', 2,
            'precio_unitario', 1250, 'alicuota_iva', 21, 'precio_por', 'base')), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S9', jsonb_build_object('sin_kg', v_err));
  begin
    r := compras_guardar_factura(null, c_p18, 'A2B-QA-1', current_date, null, null, null,
          jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', 0,
            'precio_unitario', 1250, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 33.4)), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S9,cajas_0}', to_jsonb(v_err));
  begin
    r := compras_guardar_factura(null, c_p18, 'A2B-QA-1', current_date, null, null, null,
          jsonb_build_array(jsonb_build_object('descripcion', 'Flete', 'cantidad', 1,
            'precio_unitario', 100, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 10)), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S9,flete_base}', to_jsonb(v_err));
  r := compras_guardar_factura(null, c_p18, 'A2B-QA-1', current_date, null, null, null,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', 2,
          'precio_unitario', 1250, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 33.4)), null);
  perform set_config('role', 'postgres', true);
  v_fac := (r->>'id')::uuid;
  v_res := jsonb_set(v_res, '{S9,ok}', jsonb_build_object('resp', r,
    'linea', (select jsonb_build_object('subtotal', subtotal, 'iva', iva, 'precio_por', precio_por, 'cantidad_base', cantidad_base)
              from compras_factura_items where factura_id = v_fac)));

  -- ===== S10 + S11 confirmar sin remitos, con "actualizar precios"
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_confirmar_factura(v_fac, true, true, null, null);
  perform set_config('role', 'postgres', true);
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  select id into v_rem from compras_remitos where factura_id = v_fac;
  v_res := v_res || jsonb_build_object('S10', jsonb_build_object('delta_stock', v_s1 - v_s0,
    'remito_items', (select jsonb_agg(jsonb_build_array(cantidad, cantidad_base)) from compras_remito_items where remito_id = v_rem),
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_creado' and detalle->>'remito_id' = v_rem::text)));
  v_res := v_res || jsonb_build_object('S11', jsonb_build_object('precios_actualizados', r->'precios_actualizados',
    'par', (select jsonb_build_object('cobra', cobra_por, 'precio', precio_ref) from compras_item_proveedores where item_id = c_qb and proveedor_id = c_global),
    'hist', (select jsonb_agg(jsonb_build_array(campo, valor_anterior, valor_nuevo, origen)) from compras_items_historial
             where item_id = c_qb and origen = 'factura' and creado_en >= now())));

  -- ===== S12 diferencias: remito manual 1 Caja / 16,2 kg contra factura 2 Caja / 33,4 kg (P-0017)
  select id into v_pi from compras_pedido_items where pedido_id = c_p17 and item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(null, c_p17, current_date,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 1, 'cantidad_base', 16.2)), null);
  r := compras_guardar_factura(null, c_p17, 'A2B-QA-2', current_date, null, null, null,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', 2,
          'precio_unitario', 1250, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 33.4)), null);
  v_fac := (r->>'id')::uuid;
  r := compras_confirmar_factura(v_fac, null, false, null, null);
  v_res := v_res || jsonb_build_object('S12', jsonb_build_object('diferencias', r->'diferencias',
    'vista', (select jsonb_agg(jsonb_build_object('dif', diferencia, 'fact', cantidad_facturada, 'rec', cantidad_recibida,
               'fb', facturada_base, 'fbr', facturada_base_real, 'rb', recibida_base, 'rbr', recibida_base_real,
               'ub', unidad_base, 'cont', contenido))
              from v_compras_factura_diferencias where factura_id = v_fac)));
  select id into v_dif from compras_factura_discrepancias where factura_id = v_fac and item_id = c_qb;

  -- ===== S13 resolver S12 ajustando el stock (el pedido se cierra a mano: falta mercadería)
  perform set_config('role', 'postgres', true);
  update compras_pedidos set estado_recepcion = 'cerrado_manual', cierre_motivo = 'QA A2b' where id = c_p17;
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_resolver_diferencia(v_dif, 'ajusta_stock', 'QA A2b');
  perform set_config('role', 'postgres', true);
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  v_res := v_res || jsonb_build_object('S13', jsonb_build_object('resp', r, 'delta_stock', v_s1 - v_s0));

  -- ===== S12b remito de 2 Caja / 33,0 kg y factura de 2 Caja / 33,4 kg: sin diferencia (P-0009)
  select id into v_pi from compras_pedido_items where pedido_id = c_p9 and item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_remito(null, c_p9, current_date,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'cantidad', 2, 'cantidad_base', 33.0)), null);
  r := compras_guardar_factura(null, c_p9, 'A2B-QA-3', current_date, null, null, null,
        jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi, 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', 2,
          'precio_unitario', 1250, 'alicuota_iva', 21, 'precio_por', 'base', 'cantidad_base', 33.4)), null);
  r := compras_confirmar_factura((r->>'id')::uuid, null, false, null, null);
  perform set_config('role', 'postgres', true);
  v_res := jsonb_set(v_res, '{S12,con_2_cajas_diferencias_qb}', to_jsonb((select count(*) from compras_factura_discrepancias d
     join compras_facturas f on f.id = d.factura_id where f.pedido_id = c_p9 and d.item_id = c_qb)));

  -- ===== S14 anular la factura de S10 (P-0018)
  select id into v_fac from compras_facturas where pedido_id = c_p18 and estado = 'confirmada';
  select id into v_rem from compras_remitos where factura_id = v_fac;
  select cantidad into v_s0 from compras_stock_actual where item_id = c_qb;
  perform set_config('role', 'authenticated', true);
  r := compras_anular_factura(v_fac, 'QA A2b');
  perform set_config('role', 'postgres', true);
  select cantidad into v_s1 from compras_stock_actual where item_id = c_qb;
  v_res := v_res || jsonb_build_object('S14', jsonb_build_object('delta_stock', v_s1 - v_s0,
    'evento', (select detalle from compras_pedido_eventos where tipo = 'remito_eliminado' and detalle->>'remito_id' = v_rem::text)));

  -- ===== S15 factura vieja (P-0027): kg nominales
  select count(*), count(*) filter (where not facturada_base_real and facturada_base = facturada * contenido
                                      and (recibida_base is null or (not recibida_base_real and recibida_base = recibida * contenido)))
    into v_n, v_n2
  from compras_diferencias_calculadas(c_f27);
  v_res := v_res || jsonb_build_object('S15', jsonb_build_object('filas', v_n, 'nominal_ok', v_n2,
    'ejemplo', (select jsonb_build_object('desc', descripcion, 'fact', facturada, 'fb', facturada_base, 'cont', contenido)
                from compras_diferencias_calculadas(c_f27) where descripcion = 'Queso Barra')));

  -- ===== S17 RLS: sin escritura directa
  perform set_config('role', 'authenticated', true);
  begin
    insert into compras_remito_items (remito_id, descripcion, cantidad)
    select id, 'QA directo', 1 from compras_remitos limit 1;
    get diagnostics v_n = row_count;
    v_err := 'insert ok, filas ' || v_n;
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S17', jsonb_build_object('insert_remito_items', v_err));
  begin
    update compras_factura_items set precio_unitario = 1 where factura_id = c_f27;
    get diagnostics v_n = row_count;
    v_err := 'update ok, filas ' || v_n;
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S17,update_factura_items}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S17,select_remitos}', to_jsonb((select count(*) from compras_remitos)));
  perform set_config('role', 'postgres', true);

  -- ===== S19 invariante del ledger
  v_res := v_res || jsonb_build_object('S19', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  raise exception 'RESULTADO: %', v_res;
end $$;
