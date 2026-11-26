-- Escenarios de "Ver como" (épica roles y permisos, T7). Todo dentro de begin … rollback.
-- Uso: ESCENARIOS=docs/roles/escenarios-ver-como.sql scripts/permisos-editores-prueba.sh [migración]

begin;

create temp table _caso (n serial, caso text, ok boolean, detalle text) on commit drop;
grant insert, select on _caso to authenticated;
grant usage on sequence _caso_n_seq to authenticated;

do $$
declare
  v_admin uuid := (select id from profiles where rol = 'admin' and estado = 'activo' order by nombre limit 1);
  v_local uuid := (select cuenta_local_id from locales_config where cuenta_local_id is not null and activo order by orden limit 1);
  v_directivo uuid := (select id from profiles where rol = 'gerencia_directiva' and estado = 'activo' order by nombre limit 1);
  v_res jsonb;
  v_lectura text[];
begin
  create or replace function pg_temp.como(p uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p::text, true);
    execute 'set local role authenticated';
  end $f$;
  create or replace function pg_temp.yo() returns void language plpgsql as $f$
  begin
    execute 'reset role';
  end $f$;
  create or replace function pg_temp.caso(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as $f$
    insert into _caso (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle);
  $f$;

  -- 1. Admin ve el acceso de una cuenta de local, igual al de esa cuenta.
  perform pg_temp.como(v_local);
  v_res := mi_acceso();
  perform pg_temp.como(v_admin);
  perform pg_temp.caso('acceso_de(local) = mi_acceso() de esa cuenta', acceso_de(v_local) = v_res, left(v_res::text, 200));
  perform pg_temp.caso('mi_acceso() sigue siendo el propio', (mi_acceso()->>'id')::uuid = v_admin);
  perform pg_temp.caso('acceso_de(local): sin plata de Compras', not (acceso_de(v_local)->'permisos') ? 'compras.ver_plata');

  -- 2. Sin usuarios.gestionar: null.
  perform pg_temp.como(v_directivo);
  perform pg_temp.caso('sin gestionar, acceso_de devuelve null', acceso_de(v_local) is null);
  perform pg_temp.caso('_acceso_json no se puede llamar directo',
    not has_function_privilege('authenticated', 'public._acceso_json(uuid)', 'execute'));

  -- 3. rpc_de_lectura: lecturas sí, escrituras no.
  v_lectura := rpc_de_lectura();
  perform pg_temp.caso('rpc_de_lectura incluye lecturas',
    v_lectura @> array['mi_acceso', 'acceso_de', 'gastos_listar', 'compras_tablero_resumen', 'rpc_de_lectura']);
  perform pg_temp.caso('rpc_de_lectura no incluye escrituras',
    not (v_lectura && array['gastos_guardar', 'pedidos_crear', 'roles_guardar', 'persona_guardar_acceso', 'pedido_cancelar']));
  perform pg_temp.yo();
end $$;

reset role;
select n, caso, ok, detalle from _caso order by n;

rollback;
