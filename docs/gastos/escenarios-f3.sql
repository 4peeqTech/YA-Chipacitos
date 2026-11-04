-- Escenarios de Gastos F3: conciliación de lo que manda Fudo con la base.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-f3.sql
--
-- Antes de aplicar la migración: "begin;" + 20261105120000_gastos_f3_fudo.sql +
-- este archivo sin su "begin;". Usa YA! CORDOBA (tiene Fudo pero sin datos
-- reales sincronizados) e ids de Fudo que empiezan con "zz".
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

-- Un gasto de Fudo como lo arma la app.
create function pg_temp.it(id text, monto numeric, estado text default 'UNPAID', cancelado boolean default false,
                           pagos jsonb default '[]', venc date default null, fecha date default '2026-10-10') returns jsonb
language sql as $$
  select jsonb_build_object('fudo_id', id, 'fecha', fecha, 'monto', monto, 'descripcion', 'zz ' || id, 'categoria', 'Cubre franco',
    'proveedor', 'Prov ' || id, 'estado', estado, 'cancelado', cancelado, 'vencimiento', venc, 'forma', 'Cta. Cte.', 'pagos', pagos)
$$;

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  r jsonb; e text; g record; a uuid; L constant text := 'YA! CORDOBA';
  pB jsonb := '[{"id":"zzp1","fecha":"2026-10-11","monto":500,"forma":"Efectivo"}]';
begin
  -- 1. Primera lectura: A impago (Cta. Cte.), B pagado en efectivo, C cancelado
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000), pg_temp.it('zzB', 500, 'PAID', false, pB), pg_temp.it('zzC', 300, 'UNPAID', true)), true, 'script');
  insert into _r (caso, ok, detalle) values ('1 trae 2 (el cancelado no) y 1 pago', (r->>'nuevos')::int = 2 and (r->>'pagos')::int = 1, r::text);
  select * into g from v_gastos where local = L and fudo_id = 'zzA';
  insert into _r (caso, ok, detalle) values ('2 A: pendiente, sin clasificar, con datos de Fudo',
    g.estado = 'Pendiente de pago' and g.origen = 'fudo' and g.rubro is null and g.fudo_categoria = 'Cubre franco' and g.fudo_descripcion = 'zz zzA', g.estado);
  select * into g from v_gastos where local = L and fudo_id = 'zzB';
  insert into _r (caso, ok, detalle) values ('3 B: pagado con la caja del local',
    g.estado = 'Pagado' and g.caja = (select caja_default from locales_config where sucursal = L), g.estado || ' / ' || coalesce(g.caja, '∅'));
  insert into _r (caso, ok, detalle) values ('4 C cancelado no se trae', not exists (select 1 from gastos where local = L and fudo_id = 'zzC'), null);

  -- 5. Repetir la misma lectura no cambia nada
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000), pg_temp.it('zzB', 500, 'PAID', false, pB), pg_temp.it('zzC', 300, 'UNPAID', true)), true, 'script');
  insert into _r (caso, ok, detalle) values ('5 segunda lectura igual: 0 cambios',
    (r->>'nuevos')::int = 0 and (r->>'cambiados')::int = 0 and (r->>'pagos')::int = 0 and (r->>'anulados')::int = 0, r::text);

  -- 6. Clasificar A en la app y pagarlo; Fudo después dice pagado: no se duplica
  select id into a from gastos where local = L and fudo_id = 'zzA';
  perform gastos_guardar(a, '2026-10-10', L, 'PERSONAL', 'PERSONAL', null, 1000, 'Cta. Cte.', 'clasificado en la app', null, '2026-12-15');
  perform gastos_registrar_pago(a, '2026-10-20', 'Transferencia', 'Cordoba');
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID', false, '[{"id":"zzp2","fecha":"2026-10-21","monto":1000,"forma":"Efectivo"}]', '2026-12-01'),
                                                pg_temp.it('zzB', 500, 'PAID', false, pB)), true, 'script');
  select * into g from v_gastos where id = a;
  insert into _r (caso, ok, detalle) values ('6 pagado en la app: Fudo no agrega otro pago',
    g.pagos = 1 and g.pagado = 1000 and g.estado = 'Pagado', g.pagos || ' pagos / ' || g.pagado);
  insert into _r (caso, ok, detalle) values ('7 no pisa la clasificación, observaciones ni vencimiento de la app',
    g.rubro = 'PERSONAL' and g.observaciones = 'clasificado en la app' and g.fecha_vencimiento = '2026-12-15', g.rubro || ' / ' || g.fecha_vencimiento);

  -- 8. Fudo sube el monto de B: queda en parte pagado
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID'), pg_temp.it('zzB', 600, 'PAID', false, pB)), true, 'script');
  select * into g from v_gastos where local = L and fudo_id = 'zzB';
  insert into _r (caso, ok, detalle) values ('8 Fudo cambia el monto: se actualiza y queda Parcial',
    (r->>'cambiados')::int >= 1 and g.monto = 600 and g.estado = 'Parcial', g.monto || ' ' || g.estado);

  -- 9. B cancelado en Fudo, sin pagos de la app: Anulado
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID'), pg_temp.it('zzB', 600, 'PAID', true, pB)), true, 'script');
  select * into g from v_gastos where local = L and fudo_id = 'zzB';
  insert into _r (caso, ok, detalle) values ('9 cancelado sin pagos de la app: Anulado', g.estado = 'Anulado' and (r->>'anulados')::int = 1, g.estado);

  -- 10. B se descancela: vuelve
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID'), pg_temp.it('zzB', 600, 'PAID', false, pB)), true, 'script');
  select * into g from v_gastos where local = L and fudo_id = 'zzB';
  insert into _r (caso, ok, detalle) values ('10 descancelado en Fudo: vuelve a contar', g.estado = 'Parcial', g.estado);

  -- 11. A cancelado en Fudo, pero pagado en la app: no se anula, queda para revisar
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID', true), pg_temp.it('zzB', 600, 'PAID', false, pB)), true, 'script');
  select * into g from v_gastos where id = a;
  insert into _r (caso, ok, detalle) values ('11 cancelado con pagos de la app: revisar, no anulado',
    g.estado = 'Pagado' and g.fudo_revisar and (r->>'revisar')::int = 1, g.estado || ' revisar=' || g.fudo_revisar);

  -- 12. Lo que deja de figurar: con lectura completa se anula; incompleta, no se toca
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzD', 50)), false, 'script');
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID', true)), false, 'script');
  select * into g from v_gastos where local = L and fudo_id = 'zzD';
  insert into _r (caso, ok, detalle) values ('12 lectura incompleta: lo que no vino no se toca', g.estado = 'Pendiente de pago', g.estado);
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzA', 1000, 'PAID', true)), true, 'script');
  select * into g from v_gastos where local = L and fudo_id = 'zzD';
  insert into _r (caso, ok, detalle) values ('13 lectura completa: lo que no figura se anula', g.estado = 'Anulado' and g.fudo_estado = 'NO_FIGURA', g.estado);

  -- 14. Candados de la app sobre un gasto de Fudo
  e := pg_temp.err(format('select gastos_guardar(%L, %L, %L, null, null, null, 1, %L)', a, '2026-10-10', L, 'x'));
  insert into _r (caso, ok, detalle) values ('14 no se cambia el monto de un gasto de Fudo', e like 'Este gasto viene de Fudo%', e);

  -- 15. Vencimiento de Fudo entra si la app no tiene
  r := gastos_fudo_aplicar(L, jsonb_build_array(pg_temp.it('zzE', 80, 'UNPAID', false, '[]', '2026-12-01')), false, 'script');
  insert into _r (caso, ok, detalle) values ('15 vencimiento de Fudo en un gasto nuevo',
    (select fecha_vencimiento from gastos where local = L and fudo_id = 'zzE') = '2026-12-01', null);

  -- 16. Estado de la sincronización
  insert into _r (caso, ok, detalle) values ('16 gastos_fudo_estado tiene el último OK de la sucursal',
    exists (select 1 from gastos_fudo_estado() where local = L and ultimo_ok is not null and ultimo_error is null), null);

  -- 17. Un local sin Fudo
  e := pg_temp.err($q$select gastos_fudo_aplicar('YA! FABRICA', '[]'::jsonb)$q$);
  insert into _r (caso, ok, detalle) values ('17 local sin Fudo rechazado', e like 'El local YA! FABRICA no tiene Fudo%', e);

  -- 18. Error registrado
  perform gastos_fudo_registrar_error(L, 'script', 'Fudo auth failed: 401');
  insert into _r (caso, ok, detalle) values ('18 el error queda como último intento',
    exists (select 1 from gastos_fudo_estado() where local = L and ultimo_error like 'Fudo auth%' and ultimo_ok is not null), null);
end $$;

-- 19. Otro rol no sincroniza
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
do $$
declare e text;
begin
  e := pg_temp.err($q$select gastos_fudo_aplicar('YA! CORDOBA', '[]'::jsonb)$q$);
  insert into _r (caso, ok, detalle) values ('19 no admin: rechazado', e like 'Solo un administrador%', e);
end $$;

-- 20. El cron (service role) sí
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare r jsonb;
begin
  r := gastos_fudo_aplicar('YA! CORDOBA', jsonb_build_array(jsonb_build_object('fudo_id', 'zzF', 'fecha', '2026-10-01', 'monto', 10, 'estado', 'UNPAID', 'pagos', '[]'::jsonb)), false, 'cron');
  insert into _r (caso, ok, detalle) values ('20 service role (cron): sincroniza', (r->>'nuevos')::int = 1, r::text);
end $$;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
