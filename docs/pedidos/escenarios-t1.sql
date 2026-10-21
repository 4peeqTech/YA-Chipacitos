-- Escenarios de T1 (pedidos de locales y mayorista): RPC, RLS y corte de versión.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f docs/pedidos/escenarios-t1.sql
--
-- Antes de aplicar la migración se puede probar todo junto: armar un archivo
-- con "begin;", el contenido de 20261020120000_pedidos_locales_urgente.sql y
-- este archivo sin su "begin;".
--
-- Devuelve una fila por caso (ok = true/false). Los roles se simulan con
-- request.jwt.claim.sub + role authenticated. Usuarios de dev:
--   qa-local      93b4b0a1-a7c2-4932-a17e-9be77de9dc60
--   otro local    d9ccc61c-83c9-4c9b-bcf5-b9bdd752d372 (Suc. Goya)
--   qa-mayorista  a6b5f78f-cd70-4235-a735-af51feb63d14
--   qa-deposito   570ef4d4-038a-40c4-845c-6920eb898652
--   qa-admin      37794588-426a-4699-85df-889b6b828e07

begin;

create temp table _r (ts timestamptz default clock_timestamp(), caso text, ok boolean, detalle text);
create temp table _ctx (k text primary key, v uuid);
grant all on _r, _ctx to authenticated;

create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Movimiento de stock terminado de un producto en un pedido, leído sin RLS
-- (la tabla de movimientos no la ven local ni mayorista).
create function pg_temp.mov_stock(p_pedido uuid, p_producto uuid) returns numeric
language sql security definer as $$
  select sum(delta_kg) from fabrica_stock_terminado_mov where pedido_id = p_pedido and producto_id = p_producto
$$;

create function pg_temp.chequear(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as $$
  insert into _r (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle);
$$;

-- Ejecuta p_sql y espera que falle con un mensaje que contenga p_patron.
create function pg_temp.falla(p_caso text, p_sql text, p_patron text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into _r (caso, ok, detalle) values (p_caso, false, 'no falló');
exception when others then
  insert into _r (caso, ok, detalle) values (p_caso, sqlerrm ilike '%' || p_patron || '%', sqlerrm);
end $$;

create function pg_temp.ctx(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;

-- Datos: un producto de fábrica inactivo (se revierte con el rollback).
update productos set activo = false where id = '22dc7bbe-a9b9-4b9e-9bb5-7fdf9e7f9163';
insert into _ctx values
  ('pf',  '6ee790b3-da16-4c3f-9dcb-b6ba90740f70'),  -- fábrica, con presentación (mueve stock)
  ('pf2', '22dc7bbe-a9b9-4b9e-9bb5-7fdf9e7f9163'),  -- fábrica, inactivo
  ('pf3', '6e053d76-27ef-4cfa-a89e-4d951364a715'),  -- fábrica
  ('pd',  'cf55b77b-d575-4ad9-b9ec-155c50ec7a26');  -- depósito

-- ─── Criterio 7: corte de versión (antes de crear pedidos nuevos) ─────────
select pg_temp.chequear('7 · no quedan enviados de más de 3 días',
  (select count(*) = 0 from pedidos where estado = 'enviado' and coalesce(enviado_at, created_at) < now() - interval '3 days'));
select pg_temp.chequear('7 · no quedan pendientes/preparando de más de 14 días',
  (select count(*) = 0 from pedidos where estado in ('pendiente', 'preparando') and created_at < now() - interval '14 days'));
select pg_temp.chequear('7 · cerrados automáticos: recibido, recibido_at = enviado_at y evento',
  (select bool_and(estado = 'recibido' and recibido_at = coalesce(enviado_at, created_at)
     and exists (select 1 from pedido_eventos e where e.pedido_id = p.id and e.tipo = 'cierre_automatico'))
   from pedidos p where cierre_automatico) is not false,
  (select count(*) || ' recibidos automáticos' from pedidos where cierre_automatico));
select pg_temp.chequear('7 · cancelados por el corte tienen motivo y evento',
  (select bool_and(exists (select 1 from pedido_eventos e where e.pedido_id = p.id and e.tipo = 'cancelado'))
   from pedidos p where motivo_cancelacion = 'Cerrado al pasar a la versión nueva') is not false,
  (select count(*) || ' cancelados' from pedidos where motivo_cancelacion = 'Cerrado al pasar a la versión nueva'));
select pg_temp.chequear('7 · lo anterior al corte queda con version_anterior',
  (select count(*) = 0 from pedidos where not version_anterior
     and created_at < (select value::date from config where key = 'pedidos_version_desde')),
  (select count(*) || ' con version_anterior' from pedidos where version_anterior));

do $$
declare v date; esperado date := (select value::date from config where key = 'pedidos_version_desde');
begin
  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60'); v := pedidos_inicio_version();
  perform pg_temp.chequear('7 · pedidos_inicio_version() como local', v = esperado and v is not null, v::text);
  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14'); v := pedidos_inicio_version();
  perform pg_temp.chequear('7 · pedidos_inicio_version() como mayorista', v = esperado, v::text);
  perform pg_temp.como('570ef4d4-038a-40c4-845c-6920eb898652'); v := pedidos_inicio_version();
  perform pg_temp.chequear('7 · pedidos_inicio_version() como depósito', v = esperado, v::text);
end $$;
reset role;

-- ─── Criterios 1 y 2: crear pedido mixto en una llamada, con decimales ─────
do $$
declare r jsonb; v_antes int; v_grupos int;
begin
  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  r := pedidos_crear(jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad', 1.5),
    jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad', 2)
  ), 'Nota de prueba');
  perform pg_temp.chequear('1 · pedido mixto crea un pedido por destino', jsonb_array_length(r) = 2, r::text);
  insert into _ctx select 'ped_' || (e->>'destino'), (e->>'id')::uuid from jsonb_array_elements(r) e;
  select count(distinct grupo_id) into v_grupos from pedidos where id in (pg_temp.ctx('ped_fabrica'), pg_temp.ctx('ped_deposito'));
  perform pg_temp.chequear('1 · los dos pedidos comparten grupo_id', v_grupos = 1);
  perform pg_temp.chequear('1 · evento creado en cada pedido',
    (select count(*) = 2 from pedido_eventos where tipo = 'creado' and pedido_id in (pg_temp.ctx('ped_fabrica'), pg_temp.ctx('ped_deposito'))));
  perform pg_temp.chequear('2 · la cantidad 1,5 se guarda y se lee',
    (select cantidad = 1.5 from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica')),
    (select cantidad::text from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica')));

  select count(*) into v_antes from pedidos where local_id = auth.uid();
  perform pg_temp.falla('1 · producto inactivo: no se crea nada',
    format('select pedidos_crear(%L::jsonb)', jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad', 1),
      jsonb_build_object('producto_id', pg_temp.ctx('pf2'), 'cantidad', 1))),
    'ya no está disponible');
  perform pg_temp.falla('1 · cantidad 0: no se crea nada',
    format('select pedidos_crear(%L::jsonb)', jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad', 1),
      jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad', 0))),
    'mayor a 0');
  perform pg_temp.falla('1 · cantidad negativa: no se crea nada',
    format('select pedidos_crear(%L::jsonb)', jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad', -1))),
    'mayor a 0');
  perform pg_temp.falla('1 · pedido vacío', $q$select pedidos_crear('[]'::jsonb)$q$, 'no tiene productos');
  perform pg_temp.chequear('1 · tras los errores no quedó ningún pedido nuevo',
    (select count(*) = v_antes from pedidos where local_id = auth.uid()));

  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14');
  perform pg_temp.falla('1 · el mayorista no puede crear pedidos',
    format('select pedidos_crear(%L::jsonb)', jsonb_build_array(jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad', 1))),
    'No autorizado');
end $$;
reset role;

-- ─── Criterio 3: visibilidad por RLS ────────────────────────────────────────
do $$
declare v_msg pedido_mensajes%rowtype;
begin
  -- El local escribe un mensaje intentando inventar el autor.
  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  insert into pedido_mensajes (pedido_id, texto, autor_rol, autor_nombre)
  values (pg_temp.ctx('ped_fabrica'), 'Hola', 'admin', 'Inventado')
  returning * into v_msg;
  perform pg_temp.chequear('3 · el autor del mensaje lo pone el trigger',
    v_msg.autor_rol = 'local' and v_msg.autor_nombre <> 'Inventado' and v_msg.autor_id = auth.uid(),
    v_msg.autor_rol || ' / ' || v_msg.autor_nombre);

  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14');
  perform pg_temp.chequear('3 · mayorista ve el pedido de fábrica', (select count(*) = 1 from pedidos where id = pg_temp.ctx('ped_fabrica')));
  perform pg_temp.chequear('3 · mayorista NO ve el pedido de depósito', (select count(*) = 0 from pedidos where id = pg_temp.ctx('ped_deposito')));
  perform pg_temp.chequear('3 · mayorista NO ve ítems de depósito', (select count(*) = 0 from pedido_items where pedido_id = pg_temp.ctx('ped_deposito')));
  perform pg_temp.chequear('3 · mayorista no ve ningún pedido de depósito', (select count(*) = 0 from pedidos where destino = 'deposito'));
  perform pg_temp.chequear('3 · mayorista ve el mensaje del local', (select count(*) = 1 from pedido_mensajes where pedido_id = pg_temp.ctx('ped_fabrica')));

  perform pg_temp.como('570ef4d4-038a-40c4-845c-6920eb898652');
  perform pg_temp.chequear('3 · depósito ve el pedido de depósito', (select count(*) = 1 from pedidos where id = pg_temp.ctx('ped_deposito')));
  perform pg_temp.chequear('3 · depósito no ve ningún pedido de fábrica', (select count(*) = 0 from pedidos where destino = 'fabrica'));
  perform pg_temp.chequear('3 · depósito NO ve ítems ni mensajes de fábrica',
    (select count(*) = 0 from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica'))
    and (select count(*) = 0 from pedido_mensajes where pedido_id = pg_temp.ctx('ped_fabrica')));

  perform pg_temp.como('d9ccc61c-83c9-4c9b-bcf5-b9bdd752d372');
  perform pg_temp.chequear('3 · otro local NO ve el pedido', (select count(*) = 0 from pedidos where id = pg_temp.ctx('ped_fabrica')));
  perform pg_temp.chequear('3 · otro local NO ve ítems, eventos ni mensajes',
    (select count(*) = 0 from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica'))
    and (select count(*) = 0 from pedido_eventos where pedido_id = pg_temp.ctx('ped_fabrica'))
    and (select count(*) = 0 from pedido_mensajes where pedido_id = pg_temp.ctx('ped_fabrica')));
  perform pg_temp.falla('3 · otro local no puede escribir en el chat',
    format('insert into pedido_mensajes (pedido_id, texto, autor_rol, autor_nombre) values (%L, %L, %L, %L)', pg_temp.ctx('ped_fabrica'), 'x', 'local', 'x'),
    'row-level security');
  perform pg_temp.falla('3 · otro local no puede cancelar un pedido ajeno',
    format('select pedido_cancelar(%L)', pg_temp.ctx('ped_fabrica')), 'No autorizado');

  perform pg_temp.como('37794588-426a-4699-85df-889b6b828e07');
  perform pg_temp.chequear('3 · admin ve los dos pedidos',
    (select count(*) = 2 from pedidos where id in (pg_temp.ctx('ped_fabrica'), pg_temp.ctx('ped_deposito'))));
end $$;
reset role;

-- ─── Criterio 4: el local no escribe directo ───────────────────────────────
do $$
declare n int;
begin
  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  perform pg_temp.falla('4 · local no inserta pedidos directo',
    $q$insert into pedidos (local_id, local_nombre, destino) values (auth.uid(), 'x', 'fabrica')$q$, 'row-level security');
  perform pg_temp.falla('4 · local no inserta ítems directo',
    format('insert into pedido_items (pedido_id, producto_id, producto_nombre, cantidad) values (%L, %L, %L, 1)', pg_temp.ctx('ped_fabrica'), pg_temp.ctx('pf'), 'x'),
    'row-level security');
  update pedidos set estado = 'enviado', notas = 'cambiado' where id = pg_temp.ctx('ped_fabrica');
  get diagnostics n = row_count;
  perform pg_temp.chequear('4 · local no actualiza campos del pedido (0 filas)', n = 0, n::text);
  update pedido_items set cantidad = 99 where pedido_id = pg_temp.ctx('ped_fabrica');
  get diagnostics n = row_count;
  perform pg_temp.chequear('4 · local no actualiza ítems (0 filas)', n = 0, n::text);
  perform pg_temp.falla('4 · local no marca enviado', format('select fabrica_marcar_pedido_enviado(%L)', pg_temp.ctx('ped_fabrica')), 'No autorizado');
  perform pg_temp.falla('4 · local no edita ítems por RPC',
    format('select pedido_editar_items(%L, %L::jsonb)', pg_temp.ctx('ped_fabrica'), '[]'), 'No autorizado');

  perform pg_temp.como('570ef4d4-038a-40c4-845c-6920eb898652');
  perform pg_temp.falla('4 · depósito no opera pedidos de fábrica', format('select pedido_empezar_preparacion(%L)', pg_temp.ctx('ped_fabrica')), 'No autorizado');
end $$;
reset role;

-- ─── Criterios 5 y 6: transiciones, edición y recepción ────────────────────
do $$
declare
  v_item uuid; v_cambios int; v_ev jsonb; v_res jsonb; v_peso numeric; v_mov numeric;
begin
  select id into v_item from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica');
  select fp.peso_kg into v_peso from productos p join fabrica_presentaciones fp on fp.id = p.presentacion_id where p.id = pg_temp.ctx('pf');

  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  perform pg_temp.falla('5 · no se confirma la recepción de un pedido pendiente',
    format('select fabrica_confirmar_recepcion_pedido(%L)', pg_temp.ctx('ped_fabrica')), 'está pendiente');

  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14');
  perform pedido_empezar_preparacion(pg_temp.ctx('ped_fabrica'));
  perform pg_temp.chequear('5 · mayorista empieza la preparación',
    (select estado = 'preparando' and preparando_at is not null from pedidos where id = pg_temp.ctx('ped_fabrica')));
  perform pg_temp.falla('5 · no se empieza dos veces', format('select pedido_empezar_preparacion(%L)', pg_temp.ctx('ped_fabrica')), 'en preparación');

  v_cambios := pedido_editar_items(pg_temp.ctx('ped_fabrica'), jsonb_build_array(
    jsonb_build_object('item_id', v_item, 'producto_id', pg_temp.ctx('pf'), 'cantidad_enviada', 1),
    jsonb_build_object('producto_id', pg_temp.ctx('pf3'), 'cantidad_enviada', 2.25)
  ));
  perform pg_temp.chequear('6 · la edición devuelve 2 cambios', v_cambios = 2, v_cambios::text);
  select detalle into v_ev from pedido_eventos where pedido_id = pg_temp.ctx('ped_fabrica') and tipo = 'editado';
  perform pg_temp.chequear('6 · evento editado con antes y después',
    (v_ev->'cambios'->0->>'antes')::numeric = 1.5 and (v_ev->'cambios'->0->>'despues')::numeric = 1
    and v_ev->'cambios'->1->>'tipo' = 'agregado', v_ev::text);
  perform pg_temp.chequear('6 · el agregado entra con origen despacho y cantidad 0',
    (select origen = 'despacho' and cantidad = 0 and cantidad_enviada = 2.25 from pedido_items
      where pedido_id = pg_temp.ctx('ped_fabrica') and producto_id = pg_temp.ctx('pf3')));
  perform pg_temp.chequear('6 · editar sin cambios no graba evento',
    pedido_editar_items(pg_temp.ctx('ped_fabrica'), jsonb_build_array(jsonb_build_object('item_id', v_item, 'cantidad_enviada', 1))) = 0
    and (select count(*) = 1 from pedido_eventos where pedido_id = pg_temp.ctx('ped_fabrica') and tipo = 'editado'));
  perform pg_temp.falla('6 · no se agrega un producto de otro destino',
    format('select pedido_editar_items(%L, %L::jsonb)', pg_temp.ctx('ped_fabrica'),
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad_enviada', 1))), 'no se despacha');

  perform fabrica_marcar_pedido_enviado(pg_temp.ctx('ped_fabrica'));
  perform pg_temp.chequear('5 · mayorista marca enviado', (select estado = 'enviado' from pedidos where id = pg_temp.ctx('ped_fabrica')));
  v_mov := pg_temp.mov_stock(pg_temp.ctx('ped_fabrica'), pg_temp.ctx('pf'));
  perform pg_temp.chequear('6 · el despacho descuenta lo enviado (1) y no lo pedido (1,5)',
    v_peso is null or v_mov = -(1 * v_peso), coalesce(v_mov::text, 'sin presentación'));
  perform pg_temp.falla('5 · no se envía dos veces', format('select fabrica_marcar_pedido_enviado(%L)', pg_temp.ctx('ped_fabrica')), 'en camino');
  perform pg_temp.falla('5 · no se edita un pedido enviado',
    format('select pedido_editar_items(%L, %L::jsonb)', pg_temp.ctx('ped_fabrica'), '[]'), 'en camino');

  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  perform pg_temp.falla('5 · no se cancela un pedido enviado', format('select pedido_cancelar(%L)', pg_temp.ctx('ped_fabrica')), 'en camino');

  v_res := fabrica_confirmar_recepcion_pedido(pg_temp.ctx('ped_fabrica'),
    jsonb_build_array(jsonb_build_object('id', v_item, 'cantidad_recibida', 0.5)), '[]'::jsonb, 'Faltó medio kilo');
  perform pg_temp.chequear('6 · recepción con diferencias', (v_res->>'con_diferencias')::boolean, v_res::text);
  perform pg_temp.chequear('6 · pedido marcado con diferencias y nota',
    (select estado = 'recibido' and recepcion_con_diferencias and nota_recepcion = 'Faltó medio kilo' from pedidos where id = pg_temp.ctx('ped_fabrica')));
  select detalle into v_ev from pedido_eventos where pedido_id = pg_temp.ctx('ped_fabrica') and tipo = 'recibido_con_diferencias';
  perform pg_temp.chequear('6 · la diferencia se calcula contra lo enviado (1 → 0,5)',
    jsonb_array_length(v_ev->'diferencias') = 1
    and (v_ev->'diferencias'->0->>'enviada')::numeric = 1 and (v_ev->'diferencias'->0->>'recibida')::numeric = 0.5, v_ev::text);
  perform pg_temp.chequear('6 · lo no informado se da por recibido igual a lo enviado',
    (select cantidad_recibida = 2.25 from pedido_items where pedido_id = pg_temp.ctx('ped_fabrica') and producto_id = pg_temp.ctx('pf3')));
  v_mov := pg_temp.mov_stock(pg_temp.ctx('ped_fabrica'), pg_temp.ctx('pf'));
  perform pg_temp.chequear('6 · la recepción devuelve al stock lo que no llegó',
    v_peso is null or v_mov = -(0.5 * v_peso), coalesce(v_mov::text, 'sin presentación'));
  perform pg_temp.falla('5 · no se confirma dos veces', format('select fabrica_confirmar_recepcion_pedido(%L)', pg_temp.ctx('ped_fabrica')), 'ya se confirmó');

  -- Cancelación del de depósito por el local.
  perform pedido_cancelar(pg_temp.ctx('ped_deposito'), 'Me equivoqué');
  perform pg_temp.chequear('5 · el local cancela su pedido pendiente',
    (select estado = 'cancelado' and motivo_cancelacion = 'Me equivoqué' and cancelado_por = auth.uid() from pedidos where id = pg_temp.ctx('ped_deposito'))
    and (select count(*) = 1 from pedido_eventos where pedido_id = pg_temp.ctx('ped_deposito') and tipo = 'cancelado'));
  perform pg_temp.falla('5 · no se cancela dos veces', format('select pedido_cancelar(%L)', pg_temp.ctx('ped_deposito')), 'cancelado');
  perform pg_temp.como('570ef4d4-038a-40c4-845c-6920eb898652');
  perform pg_temp.falla('5 · no se prepara un pedido cancelado', format('select pedido_empezar_preparacion(%L)', pg_temp.ctx('ped_deposito')), 'cancelado');
end $$;
reset role;

-- ─── Recepción: duplicados y destino; "Llegó todo bien"; sin update directo ─
do $$
declare r jsonb; v_id uuid; v_res jsonb; n int; v_item uuid;
begin
  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  r := pedidos_crear(jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.ctx('pf3'), 'cantidad', 3),
    jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad', 1)), null);
  v_id := (select (e->>'id')::uuid from jsonb_array_elements(r) e where e->>'destino' = 'fabrica');

  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14');
  perform fabrica_marcar_pedido_enviado(v_id);

  perform pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
  select id into v_item from pedido_items where pedido_id = v_id;
  perform pg_temp.falla('5 · recepción: el mismo ítem dos veces se rechaza',
    format('select fabrica_confirmar_recepcion_pedido(%L, %L::jsonb)', v_id, jsonb_build_array(
      jsonb_build_object('id', v_item, 'cantidad_recibida', 1),
      jsonb_build_object('id', v_item, 'cantidad_recibida', 1))),
    'informado dos veces');
  perform pg_temp.falla('5 · recepción: el mismo producto agregado dos veces se rechaza',
    format('select fabrica_confirmar_recepcion_pedido(%L, %L::jsonb, %L::jsonb)', v_id, '[]', jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad_recibida', 1),
      jsonb_build_object('producto_id', pg_temp.ctx('pf'), 'cantidad_recibida', 2))),
    'agregado dos veces');
  perform pg_temp.falla('5 · recepción: no se agrega un producto de otro destino',
    format('select fabrica_confirmar_recepcion_pedido(%L, %L::jsonb, %L::jsonb)', v_id, '[]', jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.ctx('pd'), 'cantidad_recibida', 1))),
    'no se despacha');
  perform pg_temp.chequear('5 · tras los rechazos el pedido sigue en camino',
    (select estado = 'enviado' from pedidos where id = v_id));

  v_res := fabrica_confirmar_recepcion_pedido(v_id);
  perform pg_temp.chequear('6 · "Llegó todo bien": sin diferencias y recibido = enviado',
    not (v_res->>'con_diferencias')::boolean
    and (select bool_and(cantidad_recibida = cantidad) from pedido_items where pedido_id = v_id)
    and (select count(*) = 1 from pedido_eventos where pedido_id = v_id and tipo = 'recibido'), v_res::text);

  perform pg_temp.como('570ef4d4-038a-40c4-845c-6920eb898652');
  update pedidos set estado = 'enviado'
    where id = (select (e->>'id')::uuid from jsonb_array_elements(r) e where e->>'destino' = 'deposito');
  get diagnostics n = row_count;
  perform pg_temp.chequear('4 · depósito no actualiza pedidos directo (0 filas)', n = 0, n::text);

  perform pg_temp.como('a6b5f78f-cd70-4235-a735-af51feb63d14');
  update pedidos set estado = 'recibido' where destino = 'fabrica';
  get diagnostics n = row_count;
  perform pg_temp.chequear('4 · mayorista no actualiza pedidos directo (0 filas)', n = 0, n::text);
end $$;
reset role;

select caso, ok, detalle from _r order by ts;

rollback;

-- ─── Anon (pestaña con la sesión vencida) ───────────────────────────────────
-- Las funciones de las policies tienen que poder ejecutarse como anon: si
-- fallan con "permission denied", realtime descarta el cambio para todos los
-- suscriptores (dev, 21-10). Como anon no se ve nada y no hay error.
begin;
set local role anon;
select
  (select count(*) from public.pedidos) = 0          as ok_anon_no_ve_pedidos,
  (select count(*) from public.pedido_mensajes) = 0  as ok_anon_no_ve_mensajes,
  (select count(*) from public.pedido_eventos) = 0   as ok_anon_no_ve_eventos,
  public.puede_operar_destino('fabrica') = false     as ok_anon_no_opera;
rollback;
