-- Escenarios de acceso (épica roles y permisos, T2).
--
-- Por cada persona activa, entra como ella (rol authenticated + su JWT) y anota
-- qué devuelven los helpers, cuántas filas ve de cada tabla y si puede escribir
-- en algunas tablas de administración. Todo dentro de begin … rollback.
--
-- Uso: correrlo antes y después de una migración de permisos y comparar el JSON.
--   supabase db query --remote=<ref> -f docs/roles/escenarios.sql --yes
-- Para "después" sin aplicar: anteponer la migración dentro del mismo archivo
-- (lo hace scripts/permisos-escenarios.sh).

begin;

create temp table _escenario (persona text, resultado jsonb) on commit drop;
grant insert, select on _escenario to authenticated;

do $$
declare
  v_persona record;
  v_res jsonb;
  v_tabla text;
  v_n bigint;
  v_err text;
  v_tablas text[] := array[
    'pedidos', 'pedido_items', 'ventas_posberry', 'conciliaciones', 'productos', 'gastos', 'gastos_pagos',
    'cajas', 'formas_pago', 'locales_config', 'profiles', 'roles', 'config', 'fudo_ventas', 'fudo_pagos',
    'compras_facturas', 'compras_factura_items', 'compras_pedidos', 'compras_items', 'fabrica_devoluciones',
    'nomenclador_items', 'tareas'
  ];
begin
  for v_persona in
    select id, nombre, rol from profiles where estado = 'activo' and rol is not null order by rol, nombre
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_persona.id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_persona.id::text, true);
    execute 'set local role authenticated';

    v_res := jsonb_build_object(
      'es_admin', es_admin(),
      'compras', tiene_acceso_compras(),
      'fabrica', tiene_acceso_fabrica(),
      'nomenclador', tiene_acceso_nomenclador(),
      'conteos', tiene_lectura_conteos(),
      'supervisar', puede_supervisar(),
      'fabrica_dia_viejo', fabrica_puede_editar_fecha(current_date - 10),
      'destino_deposito', puede_operar_destino('deposito'),
      'destino_fabrica', puede_operar_destino('fabrica')
    );

    foreach v_tabla in array v_tablas loop
      begin
        execute format('select count(*) from public.%I', v_tabla) into v_n;
      exception when others then
        v_n := -1;
      end;
      v_res := v_res || jsonb_build_object('ve_' || v_tabla, v_n);
    end loop;

    -- Escrituras: se intentan y se deshacen (el raise final revierte el bloque).
    begin
      insert into cajas (nombre) values ('__escenario__');
      raise exception 'permitido';
    exception when others then
      v_res := v_res || jsonb_build_object('escribe_cajas', sqlerrm = 'permitido');
    end;
    begin
      update locales_config set orden = orden where true;
      get diagnostics v_n = row_count;
      v_res := v_res || jsonb_build_object('actualiza_locales_config', v_n > 0);
    exception when others then
      v_res := v_res || jsonb_build_object('actualiza_locales_config', false);
    end;
    begin
      update roles set nombre = nombre where true;
      get diagnostics v_n = row_count;
      v_res := v_res || jsonb_build_object('actualiza_roles', v_n > 0);
    exception when others then
      v_res := v_res || jsonb_build_object('actualiza_roles', false);
    end;
    begin
      perform compras_tablero_resumen();
      v_res := v_res || jsonb_build_object('tablero_compras', 'ok');
    exception when others then
      v_res := v_res || jsonb_build_object('tablero_compras', 'rechaza');
    end;

    insert into _escenario values (v_persona.nombre || ' (' || v_persona.rol || ')', v_res);
    execute 'reset role';
  end loop;
end $$;

select json_object_agg(persona, resultado order by persona) as escenarios from _escenario;

rollback;
