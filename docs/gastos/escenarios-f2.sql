-- Escenarios de Gastos F2: lista filtrada en el servidor, resumen y Pendientes.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-f2.sql
--
-- Antes de aplicar la migración: "begin;" + 20261104120000_gastos_f2_listado.sql
-- + este archivo sin su "begin;".
--
-- Usuarios de dev: qa-admin 37794588-426a-4699-85df-889b6b828e07,
-- qa-local 93b4b0a1-a7c2-4932-a17e-9be77de9dc60 (no es admin).
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

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  e text; a uuid; b uuid; c uuid; d uuid; v_p uuid; r jsonb; n bigint; t numeric; x text;
begin
  -- Datos propios, marcados con "zzf2" en las observaciones.
  a := gastos_guardar(null, '2026-10-05', 'YA! CORDOBA', 'SERVICIOS Y ESTRUCTURA', 'ALQUILER', null, 1000, 'Transferencia', 'zzf2 alquiler Córdoba');
  b := gastos_guardar(null, '2026-10-20', 'YA! CORDOBA', 'LOGISTICA Y RODADOS', 'COMBUSTIBLE', null, 300, 'Efectivo', 'zzf2 nafta');
  c := gastos_guardar(null, '2026-09-28', 'YA! GOYA', 'PERSONAL', 'PERSONAL', null, 500, 'Efectivo', 'zzf2 cubre franco', null, '2026-10-01');
  d := gastos_guardar(null, '2026-10-10', 'YA! GOYA', 'MATERIA PRIMA', 'HUEVOS', null, 800, 'Efectivo', 'zzf2 huevos',
                      jsonb_build_object('fecha_pago', '2026-11-02', 'caja', 'Goya'));
  v_p := gastos_registrar_pago(a, '2026-10-06', 'Transferencia', 'Cordoba', null, 400);

  -- 1. Búsqueda sin acentos y sin importar mayúsculas
  select count(*) into n from gastos_listar(null, null, 'todos', null, 'ZZF2 alquiler cordoba');
  insert into _r (caso, ok, detalle) values ('1 busca "cordoba" y encuentra "Córdoba"', n = 1, n::text);

  -- 2. Período
  select string_agg(observaciones, ' | ' order by fecha) into x from gastos_listar('2026-10-01', '2026-10-31', 'todos', null, 'zzf2');
  insert into _r (caso, ok, detalle) values ('2 período de octubre: 3 gastos (sin el de septiembre)',
    (select count(*) from gastos_listar('2026-10-01', '2026-10-31', 'todos', null, 'zzf2')) = 3, x);

  -- 3. Estados
  insert into _r (caso, ok, detalle) values ('3 pendientes = pendiente + parcial (3), pagados (1)',
    (select count(*) from gastos_listar(null, null, 'pendientes', null, 'zzf2')) = 3
    and (select count(*) from gastos_listar(null, null, 'pagados', null, 'zzf2')) = 1, null);

  -- 4. Local y origen
  insert into _r (caso, ok, detalle) values ('4 local Goya (2) y origen manual (4)',
    (select count(*) from gastos_listar(null, null, 'todos', 'YA! GOYA', 'zzf2')) = 2
    and (select count(*) from gastos_listar(null, null, 'todos', null, 'zzf2', 'manual')) = 4, null);

  -- 5. Orden
  select string_agg(to_char(fecha, 'MM-DD'), ',') into x from (select fecha from gastos_listar(null, null, 'todos', null, 'zzf2', null, 'viejos')) s;
  insert into _r (caso, ok, detalle) values ('5 orden más viejo primero', x = '09-28,10-05,10-10,10-20', x);
  select string_agg(to_char(fecha, 'MM-DD'), ',') into x from (select fecha from gastos_listar(null, null, 'todos', null, 'zzf2')) s;
  insert into _r (caso, ok, detalle) values ('6 orden por defecto: más nuevo primero', x = '10-20,10-10,10-05,09-28', x);

  -- 7. Búsqueda por código de pedido de una factura (si hay en dev)
  select 'P-' || lpad(ped.numero::text, 4, '0') into x
  from compras_facturas f join compras_pedidos ped on ped.id = f.pedido_id where f.gasto_id is not null limit 1;
  if x is not null then
    insert into _r (caso, ok, detalle) values ('7 busca por código de pedido',
      exists (select 1 from gastos_listar(null, null, 'todos', null, x)), x);
  end if;

  -- 8. Resumen contra sumas directas
  r := gastos_resumen('2026-10-01', '2026-10-31', 'todos', null, 'zzf2');
  insert into _r (caso, ok, detalle) values ('8 pendiente = suma de saldos de toda la base',
    (r->>'pendiente')::numeric = (select coalesce(sum(saldo), 0) from v_gastos where estado in ('Pendiente de pago', 'Parcial')),
    r->>'pendiente');
  insert into _r (caso, ok, detalle) values ('9 pagado en el período = pagos vigentes por su fecha',
    (r->>'pagado_periodo')::numeric = (select coalesce(sum(p.monto), 0) from gastos_pagos p join gastos g on g.id = p.gasto_id
                                       where p.anulado_en is null and g.estado <> 'Anulado' and p.fecha between '2026-10-01' and '2026-10-31'),
    r->>'pagado_periodo');
  insert into _r (caso, ok, detalle) values ('10 gastado en el período = suma por fecha del gasto',
    (r->>'total_periodo')::numeric = (select coalesce(sum(monto), 0) from gastos where estado <> 'Anulado' and fecha between '2026-10-01' and '2026-10-31')
    and (r->>'gastos_periodo')::bigint = (select count(*) from gastos where estado <> 'Anulado' and fecha between '2026-10-01' and '2026-10-31'),
    (r->>'total_periodo') || ' / ' || (r->>'gastos_periodo'));
  insert into _r (caso, ok, detalle) values ('11 total filtrado (zzf2 de octubre) = 1000 + 300 + 800',
    (r->>'filtrado_total')::numeric = 2100, r->>'filtrado_total');

  -- 12. El pago de 400 del 06-10 entra en octubre; el ya pagado del 02-11, no
  r := gastos_resumen('2026-11-01', '2026-11-30');
  insert into _r (caso, ok, detalle) values ('12 noviembre incluye el pago del 02-11 (800)',
    (r->>'pagado_periodo')::numeric >= 800, r->>'pagado_periodo');

  -- 13. Pendientes por local, por saldo
  select total, cantidad into t, n from gastos_pendientes_resumen(null, null, 'YA! CORDOBA', 'zzf2');
  insert into _r (caso, ok, detalle) values ('13 Córdoba: 2 pendientes, falta 600 + 300', t = 900 and n = 2, t || ' / ' || n);
  select vencidos into n from gastos_pendientes_resumen(null, null, 'YA! GOYA', 'zzf2');
  insert into _r (caso, ok, detalle) values ('14 Goya: el que venció el 01-10 cuenta como vencido', n = 1, n::text);

  -- 15. Anular dos veces sigue rechazado con la función nueva
  perform gastos_anular_pago(v_p, 'prueba');
  e := pg_temp.err(format('select gastos_anular_pago(%L)', v_p));
  insert into _r (caso, ok, detalle) values ('15 anular dos veces rechazado', e like 'Ese pago ya está anulado%', e);
end $$;

-- 16. Otro rol: las funciones nuevas no devuelven nada
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
do $$
begin
  insert into _r (caso, ok, detalle) values ('16 no admin: gastos_listar vacía y resumen en 0',
    (select count(*) from gastos_listar()) = 0 and (gastos_resumen()->>'pendiente')::numeric = 0
    and (select count(*) from gastos_pendientes_resumen()) = 0, null);
end $$;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
