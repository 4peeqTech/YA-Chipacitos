-- Escenarios de T1 del nomenclador: código, reglas de composición, archivado,
-- cambio de tipo, generador, externos y acceso.
-- Corre contra DEV en una transacción que se descarta:
--
--   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f docs/nomenclador/escenarios-t1.sql
--
-- Antes de aplicar la migración se puede probar todo junto: armar un archivo
-- con "begin;", el contenido de 20261029120000_nomenclador_mvp.sql y este
-- archivo sin su "begin;".
--
-- Devuelve una fila por caso (ok = true/false). Los roles se simulan con
-- request.jwt.claim.sub + role authenticated. Usuarios de dev:
--   qa-admin  37794588-426a-4699-85df-889b6b828e07
--   qa-local  93b4b0a1-a7c2-4932-a17e-9be77de9dc60 (sin el módulo)
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

-- Ejecuta p_sql y devuelve el mensaje de error (null si no falló).
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
  a jsonb; b jsonb; e text;
  v_masa uuid; v_pt uuid; v_mp uuid; v_co uuid; v_res jsonb; v_n int;
  v_s1 uuid; v_s2 uuid; v_p1 uuid; v_p2 uuid; v_ext uuid;
begin
  -- 1. Códigos correlativos por prefijo
  a := nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"zz Fécula test","unidad_base":"kg"}');
  b := nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"zz Sardo test","unidad_base":"kg"}');
  insert into _r (caso, ok, detalle) values ('1 códigos MP correlativos',
    a->>'codigo' ~ '^MP-[0-9]{4}$' and split_part(b->>'codigo', '-', 2)::int = split_part(a->>'codigo', '-', 2)::int + 1,
    (a->>'codigo') || ' / ' || (b->>'codigo'));
  v_mp := (a->>'id')::uuid;

  -- 2. Validaciones de alta
  e := pg_temp.err($q$select nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"  "}')$q$);
  insert into _r (caso, ok, detalle) values ('2a nombre vacío', e = 'El nombre es obligatorio.', e);
  e := pg_temp.err($q$select nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"zz sin unidad"}')$q$);
  insert into _r (caso, ok, detalle) values ('2b unidad obligatoria', e like 'La unidad base es obligatoria%', e);
  e := pg_temp.err($q$select nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"ZZ FÉCULA TEST","unidad_base":"kg"}')$q$);
  insert into _r (caso, ok, detalle) values ('2c nombre repetido en el tipo', e = 'Ya hay un ítem activo de ese tipo con ese nombre.', e);
  e := pg_temp.err($q$select nomenclador_guardar_item(null, '{"tipo":"materia_prima","nombre":"zz x","unidad_base":"kg","precio":1}')$q$);
  insert into _r (caso, ok, detalle) values ('2d campo no permitido', e like 'El campo "precio"%', e);

  -- 3. Composición: tipos y ciclos
  v_masa := (nomenclador_guardar_item(null, '{"tipo":"semielaborado","nombre":"zz Masa test","unidad_base":"kg"}')->>'id')::uuid;
  v_pt   := (nomenclador_guardar_item(null, '{"tipo":"producto_terminado","nombre":"zz Chipá test","unidad_base":"kg"}')->>'id')::uuid;
  v_co   := (nomenclador_guardar_item(null, '{"tipo":"concepto","nombre":"zz Logística test"}')->>'id')::uuid;
  perform nomenclador_guardar_componentes(v_masa, 2.35, jsonb_build_array(jsonb_build_object('componente_id', v_mp)));
  perform nomenclador_guardar_componentes(v_pt, null, jsonb_build_array(jsonb_build_object('componente_id', v_masa, 'cantidad', 1, 'unidad', 'kg')));
  insert into _r (caso, ok, detalle) values ('3a composición sin cantidades y con cantidades',
    (select count(*) from nomenclador_componentes where item_id in (v_masa, v_pt)) = 2
    and (select rinde_cantidad from nomenclador_items where id = v_masa) = 2.35, null);

  e := pg_temp.err(format('select nomenclador_guardar_componentes(%L, null, %L)', v_mp,
       jsonb_build_array(jsonb_build_object('componente_id', v_co))));
  insert into _r (caso, ok, detalle) values ('3b materia prima no lleva composición', e like '%no lleva composición%', e);
  e := pg_temp.err(format('select nomenclador_guardar_componentes(%L, null, %L)', v_pt,
       jsonb_build_array(jsonb_build_object('componente_id', v_co))));
  insert into _r (caso, ok, detalle) values ('3c concepto no es componente', e like '%es un concepto%', e);
  e := pg_temp.err(format('select nomenclador_guardar_componentes(%L, null, %L)', v_masa,
       jsonb_build_array(jsonb_build_object('componente_id', v_pt))));
  insert into _r (caso, ok, detalle) values ('3d ciclo indirecto rechazado', e like 'Se formaría un ciclo%', e);
  insert into _r (caso, ok, detalle) values ('3e un error no borra la composición anterior',
    (select count(*) from nomenclador_componentes where item_id = v_masa) = 1, null);
  e := pg_temp.err(format('select nomenclador_guardar_componentes(%L, null, %L)', v_pt,
       jsonb_build_array(jsonb_build_object('componente_id', v_masa, 'cantidad', 0))));
  insert into _r (caso, ok, detalle) values ('3f cantidad 0 rechazada', e like 'Revisá las cantidades%', e);

  -- 4. Archivar un componente en uso
  e := pg_temp.err(format('select nomenclador_archivar_item(%L)', v_masa));
  insert into _r (caso, ok, detalle) values ('4a no se archiva lo que está en uso', e like 'No se puede archivar: lo usan%', e);
  e := pg_temp.err(format('select nomenclador_archivar_item(%L)', v_pt));
  insert into _r (caso, ok, detalle) values ('4b se archiva lo que no está en uso', e is null, e);

  -- 5. Cambio de tipo
  e := pg_temp.err(format($q$select nomenclador_guardar_item(%L, '{"tipo":"insumo"}')$q$, v_co));
  insert into _r (caso, ok, detalle) values ('5a tipo fijo si no está a revisar', e like 'El tipo solo se puede cambiar%', e);
  perform nomenclador_guardar_item(v_co, '{"a_revisar":true}');
  a := nomenclador_guardar_item(v_co, '{"tipo":"insumo","unidad_base":"unidades"}');
  insert into _r (caso, ok, detalle) values ('5b a revisar: cambia tipo y código', a->>'codigo' like 'IN-%', a->>'codigo');
  v_n := nomenclador_marcar_revisado(array[v_co]);
  insert into _r (caso, ok, detalle) values ('5c marcar revisado',
    v_n = 1 and not (select a_revisar from nomenclador_items where id = v_co), null);

  -- 6. Generador
  v_s1 := nomenclador_guardar_parametro('sabor', null, '{"nombre":"zz Clásicos","nombres_alternativos":["Clasico"]}');
  v_s2 := nomenclador_guardar_parametro('sabor', null, '{"nombre":"zz Queso Azul","nombres_alternativos":["Roquefort"]}');
  v_p1 := nomenclador_guardar_parametro('presentacion', null, '{"nombre":"zz 1/2 kg Mayorista","cantidad":0.5,"unidad":"kg"}');
  v_p2 := nomenclador_guardar_parametro('presentacion', null, '{"nombre":"zz Para horneado","cantidad":null,"unidad":null}');
  v_n := (select count(*) from nomenclador_items);
  v_res := nomenclador_generar_variantes('{"nombre":"zz Chipá"}', array[v_s1, v_s2], array[v_p1, v_p2], true);
  insert into _r (caso, ok, detalle) values ('6a simular no escribe',
    jsonb_array_length(v_res) = 6 and (select count(*) from nomenclador_items) = v_n, jsonb_array_length(v_res)::text);
  v_res := nomenclador_generar_variantes('{"nombre":"zz Chipá"}', array[v_s1, v_s2], array[v_p1, v_p2]);
  insert into _r (caso, ok, detalle) values ('6b genera 2 PT + 4 PV',
    (select count(*) from jsonb_array_elements(v_res) x where x->>'accion' = 'crear') = 6
    and (select count(*) from nomenclador_items) = v_n + 6, null);
  insert into _r (caso, ok, detalle) values ('6c PV con composición PT × cantidad',
    exists (select 1 from nomenclador_items pv join nomenclador_componentes c on c.item_id = pv.id
            where pv.presentacion_id = v_p1 and pv.sabor_id = v_s1 and c.componente_id = pv.variante_de
              and c.cantidad = 0.5 and c.unidad = 'kg'), null);
  v_res := nomenclador_generar_variantes('{"nombre":"zz Chipá"}', array[v_s1, v_s2], array[v_p1, v_p2]);
  insert into _r (caso, ok, detalle) values ('6d volver a generar no duplica',
    (select count(*) from jsonb_array_elements(v_res) x where x->>'accion' = 'existe') = 6
    and (select count(*) from nomenclador_items) = v_n + 6, null);

  -- 7. Códigos externos
  v_ext := nomenclador_guardar_externo(null, '{"sistema":"posberry","codigo":"zz121","nombre":"1/2 Kg. Mayoristas CLÁSICOS"}');
  e := pg_temp.err($q$select nomenclador_guardar_externo(null, '{"sistema":"posberry","codigo":"zz121","nombre":"otro"}')$q$);
  insert into _r (caso, ok, detalle) values ('7a código externo repetido', e = 'Ese código ya está cargado para ese sistema.', e);
  perform nomenclador_asignar_externo(v_ext, v_mp);
  insert into _r (caso, ok, detalle) values ('7b asignar externo',
    (select item_id from nomenclador_externos where id = v_ext) = v_mp, null);
  perform nomenclador_asignar_externo(v_ext, null);
  insert into _r (caso, ok, detalle) values ('7c quitar asignación (queda sin mapear)',
    (select item_id from nomenclador_externos where id = v_ext) is null, null);
end $$;

-- 8. Acceso: un usuario sin el módulo no ve ni escribe
select pg_temp.como('93b4b0a1-a7c2-4932-a17e-9be77de9dc60');
do $$
declare e text;
begin
  e := pg_temp.err($q$select nomenclador_guardar_item(null, '{"tipo":"insumo","nombre":"zz x","unidad_base":"kg"}')$q$);
  insert into _r (caso, ok, detalle) values ('8a sin módulo no escribe', e = 'No autorizado', e);
  insert into _r (caso, ok, detalle) values ('8b sin módulo no lee', (select count(*) from nomenclador_items) = 0, null);
  e := pg_temp.err($q$select _nomenclador_siguiente_codigo('insumo')$q$);
  insert into _r (caso, ok, detalle) values ('8c helper de código no expuesto', e like 'permission denied%', e);
end $$;

reset role;
select n, caso, ok, detalle from _r order by n;
rollback;
