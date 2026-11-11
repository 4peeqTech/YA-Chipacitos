do $$
declare
  c_admin uuid := '37794588-426a-4699-85df-889b6b828e07';
  c_coord uuid := '01e4dfd9-598f-49ac-87fd-15c538cc0ed9';
  c_fab   uuid := 'b716e74f-91c7-4fa7-a8e0-aab0ff2de18d';
  c_local uuid := '93b4b0a1-a7c2-4932-a17e-9be77de9dc60';
  c_qb    uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';  -- Queso Barra: movimientos, pedidos, facturas, Global, borrador
  c_p1    uuid := '531c71fc-ac4c-43c2-9fb9-104f60ff6959';  -- AL SA
  c_p2    uuid := '29d9353c-2a97-4961-bed1-6f9a86e0b87f';  -- ALBOR
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_new uuid;
  v_ids text;
  v_ids2 text;
  v_n int;
  v_err text;
  v_qb_prov uuid;
  v_qb_par uuid;
  v_sol uuid;
  v_x numeric;
  v_y numeric;
begin
  -- ===== S1 crear
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_insumo(null,
        '{"nombre":"QA A2a Insumo","unidad":"Caja","stock_minimo":2}'::jsonb,
        jsonb_build_array(
          jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true, 'precio_ref', 100),
          jsonb_build_object('proveedor_id', c_p2, 'es_principal', false, 'activo', true)));
  v_new := (r->>'item_id')::uuid;
  v_res := v_res || jsonb_build_object('S1', jsonb_build_object('resp', r,
     'pares', (select count(*) from compras_item_proveedores where item_id = v_new),
     'hist', (select jsonb_agg(campo order by campo) from compras_items_historial where item_id = v_new)));

  -- ===== S2 editar solo stock_minimo
  select string_agg(id::text || created_at::text, ',' order by id) into v_ids from compras_item_proveedores where item_id = v_new;
  r := compras_guardar_insumo(v_new, '{"stock_minimo":6}'::jsonb, null);
  select string_agg(id::text || created_at::text, ',' order by id) into v_ids2 from compras_item_proveedores where item_id = v_new;
  v_res := v_res || jsonb_build_object('S2', jsonb_build_object('resp', r,
     'stock_minimo', (select stock_minimo from compras_items where id = v_new),
     'pares_iguales', v_ids = v_ids2,
     'hist', (select jsonb_agg(jsonb_build_array(campo, valor_anterior, valor_nuevo)) from compras_items_historial where item_id = v_new and campo = 'stock_minimo')));

  -- ===== S3 factura pisa precio mientras se edita, usuario no lo toca
  perform set_config('role', 'postgres', true);
  update compras_item_proveedores set precio_ref = 120 where item_id = v_new and proveedor_id = c_p1;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_insumo(v_new, '{"cantidad_por_masa":2}'::jsonb,
        jsonb_build_array(
          jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true, 'precio_ref', 100, 'precio_ref_anterior', 100),
          jsonb_build_object('proveedor_id', c_p2, 'es_principal', false, 'activo', true)));
  v_res := v_res || jsonb_build_object('S3', jsonb_build_object('resp', r,
     'precio', (select precio_ref from compras_item_proveedores where item_id = v_new and proveedor_id = c_p1),
     'hist_precio_120', (select count(*) from compras_items_historial where item_id = v_new and campo = 'proveedor.precio_ref' and valor_nuevo in ('120','130'))));

  -- ===== S4 conflicto de precio
  begin
    r := compras_guardar_insumo(v_new, '{"stock_minimo":9}'::jsonb,
          jsonb_build_array(
            jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true, 'precio_ref', 130, 'precio_ref_anterior', 100),
            jsonb_build_object('proveedor_id', c_p2, 'es_principal', false, 'activo', true)));
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm;
  end;
  v_res := v_res || jsonb_build_object('S4', jsonb_build_object('err', v_err,
     'stock_minimo', (select stock_minimo from compras_items where id = v_new)));

  -- ===== S5 par inactivo se mantiene
  perform set_config('role', 'postgres', true);
  update compras_item_proveedores set activo = false where item_id = v_new and proveedor_id = c_p2;
  select id::text || created_at::text into v_ids from compras_item_proveedores where item_id = v_new and proveedor_id = c_p2;
  perform set_config('role', 'authenticated', true);
  r := compras_guardar_insumo(v_new, '{}'::jsonb,
        jsonb_build_array(
          jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true, 'precio_ref', 120, 'precio_ref_anterior', 120),
          jsonb_build_object('proveedor_id', c_p2, 'es_principal', false, 'activo', false)));
  v_res := v_res || jsonb_build_object('S5', jsonb_build_object('resp', r,
     'activo', (select activo from compras_item_proveedores where item_id = v_new and proveedor_id = c_p2),
     'mismo', v_ids = (select id::text || created_at::text from compras_item_proveedores where item_id = v_new and proveedor_id = c_p2)));

  -- ===== S6 quitar proveedor con historia (QB) y sin historia (nuevo)
  select proveedor_id, id into v_qb_prov, v_qb_par from compras_item_proveedores where item_id = c_qb and es_principal;
  r := compras_guardar_insumo(c_qb, '{}'::jsonb,
        jsonb_build_array(jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true)));
  v_res := v_res || jsonb_build_object('S6a', jsonb_build_object('resp', r,
     'viejo', (select jsonb_build_object('activo', activo, 'principal', es_principal, 'mismo_id', id = v_qb_par) from compras_item_proveedores where item_id = c_qb and proveedor_id = v_qb_prov),
     'hist', (select jsonb_agg(jsonb_build_array(campo, valor_anterior, valor_nuevo) order by campo) from compras_items_historial where item_id = c_qb)));
  r := compras_guardar_insumo(v_new, '{}'::jsonb,
        jsonb_build_array(jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true, 'precio_ref', 120, 'precio_ref_anterior', 120)));
  v_res := v_res || jsonb_build_object('S6b', jsonb_build_object('resp', r,
     'p2_existe', exists(select 1 from compras_item_proveedores where item_id = v_new and proveedor_id = c_p2),
     'hist', (select jsonb_agg(jsonb_build_array(campo, valor_anterior, valor_nuevo)) from compras_items_historial where item_id = v_new and campo = 'proveedor' and valor_nuevo is null)));

  -- ===== S7 errores
  v_res := v_res || jsonb_build_object('S7', '[]'::jsonb);
  begin r := compras_guardar_insumo(v_new, '{}'::jsonb, jsonb_build_array(
      jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true),
      jsonb_build_object('proveedor_id', c_p2, 'es_principal', true, 'activo', true))); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));
  begin r := compras_guardar_insumo(v_new, '{}'::jsonb, jsonb_build_array(
      jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', false),
      jsonb_build_object('proveedor_id', c_p2, 'es_principal', false, 'activo', true))); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));
  begin r := compras_guardar_insumo(v_new, '{}'::jsonb, jsonb_build_array(
      jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', false))); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));
  begin r := compras_guardar_insumo(v_new, '{}'::jsonb, jsonb_build_array(
      jsonb_build_object('proveedor_id', c_p1, 'es_principal', true, 'activo', true),
      jsonb_build_object('proveedor_id', c_p1, 'es_principal', false, 'activo', true))); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));
  begin r := compras_guardar_insumo(v_new, '{"precio":5}'::jsonb, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));
  begin r := compras_guardar_insumo(v_new, '{"nombre":"  queso BARRA "}'::jsonb, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S7}', (v_res->'S7') || to_jsonb(v_err));

  -- ===== S13 RLS (antes de archivar para no mezclar)
  update compras_items set nombre = 'x' where id = c_qb;
  get diagnostics v_n = row_count;
  begin insert into compras_item_proveedores (item_id, proveedor_id) values (c_qb, c_p2); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S13admin', jsonb_build_object('update_filas', v_n, 'insert', v_err,
     'select', (select count(*) from compras_items), 'select_cip', (select count(*) from compras_item_proveedores)));
  perform set_config('request.jwt.claims', json_build_object('sub', c_fab, 'role', 'authenticated')::text, true);
  update compras_items set nombre = 'x' where id = c_qb;
  get diagnostics v_n = row_count;
  begin insert into compras_item_proveedores (item_id, proveedor_id) values (c_qb, c_p2); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S13fab', jsonb_build_object('update_filas', v_n, 'insert', v_err,
     'select', (select count(*) from compras_items), 'select_cip', (select count(*) from compras_item_proveedores)));

  -- ===== S14 vista
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select (select coalesce(sum((e->>'pendiente')::numeric), 0) from jsonb_array_elements(v.pedidos_abiertos) e)
    into v_x from v_compras_insumos_resumen v where v.item_id = c_qb;
  select coalesce(sum(pp.pendiente), 0) into v_y from v_compras_pedido_pendiente pp
    join compras_pedidos p on p.id = pp.pedido_id
    where pp.item_id = c_qb and p.estado_recepcion in ('enviado', 'parcial');
  v_res := v_res || jsonb_build_object('S14admin', (select jsonb_build_object(
     'stock_ok', v.stock = coalesce((select cantidad from compras_stock_actual where item_id = c_qb), 0),
     'pend_vista', v_x, 'pend_ref', v_y, 'pedidos', jsonb_array_length(v.pedidos_abiertos),
     'ultimo_precio', v.ultimo_precio, 'unidad', v.ultimo_precio_unidad, 'fecha', v.ultimo_precio_fecha,
     'puede_eliminar', v.puede_eliminar, 'filas', (select count(*) from v_compras_insumos_resumen))
     from v_compras_insumos_resumen v where v.item_id = c_qb));
  perform set_config('request.jwt.claims', json_build_object('sub', c_coord, 'role', 'authenticated')::text, true);
  v_res := v_res || jsonb_build_object('S14coord', (select jsonb_build_object('ultimo_precio', v.ultimo_precio, 'fecha', v.ultimo_precio_fecha, 'stock', v.stock)
     from v_compras_insumos_resumen v where v.item_id = c_qb));

  -- ===== S8 archivar QB con borrador de Global abierto
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from fabrica_conteo_definicion_items where item_id = c_qb;
  r := compras_archivar_insumo(c_qb, true);
  v_res := v_res || jsonb_build_object('S8', jsonb_build_object('resp', r,
     'estado', (select estado from compras_items where id = c_qb),
     'en_borrador', (select count(*) from fabrica_conteo_items fci join fabrica_conteos c on c.id = fci.conteo_id where c.estado = 'borrador' and fci.item_id = c_qb),
     'def_items_igual', v_n = (select count(*) from fabrica_conteo_definicion_items where item_id = c_qb)));
  begin r := compras_archivar_insumo(c_qb, true); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S8,doble}', to_jsonb(v_err));

  -- ===== S9 pedido base sin el archivado
  perform set_config('role', 'postgres', true);
  update compras_solicitudes set estado = 'descartada' where tipo = 'base' and estado = 'abierta';
  perform set_config('role', 'authenticated', true);
  v_sol := generar_solicitud_base();
  v_res := v_res || jsonb_build_object('S9', jsonb_build_object(
     'lineas', (select count(*) from compras_solicitud_items where solicitud_id = v_sol),
     'con_qb', (select count(*) from compras_solicitud_items where solicitud_id = v_sol and item_id = c_qb)));

  -- ===== S10 reactivar
  r := compras_archivar_insumo(c_qb, false);
  v_res := v_res || jsonb_build_object('S10', jsonb_build_object('resp', r,
     'estado', (select estado from compras_items where id = c_qb),
     'hist', (select jsonb_agg(jsonb_build_array(valor_anterior, valor_nuevo) order by creado_en) from compras_items_historial where item_id = c_qb and campo = 'estado')));

  -- ===== S11 eliminar
  begin r := compras_eliminar_insumo(c_qb); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  r := compras_eliminar_insumo(v_new);
  v_res := v_res || jsonb_build_object('S11', jsonb_build_object('err_qb', v_err, 'resp', r,
     'restos', (select count(*) from compras_items where id = v_new) + (select count(*) from compras_item_proveedores where item_id = v_new)
             + (select count(*) from compras_items_historial where item_id = v_new) + (select count(*) from compras_stock_actual where item_id = v_new)));
  begin r := compras_eliminar_insumo(v_new); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S11,segunda}', to_jsonb(v_err));

  -- ===== S15 sin Compras
  perform set_config('request.jwt.claims', json_build_object('sub', c_local, 'role', 'authenticated')::text, true);
  v_res := v_res || jsonb_build_object('S15', '[]'::jsonb);
  begin r := compras_guardar_insumo(c_qb, '{"stock_minimo":1}'::jsonb, null); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15}', (v_res->'S15') || to_jsonb(v_err));
  begin r := compras_archivar_insumo(c_qb, true); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15}', (v_res->'S15') || to_jsonb(v_err));
  begin r := compras_eliminar_insumo(c_qb); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15}', (v_res->'S15') || to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S15}', (v_res->'S15') || to_jsonb((select count(*) from v_compras_insumos_resumen)));

  -- ===== S12 delete directo
  perform set_config('role', 'postgres', true);
  begin delete from compras_items where id = c_qb; v_err := 'NO FALLÓ';
  exception when foreign_key_violation then v_err := 'foreign_key_violation: ' || sqlerrm; when others then v_err := 'otro: ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S12', v_err);
  -- Aislado: un insumo cuyo único uso es un movimiento.
  insert into compras_items (nombre, unidad) values ('QA A2a solo ledger', 'u') returning id into v_new;
  insert into compras_stock_movimientos (item_id, tipo, delta) values (v_new, 'ajuste_manual', 1);
  begin delete from compras_items where id = v_new; v_err := 'NO FALLÓ';
  exception when foreign_key_violation then v_err := 'foreign_key_violation: ' || sqlerrm; when others then v_err := 'otro: ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S12b', v_err);

  -- ===== S16 invariante
  v_res := v_res || jsonb_build_object('S16', (select count(*) from compras_stock_actual a
     where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  raise exception 'RESULTADO: %', v_res;
end $$;
