-- Escenarios de Gastos G2: cada gasto con una cuenta del plan.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-g2.sql
--
-- Antes de aplicar la migración: "begin;" + 20261111180000_gastos_cuentas.sql +
-- este archivo sin su "begin;". Los gastos de prueba van en 2030 para que el
-- período tenga solo estos.
-- Usuarios: qa-admin 37794588-426a-4699-85df-889b6b828e07, qa-local 93b4b0a1-a7c2-4932-a17e-9be77de9dc60.
begin;
create temp table _r (n serial, caso text, ok boolean, detalle text);
grant all on _r to authenticated, service_role;
grant usage on sequence _r_n_seq to authenticated, service_role;

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

-- 1. Los que ya estaban: ninguno fuera de Fudo sin cuenta, y rubro/categoría del plan.
insert into _r (caso, ok, detalle)
select '1 los gastos que ya estaban tienen cuenta y rubro/categoría del plan',
       count(*) filter (where g.origen <> 'fudo' and g.cuenta is null) = 0
       and count(*) filter (where g.cuenta is not null and (g.rubro is distinct from p.rubro_gasto or g.categoria is distinct from p.categoria_gasto)) = 0,
       count(*) filter (where g.cuenta is not null) || ' con cuenta'
from gastos g left join plan_cuentas p on p.codigo = g.cuenta;

update gastos_recurrentes set activo = false;
select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  luz uuid; ret uuid; x uuid; e text; g record; r jsonb; n int; rec uuid; fudo record;
begin
  -- 2. Alta con cuenta: rubro y categoría salen del plan
  luz := gastos_guardar(null, '2030-01-05', 'YA! GOYA', '5.3.01.01', null, 1000, 'Transferencia', null, null, null);
  select * into g from gastos where id = luz;
  insert into _r (caso, ok, detalle) values ('2 alta con 5.3.01.01: rubro y categoría del plan',
    g.cuenta = '5.3.01.01' and g.rubro = 'Gastos de funcionamiento' and g.categoria = 'Servicios', g.rubro || ' / ' || g.categoria);

  -- 3-5. Cuentas que no se pueden elegir
  e := pg_temp.err($q$select gastos_guardar(null, '2030-01-05', 'YA! GOYA', null, null, 10, 'Transferencia')$q$);
  insert into _r (caso, ok, detalle) values ('3 sin cuenta: pide la cuenta', e like 'Elegí la cuenta%', e);
  e := pg_temp.err($q$select gastos_guardar(null, '2030-01-05', 'YA! GOYA', '1.1.01.01', null, 10, 'Transferencia')$q$);
  insert into _r (caso, ok, detalle) values ('4 caja de efectivo: no se usa en Gastos', e like '%no se usa en Gastos%', e);
  e := pg_temp.err($q$select gastos_guardar(null, '2030-01-05', 'YA! GOYA', '5.3.01', null, 10, 'Transferencia')$q$);
  insert into _r (caso, ok, detalle) values ('5 una categoría (no imputable): no', e like '%no se usa en Gastos%', e);
  e := pg_temp.err($q$select gastos_guardar(null, '2030-01-05', 'YA! GOYA', '9.9.99.99', null, 10, 'Transferencia')$q$);
  insert into _r (caso, ok, detalle) values ('6 una cuenta que no existe: no', e is not null, e);

  -- 7. Editar la cuenta cambia rubro y categoría
  perform gastos_guardar(luz, '2030-01-05', 'YA! GOYA', '5.4.01.01', null, 1000, 'Transferencia', null, null, null);
  select * into g from gastos where id = luz;
  insert into _r (caso, ok, detalle) values ('7 editar a 5.4.01.01: Logística y vehículos',
    g.cuenta = '5.4.01.01' and g.rubro = 'Logística y vehículos' and g.categoria = 'Combustible y movilidad', g.rubro);
  perform gastos_guardar(luz, '2030-01-05', 'YA! GOYA', '5.3.01.01', null, 1000, 'Transferencia', null, null, null);

  -- 8. Un retiro del socio no suma en lo gastado: va aparte
  ret := gastos_guardar(null, '2030-01-06', 'YA! GOYA', '3.1.01.01', null, 500, 'Efectivo', null, null, null);
  r := gastos_resumen('2030-01-01', '2030-01-31');
  insert into _r (caso, ok, detalle) values ('8 resumen: gastado 1000 (1 gasto), otros pagos 500 (1)',
    (r->>'total_periodo')::numeric = 1000 and (r->>'gastos_periodo')::int = 1
    and (r->>'otros_periodo')::numeric = 500 and (r->>'otros_count')::int = 1, r::text);
  insert into _r (caso, ok, detalle) values ('9 lo filtrado suma todo lo que se ve (1500)',
    (r->>'filtrado_total')::numeric = 1500, r->>'filtrado_total');

  -- 10-13. Filtro por cuenta
  select count(*) into n from gastos_listar('2030-01-01', '2030-01-31', p_cuenta => '5.3');
  insert into _r (caso, ok, detalle) values ('10 filtro por rubro 5.3: la luz', n = 1, n::text);
  select count(*) into n from gastos_listar('2030-01-01', '2030-01-31', p_cuenta => '5.3.01.01');
  insert into _r (caso, ok, detalle) values ('11 filtro por la cuenta exacta', n = 1, n::text);
  select count(*) into n from gastos_listar('2030-01-01', '2030-01-31', p_cuenta => 'otros');
  insert into _r (caso, ok, detalle) values ('12 filtro "no es gasto": el retiro', n = 1, n::text);
  r := gastos_resumen('2030-01-01', '2030-01-31', p_cuenta => 'otros');
  insert into _r (caso, ok, detalle) values ('13 resumen con filtro: lo filtrado es 500',
    (r->>'filtrado_total')::numeric = 500, r->>'filtrado_total');

  -- 14. Buscar por el nombre de la cuenta, sin tildes
  select count(*) into n from gastos_listar('2030-01-01', '2030-01-31', p_q => 'energia electrica');
  insert into _r (caso, ok, detalle) values ('14 buscar "energia electrica" encuentra la luz', n = 1, n::text);

  -- 15-16. Un gasto de Fudo: se clasifica y se puede volver a dejar sin clasificar
  select * into fudo from gastos where origen = 'fudo' and estado <> 'Anulado' limit 1;
  if fudo.id is null then
    insert into _r (caso, ok, detalle) values ('15 gasto de Fudo (no hay en dev)', true, 'salteado');
  else
    perform gastos_guardar(fudo.id, fudo.fecha, fudo.local, '5.2.02.01', fudo.proveedor_id, fudo.monto, fudo.forma_pago,
                           fudo.observaciones, null, fudo.fecha_vencimiento);
    select * into g from gastos where id = fudo.id;
    insert into _r (caso, ok, detalle) values ('15 clasificar uno de Fudo en 5.2.02.01',
      g.cuenta = '5.2.02.01' and g.categoria = 'Personal contratado y eventual', g.categoria);
    perform gastos_guardar(fudo.id, fudo.fecha, fudo.local, null, fudo.proveedor_id, fudo.monto, fudo.forma_pago,
                           fudo.observaciones, null, fudo.fecha_vencimiento);
    select * into g from gastos where id = fudo.id;
    insert into _r (caso, ok, detalle) values ('16 y volver a "sin clasificar"', g.cuenta is null and g.rubro is null, coalesce(g.cuenta, 'null'));
  end if;

  -- 17-18. Gastos que se repiten con cuenta
  rec := gastos_recurrente_guardar(null, 'zz Alquiler G2', 'YA! GOYA', '5.3.02.01', null, 2000, false,
                                   'Transferencia', 10, null, '2030-01-01', null, null);
  r := gastos_generar_recurrentes('2030-01-31');
  select * into g from gastos where recurrente_id = rec;
  insert into _r (caso, ok, detalle) values ('17 la plantilla genera el gasto con su cuenta',
    g.cuenta = '5.3.02.01' and g.categoria = 'Alquileres', coalesce(g.cuenta, 'sin gasto'));
  e := pg_temp.err($q$select gastos_recurrente_guardar(null, 'zz', 'YA! GOYA', '1.1.01.01', null, 1, false, 'Transferencia', 1, null, '2030-01-01')$q$);
  insert into _r (caso, ok, detalle) values ('18 plantilla con una cuenta que no se usa: no', e like '%no se usa en Gastos%', e);
end $$;

-- 19. La factura de compras crea el gasto con la cuenta de compras_config
reset role;
do $$
declare x uuid; g record;
begin
  insert into gastos (fecha, local, rubro, categoria, monto, forma_pago, estado, origen)
  values ('2030-01-07', 'YA! GOYA', 'MATERIA PRIMA', 'MATERIA PRIMA', 300, 'Transferencia', 'Pendiente de pago', 'factura')
  returning id into x;
  select * into g from gastos where id = x;
  insert into _r (caso, ok, detalle) values ('19 gasto de factura: cuenta 5.1.01.01 y categoría del plan',
    g.cuenta = '5.1.01.01' and g.categoria = 'Materias primas', coalesce(g.cuenta, 'null') || ' ' || coalesce(g.categoria, ''));

  -- 20. Una cuenta que deja de usarse en Gastos no traba editar un gasto que ya la tenía
  update plan_cuentas set uso_gastos = null where codigo = '5.1.01.01';
  perform pg_temp.como('37794588-426a-4699-85df-889b6b828e07');
  perform gastos_guardar(x, '2030-01-07', 'YA! GOYA', '5.1.01.01', null, 300, 'Transferencia', 'editado', null, null);
  select * into g from gastos where id = x;
  insert into _r (caso, ok, detalle) values ('20 editar un gasto con una cuenta que ya no se usa: se guarda',
    g.observaciones = 'editado', g.observaciones);
end $$;

-- 21-22. El plan no se edita desde la app
reset role;
select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');
insert into _r (caso, ok, detalle)
select '21 un admin no puede cambiar el plan', e is not null, e
from (select pg_temp.err($q$update plan_cuentas set nombre = 'x' where codigo = '5.3.01.01'$q$) e) s;
insert into _r (caso, ok, detalle)
select '22 un admin no puede agregar cuentas', e is not null, e
from (select pg_temp.err($q$insert into plan_cuentas (codigo, nombre, nivel, padre, imputable, tipo, orden) values ('5.3.01.99', 'x', 4, '5.3.01', true, 'x', 999)$q$) e) s;
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
insert into _r (caso, ok, detalle)
select '23 un usuario de local lee el plan', count(*) = 216, count(*)::text from plan_cuentas;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
