-- Escenarios de B5 (plan-B5.md §9.2). Se corren contra dev PEGADOS DETRÁS de la
-- migración 20261006170000, en un solo archivo envuelto en begin/rollback:
--   { echo begin; cat <migración> docs/bloque2/escenarios-B5.sql; echo rollback; } > <tmp>
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp>
-- Después del push, se corren solos (sin la migración), igual envueltos.
-- El raise final deshace todo. Arma sus propios pedidos de GLOBAL (Queso Barra
-- + Fécula, como B4): no toca P-0079 ni P-0080. Cada clave "ok" tiene que dar true.
-- compras_avisos_tomar corre como postgres (dueño), que es lo que hace el
-- service role; S18 chequea que authenticated y anon no la puedan ejecutar.

create function pg_temp.b5_pedido(p_qb numeric, p_fec numeric) returns uuid language plpgsql as $f$
declare r jsonb; v uuid; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('item_id', '7e60be56-9d6d-41dc-b2bd-30fce887ca24', 'descripcion', 'Queso Barra', 'unidad', 'Caja', 'cantidad', p_qb); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('item_id', 'a360d424-8e73-4a7c-b75f-1c4522113d02', 'descripcion', 'Fécula de Mandioca', 'unidad', 'Bolsa', 'cantidad', p_fec); end if;
  r := compras_guardar_pedido(null, '6214db3f-40f3-46fb-ac8e-3a5a67170bf7', null, v_items);
  v := (r->>'id')::uuid;
  perform compras_marcar_pedido_enviado(v, false);
  return v;
end $f$;

create function pg_temp.b5_pi(p_ped uuid, p_item uuid) returns uuid language sql as $f$
  select id from compras_pedido_items where pedido_id = p_ped and item_id = p_item;
$f$;

create function pg_temp.b5_remito(p_ped uuid, p_qb numeric, p_qb_kg numeric, p_fec numeric) returns uuid language plpgsql as $f$
declare r jsonb; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b5_pi(p_ped, '7e60be56-9d6d-41dc-b2bd-30fce887ca24'),
                     'descripcion', 'Queso Barra', 'cantidad', p_qb, 'cantidad_base', p_qb_kg); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b5_pi(p_ped, 'a360d424-8e73-4a7c-b75f-1c4522113d02'),
                     'descripcion', 'Fécula de Mandioca', 'cantidad', p_fec); end if;
  r := compras_guardar_remito(null, p_ped, current_date, v_items, null);
  return (r->>'id')::uuid;
end $f$;

create function pg_temp.b5_factura(p_ped uuid, p_numero text, p_qb numeric, p_qb_kg numeric, p_fec numeric)
returns uuid language plpgsql as $f$
declare r jsonb; v uuid; v_items jsonb := '[]'::jsonb;
begin
  if p_qb > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b5_pi(p_ped, '7e60be56-9d6d-41dc-b2bd-30fce887ca24'),
                     'item_id', '7e60be56-9d6d-41dc-b2bd-30fce887ca24', 'descripcion', 'Queso Barra', 'unidad', 'Caja',
                     'cantidad', p_qb, 'cantidad_base', p_qb_kg, 'precio_por', 'base', 'precio_unitario', 1250, 'alicuota_iva', 21); end if;
  if p_fec > 0 then v_items := v_items || jsonb_build_object('pedido_item_id', pg_temp.b5_pi(p_ped, 'a360d424-8e73-4a7c-b75f-1c4522113d02'),
                     'item_id', 'a360d424-8e73-4a7c-b75f-1c4522113d02', 'descripcion', 'Fécula de Mandioca', 'unidad', 'Bolsa',
                     'cantidad', p_fec, 'precio_por', 'unidad', 'precio_unitario', 2450, 'alicuota_iva', 21); end if;
  r := compras_guardar_factura(null, p_ped, p_numero, current_date, null, null, null, v_items, null);
  v := (r->>'id')::uuid;
  perform compras_confirmar_factura(v, null, false, null, null);
  return v;
end $f$;

-- Cuántas filas de un tipo/entidad devuelve una toma.
create function pg_temp.b5_toma(p_tipo text, p_entidad uuid, p_pedido uuid default null) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from compras_avisos_tomar(array[p_tipo], p_pedido) t where t.entidad_id = p_entidad;
$f$;

create function pg_temp.b5_fila(p_tipo text, p_entidad uuid) returns boolean language sql as $f$
  select exists (select 1 from compras_avisos_enviados where tipo = p_tipo and entidad_id = p_entidad);
$f$;

do $$
declare
  c_admin  uuid := (select id from auth.users where email = 'qa-admin@chipacitos.test');
  c_squad  uuid := (select id from auth.users where email = 'qa-squad@chipacitos.test');
  c_qb     uuid := '7e60be56-9d6d-41dc-b2bd-30fce887ca24';
  c_fec    uuid := 'a360d424-8e73-4a7c-b75f-1c4522113d02';
  m_mal    uuid := (select id from compras_devolucion_motivos where nombre = 'Mercadería en mal estado');
  c_sin    uuid := (select p.id from profiles p
                    where p.estado = 'activo' and p.rol <> 'admin'
                      and not (coalesce(p.modulos_permitidos, '{}') && array['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'])
                    order by p.created_at limit 1);
  v_res jsonb := '{}'::jsonb;
  r jsonb; t1 jsonb; t2 jsonb; t3 jsonb;
  v_err text;
  v_a uuid; v_b uuid; v_c uuid; v_fac_b uuid; v_fac_c uuid; v_dev_c uuid; v_rem uuid;
  v_it uuid; v_it2 uuid; v_ped_it2 uuid;
  v_n int; v_n2 int; v_num numeric; v_num2 numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ===== S1 config
  insert into compras_config (clave, valor) values ('b5.qa.invalido', '"abc"'::jsonb);
  v_res := v_res || jsonb_build_object('S1', jsonb_build_object(
    'claves', (select count(*) from compras_config where clave in ('pedidos.dias_demora', 'avisos.remito_listo.activo',
               'avisos.pedido_demorado.activo', 'avisos.diferencias.activo', 'avisos.diferencias.dias', 'avisos.nc_pendiente.activo',
               'avisos.nc_pendiente.dias', 'avisos.stock_bajo.activo', 'avisos.repetir_dias')),
    'inexistente', _compras_config_num('b5.qa.no_existe', 42),
    'invalido_num', _compras_config_num('b5.qa.invalido', 7),
    'invalido_bool', _compras_config_bool('b5.qa.invalido', true),
    'demora', _compras_config_num('pedidos.dias_demora', 0)));
  v_res := jsonb_set(v_res, '{S1,ok}', to_jsonb((v_res #>> '{S1,claves}')::int = 9 and (v_res #>> '{S1,inexistente}')::numeric = 42
    and (v_res #>> '{S1,invalido_num}')::numeric = 7 and (v_res #>> '{S1,invalido_bool}')::boolean));

  -- ===== S2 demorado: una vez por episodio
  v_a := pg_temp.b5_pedido(2, 3);
  update compras_pedidos set enviado_en = now() - interval '4 days' where id = v_a;
  t1 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  t2 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  v_res := v_res || jsonb_build_object('S2', jsonb_build_object('t1', t1, 't2', t2));
  v_res := jsonb_set(v_res, '{S2,ok}', to_jsonb(jsonb_array_length(t1) = 1 and jsonb_array_length(t2) = 0
    and (t1 -> 0 ->> 'dias')::int = 4 and not (t1 -> 0 ->> 'repetido')::boolean));

  -- ===== S3 reenvío: otra huella → otro episodio
  update compras_pedidos set enviado_en = now() - interval '5 days' where id = v_a;
  t1 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  v_res := v_res || jsonb_build_object('S3', jsonb_build_object('t3', t1,
    'envios', (select envios from compras_avisos_enviados where tipo = 'pedido_demorado' and entidad_id = v_a)));
  v_res := jsonb_set(v_res, '{S3,ok}', to_jsonb(jsonb_array_length(t1) = 1 and not (t1 -> 0 ->> 'repetido')::boolean
    and (v_res #>> '{S3,envios}')::int = 1));

  -- ===== S4 remito que completa: deja de ser demorado, queda listo para facturar
  v_rem := pg_temp.b5_remito(v_a, 2, 33, 3);
  t1 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  t2 := pg_temp.b5_toma('remito_listo', v_a, v_a);
  v_res := v_res || jsonb_build_object('S4', jsonb_build_object(
    'estado', (select estado_recepcion from compras_pedidos where id = v_a),
    'demorado', t1, 'fila_demorado', pg_temp.b5_fila('pedido_demorado', v_a), 'listo', t2));
  v_res := jsonb_set(v_res, '{S4,ok}', to_jsonb(v_res #>> '{S4,estado}' = 'recibido' and jsonb_array_length(t1) = 0
    and not (v_res #>> '{S4,fila_demorado}')::boolean and jsonb_array_length(t2) = 1));

  -- ===== S5 remito_listo dos veces seguidas
  t1 := pg_temp.b5_toma('remito_listo', v_a, v_a);
  v_res := v_res || jsonb_build_object('S5', jsonb_build_object('t2', t1, 'ok', jsonb_array_length(t1) = 0));

  -- ===== S6 se elimina el remito: rearme
  perform compras_eliminar_remito(v_rem);
  t1 := pg_temp.b5_toma('remito_listo', v_a, v_a);
  v_res := v_res || jsonb_build_object('S6', jsonb_build_object(
    'estado', (select estado_recepcion from compras_pedidos where id = v_a),
    't', t1, 'fila', pg_temp.b5_fila('remito_listo', v_a)));
  v_res := jsonb_set(v_res, '{S6,ok}', to_jsonb(v_res #>> '{S6,estado}' = 'enviado' and jsonb_array_length(t1) = 0
    and not (v_res #>> '{S6,fila}')::boolean));

  -- ===== S7 tipo apagado: no toma ni rearma
  t1 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);   -- vuelve a ser demorado (episodio nuevo tras el rearme de S4)
  update compras_config set valor = 'false'::jsonb where clave = 'avisos.pedido_demorado.activo';
  update compras_pedidos set enviado_en = now() - interval '6 days' where id = v_a;   -- huella nueva
  t2 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  update compras_pedidos set enviado_en = now() where id = v_a;                        -- deja de ser candidato
  t3 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  v_res := v_res || jsonb_build_object('S7', jsonb_build_object('prendido', t1, 'apagado', t2, 'apagado_resuelto', t3,
    'fila', pg_temp.b5_fila('pedido_demorado', v_a)));
  v_res := jsonb_set(v_res, '{S7,ok}', to_jsonb(jsonb_array_length(t1) = 1 and jsonb_array_length(t2) = 0
    and jsonb_array_length(t3) = 0 and (v_res #>> '{S7,fila}')::boolean));
  update compras_pedidos set enviado_en = now() - interval '6 days' where id = v_a;
  update compras_config set valor = 'true'::jsonb where clave = 'avisos.pedido_demorado.activo';

  -- ===== S8 repetir_dias
  t1 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);   -- toma la huella nueva de S7
  update compras_config set valor = '1'::jsonb where clave = 'avisos.repetir_dias';
  update compras_avisos_enviados set enviado_en = now() - interval '2 days' where tipo = 'pedido_demorado' and entidad_id = v_a;
  t2 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);
  t3 := pg_temp.b5_toma('pedido_demorado', v_a, v_a);   -- recién repetido: no otra vez
  v_res := v_res || jsonb_build_object('S8', jsonb_build_object('huella_nueva', t1, 'repite', t2, 'enseguida', t3));
  v_res := jsonb_set(v_res, '{S8,ok}', to_jsonb(jsonb_array_length(t1) = 1 and jsonb_array_length(t2) = 1
    and (t2 -> 0 ->> 'repetido')::boolean and jsonb_array_length(t3) = 0));
  update compras_config set valor = '0'::jsonb where clave = 'avisos.repetir_dias';

  -- ===== S9 diferencias (factura con una Caja más de lo recibido)
  v_b := pg_temp.b5_pedido(2, 3);
  perform pg_temp.b5_remito(v_b, 2, 33, 3);
  v_fac_b := pg_temp.b5_factura(v_b, 'B5-QA-9001', 3, 49.5, 3);
  update compras_factura_discrepancias set updated_at = now() where factura_id = v_fac_b;
  t1 := pg_temp.b5_toma('diferencias', v_b, v_b);
  update compras_factura_discrepancias set updated_at = now() - interval '4 days' where factura_id = v_fac_b;
  t2 := pg_temp.b5_toma('diferencias', v_b, v_b);
  v_res := v_res || jsonb_build_object('S9', jsonb_build_object(
    'pendientes', (select count(*) from compras_factura_discrepancias where factura_id = v_fac_b and resolucion = 'pendiente'),
    'estado', (select estado_recepcion from compras_pedidos where id = v_b),
    'hoy', t1, 'hace_4', t2));
  v_res := jsonb_set(v_res, '{S9,ok}', to_jsonb((v_res #>> '{S9,pendientes}')::int > 0 and jsonb_array_length(t1) = 0
    and jsonb_array_length(t2) = 1 and (t2 -> 0 ->> 'pendientes')::int > 0 and (t2 -> 0 ->> 'dias')::int = 4));

  -- ===== S10 devolución contra la factura, sin NC, hace 8 días
  v_c := pg_temp.b5_pedido(2, 3);
  perform pg_temp.b5_remito(v_c, 2, 33, 3);
  v_fac_c := pg_temp.b5_factura(v_c, 'B5-QA-9002', 2, 33, 3);
  r := compras_registrar_devolucion(v_c, m_mal, false,
        jsonb_build_array(jsonb_build_object('item_id', c_qb, 'cantidad', 1, 'cantidad_base', 16)), null, null, null);
  v_dev_c := (r->>'id')::uuid;
  t1 := pg_temp.b5_toma('nc_pendiente', v_dev_c, v_c);   -- recién hecha: no
  update compras_devoluciones set created_at = now() - interval '8 days' where id = v_dev_c;
  update compras_facturas set confirmada_en = now() - interval '8 days' where id = v_fac_c;
  t2 := pg_temp.b5_toma('nc_pendiente', v_dev_c, v_c);
  v_res := v_res || jsonb_build_object('S10', jsonb_build_object(
    'espera_vista', (select espera_nota_credito from v_compras_devoluciones where id = v_dev_c),
    'hoy', t1, 'hace_8', t2, 'codigo_dev', r->>'codigo'));
  v_res := jsonb_set(v_res, '{S10,ok}', to_jsonb((v_res #>> '{S10,espera_vista}')::boolean and jsonb_array_length(t1) = 0
    and jsonb_array_length(t2) = 1 and t2 -> 0 ->> 'codigo' = r->>'codigo' and (t2 -> 0 ->> 'pedido_id')::uuid = v_c
    and (t2 -> 0 ->> 'dias')::int = 8));

  -- ===== S11 réplica de espera_nota_credito, sobre todas las devoluciones de dev
  select count(*) into v_n from (
    select id from v_compras_devoluciones where espera_nota_credito
    except select devolucion_id from _compras_devoluciones_esperan_nc()) x;
  select count(*) into v_n2 from (
    select devolucion_id from _compras_devoluciones_esperan_nc()
    except select id from v_compras_devoluciones where espera_nota_credito) x;
  v_res := v_res || jsonb_build_object('S11', jsonb_build_object('vista_menos_helper', v_n, 'helper_menos_vista', v_n2,
    'total', (select count(*) from _compras_devoluciones_esperan_nc()),
    'devoluciones_dev', (select count(*) from v_compras_devoluciones),
    'ok', v_n = 0 and v_n2 = 0 and (select count(*) from v_compras_devoluciones) > 0));

  -- ===== S12 réplica de "Por facturar" y "demorado" contra las reglas de la pantalla
  -- (filtroDelPedido con recibioAlgo = alguna línea recibida o algún remito; estaDemorado con 3 días),
  -- leídas de las vistas de Pedidos como qa-admin.
  with ped as (
    select p.id, p.estado_recepcion, p.estado_facturacion, p.enviado_en,
           (exists (select 1 from v_compras_pedido_pendiente l where l.pedido_id = p.id and coalesce(l.recibido, 0) > 0)
            or exists (select 1 from compras_remitos r where r.pedido_id = p.id)) as recibio
    from compras_pedidos p
  )
  select count(*) filter (where estado_recepcion <> 'devuelto' and estado_facturacion = 'sin_facturar'
                            and (estado_recepcion = 'recibido' or (estado_recepcion = 'cerrado_manual' and recibio))),
         count(*) filter (where estado_recepcion in ('enviado', 'parcial') and enviado_en is not null
                            and floor(extract(epoch from (now() - enviado_en)) / 86400) >= 3)
    into v_n, v_n2 from ped;
  r := compras_tablero_resumen();
  v_res := v_res || jsonb_build_object('S12', jsonb_build_object('pantalla_por_facturar', v_n, 'pantalla_demorados', v_n2,
    'tablero_por_facturar', r->'por_facturar', 'tablero_demorados', r->'demorados',
    'ok', (r->>'por_facturar')::int = v_n and (r->>'demorados')::int = v_n2));

  -- ===== S13 stock bajo: sin pedido avisa, con pedido abierto no
  select i.id into v_it from compras_items i
  where i.estado = 'activo' and i.id not in (c_qb, c_fec)
    and not exists (select 1 from compras_pedido_items pi join compras_pedidos p on p.id = pi.pedido_id
                    where pi.item_id = i.id and p.estado_recepcion in ('sin_enviar', 'enviado', 'parcial'))
  order by i.nombre limit 1;
  select i.id into v_it2 from compras_items i
  where i.estado = 'activo' and i.id not in (c_qb, c_fec, v_it)
  order by i.nombre limit 1;
  update compras_items set stock_minimo = coalesce((select cantidad from compras_stock_actual where item_id = compras_items.id), 0) + 100
  where id in (v_it, v_it2);
  -- Sin rastro de un aviso anterior (la QA de dev puede haber dejado uno hasta la próxima toma).
  delete from compras_avisos_enviados where tipo = 'stock_bajo' and entidad_id in (v_it, v_it2);
  r := compras_guardar_pedido(null, '6214db3f-40f3-46fb-ac8e-3a5a67170bf7', null,
         jsonb_build_array(jsonb_build_object('item_id', v_it2, 'descripcion', 'QA B5', 'unidad', 'u', 'cantidad', 1)));
  v_ped_it2 := (r->>'id')::uuid;
  perform compras_marcar_pedido_enviado(v_ped_it2, false);
  t1 := pg_temp.b5_toma('stock_bajo', v_it);
  t2 := pg_temp.b5_toma('stock_bajo', v_it2);
  v_res := v_res || jsonb_build_object('S13', jsonb_build_object('sin_pedido', t1, 'con_pedido', t2,
    'en_pedido_it2', (select en_pedido from _compras_insumos_bajo_minimo() where item_id = v_it2)));
  v_res := jsonb_set(v_res, '{S13,ok}', to_jsonb(jsonb_array_length(t1) = 1 and jsonb_array_length(t2) = 0
    and (v_res #>> '{S13,en_pedido_it2}')::boolean and (t1 -> 0 ->> 'minimo')::numeric > (t1 -> 0 ->> 'cantidad')::numeric));

  -- ===== S14 el insumo vuelve a superar el mínimo (ajuste de stock): rearme
  perform compras_ajustar_stock(v_it, (select stock_minimo from compras_items where id = v_it) + 1, 'QA B5');
  t1 := pg_temp.b5_toma('stock_bajo', v_it);
  v_res := v_res || jsonb_build_object('S14', jsonb_build_object('t', t1, 'fila', pg_temp.b5_fila('stock_bajo', v_it)));
  v_res := jsonb_set(v_res, '{S14,ok}', to_jsonb(jsonb_array_length(t1) = 0 and not (v_res #>> '{S14,fila}')::boolean));

  -- ===== S15 tablero como admin; la deuda contra estadoPago/resumirPagos sobre v_compras_facturas
  r := compras_tablero_resumen();
  select coalesce(sum(case when tipo_comprobante = 'nota_credito' then -total else total end)
                    filter (where not (tipo_comprobante = 'nota_credito' and nc_gasto in ('a_favor', 'sin_gasto'))
                              and gasto_id is not null and gasto_estado is distinct from 'Pagado'), 0),
         coalesce(sum(-total) filter (where tipo_comprobante = 'nota_credito' and nc_gasto = 'a_favor'), 0)
    into v_num, v_num2
  from v_compras_facturas where estado = 'confirmada';
  v_res := v_res || jsonb_build_object('S15', jsonb_build_object('tablero', r, 'vista_pendiente', v_num, 'vista_a_favor', v_num2,
    'nulos', (select count(*) from jsonb_each(r) where jsonb_typeof(value) <> 'number')));
  v_res := jsonb_set(v_res, '{S15,ok}', to_jsonb((v_res #>> '{S15,nulos}')::int = 0
    and (r->>'deuda_pendiente')::numeric = round(v_num, 2) and (r->>'deuda_a_favor')::numeric = round(v_num2, 2)
    and (r->>'por_facturar')::int >= 1 and (r->>'diferencias')::int >= 1 and (r->>'nc_pendientes')::int >= 1
    and (r->>'por_facturar_estimado')::numeric > 0));

  -- ===== S16 tablero como qa-squad: sin campos de admin
  perform set_config('request.jwt.claims', json_build_object('sub', c_squad, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := compras_tablero_resumen();
  v_res := v_res || jsonb_build_object('S16', jsonb_build_object('tablero', r,
    'ok', jsonb_typeof(r->'por_recibir') = 'number' and jsonb_typeof(r->'stock_bajo') = 'number'
          and jsonb_typeof(r->'por_facturar') = 'number' and jsonb_typeof(r->'demorados') = 'number'
          and r->'por_facturar_estimado' = 'null'::jsonb and r->'diferencias' = 'null'::jsonb
          and r->'nc_pendientes' = 'null'::jsonb and r->'deuda_pendiente' = 'null'::jsonb and r->'deuda_a_favor' = 'null'::jsonb));

  -- ===== S20 (acá, con el rol de squad) las tablas de avisos no se ven sin admin
  v_res := v_res || jsonb_build_object('S20', jsonb_build_object(
    'squad_enviados', (select count(*) from compras_avisos_enviados),
    'squad_corridas', (select count(*) from compras_avisos_corridas)));
  begin
    insert into compras_avisos_enviados (tipo, entidad_id) values ('stock_bajo', gen_random_uuid()); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S20,squad_insert}', to_jsonb(v_err));

  -- ===== S18/S19 como authenticated: tomar y los helpers, denegados
  v_res := v_res || jsonb_build_object('S18', '{}'::jsonb);
  begin
    perform * from compras_avisos_tomar(null, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,squad_tomar}', to_jsonb(v_err));
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  begin
    perform * from compras_avisos_tomar(null, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,admin_tomar}', to_jsonb(v_err));
  v_res := jsonb_set(v_res, '{S20,admin_enviados}', to_jsonb((select count(*) from compras_avisos_enviados)));
  v_res := v_res || jsonb_build_object('S19', '{}'::jsonb);
  begin
    perform count(*) from _compras_pedidos_por_recibir(); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S19,llamada}', to_jsonb(v_err));
  perform set_config('role', 'anon', true);
  begin
    perform * from compras_avisos_tomar(null, null); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := jsonb_set(v_res, '{S18,anon_tomar}', to_jsonb(v_err));

  -- ===== S17 usuario sin compras
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_sin, 'role', 'authenticated')::text, true);
  begin
    r := compras_tablero_resumen(); v_err := 'NO FALLÓ';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  v_res := v_res || jsonb_build_object('S17', jsonb_build_object('usuario', c_sin, 'err', v_err,
    'ok', c_sin is not null and v_err like '42501%'));

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  v_res := jsonb_set(v_res, '{S18,privilegios}', jsonb_build_object(
    'authenticated', has_function_privilege('authenticated', 'public.compras_avisos_tomar(text[], uuid)', 'execute'),
    'anon', has_function_privilege('anon', 'public.compras_avisos_tomar(text[], uuid)', 'execute'),
    'service_role', has_function_privilege('service_role', 'public.compras_avisos_tomar(text[], uuid)', 'execute'),
    'tablero_anon', has_function_privilege('anon', 'public.compras_tablero_resumen()', 'execute')));
  v_res := jsonb_set(v_res, '{S18,ok}', to_jsonb(v_res #>> '{S18,squad_tomar}' like '%permission denied%'
    and v_res #>> '{S18,admin_tomar}' like '%permission denied%' and v_res #>> '{S18,anon_tomar}' like '%permission denied%'
    and not (v_res #>> '{S18,privilegios,authenticated}')::boolean and not (v_res #>> '{S18,privilegios,anon}')::boolean
    and (v_res #>> '{S18,privilegios,service_role}')::boolean and not (v_res #>> '{S18,privilegios,tablero_anon}')::boolean));

  v_res := jsonb_set(v_res, '{S19,authenticated_helpers}', to_jsonb((select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_compras_config_num', '_compras_config_bool', '_compras_pedidos_por_recibir', '_compras_pedidos_demorados',
                        '_compras_pedidos_por_facturar', '_compras_pedidos_con_diferencias', '_compras_devoluciones_esperan_nc',
                        '_compras_insumos_bajo_minimo', '_compras_avisos_candidatos')
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')))));
  v_res := jsonb_set(v_res, '{S19,ok}', to_jsonb(v_res #>> '{S19,llamada}' like '%permission denied%'
    and (v_res #>> '{S19,authenticated_helpers}')::int = 0));

  v_res := jsonb_set(v_res, '{S20,ok}', to_jsonb((v_res #>> '{S20,squad_enviados}')::int = 0
    and (v_res #>> '{S20,squad_corridas}')::int = 0 and (v_res #>> '{S20,squad_insert}' like '%permission denied%' or v_res #>> '{S20,squad_insert}' like '%row-level security%')
    and (v_res #>> '{S20,admin_enviados}')::int > 0));

  -- ===== S22 invariante del ledger
  v_res := v_res || jsonb_build_object('S22', (select count(*) from compras_stock_actual a
    where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id)));

  v_res := v_res || jsonb_build_object('TODOS_OK', (select bool_and((value->>'ok')::boolean) from jsonb_each(v_res) where value ? 'ok')
                                                   and (v_res->>'S22')::int = 0,
                                       'FALLAN', (select jsonb_agg(key) from jsonb_each(v_res) where value ? 'ok' and not (value->>'ok')::boolean));
  raise exception 'RESULTADO: %', v_res;
end $$;
