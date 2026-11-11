do $$
declare
  c_admin uuid := '37794588-426a-4699-85df-889b6b828e07';
  c_coord uuid := '01e4dfd9-598f-49ac-87fd-15c538cc0ed9';
  c_fab   uuid := 'b716e74f-91c7-4fa7-a8e0-aab0ff2de18d';
  c_rrhh  uuid := '09b51418-f4b5-48b9-9bb0-42145385c866';
  c_conteo uuid := 'a9c57c8e-1b1c-406d-bb7c-0f2b3f8af5ac';
  c_qb    uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_err text;
  v_n int;
begin
  update profiles set modulos_permitidos = array['fabrica-conteos'] where id = c_coord;

  -- P1: solo fabrica-conteos lee la pantalla
  perform set_config('request.jwt.claims', json_build_object('sub', c_coord, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := v_res || jsonb_build_object('P1', jsonb_build_object(
    'historial', (select count(*) from v_compras_conteos_historial),
    'historial_pend', (select diferencias_pendientes from v_compras_conteos_historial where id = c_conteo),
    'diferencias', (select count(*) from v_fabrica_conteo_diferencias where conteo_id = c_conteo),
    'items_con_nombre', (select count(*) from fabrica_conteo_items fci join compras_items ci on ci.id = fci.item_id where fci.conteo_id = c_conteo),
    'items', (select count(*) from fabrica_conteo_items where conteo_id = c_conteo),
    'config', (select count(*) from compras_config where clave = 'conteo.diferencia_resaltar_pct')));

  -- P2: pierde Compras
  v_res := v_res || jsonb_build_object('P2', '[]'::jsonb);
  begin perform compras_resolver_diferencias_conteo(c_conteo, null, 'ignorar', null); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{P2}', (v_res->'P2') || to_jsonb(v_err));
  begin perform compras_ajustar_stock(c_qb, 1, 'x'); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{P2}', (v_res->'P2') || to_jsonb(v_err));
  begin perform compras_guardar_insumo(c_qb, '{"stock_minimo":1}'::jsonb, null); v_err := 'NO FALLÓ'; exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{P2}', (v_res->'P2') || to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{P2}', (v_res->'P2') || to_jsonb((select count(*) from v_compras_pedido_pendiente)));
  v_res := jsonb_set(v_res, '{P2}', (v_res->'P2') || to_jsonb((select count(*) from v_compras_insumos_resumen)));

  -- P3: admin y un perfil con compras-stock siguen resolviendo; fábrica sigue contando
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  begin r := compras_resolver_diferencias_conteo(c_conteo, array(select id from fabrica_conteo_items where conteo_id = c_conteo and item_id = '19815a7d-b1cb-4b0d-b31e-51edbd6054c2'), 'ignorar', null); v_err := 'ok ' || (r->>'hechas'); exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('P3admin', v_err);
  perform set_config('request.jwt.claims', json_build_object('sub', c_rrhh, 'role', 'authenticated')::text, true);
  begin r := compras_resolver_diferencias_conteo(c_conteo, array(select id from fabrica_conteo_items where conteo_id = c_conteo and item_id = 'd758d44d-7207-45b1-bc9b-cebb7079a604'), 'ignorar', null); v_err := 'ok ' || (r->>'hechas'); exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('P3compras', v_err);
  perform set_config('request.jwt.claims', json_build_object('sub', c_fab, 'role', 'authenticated')::text, true);
  begin perform fabrica_guardar_cantidad_conteo('508ac19e-ea47-4bae-a511-394d05940bc0', 3); v_err := 'ok'; exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('P3fab_guardar', v_err);
  begin perform cerrar_conteo_fabrica('31e6a1bc-d7bf-457e-921b-b0a3a425b92e'); v_err := 'ok'; exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('P3fab_cerrar', v_err,
     'P3fab_lee', (select count(*) from v_compras_conteos_historial),
     'P3fab_pend', (select diferencias_pendientes from v_compras_conteos_historial where id = c_conteo));

  perform set_config('role', 'postgres', true);
  v_res := v_res || jsonb_build_object('S16', (select count(*) from compras_stock_actual a
     where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));
  raise exception 'RESULTADO: %', v_res;
end $$;
