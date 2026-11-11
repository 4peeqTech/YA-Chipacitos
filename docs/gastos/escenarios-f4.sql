-- Escenarios de Gastos F4: gastos que se repiten.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-f4.sql
--
-- Antes de aplicar la migración: "begin;" + 20261105150000_gastos_f4_recurrentes.sql +
-- este archivo sin su "begin;". Las fechas van fijas (p_hasta) para no depender de hoy.
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

-- Para que solo cuenten las plantillas de la prueba.
update gastos_recurrentes set activo = false;

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  alq uuid; luz uuid; vie uuid; fin uuid; r jsonb; e text; x text; g record; v_id uuid;
begin
  -- 1. Alquiler fijo, día 10, vence a los 5 días, desde agosto
  alq := gastos_recurrente_guardar(null, 'zz Alquiler Goya', 'YA! GOYA', 'SERVICIOS Y ESTRUCTURA', 'ALQUILER', null, 100000, false,
                                   'Transferencia', 10, 5, '2026-08-01', null, null);
  r := gastos_generar_recurrentes('2026-11-04');
  select string_agg(to_char(fecha, 'MM-DD') || '>' || to_char(fecha_vencimiento, 'MM-DD'), ',' order by fecha) into x from gastos where recurrente_id = alq;
  insert into _r (caso, ok, detalle) values ('1 alquiler: agosto, septiembre y octubre (noviembre todavía no llegó al 10)',
    x = '08-10>08-15,09-10>09-15,10-10>10-15' and (r->>'generados')::int = 3, x);
  select * into g from gastos where recurrente_id = alq and periodo = '2026-10';
  insert into _r (caso, ok, detalle) values ('2 nace pendiente, de origen recurrente, con el nombre',
    g.estado = 'Pendiente de pago' and g.origen = 'recurrente' and g.observaciones like 'zz Alquiler Goya%' and not g.a_confirmar, g.estado);

  -- 3. Generar otra vez no duplica
  r := gastos_generar_recurrentes('2026-11-04');
  insert into _r (caso, ok, detalle) values ('3 generar dos veces: 0 nuevos', (r->>'generados')::int = 0, r::text);

  -- 4. Llega el 10 de noviembre
  r := gastos_generar_recurrentes('2026-11-10');
  insert into _r (caso, ok, detalle) values ('4 el día 10 se genera noviembre', (r->>'generados')::int = 1, r::text);

  -- 5. Luz variable el 31: febrero cae el 28, y nace "a confirmar"
  luz := gastos_recurrente_guardar(null, 'zz Luz Córdoba', 'YA! CORDOBA', 'SERVICIOS Y ESTRUCTURA', 'ELECTRICIDAD', null, 5000, true,
                                   'Debito automatico', 31, null, '2026-01-01', null, null);
  perform gastos_generar_recurrentes('2026-03-31');
  select string_agg(to_char(fecha, 'MM-DD'), ',' order by fecha) into x from gastos where recurrente_id = luz;
  insert into _r (caso, ok, detalle) values ('5 día 31: enero 31, febrero 28, marzo 31', x = '01-31,02-28,03-31', x);
  insert into _r (caso, ok, detalle) values ('6 monto variable: nacen a confirmar',
    (select bool_and(a_confirmar) from gastos where recurrente_id = luz), null);

  -- 7. Se corrige marzo a 6200: abril nace con 6200, a confirmar
  select id into v_id from gastos where recurrente_id = luz and periodo = '2026-03';
  perform gastos_guardar(v_id, '2026-03-31', 'YA! CORDOBA', 'SERVICIOS Y ESTRUCTURA', 'ELECTRICIDAD', null, 6200, 'Debito automatico', null);
  perform gastos_generar_recurrentes('2026-04-30');
  select * into g from gastos where recurrente_id = luz and periodo = '2026-04';
  insert into _r (caso, ok, detalle) values ('7 corregido el último: el próximo nace con ese monto, a confirmar',
    g.monto = 6200 and g.a_confirmar and not (select a_confirmar from gastos where id = v_id), g.monto::text);

  -- 8. Tope de 12 meses hacia atrás
  vie := gastos_recurrente_guardar(null, 'zz Viejo', 'YA! FABRICA', 'PERSONAL', 'PERSONAL', null, 10, false, 'Efectivo', 1, null, '2024-01-01', null, null);
  perform gastos_generar_recurrentes('2026-11-04');
  insert into _r (caso, ok, detalle) values ('8 desde 2024: solo los últimos 12 meses',
    (select count(*) from gastos where recurrente_id = vie) = 12, (select min(periodo) || '..' || max(periodo) from gastos where recurrente_id = vie));

  -- 9. Con fin: no sigue después
  fin := gastos_recurrente_guardar(null, 'zz Con fin', 'YA! FABRICA', 'PERSONAL', 'PERSONAL', null, 10, false, 'Efectivo', 20, null, '2026-08-01', '2026-09-15', null);
  perform gastos_generar_recurrentes('2026-11-04');
  insert into _r (caso, ok, detalle) values ('9 con fecha de fin: solo agosto',
    (select string_agg(periodo, ',') from gastos where recurrente_id = fin) = '2026-08', null);

  -- 10. Pausar y reactivar
  perform gastos_recurrente_activar(alq, false);
  r := gastos_generar_recurrentes('2026-12-31');
  insert into _r (caso, ok, detalle) values ('10 pausado: no genera diciembre',
    not exists (select 1 from gastos where recurrente_id = alq and periodo = '2026-12'), r::text);
  perform gastos_recurrente_activar(alq, true);
  perform gastos_generar_recurrentes('2026-12-31');
  insert into _r (caso, ok, detalle) values ('11 reactivado: genera lo que faltaba',
    exists (select 1 from gastos where recurrente_id = alq and periodo = '2026-12'), null);

  -- 12. Eliminar un gasto generado lo anula y no vuelve
  select id into v_id from gastos where recurrente_id = alq and periodo = '2026-12';
  perform gastos_eliminar(v_id);
  perform gastos_generar_recurrentes('2026-12-31');
  insert into _r (caso, ok, detalle) values ('12 eliminar uno generado: queda Anulado y no se regenera',
    (select estado from gastos where id = v_id) = 'Anulado' and (select count(*) from gastos where recurrente_id = alq and periodo = '2026-12') = 1, null);

  -- 13-14. Eliminar la plantilla
  e := pg_temp.err(format('select gastos_recurrente_eliminar(%L)', alq));
  insert into _r (caso, ok, detalle) values ('13 con gastos generados no se elimina', e like 'Ya generó gastos%', e);
  v_id := gastos_recurrente_guardar(null, 'zz Nunca', 'YA! FABRICA', 'PERSONAL', 'PERSONAL', null, 10, false, 'Efectivo', 28, null, '2027-01-01', null, null);
  perform gastos_recurrente_eliminar(v_id);
  insert into _r (caso, ok, detalle) values ('14 sin generados se elimina', not exists (select 1 from gastos_recurrentes where id = v_id), null);

  -- 15. Validaciones
  e := pg_temp.err($q$select gastos_recurrente_guardar(null, 'x', 'YA! FABRICA', 'PERSONAL', 'PERSONAL', null, 10, false, 'Efectivo', 32, null, '2026-01-01')$q$);
  insert into _r (caso, ok, detalle) values ('15 día 32 rechazado', e like 'El día del mes va del 1 al 31%', e);
  e := pg_temp.err($q$select gastos_recurrente_guardar(null, 'x', 'YA! FABRICA', 'PERSONAL', 'PERSONAL', null, 10, false, 'Efectivo', 5, null, '2026-05-01', '2026-01-01')$q$);
  insert into _r (caso, ok, detalle) values ('16 fin antes del inicio rechazado', e like 'La fecha de fin%', e);

  -- 17. Editar la plantilla no toca lo generado
  perform gastos_recurrente_guardar(alq, 'zz Alquiler Goya', 'YA! GOYA', 'SERVICIOS Y ESTRUCTURA', 'ALQUILER', null, 120000, false, 'Transferencia', 10, 5, '2026-08-01', null, null);
  insert into _r (caso, ok, detalle) values ('17 editar la plantilla no cambia lo ya generado',
    (select monto from gastos where recurrente_id = alq and periodo = '2026-08') = 100000, null);

  -- 18. La vista
  select * into g from v_gastos_recurrentes where id = luz;
  -- Enero a diciembre (las corridas hasta el 31-12 también generaron mayo a diciembre, con el monto corregido).
  insert into _r (caso, ok, detalle) values ('18 vista: generados y último monto', g.generados = 12 and g.ultimo_monto = 6200, g.generados || ' / ' || g.ultimo_monto);
end $$;

-- 19. Otro rol no genera
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
do $$
declare e text;
begin
  e := pg_temp.err('select gastos_generar_recurrentes()');
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
  r := gastos_generar_recurrentes('2027-01-31');
  insert into _r (caso, ok, detalle) values ('20 service role (cron): genera', (r->>'generados')::int > 0, r::text);
end $$;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
