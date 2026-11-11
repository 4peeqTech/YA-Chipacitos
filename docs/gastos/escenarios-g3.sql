-- Escenarios de Gastos G3: equivalencias de Fudo (lo que dice Fudo → cuenta).
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-g3.sql
--
-- Antes de aplicar la migración: "begin;" + 20261111190000_gastos_fudo_equivalencias.sql +
-- este archivo sin su "begin;". Usa los gastos de Fudo de La Unidad que hay en dev
-- ("Cubre franco" viene como categoría y "Cubre Franco" como proveedor).
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

-- Arranque limpio: los de "cubre franco" sin cuenta.
update gastos set cuenta = null where origen = 'fudo' and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco';
delete from gastos_fudo_equivalencias;

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare
  total int; n int; manual uuid; g record; e text; x record;
begin
  select count(*) into total from gastos where origen = 'fudo' and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco';
  if total < 2 then
    insert into _r (caso, ok, detalle) values ('0 hace falta "cubre franco" en dev', false, total::text);
    return;
  end if;

  -- 1. Uno se clasifica a mano antes de la equivalencia
  select * into g from gastos where origen = 'fudo' and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco' limit 1;
  manual := g.id;
  perform gastos_guardar(g.id, g.fecha, g.local, '5.2.01.01', g.proveedor_id, g.monto, g.forma_pago, g.observaciones, null, g.fecha_vencimiento);
  select * into g from gastos where id = manual;
  insert into _r (caso, ok, detalle) values ('1 clasificado a mano: no es automática', g.cuenta = '5.2.01.01' and not g.cuenta_automatica, g.cuenta);

  -- 2. La equivalencia junta categoría y proveedor ("Cubre franco" / "Cubre Franco") y no pisa el manual
  n := gastos_fudo_equivalencia_guardar('Cubre franco', '5.2.02.01');
  insert into _r (caso, ok, detalle) values ('2 equivalencia: clasifica todos menos el manual', n = total - 1, n || ' de ' || total);
  select count(*) into n from gastos where origen = 'fudo' and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco'
    and cuenta = '5.2.02.01' and cuenta_automatica and categoria = 'Personal contratado y eventual';
  insert into _r (caso, ok, detalle) values ('3 quedan automáticos, con la categoría del plan', n = total - 1, n::text);
  select * into g from gastos where id = manual;
  insert into _r (caso, ok, detalle) values ('4 el manual sigue como estaba', g.cuenta = '5.2.01.01' and not g.cuenta_automatica, g.cuenta);

  -- 5. Cambiar la equivalencia mueve los automáticos
  n := gastos_fudo_equivalencia_guardar('CUBRE FRANCO', '5.4.03.01');
  select count(*) into n from gastos where origen = 'fudo' and cuenta = '5.4.03.01' and cuenta_automatica
    and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco';
  insert into _r (caso, ok, detalle) values ('5 cambiar la equivalencia (en mayúsculas): mueve los automáticos', n = total - 1, n::text);

  -- 6. Editar otro dato de uno automático no lo vuelve manual
  select * into g from gastos where origen = 'fudo' and cuenta_automatica limit 1;
  perform gastos_guardar(g.id, g.fecha, g.local, g.cuenta, g.proveedor_id, g.monto, g.forma_pago, 'nota g3', null, g.fecha_vencimiento);
  select * into x from gastos where id = g.id;
  insert into _r (caso, ok, detalle) values ('6 editar la nota de uno automático: sigue automático', x.cuenta_automatica and x.observaciones = 'nota g3', x.cuenta);

  -- 7. Lo que dice Fudo, agrupado
  select * into x from gastos_fudo_etiquetas() t where t.etiqueta = 'cubre franco';
  insert into _r (caso, ok, detalle) values ('7 etiquetas: cubre franco con su cuenta y 1 a mano',
    x.cuenta = '5.4.03.01' and x.gastos = total and x.a_mano = 1 and x.sin_clasificar = 0, x.texto || ' ' || x.gastos || ' ' || x.a_mano);

  -- 8. Sacar la equivalencia: los automáticos vuelven a "sin clasificar"; el manual no
  n := gastos_fudo_equivalencia_guardar('Cubre franco', null);
  select count(*) into n from gastos where origen = 'fudo' and cuenta is null
    and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = 'cubre franco';
  select * into g from gastos where id = manual;
  insert into _r (caso, ok, detalle) values ('8 sin equivalencia: vuelven a sin clasificar, el manual queda',
    n = total - 1 and g.cuenta = '5.2.01.01', n::text);

  -- 9-10. Cuentas que no van
  e := pg_temp.err($q$select gastos_fudo_equivalencia_guardar('Cubre franco', '1.1.01.01')$q$);
  insert into _r (caso, ok, detalle) values ('9 equivalencia a una cuenta que no se usa: no', e like '%no se usa en Gastos%', e);
  e := pg_temp.err($q$select gastos_fudo_equivalencia_guardar('  ', '5.2.02.01')$q$);
  insert into _r (caso, ok, detalle) values ('10 sin lo que dice Fudo: no', e like 'Falta%', e);

  perform gastos_fudo_equivalencia_guardar('Cubre franco', '5.2.02.01');
end $$;

-- 11-12. La sincronización: un gasto nuevo de Fudo toma la equivalencia; si Fudo le cambia la categoría, la pierde
reset role;
do $$
declare x uuid; g record;
begin
  insert into gastos (fecha, local, monto, forma_pago, estado, origen, fudo_id, fudo_categoria, fudo_proveedor)
  values ('2030-02-01', 'YA! UNIDAD', 100, 'Efectivo', 'Pendiente de pago', 'fudo', 'zz-g3-1', ' Cubre  franco', null)
  returning id into x;
  select * into g from gastos where id = x;
  insert into _r (caso, ok, detalle) values ('11 nuevo de Fudo (" Cubre  franco"): se clasifica solo',
    g.cuenta = '5.2.02.01' and g.cuenta_automatica, coalesce(g.cuenta, 'null'));
  update gastos set fudo_categoria = 'Otra cosa' where id = x;
  select * into g from gastos where id = x;
  insert into _r (caso, ok, detalle) values ('12 Fudo le cambia la categoría: vuelve a sin clasificar',
    g.cuenta is null and not g.cuenta_automatica, coalesce(g.cuenta, 'null'));
end $$;

-- 13. Un usuario de local no guarda equivalencias
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
insert into _r (caso, ok, detalle)
select '13 usuario de local: no puede', e like 'Solo un administrador%', e
from (select pg_temp.err($q$select gastos_fudo_equivalencia_guardar('Logistica', '5.4.03.01')$q$) e) s;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
