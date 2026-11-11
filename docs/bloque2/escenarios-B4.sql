-- Escenarios de B4 (plan-B4.md §9.2). Se corren contra dev PEGADOS DETRÁS de la
-- migración 20261006150000, en un solo archivo envuelto en begin/rollback:
--   { echo begin; cat <migración> docs/bloque2/escenarios-B4.sql; echo rollback; } > <tmp>
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp>
-- El raise final deshace todo, migración incluida. Arma sus propios pedidos de
-- GLOBAL (Queso Barra por kg a $ 1.250 + Fécula por bolsa a $ 2.450): no toca
-- P-0037 ni P-0019. Cada clave "ok_*" tiene que dar true.

-- Helpers del lote (corren como postgres, con el jwt de quien esté en claims).
create function pg_temp.b4_pedido(p_qb numeric, p_fec numeric) returns uuid language plpgsql as $f$
declare r jsonb; v uuid; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('item_id', '7e60be56-9d6d-41dc-b2bd-30fce887ca24', 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', p_qb); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('item_id', 'a360d424-8e73-4a7c-b75f-1c4522113d02', 'descripcion', 'Fécula de Mandioca', 'unidad', 'Bolsa', 'cantidad', p_fec); end if;
  r := compras_guardar_pedido(null, '6214db3f-40f3-46fb-ac8e-3a5a67170bf7', null, v_items);
  v := (r->>'id')::uuid;
  perform compras_marcar_pedido_enviado(v, false);
  return v;
end $f$;

create function pg_temp.b4_pi(p_ped uuid, p_item uuid) returns uuid language sql as $f$
  select id from compras_pedido_items where pedido_id = p_ped and item_id = p_item;
$f$;

create function pg_temp.b4_remito(p_ped uuid, p_qb numeric, p_qb_kg numeric, p_fec numeric) returns uuid language plpgsql as $f$
declare r jsonb; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b4_pi(p_ped, '7e60be56-9d6d-41dc-b2bd-30fce887ca24'),
                     'descripcion', 'Queso Barra', 'cantidad', p_qb, 'cantidad_base', p_qb_kg); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b4_pi(p_ped, 'a360d424-8e73-4a7c-b75f-1c4522113d02'),
                     'descripcion', 'Fécula de Mandioca', 'cantidad', p_fec); end if;
  r := compras_guardar_remito(null, p_ped, current_date, v_items, null);
  return (r->>'id')::uuid;
end $f$;

-- Factura confirmada (Queso Barra por kg a $ 1.250, Fécula por bolsa a $ 2.450, IVA 21).
create function pg_temp.b4_factura(p_ped uuid, p_numero text, p_qb numeric, p_qb_kg numeric, p_fec numeric, p_llego boolean)
returns uuid language plpgsql as $f$
declare r jsonb; v uuid; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b4_pi(p_ped, '7e60be56-9d6d-41dc-b2bd-30fce887ca24'),
                     'item_id', '7e60be56-9d6d-41dc-b2bd-30fce887ca24', 'descripcion', 'Queso Barra', 'unidad', 'Caja',
                     'cantidad', p_qb, 'cantidad_base', p_qb_kg, 'precio_por', 'base', 'precio_unitario', 1250, 'alicuota_iva', 21); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b4_pi(p_ped, 'a360d424-8e73-4a7c-b75f-1c4522113d02'),
                     'item_id', 'a360d424-8e73-4a7c-b75f-1c4522113d02', 'descripcion', 'Fécula de Mandioca', 'unidad', 'Bolsa',
                     'cantidad', p_fec, 'precio_por', 'unidad', 'precio_unitario', 2450, 'alicuota_iva', 21); end if;
  r := compras_guardar_factura(null, p_ped, p_numero, current_date, null, null, null, v_items, null);
  v := (r->>'id')::uuid;
  perform compras_confirmar_factura(v, p_llego, false, null, null);
  return v;
end $f$;

create function pg_temp.b4_stock(p_item uuid) returns numeric language sql as $f$
  select coalesce((select cantidad from compras_stock_actual where item_id = p_item), 0);
$f$;

do $$
declare
  c_admin  uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  c_squad  uuid := (select id from auth.users where email = 'qa-squad@chipacitos.test');
  c_qb     uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';  -- Queso Barra (Caja / 16,5 kg; GLOBAL cobra por kg)
  c_fec    uuid := 'a360d424-8e73-4a7c-b75f-1c4522113d02';  -- Fécula de Mandioca (Bolsa)
  m_mal    uuid := (select id from compras_devolucion_motivos where nombre = 'Mercadería en mal estado');
  m_noent  uuid := (select id from compras_devolucion_motivos where nombre = 'Facturado y no entregado');
  m_precio uuid := (select id from compras_devolucion_motivos where nombre = 'Precio mal facturado');
  v_res jsonb := '{}'::jsonb;
  r jsonb;
  v_err text;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid; v_h uuid; v_i uuid; v_j uuid; v_k uuid;
  v_fac_c uuid; v_fac_d uuid; v_fac_e uuid; v_fac_f uuid; v_fac_g uuid; v_fac_h uuid; v_fac_i uuid;
  v_dev_a uuid; v_dev_c uuid; v_dev_c2 uuid; v_dev_e uuid; v_dev_f uuid; v_dev_h uuid; v_dev_j uuid; v_dev_k uuid;
  v_rem uuid; v_lin uuid; v_dif uuid; v_gasto uuid;
  v_s0 numeric; v_s1 numeric; v_f0 numeric; v_m0 numeric; v_m1 numeric; v_n int; v_n2 int;
  v_txt text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ===== S1 migración
  v_res := v_res || jsonb_build_object('S1', jsonb_build_object(
    'motivos', (select jsonb_agg(jsonb_build_array(nombre, devuelve_mercaderia, corrige_precio) order by orden) from compras_devolucion_motivos),
    'checks', (select count(*) from pg_constraint where conname in ('compras_devolucion_motivos_flags_validos',
               'compras_devoluciones_repone_con_mercaderia', 'compras_devoluciones_repone_sin_nc',
               'compras_devoluciones_anulada_con_motivo', 'compras_facturas_nc_campos', 'compras_facturas_nc_con_origen')),
    'politicas_dev', (select jsonb_agg(policyname || ':' || cmd) from pg_policies where tablename in ('compras_devoluciones', 'compras_devolucion_items')),
    'tipos_evento', (select pg_get_constraintdef(oid) like '%devolucion_anulada%' from pg_constraint where conname = 'compras_pedido_eventos_tipo_check'),
    'dependientes_eventos', (select count(*) from pg_depend d join pg_rewrite rw on rw.oid = d.objid
                             where d.refobjid = 'public.v_compras_pedido_eventos'::regclass and rw.ev_class <> d.refobjid),
    'mover_stock_10', (select count(*) from pg_proc where proname = 'compras_mover_stock' and pronargs = 10),
    'mover_stock_otras', (select count(*) from pg_proc where proname = 'compras_mover_stock' and pronargs <> 10)));
  -- compras_recalcular_diferencias_factura compila contra la función nueva (factura vieja confirmada, sin cambios)
  begin
    perform compras_recalcular_diferencias_factura((select id from compras_facturas where estado = 'confirmada' and tipo_comprobante = 'factura' order by created_at limit 1));
    v_err := 'ok';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S1,recalc_diferencias}', to_jsonb(v_err));

  -- ===== S2 (D1) pedido A sin factura, devolución con reposición
  v_a := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_a, 2, 33, 3);
  v_s0 := pg_temp.b4_stock(c_qb);
  r := compras_registrar_devolucion(v_a, m_mal, true,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16.4)), 'QA B4', null, null);
  v_dev_a := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S2', jsonb_build_object(
    'resp', r,
    'delta_stock', pg_temp.b4_stock(c_qb) - v_s0,
    'mov', (select jsonb_build_object('delta', delta, 'tipo', tipo, 'motivo', motivo, 'dev', devolucion_id = v_dev_a)
            from compras_stock_movimientos where devolucion_id = v_dev_a),
    'estado', (select estado_recepcion from compras_pedidos where id = v_a),
    'pendiente_qb', (select jsonb_build_object('pend', pendiente, 'devuelto', devuelto, 'sin_repone', devuelto_sin_repone, 'recibido', recibido)
                     from v_compras_pedido_pendiente where pedido_id = v_a and item_id = c_qb),
    'evento', (select detalle from compras_pedido_eventos where pedido_id = v_a and tipo = 'devolucion_registrada'),
    'item_pi', (select pedido_item_id = pg_temp.b4_pi(v_a, c_qb) from compras_devolucion_items where devolucion_id = v_dev_a)));
  v_res := jsonb_set(v_res, '{S2,ok}', to_jsonb(
    (v_res #>> '{S2,delta_stock}')::numeric = -1 and v_res #>> '{S2,estado}' = 'parcial'
    and (v_res #>> '{S2,pendiente_qb,pend}')::numeric = 1 and r->>'codigo' like 'D-%-01'
    and v_res #>> '{S2,mov,motivo}' like '%(16,4 kg)%' and not (v_res #> '{S2,evento}') ? 'total'));

  -- ===== S3 reposición
  perform pg_temp.b4_remito(v_a, 1, 16.5, 0);
  v_res := v_res || jsonb_build_object('S3', jsonb_build_object(
    'estado', (select estado_recepcion from compras_pedidos where id = v_a),
    'pend', (select pendiente from v_compras_pedido_pendiente where pedido_id = v_a and item_id = c_qb)));
  v_res := jsonb_set(v_res, '{S3,ok}', to_jsonb(v_res #>> '{S3,estado}' = 'recibido' and (v_res #>> '{S3,pend}')::numeric = 0));

  -- ===== S4 devolver todo sin reposición → devuelto
  v_b := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_b, 2, 33, 3);
  r := compras_registrar_devolucion(v_b, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 2), jsonb_build_object('item_id', c_fec, 'cantidad', 3)), null, null, null);
  v_res := v_res || jsonb_build_object('S4', (select jsonb_build_object('recepcion', estado_recepcion, 'legacy', estado, 'resp_estado', r->>'estado_recepcion')
                                              from compras_pedidos where id = v_b));
  v_res := jsonb_set(v_res, '{S4,ok}', to_jsonb(v_res #>> '{S4,recepcion}' = 'devuelto' and v_res #>> '{S4,legacy}' = 'cerrado'));

  -- ===== S5 (D2) factura + devolución con NC
  v_c := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_c, 2, 33.4, 3);
  v_fac_c := pg_temp.b4_factura(v_c, 'B4-QA-9003', 2, 33.4, 3, null);
  select gasto_id into v_gasto from compras_facturas where id = v_fac_c;
  select monto into v_m0 from gastos where id = v_gasto;
  r := compras_registrar_devolucion(v_c, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16.4)), null,
        jsonb_build_object('numero', '0001-B4QA0005', 'fecha', current_date,
          'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 1250, 'alicuota_iva', 21))), null);
  v_dev_c := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S5', jsonb_build_object(
    'resp', r,
    'factura_total', (select total from compras_facturas where id = v_fac_c),
    'gasto_antes', v_m0,
    'gasto_despues', (select monto from gastos where id = v_gasto),
    'nc', (select jsonb_build_object('tipo', tipo_comprobante, 'origen_ok', factura_origen_id = v_fac_c, 'subtotal', subtotal, 'iva', iva,
                                     'total', total, 'nc_gasto', nc_gasto, 'desc', gasto_descontado, 'estado', estado)
           from compras_facturas where id = (r #>> '{nota_credito,id}')::uuid),
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_c),
    'vista_nc', (select jsonb_build_object('gasto_estado', gasto_estado, 'gasto_id_ok', gasto_id = v_gasto, 'dev', devolucion_codigo)
                 from v_compras_facturas where id = (r #>> '{nota_credito,id}')::uuid),
    'vista_fac', (select jsonb_build_object('nc_total', notas_credito_total, 'gasto_monto', gasto_monto) from v_compras_facturas where id = v_fac_c),
    'suma_con_signo', (select sum(case when tipo_comprobante = 'nota_credito' then -total else total end)
                       from v_compras_facturas where pedido_id = v_c and estado = 'confirmada')));
  v_res := jsonb_set(v_res, '{S5,ok}', to_jsonb(
    (v_res #>> '{S5,nc,total}')::numeric = 24805 and (v_res #>> '{S5,gasto_despues}')::numeric = v_m0 - 24805
    and v_res #>> '{S5,nc,nc_gasto}' = 'descontado' and (v_res #>> '{S5,diferencias}')::int = 0
    and v_res #>> '{S5,vista_nc,gasto_estado}' = 'Pendiente de pago'
    and (v_res #>> '{S5,suma_con_signo}')::numeric = (v_res #>> '{S5,gasto_despues}')::numeric));

  -- ===== S6 (D2 desde la diferencia) facturado 10, llegaron 8, cerrado a mano
  v_d := pg_temp.b4_pedido(0, 10);
  perform pg_temp.b4_remito(v_d, 0, null, 8);
  perform compras_cerrar_pedido_manual(v_d, 'QA B4: no llegan las 2 que faltan');
  v_fac_d := pg_temp.b4_factura(v_d, 'B4-QA-9004', 0, null, 10, null);
  select id into v_dif from compras_factura_discrepancias where factura_id = v_fac_d;
  r := compras_resolver_diferencia(v_dif, 'reclamo_proveedor', null);
  select monto into v_m0 from gastos where id = (select gasto_id from compras_facturas where id = v_fac_d);
  v_s0 := pg_temp.b4_stock(c_fec);
  r := compras_registrar_devolucion(v_d, m_noent, false,
        jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 2)), null,
        jsonb_build_object('numero', '0001-B4QA0006', 'fecha', current_date,
          'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 2450, 'alicuota_iva', 21))), v_dif);
  v_res := v_res || jsonb_build_object('S6', jsonb_build_object(
    'resp', r,
    'delta_stock', pg_temp.b4_stock(c_fec) - v_s0,
    'movs', (select count(*) from compras_stock_movimientos where devolucion_id = (r->>'id')::uuid),
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_d),
    'gasto', (select monto from gastos where id = (select gasto_id from compras_facturas where id = v_fac_d)),
    'gasto_antes', v_m0,
    'estado', (select estado_recepcion from compras_pedidos where id = v_d)));
  v_res := jsonb_set(v_res, '{S6,ok}', to_jsonb(
    (v_res #>> '{S6,delta_stock}')::numeric = 0 and (v_res #>> '{S6,movs}')::int = 0 and (v_res #>> '{S6,diferencias}')::int = 0
    and (v_res #>> '{S6,gasto}')::numeric = v_m0 - 5929 and v_res #>> '{S6,estado}' = 'cerrado_manual'));

  -- ===== S7 precio mal facturado sobre la línea por kg del pedido C (correcto $ 1.200)
  v_s0 := pg_temp.b4_stock(c_qb);
  v_n := (select count(*) from compras_factura_discrepancias where factura_id = v_fac_c);
  v_f0 := (select facturado_cantidad from compras_trazabilidad_insumo(current_date, current_date, c_qb));
  r := compras_registrar_devolucion(v_c, m_precio, false,
        jsonb_build_array(jsonb_build_object('factura_item_id',
          (select id from compras_factura_items where factura_id = v_fac_c and item_id = c_qb), 'cantidad', 33.4, 'precio_correcto', 1200)), null,
        jsonb_build_object('numero', '0001-B4QA0007', 'fecha', current_date,
          'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 99999, 'alicuota_iva', 21))), null);
  v_dev_c2 := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S7', jsonb_build_object(
    'resp', r,
    'linea', (select jsonb_build_object('item_id', item_id, 'desc', descripcion, 'cant', cantidad, 'precio', precio_unitario, 'sub', subtotal, 'iva', iva, 'por', precio_por)
              from compras_factura_items where factura_id = (r #>> '{nota_credito,id}')::uuid),
    'delta_stock', pg_temp.b4_stock(c_qb) - v_s0,
    'diferencias_antes', v_n,
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_c),
    'traza_facturado_igual', (select facturado_cantidad from compras_trazabilidad_insumo(current_date, current_date, c_qb)) = v_f0));
  v_res := jsonb_set(v_res, '{S7,ok}', to_jsonb(
    v_res #> '{S7,linea,item_id}' = 'null'::jsonb and (v_res #>> '{S7,linea,sub}')::numeric = 1670
    and (r #>> '{nota_credito,total}')::numeric = 2020.70
    and (v_res #>> '{S7,delta_stock}')::numeric = 0 and (v_res #>> '{S7,diferencias}')::int = v_n
    and (v_res #>> '{S7,traza_facturado_igual}')::boolean));

  -- ===== S8 (D3) devolución sin NC → diferencia "esperando"; después la NC
  v_e := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_e, 2, 33, 3);
  v_fac_e := pg_temp.b4_factura(v_e, 'B4-QA-9005', 2, 33, 3, null);
  select monto into v_m0 from gastos where id = (select gasto_id from compras_facturas where id = v_fac_e);
  r := compras_registrar_devolucion(v_e, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16)), null, null, null);
  v_dev_e := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S8', jsonb_build_object(
    'resp', r,
    'dif', (select jsonb_build_object('res', resolucion, 'dev_ok', devolucion_id = v_dev_e, 'nota', nota, 'dif', diferencia)
            from compras_factura_discrepancias where factura_id = v_fac_e),
    'vista_dif', (select jsonb_build_object('devuelta', devuelta, 'acreditada', acreditada, 'rec_base', recibida_base, 'fac_base', facturada_base, 'codigo', devolucion_codigo)
                  from v_compras_factura_diferencias where factura_id = v_fac_e),
    'espera', (select espera_nota_credito from v_compras_devoluciones where id = v_dev_e)));
  r := compras_cargar_nota_credito(v_dev_e, '0001-B4QA0008', current_date,
        jsonb_build_array(jsonb_build_object('devolucion_item_id', (select id from compras_devolucion_items where devolucion_id = v_dev_e),
          'precio_unitario', 1250, 'alicuota_iva', 21)), null);
  v_res := jsonb_set(v_res, '{S8,cargar}', r);
  v_res := jsonb_set(v_res, '{S8,despues}', jsonb_build_object(
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_e),
    'gasto', (select monto from gastos where id = (select gasto_id from compras_facturas where id = v_fac_e)),
    'nc_ok', (select nota_credito_id is not null from compras_devoluciones where id = v_dev_e),
    'espera', (select espera_nota_credito from v_compras_devoluciones where id = v_dev_e)));
  v_res := jsonb_set(v_res, '{S8,ok}', to_jsonb(
    v_res #>> '{S8,dif,res}' = 'reclamo_proveedor' and (v_res #>> '{S8,dif,dev_ok}')::boolean
    and v_res #>> '{S8,dif,nota}' like 'Esperando la nota de crédito de D-%' and (v_res #>> '{S8,espera}')::boolean
    and (v_res #>> '{S8,vista_dif,devuelta}')::numeric = 1 and (v_res #>> '{S8,vista_dif,rec_base}')::numeric = 17
    and (v_res #>> '{S8,despues,diferencias}')::int = 0 and (v_res #>> '{S8,despues,gasto}')::numeric = v_m0 - 24200
    and not (v_res #>> '{S8,despues,espera}')::boolean));

  -- ===== S9 (D4) anular la devolución de S5
  select monto into v_m1 from gastos where id = v_gasto;   -- con S5 y S7 aplicadas
  v_s0 := pg_temp.b4_stock(c_qb);
  r := compras_anular_devolucion(v_dev_c, 'QA B4: se cargó por error');
  v_res := v_res || jsonb_build_object('S9', jsonb_build_object(
    'resp', r,
    'delta_stock', pg_temp.b4_stock(c_qb) - v_s0,
    'reversion', (select jsonb_build_object('delta', m.delta, 'anula_ok', m.anula_movimiento_id = o.id)
                  from compras_stock_movimientos m join compras_stock_movimientos o on o.devolucion_id = v_dev_c and o.tipo = 'devolucion_proveedor'
                  where m.devolucion_id = v_dev_c and m.tipo = 'reversion'),
    'nc_estado', (select estado from compras_facturas where numero = '0001-B4QA0005'),
    'gasto', (select monto from gastos where id = v_gasto),
    'gasto_esperado', v_m1 + 24805,
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_c),
    'evento', (select detalle - 'lineas' from compras_pedido_eventos where pedido_id = v_c and tipo = 'devolucion_anulada')));
  begin
    r := compras_anular_devolucion(v_dev_c, 'otra vez'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S9,otra_vez}', to_jsonb(v_err));
  begin
    perform compras_mover_stock(c_qb, 1, 'reversion', 'duplicada', null, null,
      (select id from compras_stock_movimientos where devolucion_id = v_dev_c and tipo = 'devolucion_proveedor'), null, null, v_dev_c);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S9,reversion_duplicada}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S9,ok}', to_jsonb(
    (v_res #>> '{S9,delta_stock}')::numeric = 1 and (v_res #>> '{S9,reversion,anula_ok}')::boolean
    and v_res #>> '{S9,nc_estado}' = 'anulada' and (v_res #>> '{S9,gasto}')::numeric = v_m1 + 24805
    and (v_res #>> '{S9,diferencias}')::int = 0 and v_res #>> '{S9,otra_vez}' like '%ya está anulada%'
    and v_res #>> '{S9,reversion_duplicada}' <> 'NO FALLÓ'));

  -- ===== S10 (D5) gasto pagado → a favor
  v_f := pg_temp.b4_pedido(2, 3);
  v_fac_f := pg_temp.b4_factura(v_f, 'B4-QA-9006', 2, 33, 3, true);
  perform gastos_registrar_pago((select gasto_id from compras_facturas where id = v_fac_f), current_date, 'Transferencia', 'Caja QA', null);
  select monto into v_m0 from gastos where id = (select gasto_id from compras_facturas where id = v_fac_f);
  r := compras_registrar_devolucion(v_f, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16.5)), null,
        jsonb_build_object('numero', '0001-B4QA0010', 'fecha', current_date,
          'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 1250, 'alicuota_iva', 21))), null);
  v_dev_f := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S10', jsonb_build_object(
    'resp', r,
    'nc_gasto', (select nc_gasto from compras_facturas where id = (r #>> '{nota_credito,id}')::uuid),
    'gasto', (select jsonb_build_object('monto', monto, 'estado', estado) from gastos where id = (select gasto_id from compras_facturas where id = v_fac_f)),
    'vista_nc', (select jsonb_build_object('gasto_estado', gasto_estado, 'nc_gasto', nc_gasto) from v_compras_facturas where id = (r #>> '{nota_credito,id}')::uuid)));
  r := compras_anular_nota_credito(v_dev_f, 'QA B4');
  v_res := jsonb_set(v_res, '{S10,anular}', r);
  v_res := jsonb_set(v_res, '{S10,gasto_tras_anular}', to_jsonb((select monto from gastos where id = (select gasto_id from compras_facturas where id = v_fac_f))));
  v_res := jsonb_set(v_res, '{S10,espera_tras_anular}', to_jsonb((select espera_nota_credito from v_compras_devoluciones where id = v_dev_f)));
  v_res := jsonb_set(v_res, '{S10,ok}', to_jsonb(
    v_res #>> '{S10,nc_gasto}' = 'a_favor' and v_res #>> '{S10,resp,nota_credito,gasto}' = 'a_favor'
    and (v_res #>> '{S10,gasto,monto}')::numeric = v_m0 and (v_res #>> '{S10,gasto_tras_anular}')::numeric = v_m0
    and (v_res #>> '{S10,espera_tras_anular}')::boolean));

  -- ===== S11 NC descontada (E, S8) y después el gasto se paga → anular la NC frena
  perform gastos_registrar_pago((select gasto_id from compras_facturas where id = v_fac_e), current_date, 'Transferencia', 'Caja QA', null);
  select monto into v_m0 from gastos where id = (select gasto_id from compras_facturas where id = v_fac_e);
  begin
    r := compras_anular_nota_credito(v_dev_e, 'QA B4'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S11', jsonb_build_object('err', v_err,
    'nc_sigue', (select nota_credito_id is not null from compras_devoluciones where id = v_dev_e),
    'gasto_igual', (select monto from gastos where id = (select gasto_id from compras_facturas where id = v_fac_e)) = v_m0));
  v_res := jsonb_set(v_res, '{S11,ok}', to_jsonb(v_err like '%ya se pagó con el descuento%'
    and (v_res #>> '{S11,nc_sigue}')::boolean and (v_res #>> '{S11,gasto_igual}')::boolean));

  -- ===== S12 remito automático + devolución → anular la factura frena (E7)
  v_g := pg_temp.b4_pedido(2, 3);
  v_fac_g := pg_temp.b4_factura(v_g, 'B4-QA-9007', 2, 33, 3, true);
  r := compras_registrar_devolucion(v_g, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
  v_s0 := pg_temp.b4_stock(c_fec);
  begin
    r := compras_anular_factura(v_fac_g, 'QA B4'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S12', jsonb_build_object('err', v_err,
    'remitos', (select count(*) from compras_remitos where pedido_id = v_g),
    'stock_igual', pg_temp.b4_stock(c_fec) = v_s0,
    'factura', (select estado from compras_facturas where id = v_fac_g)));
  v_res := jsonb_set(v_res, '{S12,ok}', to_jsonb(v_err like '%Anulá esa devolución primero%'
    and (v_res #>> '{S12,remitos}')::int = 1 and (v_res #>> '{S12,stock_igual}')::boolean));

  -- ===== S13 factura con NC → anular frena (E18)
  begin
    r := compras_anular_factura(v_fac_c, 'QA B4'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S13', jsonb_build_object('con_nc', v_err));
  begin
    r := compras_anular_factura((select nota_credito_id from compras_devoluciones where id = v_dev_c2), 'QA B4'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S13,anular_la_nc}', to_jsonb(v_err));
  r := compras_anular_nota_credito(v_dev_c2, 'QA B4');
  begin
    r := compras_anular_factura(v_fac_c, 'QA B4'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S13,con_devolucion_precio}', to_jsonb(v_err));
  r := compras_anular_devolucion(v_dev_c2, 'QA B4');
  r := compras_anular_factura(v_fac_c, 'QA B4');
  v_res := jsonb_set(v_res, '{S13,anulada}', to_jsonb((select estado from compras_facturas where id = v_fac_c)));
  v_res := jsonb_set(v_res, '{S13,ok}', to_jsonb(
    v_res #>> '{S13,con_nc}' like '%0001-B4QA0007%' and v_res #>> '{S13,anular_la_nc}' like 'Una nota de crédito se anula desde su devolución%'
    and v_res #>> '{S13,con_devolucion_precio}' like '%corrige esta factura%' and v_res #>> '{S13,anulada}' = 'anulada'));

  -- ===== S14 NC por el total → gasto en $ 0 (D4)
  v_h := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_h, 2, 33, 3);
  v_fac_h := pg_temp.b4_factura(v_h, 'B4-QA-9008', 2, 33, 3, null);
  select monto into v_m0 from gastos where id = (select gasto_id from compras_facturas where id = v_fac_h);
  v_txt := (select forma_pago from gastos where id = (select gasto_id from compras_facturas where id = v_fac_h));
  r := compras_registrar_devolucion(v_h, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 2, 'cantidad_base', 33),
                          jsonb_build_object('item_id', c_fec, 'cantidad', 3)), null,
        jsonb_build_object('numero', '0001-B4QA0014', 'fecha', current_date,
          'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 1250, 'alicuota_iva', 21),
                                      jsonb_build_object('indice', 1, 'precio_unitario', 2450, 'alicuota_iva', 21))), null);
  v_dev_h := (r->>'id')::uuid;
  v_res := v_res || jsonb_build_object('S14', jsonb_build_object(
    'resp', r,
    'gasto', (select jsonb_build_object('monto', monto, 'estado', estado, 'forma', forma_pago, 'fecha_pago', fecha_pago)
              from gastos where id = (select gasto_id from compras_facturas where id = v_fac_h)),
    'estado', (select estado_recepcion from compras_pedidos where id = v_h)));
  r := compras_anular_devolucion(v_dev_h, 'QA B4');
  v_res := jsonb_set(v_res, '{S14,tras_anular}', (select jsonb_build_object('monto', monto, 'estado', estado, 'forma', forma_pago, 'fecha_pago', fecha_pago)
              from gastos where id = (select gasto_id from compras_facturas where id = v_fac_h)));
  v_res := jsonb_set(v_res, '{S14,estado_tras_anular}', to_jsonb((select estado_recepcion from compras_pedidos where id = v_h)));
  v_res := jsonb_set(v_res, '{S14,ok}', to_jsonb(
    (v_res #>> '{S14,gasto,monto}')::numeric = 0 and v_res #>> '{S14,gasto,estado}' = 'Pagado'
    and v_res #>> '{S14,gasto,forma}' = 'Nota de crédito' and v_res #>> '{S14,resp,nota_credito,gasto}' = 'cancelo_gasto'
    and v_res #>> '{S14,estado}' = 'devuelto'
    and (v_res #>> '{S14,tras_anular,monto}')::numeric = v_m0 and v_res #>> '{S14,tras_anular,estado}' = 'Pendiente de pago'
    and v_res #>> '{S14,tras_anular,forma}' = v_txt and v_res #>> '{S14,estado_tras_anular}' = 'recibido'));

  -- ===== S15 límites (cada uno con su mensaje; nada queda a medias)
  v_n := (select count(*) from compras_devoluciones);
  v_s0 := pg_temp.b4_stock(c_qb); v_s1 := pg_temp.b4_stock(c_fec);
  v_n2 := (select count(*) from compras_facturas where tipo_comprobante = 'nota_credito');
  v_res := v_res || jsonb_build_object('S15', '{}'::jsonb);
  begin  -- a. más de lo que llegó (A: llegaron 3, devuelto 1)
    r := compras_registrar_devolucion(v_a, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 3)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,mas_de_lo_que_llego}', to_jsonb(v_err));
  begin  -- b. la segunda pasa lo que queda
    r := compras_registrar_devolucion(v_a, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1.5)), null, null, null);
    r := compras_registrar_devolucion(v_a, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,segunda}', to_jsonb(v_err));
  begin  -- c. NC mayor que lo que queda de la factura
    r := compras_registrar_devolucion(v_e, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16)), null,
          jsonb_build_object('numero', '0001-B4QA0099', 'fecha', current_date,
            'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 999999, 'alicuota_iva', 21))), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,nc_mayor}', to_jsonb(v_err));
  begin  -- d. número de NC repetido para el proveedor
    r := compras_registrar_devolucion(v_e, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16)), null,
          jsonb_build_object('numero', '0001 B4QA0008', 'fecha', current_date,
            'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 1, 'alicuota_iva', 21))), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,nc_repetida}', to_jsonb(v_err));
  begin  -- e. repone + NC
    r := compras_registrar_devolucion(v_e, m_mal, true, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null,
          jsonb_build_object('numero', '0001-B4QA0098', 'fecha', current_date,
            'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 2450, 'alicuota_iva', 21))), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,repone_con_nc}', to_jsonb(v_err));
  begin  -- f. repone en un pedido cerrado a mano
    r := compras_registrar_devolucion(v_d, m_mal, true, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,repone_cerrado}', to_jsonb(v_err));
  begin  -- g. sin mercadería y sin factura
    r := compras_registrar_devolucion(v_a, m_noent, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,sin_factura}', to_jsonb(v_err));
  begin  -- h. NC sin los kg de una línea por kg
    r := compras_registrar_devolucion(v_e, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1)), null,
          jsonb_build_object('numero', '0001-B4QA0097', 'fecha', current_date,
            'lineas', jsonb_build_array(jsonb_build_object('indice', 0, 'precio_unitario', 1250, 'alicuota_iva', 21))), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,nc_sin_kg}', to_jsonb(v_err));
  begin  -- i. precio correcto ≥ cobrado
    r := compras_registrar_devolucion(v_e, m_precio, false,
          jsonb_build_array(jsonb_build_object('factura_item_id', (select id from compras_factura_items where factura_id = v_fac_e and item_id = c_qb),
            'cantidad', 1, 'precio_correcto', 1250)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,precio_mayor}', to_jsonb(v_err));
  begin  -- j. facturado y no entregado más de lo facturado
    r := compras_registrar_devolucion(v_e, m_noent, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 4)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S15,no_entregado_max}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S15,nada_a_medias}', to_jsonb(
    (select count(*) from compras_devoluciones) = v_n and pg_temp.b4_stock(c_qb) = v_s0 and pg_temp.b4_stock(c_fec) = v_s1
    and (select count(*) from compras_facturas where tipo_comprobante = 'nota_credito') = v_n2));
  v_res := jsonb_set(v_res, '{S15,ok}', to_jsonb(
    v_res #>> '{S15,mas_de_lo_que_llego}' like 'De Queso Barra llegaron 3 Caja y ya se devolvieron 1: como mucho podés devolver 2 Caja.'
    and v_res #>> '{S15,segunda}' like '%como mucho podés devolver 0,5 Caja%'
    and v_res #>> '{S15,nc_mayor}' like 'La nota de crédito%supera%'
    and v_res #>> '{S15,nc_repetida}' like 'Ya cargaste la nota de crédito%'
    and v_res #>> '{S15,repone_con_nc}' like 'Si el proveedor repone%'
    and v_res #>> '{S15,repone_cerrado}' like 'El pedido está cerrado a mano%'
    and v_res #>> '{S15,sin_factura}' like 'Esta devolución corrige la factura%'
    and v_res #>> '{S15,nc_sin_kg}' like 'Cargá los kg devueltos de Queso Barra%'
    and v_res #>> '{S15,precio_mayor}' like 'El precio correcto%'
    and v_res #>> '{S15,no_entregado_max}' like 'De Fécula de Mandioca se facturaron 3%'
    and (v_res #>> '{S15,nada_a_medias}')::boolean));

  -- ===== S16 (R3) diferencia ajustada en el stock → la devolución frena con E14
  v_i := pg_temp.b4_pedido(2, 0);
  perform pg_temp.b4_remito(v_i, 2, 33, 0);
  v_fac_i := pg_temp.b4_factura(v_i, 'B4-QA-9009', 3, 49.5, 0, null);
  r := compras_resolver_diferencia((select id from compras_factura_discrepancias where factura_id = v_fac_i), 'ajusta_stock', 'QA B4');
  v_n := (select count(*) from compras_stock_movimientos where item_id = c_qb);
  begin
    r := compras_registrar_devolucion(v_i, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S16', jsonb_build_object('err', v_err,
    'movs_nuevos', (select count(*) from compras_stock_movimientos where item_id = c_qb) - v_n));
  v_res := jsonb_set(v_res, '{S16,ok}', to_jsonb(v_err like 'Queso Barra ya se ajustó desde la factura%Revertí ese ajuste antes de registrar la devolución.'
    and (v_res #>> '{S16,movs_nuevos}')::int = 0));

  -- ===== S17 (E7) remito por debajo de lo devuelto
  v_j := pg_temp.b4_pedido(2, 0);
  v_rem := pg_temp.b4_remito(v_j, 2, 33, 0);
  select id into v_lin from compras_remito_items where remito_id = v_rem;
  r := compras_registrar_devolucion(v_j, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 2)), null, null, null);
  v_dev_j := (r->>'id')::uuid;
  v_s0 := pg_temp.b4_stock(c_qb);
  begin
    r := compras_guardar_remito(v_rem, null, current_date,
          jsonb_build_array(jsonb_build_object('id', v_lin, 'pedido_item_id', pg_temp.b4_pi(v_j, c_qb), 'descripcion', 'Queso Barra', 'cantidad', 1)), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('S17', jsonb_build_object('editar', v_err));
  begin
    r := compras_eliminar_remito(v_rem); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S17,eliminar}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S17,stock_igual}', to_jsonb(pg_temp.b4_stock(c_qb) = v_s0));
  v_res := jsonb_set(v_res, '{S17,ok}', to_jsonb(
    v_res #>> '{S17,editar}' like 'De Queso Barra se devolvieron 2 Caja al proveedor (D-%-01)%Anulá esa devolución primero.'
    and v_res #>> '{S17,eliminar}' like 'De Queso Barra se devolvieron 2 Caja%' and (v_res #>> '{S17,stock_igual}')::boolean));

  -- ===== S18 permisos con qa-squad (rol custom de Compras)
  v_k := pg_temp.b4_pedido(2, 3);
  perform pg_temp.b4_remito(v_k, 2, 33, 3);
  perform set_config('request.jwt.claims', json_build_object('sub', c_squad, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := v_res || jsonb_build_object('S18', '{}'::jsonb);
  begin
    r := compras_registrar_devolucion(v_k, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
    v_dev_k := (r->>'id')::uuid; v_err := 'ok';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,mercaderia}', to_jsonb(v_err));
  begin
    r := compras_registrar_devolucion(v_e, m_noent, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null, null, null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,sin_mercaderia}', to_jsonb(v_err));
  begin
    r := compras_registrar_devolucion(v_k, m_mal, false, jsonb_build_array(jsonb_build_object('item_id', c_fec, 'cantidad', 1)), null,
          jsonb_build_object('numero', '1', 'fecha', current_date, 'lineas', '[]'::jsonb), null);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,con_nc}', to_jsonb(v_err));
  begin
    r := compras_cargar_nota_credito(v_dev_k, '1', current_date, '[]'::jsonb, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,cargar_nc}', to_jsonb(v_err));
  begin
    r := compras_anular_nota_credito(v_dev_e, 'QA'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,anular_nc}', to_jsonb(v_err));
  begin
    r := compras_anular_devolucion(v_dev_e, 'QA'); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,anular_dev_con_nc}', to_jsonb(v_err));
  begin
    r := compras_anular_devolucion(v_dev_k, 'QA squad'); v_err := 'ok';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,anular_dev_propia}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S18,vista}', jsonb_build_object(
    'filas', (select count(*) from v_compras_devoluciones),
    'con_montos', (select count(*) from v_compras_devoluciones
                   where nc_numero is not null or nc_total is not null or factura_numero is not null
                      or exists (select 1 from jsonb_array_elements(lineas) l where l->'precio_correcto' <> 'null'::jsonb)),
    'eventos_nc', (select count(*) from v_compras_pedido_eventos where tipo like 'nota_credito%'),
    'facturas', (select count(*) from v_compras_facturas)));
  begin
    insert into compras_devoluciones (pedido_id, secuencia, motivo_id, motivo_nombre, devuelve_mercaderia, corrige_precio, repone)
    values (v_k, 99, m_mal, 'x', true, false, false);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,insert_directo}', to_jsonb(v_err));
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  v_res := jsonb_set(v_res, '{S18,anon_execute}', to_jsonb((select count(*) from pg_proc p
    where p.proname in ('compras_registrar_devolucion', 'compras_cargar_nota_credito', 'compras_anular_nota_credito', 'compras_anular_devolucion')
      and has_function_privilege('anon', p.oid, 'execute'))));
  v_res := jsonb_set(v_res, '{S18,authenticated_helpers}', to_jsonb((select count(*) from pg_proc p
    where p.proname in ('_compras_devuelto', '_compras_crear_nota_credito', '_compras_nc_aplicar_gasto', '_compras_nc_revertir_gasto',
                        'compras_mover_stock', 'compras_diferencias_calculadas', '_compras_exigir_sin_ajuste_factura')
      and has_function_privilege('authenticated', p.oid, 'execute'))));
  v_res := jsonb_set(v_res, '{S18,ok}', to_jsonb(
    v_res #>> '{S18,mercaderia}' = 'ok' and v_res #>> '{S18,sin_mercaderia}' like 'Solo un administrador%'
    and v_res #>> '{S18,con_nc}' like 'Solo un administrador%' and v_res #>> '{S18,cargar_nc}' like 'Solo un administrador%'
    and v_res #>> '{S18,anular_nc}' like 'Solo un administrador%' and v_res #>> '{S18,anular_dev_con_nc}' like '%la anula un administrador%'
    and v_res #>> '{S18,anular_dev_propia}' = 'ok' and (v_res #>> '{S18,vista,filas}')::int > 0
    and (v_res #>> '{S18,vista,con_montos}')::int = 0 and (v_res #>> '{S18,vista,eventos_nc}')::int = 0
    and (v_res #>> '{S18,vista,facturas}')::int = 0 and v_res #>> '{S18,insert_directo}' like '%permission denied%'
    and (v_res #>> '{S18,anon_execute}')::int = 0 and (v_res #>> '{S18,authenticated_helpers}')::int = 0));

  -- ===== S19 motivo editado después: la reversión mueve lo que se movió (E2)
  update compras_devolucion_motivos set devuelve_mercaderia = false where id = m_mal;
  v_s0 := pg_temp.b4_stock(c_qb);
  r := compras_anular_devolucion(v_dev_a, 'QA B4');
  v_res := v_res || jsonb_build_object('S19', jsonb_build_object('delta', pg_temp.b4_stock(c_qb) - v_s0, 'resp', r));
  v_res := jsonb_set(v_res, '{S19,ok}', to_jsonb((v_res #>> '{S19,delta}')::numeric = 1));
  update compras_devolucion_motivos set devuelve_mercaderia = true where id = m_mal;

  -- ===== S20 eventos (admin)
  v_res := v_res || jsonb_build_object('S20', jsonb_build_object(
    'factura_anulada_de_nc', (select count(*) from v_compras_pedido_eventos e
       where e.tipo = 'factura_anulada' and (e.detalle->>'factura_id')::uuid in (select id from compras_facturas where tipo_comprobante = 'nota_credito')),
    'nc', (select count(*) from v_compras_pedido_eventos where tipo = 'nota_credito' and detalle->>'devolucion_id' is not null),
    'nc_anulada', (select count(*) from v_compras_pedido_eventos where tipo = 'nota_credito_anulada' and detalle->>'devolucion_id' is not null),
    'nc_anulada_total', (select count(*) from v_compras_pedido_eventos where tipo = 'nota_credito_anulada')));
  v_res := jsonb_set(v_res, '{S20,ok}', to_jsonb((v_res #>> '{S20,factura_anulada_de_nc}')::int = 0
    and (v_res #>> '{S20,nc}')::int >= 6 and (v_res #>> '{S20,nc_anulada}')::int = (v_res #>> '{S20,nc_anulada_total}')::int
    and (v_res #>> '{S20,nc_anulada}')::int >= 4));

  -- ===== S21 vistas (lo de S2/S5/S8 ya quedó arriba; acá el pedido E con su NC)
  v_res := v_res || jsonb_build_object('S21', jsonb_build_object(
    'pendiente_A', (select jsonb_agg(jsonb_build_object('item', descripcion, 'recibido', recibido, 'devuelto', devuelto, 'pend', pendiente)) from v_compras_pedido_pendiente where pedido_id = v_a),
    'facturas_E', (select jsonb_agg(jsonb_build_object('tipo', tipo_comprobante, 'total', total, 'nc_total', notas_credito_total, 'gasto_monto', gasto_monto,
                                                       'origen', factura_origen_numero, 'dev', devolucion_codigo, 'estado_pago', gasto_estado))
                   from v_compras_facturas where pedido_id = v_e)));
  v_res := jsonb_set(v_res, '{S21,ok}', to_jsonb(
    (v_res #>> '{S2,pendiente_qb,devuelto}')::numeric = 1 and (v_res #>> '{S5,vista_fac,nc_total}')::numeric = 24805
    and (select notas_credito_total from v_compras_facturas where id = v_fac_e) = 24200));

  -- ===== S22 invariante del ledger
  v_res := v_res || jsonb_build_object('S22', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  v_res := v_res || jsonb_build_object('TODOS_OK', (select bool_and((value->>'ok')::boolean) from jsonb_each(v_res) where value ? 'ok')
                                                   and (v_res->>'S22')::int = 0,
                                       'FALLAN', (select jsonb_agg(key) from jsonb_each(v_res) where value ? 'ok' and not (value->>'ok')::boolean));
  raise exception 'RESULTADO: %', v_res;
end $$;
