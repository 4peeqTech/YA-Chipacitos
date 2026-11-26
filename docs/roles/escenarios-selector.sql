-- Escenarios del selector de sucursal (épica roles y permisos, T4).
--
-- Arma un supervisor de locales con dos sucursales y prueba pedidos_crear como
-- él, como una cuenta de local y como Admin. Todo dentro de begin … rollback.
--
-- Uso: ESCENARIOS=docs/roles/escenarios-selector.sql scripts/permisos-editores-prueba.sh [migración]

begin;

create temp table _caso (n serial, caso text, ok boolean, detalle text) on commit drop;
grant insert, select on _caso to authenticated;
grant usage on sequence _caso_n_seq to authenticated;

do $$
declare
  v_admin uuid := (select id from profiles where rol = 'admin' and estado = 'activo' order by nombre limit 1);
  v_super uuid := (select id from profiles where rol = 'supervisor_locales' and estado = 'activo' order by nombre limit 1);
  v_directivo uuid := (select id from profiles where rol = 'gerencia_directiva' and estado = 'activo' order by nombre limit 1);
  v_suc_a uuid;
  v_suc_b uuid;
  v_suc_ajena uuid;
  v_cuenta_a uuid;
  v_cuenta_b uuid;
  v_items jsonb;
  v_res jsonb;
  v_local uuid;
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

  select id, cuenta_local_id into v_suc_a, v_cuenta_a from locales_config where activo and cuenta_local_id is not null order by orden limit 1;
  select id, cuenta_local_id into v_suc_b, v_cuenta_b from locales_config where activo and cuenta_local_id is not null order by orden offset 1 limit 1;
  select id into v_suc_ajena from locales_config where activo and cuenta_local_id is not null order by orden offset 2 limit 1;
  v_items := jsonb_build_array(jsonb_build_object('producto_id',
    (select p.id from productos p
     left join catalogo_categorias c on c.destino = p.destino and c.nombre = p.categoria
     where p.destino = 'fabrica' and p.activo and coalesce(c.activa, true) order by p.nombre limit 1),
    'cantidad', 1));

  -- Supervisor de locales con Locales y dos sucursales.
  insert into rol_areas (rol_key, area) values ('supervisor_locales', 'locales') on conflict do nothing;
  delete from persona_sucursales where persona_id = v_super;
  insert into persona_sucursales (persona_id, local_config_id) values (v_super, v_suc_a), (v_super, v_suc_b);

  -- 1. Lee solo sus sucursales de locales_config.
  perform pg_temp.como(v_super);
  perform pg_temp.caso('supervisor ve solo sus dos sucursales',
    (select array_agg(id order by id) from locales_config) = (select array_agg(x order by x) from unnest(array[v_suc_a, v_suc_b]) x));

  -- 2. Crea un pedido en cada sucursal, a nombre de la cuenta de cada una.
  v_res := pedidos_crear(v_items, 'QA T4', v_suc_a);
  perform pg_temp.yo();
  select local_id into v_local from pedidos where id = (v_res->0->>'id')::uuid;
  perform pg_temp.caso('pedido en la sucursal A sale a nombre de su cuenta', v_local = v_cuenta_a, v_res::text);
  perform pg_temp.caso('el evento queda a nombre de quien lo hizo',
    exists (select 1 from pedido_eventos where pedido_id = (v_res->0->>'id')::uuid and autor_id = v_super));
  perform pg_temp.como(v_super);
  v_res := pedidos_crear(v_items, 'QA T4', v_suc_b);
  perform pg_temp.yo();
  select local_id into v_local from pedidos where id = (v_res->0->>'id')::uuid;
  perform pg_temp.caso('pedido en la sucursal B sale a nombre de su cuenta', v_local = v_cuenta_b);

  -- 3. Una sucursal ajena, no (forzando el id).
  perform pg_temp.como(v_super);
  begin
    perform pedidos_crear(v_items, 'QA T4', v_suc_ajena);
    perform pg_temp.caso('supervisor no crea en una sucursal ajena', false);
  exception when others then perform pg_temp.caso('supervisor no crea en una sucursal ajena', sqlerrm = 'No autorizado', sqlerrm); end;
  -- Sin sucursal, el supervisor no es cuenta de local: no.
  begin
    perform pedidos_crear(v_items, 'QA T4', null);
    perform pg_temp.caso('supervisor sin sucursal no crea', false);
  exception when others then perform pg_temp.caso('supervisor sin sucursal no crea', sqlerrm = 'No autorizado', sqlerrm); end;

  -- 4. La cuenta de local: sin sucursal, como antes; con otra sucursal, no.
  perform pg_temp.como(v_cuenta_a);
  v_res := pedidos_crear(v_items, 'QA T4', null);
  perform pg_temp.yo();
  select local_id into v_local from pedidos where id = (v_res->0->>'id')::uuid;
  perform pg_temp.caso('cuenta de local sin sucursal: a su nombre (como antes)', v_local = v_cuenta_a);
  perform pg_temp.como(v_cuenta_a);
  v_res := pedidos_crear(v_items, 'QA T4', v_suc_a);
  perform pg_temp.yo();
  select local_id into v_local from pedidos where id = (v_res->0->>'id')::uuid;
  perform pg_temp.caso('cuenta de local con su sucursal: a su nombre', v_local = v_cuenta_a);
  perform pg_temp.como(v_cuenta_a);
  begin
    perform pedidos_crear(v_items, 'QA T4', v_suc_b);
    perform pg_temp.caso('cuenta de local no crea para otra sucursal', false);
  exception when others then perform pg_temp.caso('cuenta de local no crea para otra sucursal', sqlerrm = 'No autorizado', sqlerrm); end;

  -- 5. Admin, en cualquier sucursal.
  perform pg_temp.como(v_admin);
  v_res := pedidos_crear(v_items, 'QA T4', v_suc_ajena);
  perform pg_temp.yo();
  select local_id into v_local from pedidos where id = (v_res->0->>'id')::uuid;
  perform pg_temp.caso('Admin crea en cualquier sucursal',
    v_local = (select cuenta_local_id from locales_config where id = v_suc_ajena));

  -- 6. Sin el área Locales, no (aunque tenga sucursal cargada).
  insert into persona_sucursales (persona_id, local_config_id) values (v_directivo, v_suc_a) on conflict do nothing;
  perform pg_temp.como(v_directivo);
  begin
    perform pedidos_crear(v_items, 'QA T4', v_suc_a);
    perform pg_temp.caso('sin el área Locales no crea', false);
  exception when others then perform pg_temp.caso('sin el área Locales no crea', sqlerrm = 'No autorizado', sqlerrm); end;

  -- 7. El supervisor ve los pedidos de sus sucursales y no los de otra.
  perform pg_temp.como(v_super);
  perform pg_temp.caso('supervisor ve pedidos de sus sucursales',
    exists (select 1 from pedidos where local_id = v_cuenta_a) and exists (select 1 from pedidos where local_id = v_cuenta_b));
  perform pg_temp.caso('supervisor no ve pedidos de una sucursal ajena',
    not exists (select 1 from pedidos where local_id = (select cuenta_local_id from locales_config where id = v_suc_ajena)));
  perform pg_temp.yo();
end $$;

reset role;
select n, caso, ok, detalle from _caso order by n;

rollback;
