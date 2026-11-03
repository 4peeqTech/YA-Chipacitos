-- Escenarios de Gastos F1: locales, pagos parciales con historial, vencimiento,
-- adjuntos, candados de factura y de Fudo, y acceso.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-f1.sql
--
-- Antes de aplicar la migración: armar un archivo con "begin;", el contenido
-- de 20261103210000_gastos_f1_pagos_locales.sql y este archivo sin su "begin;".
--
-- Devuelve una fila por caso (ok = true/false). Usuarios de dev:
--   qa-admin  37794588-426a-4699-85df-889b6b828e07
--   qa-local  93b4b0a1-a7c2-4932-a17e-9be77de9dc60 (no es admin)
begin;
create temp table _r (n serial, caso text, ok boolean, detalle text);
grant all on _r to authenticated;
grant usage on sequence _r_n_seq to authenticated;

create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- Lo que dejó la migración, antes de tocar nada.
insert into _r (caso, ok, detalle)
select '0a locales: 9 activos en orden, 5 con Fudo',
  count(*) filter (where activo and orden between 1 and 9) = 9 and count(*) filter (where tiene_fudo) = 5,
  string_agg(sucursal || case when tiene_fudo then ' (fudo)' else '' end || coalesce(' → ' || caja_default, ''), ', ' order by orden)
from locales_config;

insert into _r (caso, ok, detalle)
select '0b pagos migrados: cada Pagado con monto tiene su pago',
  not exists (
    select 1 from gastos g where g.estado = 'Pagado' and g.monto > 0
      and not exists (select 1 from gastos_pagos p where p.gasto_id = g.id and p.anulado_en is null)),
  (select count(*) from gastos_pagos)::text || ' pagos';

insert into _r (caso, ok, detalle)
select '0c gastos de factura con origen factura',
  not exists (select 1 from compras_facturas f join gastos g on g.id = f.gasto_id where f.gasto_generado and g.origen <> 'factura'),
  (select count(*) from gastos where origen = 'factura')::text;

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  e text; v_id uuid; v_id2 uuid; v_p1 uuid; v_p2 uuid; v_adj uuid; v_ruta text; g record; v_fac uuid;
begin
  -- 1. Alta pendiente
  v_id := gastos_guardar(null, current_date, 'YA! FABRICA', 'MATERIA PRIMA', 'HUEVOS', null, 100, 'Transferencia', 'zz test f1', null, current_date - 1);
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('1 alta queda pendiente, saldo = monto, vencido',
    g.estado = 'Pendiente de pago' and g.saldo = 100 and g.pagado = 0 and g.vencido and g.origen = 'manual',
    g.estado || ' saldo ' || g.saldo || ' vencido ' || g.vencido);

  -- 2. Pago parcial
  v_p1 := gastos_registrar_pago(v_id, current_date, 'Efectivo', 'Paraguay', null, 40);
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('2 pago de 40: Parcial, falta 60, no vencido',
    g.estado = 'Parcial' and g.saldo = 60 and g.pagado = 40 and g.pagos = 1 and g.vencido,
    g.estado || ' saldo ' || g.saldo);

  -- 3. No se paga de más
  e := pg_temp.err(format('select gastos_registrar_pago(%L, current_date, %L, %L, null, 61)', v_id, 'Efectivo', 'Paraguay'));
  insert into _r (caso, ok, detalle) values ('3 pago mayor al saldo rechazado', e like 'El pago es mayor%$ 60%', e);

  -- 4. Sin monto paga el saldo
  v_p2 := gastos_registrar_pago(v_id, current_date, 'Transferencia', 'Paraguay', 'gastos/x/comp.pdf', null);
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('4 pago sin monto completa: Pagado, saldo 0, último pago visible',
    g.estado = 'Pagado' and g.saldo = 0 and g.pagos = 2 and not g.vencido
      and g.fecha_pago = current_date and g.ultimo_pago_forma = 'Transferencia' and g.comprobante_url = 'gastos/x/comp.pdf',
    g.estado || ' / ' || g.ultimo_pago_forma);

  e := pg_temp.err(format('select gastos_registrar_pago(%L, current_date, %L, %L)', v_id, 'Efectivo', 'Paraguay'));
  insert into _r (caso, ok, detalle) values ('5 pagar un gasto ya pagado rechazado', e like 'Ese gasto ya está pagado%', e);

  -- 6. Editar el monto por debajo de lo pagado
  e := pg_temp.err(format('select gastos_guardar(%L, current_date, %L, %L, %L, null, 50, %L, null)', v_id, 'YA! FABRICA', 'MATERIA PRIMA', 'HUEVOS', 'Transferencia'));
  insert into _r (caso, ok, detalle) values ('6 monto menor a lo pagado rechazado', e like 'Ya se pagaron $ 100%', e);

  -- 7. Subir el monto: vuelve a Parcial
  perform gastos_guardar(v_id, current_date, 'YA! FABRICA', 'MATERIA PRIMA', 'HUEVOS', null, 150, 'Transferencia', null);
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('7 subir el monto a 150: Parcial, falta 50', g.estado = 'Parcial' and g.saldo = 50, g.estado || ' ' || g.saldo);

  -- 8. Anular un pago: queda en el historial
  perform gastos_anular_pago(v_p1, 'cargado de más');
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('8 anular el pago de 40: Parcial con 60 pagos, el anulado sigue',
    g.estado = 'Parcial' and g.pagado = 60 and g.pagos = 1
      and exists (select 1 from v_gastos_pagos where id = v_p1 and anulado_en is not null and anulado_motivo = 'cargado de más' and anulado_por_nombre is not null),
    g.estado || ' pagado ' || g.pagado);

  e := pg_temp.err(format('select gastos_anular_pago(%L)', v_p1));
  insert into _r (caso, ok, detalle) values ('9 anular dos veces rechazado', e like 'Ese pago ya está anulado%', e);

  -- 10. No se elimina con pagos vigentes
  e := pg_temp.err(format('select gastos_eliminar(%L)', v_id));
  insert into _r (caso, ok, detalle) values ('10 eliminar con pagos rechazado', e like 'Este gasto tiene pagos%', e);

  -- 11. Deshacer (pantalla anterior): todos los pagos anulados, pendiente
  perform gastos_deshacer_pago(v_id);
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('11 deshacer pago: Pendiente, sin pagos vigentes, historial de 2',
    g.estado = 'Pendiente de pago' and g.pagos = 0 and g.fecha_pago is null
      and (select count(*) from gastos_pagos where gasto_id = v_id) = 2,
    g.estado);

  -- 12. Adjuntos
  v_adj := gastos_agregar_adjunto(v_id, 'gastos/' || v_id || '/factura.pdf', 'factura.pdf', 'application/pdf', 1234);
  select * into g from v_gastos where id = v_id;
  v_ruta := gastos_quitar_adjunto(v_adj);
  insert into _r (caso, ok, detalle) values ('12 adjunto: suma 1 y al quitarlo devuelve la ruta',
    g.adjuntos = 1 and v_ruta = 'gastos/' || v_id || '/factura.pdf' and not exists (select 1 from gastos_adjuntos where id = v_adj), v_ruta);

  -- 13. Eliminar sin pagos vigentes
  perform gastos_eliminar(v_id);
  insert into _r (caso, ok, detalle) values ('13 eliminar sin pagos vigentes: se borra con su historial',
    not exists (select 1 from gastos where id = v_id) and not exists (select 1 from gastos_pagos where gasto_id = v_id), null);

  -- 14. Alta ya pagada
  v_id2 := gastos_guardar(null, current_date, 'YA! UNIDAD', 'PERSONAL', 'PERSONAL', null, 250.555, 'Efectivo', null,
                          jsonb_build_object('fecha_pago', current_date, 'caja', 'La unidad'));
  select * into g from v_gastos where id = v_id2;
  insert into _r (caso, ok, detalle) values ('14 alta ya pagada: Pagado con un pago por el total (redondeado)',
    g.estado = 'Pagado' and g.monto = 250.56 and g.pagado = 250.56 and g.caja = 'La unidad', g.estado || ' ' || g.pagado);

  -- 15-16. Validaciones de alta
  e := pg_temp.err($q$select gastos_guardar(null, current_date, 'YA! NO EXISTE', 'PERSONAL', 'PERSONAL', null, 10, 'Efectivo')$q$);
  insert into _r (caso, ok, detalle) values ('15 local inexistente rechazado', e like 'Ese local no está%', e);
  e := pg_temp.err($q$select gastos_guardar(null, current_date, 'YA! FABRICA', null, null, null, 10, 'Efectivo')$q$);
  insert into _r (caso, ok, detalle) values ('16 alta sin rubro rechazada', e like 'Elegí el rubro%', e);
  e := pg_temp.err($q$insert into gastos (fecha, local, monto, forma_pago) values (current_date, 'YA! FABRICA', 10, 'Efectivo')$q$);
  insert into _r (caso, ok, detalle) values ('17 manual sin clasificar rechazado por la base', e like '%gastos_clasificado_check%', e);

  -- 18. Gasto de Fudo: entra sin clasificar, candados
  insert into gastos (fecha, local, monto, forma_pago, origen, fudo_id, fudo_categoria)
  values (current_date - 3, 'YA! UNIDAD', 500, 'Cta. Cte.', 'fudo', 'zz-1', 'Cubre franco') returning id into v_id;
  e := pg_temp.err(format('select gastos_guardar(%L, current_date - 3, %L, null, null, null, 400, %L, null)', v_id, 'YA! UNIDAD', 'Cta. Cte.'));
  insert into _r (caso, ok, detalle) values ('18 Fudo: cambiar el monto rechazado', e like 'Este gasto viene de Fudo%', e);
  perform gastos_guardar(v_id, current_date - 3, 'YA! UNIDAD', 'PERSONAL', 'PERSONAL', null, 500, 'Cta. Cte.', 'clasificado');
  select * into g from v_gastos where id = v_id;
  insert into _r (caso, ok, detalle) values ('19 Fudo: clasificarlo sí', g.rubro = 'PERSONAL' and g.observaciones = 'clasificado', g.rubro);
  e := pg_temp.err(format('select gastos_eliminar(%L)', v_id));
  insert into _r (caso, ok, detalle) values ('20 Fudo: eliminar rechazado', e like 'Este gasto viene de Fudo%', e);
  e := pg_temp.err($q$insert into gastos (fecha, local, monto, forma_pago, origen, fudo_id) values (current_date, 'YA! UNIDAD', 1, 'x', 'fudo', 'zz-1')$q$);
  insert into _r (caso, ok, detalle) values ('21 Fudo: mismo id en el mismo local rechazado', e like '%gastos_fudo_unico%', e);

  -- 22. Gasto de factura: candado de monto
  select f.gasto_id into v_fac from compras_facturas f join gastos g2 on g2.id = f.gasto_id limit 1;
  if v_fac is null then
    insert into _r (caso, ok, detalle) values ('22 factura: candado de monto', null, 'no hay gastos de factura en dev');
  else
    select * into g from gastos where id = v_fac;
    e := pg_temp.err(format('select gastos_guardar(%L, %L, %L, %L, %L, %L, %s, %L, null)',
      g.id, g.fecha, g.local, coalesce(g.rubro, 'MATERIA PRIMA'), coalesce(g.categoria, 'MATERIA PRIMA'), g.proveedor_id, g.monto + 1, g.forma_pago));
    insert into _r (caso, ok, detalle) values ('22 factura: cambiar el monto rechazado', e like 'Este gasto salió de la factura%', e);
  end if;
end $$;

-- 23. Otro rol: ni ve ni paga
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
do $$
declare e text;
begin
  insert into _r (caso, ok, detalle) values ('23 no admin: v_gastos vacía', (select count(*) from v_gastos) = 0, null);
  e := pg_temp.err(format('select gastos_registrar_pago(%L, current_date, %L, %L)', gen_random_uuid(), 'Efectivo', 'Paraguay'));
  insert into _r (caso, ok, detalle) values ('24 no admin: registrar pago rechazado', e like 'Solo un administrador%', e);
  e := pg_temp.err('select count(*) from gastos_pagos');
  insert into _r (caso, ok, detalle) values ('25 no admin: gastos_pagos sin filas', (select count(*) from gastos_pagos) = 0, e);
  e := pg_temp.err(format('select gastos_recalcular_estado(%L)', gen_random_uuid()));
  insert into _r (caso, ok, detalle) values ('26 recalcular no se llama desde afuera', e like '%permission denied%', e);
end $$;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
