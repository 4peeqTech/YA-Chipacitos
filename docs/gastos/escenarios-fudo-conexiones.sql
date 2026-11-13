-- Escenarios de las conexiones de Fudo (claves en Vault).
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --remote=fafckqysyvtlslfnpzrh -f docs/gastos/escenarios-fudo-conexiones.sql
--
-- Antes de aplicar la migración: "begin;" + 20261113140000_fudo_conexiones.sql +
-- este archivo sin su "begin;". Usa claves inventadas ('zz-...'): no habla con Fudo.
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

select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');

do $$
declare e text; n int; r record; v_local text;
begin
  -- 1-2. Agregar un local
  v_local := locales_agregar('  ya!  zz prueba  ', 'Zz Caja');
  select * into r from locales_config where sucursal = v_local;
  insert into _r (caso, ok, detalle) values ('1 agregar local: en mayúsculas, sin Fudo y con su caja',
    v_local = 'YA! ZZ PRUEBA' and not r.tiene_fudo and r.caja_default = 'Zz Caja'
    and exists (select 1 from cajas where nombre = 'Zz Caja'), v_local);
  e := pg_temp.err($q$select locales_agregar('ya! zz prueba', 'Otra')$q$);
  insert into _r (caso, ok, detalle) values ('2 agregar el mismo local otra vez: no', e like 'Ya hay un local%', e);
  e := pg_temp.err($q$select locales_agregar('YA! ZZ OTRO', '  ')$q$);
  insert into _r (caso, ok, detalle) values ('3 agregar sin caja: no', e like 'Poné la caja%', e);

  -- 4-6. Guardar claves: quedan cifradas y el local pasa a usar Fudo
  perform fudo_conexion_guardar('YA! ZZ PRUEBA', 'zz-key-1', 'zz-secret-1', true, null);
  select * into r from fudo_conexiones where local = 'YA! ZZ PRUEBA';
  insert into _r (caso, ok, detalle) values ('4 guardar: queda el key y el secret en Vault',
    r.api_key = 'zz-key-1' and r.secret_id is not null and r.probada_ok, r.api_key);
  insert into _r (caso, ok, detalle) values ('5 el local pasa a usar Fudo',
    (select tiene_fudo from locales_config where sucursal = 'YA! ZZ PRUEBA'), null);
  e := pg_temp.err($q$select fudo_conexion_guardar('YA! ZZ PRUEBA', 'zz-key-1', '  ')$q$);
  insert into _r (caso, ok, detalle) values ('6 guardar sin secret: no', e like 'Cargá el API Key%', e);

  -- 7. Un admin ve la conexión pero no el secret
  e := pg_temp.err($q$select * from fudo_conexion_leer('YA! ZZ PRUEBA')$q$);
  insert into _r (caso, ok, detalle) values ('7 un admin no puede leer el secret', e like '%permission denied%', e);
  e := pg_temp.err($q$select decrypted_secret from vault.decrypted_secrets limit 1$q$);
  insert into _r (caso, ok, detalle) values ('8 un admin no puede leer Vault', e is not null, e);

  -- 9. Estado para la pantalla
  select * into r from fudo_conexiones_estado() where sucursal = 'YA! ZZ PRUEBA';
  insert into _r (caso, ok, detalle) values ('9 estado: con claves, termina en "ey-1", sin error',
    r.con_claves and r.api_key_fin = 'ey-1' and r.ultimo_error is null and r.gastos = 0, r.api_key_fin);
end $$;

-- 10-11. El servidor (service role) sí lee el par; reemplazar pisa el secret
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare r record; n int;
begin
  select * into r from fudo_conexion_leer('YA! ZZ PRUEBA');
  insert into _r (caso, ok, detalle) values ('10 el servidor lee el par', r.api_key = 'zz-key-1' and r.api_secret = 'zz-secret-1', r.api_key);
  perform fudo_conexion_guardar('YA! ZZ PRUEBA', 'zz-key-2', 'zz-secret-2');
  select * into r from fudo_conexion_leer('YA! ZZ PRUEBA');
  select count(*) into n from fudo_conexiones where local = 'YA! ZZ PRUEBA';
  insert into _r (caso, ok, detalle) values ('11 reemplazar: un solo registro, key y secret nuevos',
    n = 1 and r.api_key = 'zz-key-2' and r.api_secret = 'zz-secret-2', r.api_key);
end $$;

-- 12-13. Desconectar: se borran las claves (también de Vault) y deja de usar Fudo
reset role;
select pg_temp.como('37794588-426a-4699-85df-889b6b828e07');
do $$
declare v_id uuid;
begin
  select secret_id into v_id from fudo_conexiones where local = 'YA! ZZ PRUEBA';
  perform fudo_conexion_desconectar('YA! ZZ PRUEBA');
  insert into _r (caso, ok, detalle) values ('12 desconectar: sin claves y sin Fudo',
    not exists (select 1 from fudo_conexiones where local = 'YA! ZZ PRUEBA')
    and not (select tiene_fudo from locales_config where sucursal = 'YA! ZZ PRUEBA'), null);
  reset role;
  insert into _r (caso, ok, detalle) values ('13 el secret se borró de Vault',
    not exists (select 1 from vault.secrets where id = v_id), null);
end $$;

-- 14-15. Un usuario de local no puede nada de esto
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
insert into _r (caso, ok, detalle)
select '14 usuario de local: no guarda claves', e like 'Solo un administrador%', e
from (select pg_temp.err($q$select fudo_conexion_guardar('YA! ZZ PRUEBA', 'a', 'b')$q$) e) s;
insert into _r (caso, ok, detalle)
select '15 usuario de local: no agrega locales', e like 'Solo un administrador%', e
from (select pg_temp.err($q$select locales_agregar('YA! ZZ X', 'X')$q$) e) s;
insert into _r (caso, ok, detalle)
select '16 usuario de local: no ve el estado', count(*) = 0, count(*)::text from fudo_conexiones_estado();

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
