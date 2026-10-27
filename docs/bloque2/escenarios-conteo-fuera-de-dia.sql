-- Escenarios de 20261027180000_fabrica_conteo_fuera_de_dia.sql.
-- Corre como qa-fabrica con RLS (role authenticated), igual que la pantalla:
-- el motivo se guarda con un update al borrador y después se llama al cierre.
-- El día de la lista se mueve dentro de la transacción para no depender de qué
-- día se corra. El raise final deshace todo (conteos, solicitudes, días).
do $$
declare
  c_fab  uuid := (select id from auth.users where email = 'qa-fabrica@chipacitos.test');
  v_hoy  int  := extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires'))::int;
  v_otro int;
  v_def  uuid;
  v_c    uuid;
  v_sol  uuid;
  v_n    int;
  v_res  jsonb := '{}'::jsonb;
  v_err  text;
begin
  v_otro := v_hoy % 7 + 1;  -- mañana: cualquier día distinto de hoy

  -- Un borrador cualquiera con ítems; su lista pasa a "no es hoy".
  select c.id, c.definicion_id into v_c, v_def
    from fabrica_conteos c
    where c.estado = 'borrador'
      and exists (select 1 from fabrica_conteo_items i where i.conteo_id = c.id)
    order by c.created_at desc limit 1;
  update fabrica_conteo_definiciones set dia_semana = v_otro where id = v_def;
  -- Fecha libre: que no choque con un cierre real de esa lista (un cerrado por lista y fecha).
  update fabrica_conteos set fecha = current_date + 30 where id = v_c;

  perform set_config('request.jwt.claims', json_build_object('sub', c_fab, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- F1 fuera de día sin motivo: no cierra
  begin
    perform cerrar_conteo_fabrica(v_c);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('F1', v_err, 'F1_ok', v_err like 'Hoy no es el día de este conteo%');

  -- F2 motivo en blanco: tampoco
  update fabrica_conteos set motivo_fuera_de_dia = '   ' where id = v_c;
  begin
    perform cerrar_conteo_fabrica(v_c);
    v_err := 'NO FALLÓ';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_object('F2_ok', v_err like 'Hoy no es el día de este conteo%');

  -- F3 con motivo: cierra, queda marcado, genera la solicitud y se ve en el historial
  update fabrica_conteos set motivo_fuera_de_dia = '  Viaje a Santa Fe  ' where id = v_c;
  get diagnostics v_n = row_count;
  v_sol := cerrar_conteo_fabrica(v_c);  -- Fábrica no lee solicitudes (RLS): se mira el id que devuelve
  v_res := v_res || jsonb_build_object('F3', (
    select jsonb_build_object('update_borrador', v_n, 'estado', c.estado, 'fuera', c.fuera_de_dia, 'motivo', c.motivo_fuera_de_dia,
      'solicitud', (v_sol is not null)::int,
      'vista', (select jsonb_build_object('fuera', h.fuera_de_dia, 'motivo', h.motivo_fuera_de_dia, 'dia', h.definicion_dia_semana)
                from v_compras_conteos_historial h where h.id = c.id))
    from fabrica_conteos c where c.id = v_c));
  v_res := v_res || jsonb_build_object('F3_ok', (v_res #>> '{F3,fuera}')::boolean
    and v_res #>> '{F3,motivo}' = 'Viaje a Santa Fe' and (v_res #>> '{F3,solicitud}')::int = 1
    and (v_res #>> '{F3,vista,fuera}')::boolean and (v_res #>> '{F3,update_borrador}')::int = 1);

  -- F4 Fábrica no puede tocar el motivo ni la marca de un conteo ya cerrado (RLS)
  update fabrica_conteos set motivo_fuera_de_dia = 'otro', fuera_de_dia = false where id = v_c;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('F4_ok', v_n = 0
    and (select fuera_de_dia and motivo_fuera_de_dia = 'Viaje a Santa Fe' from fabrica_conteos where id = v_c));

  -- F5 en su día: cierra sin motivo, sin marca; un motivo o una marca que mande el navegador se pisan
  perform set_config('role', 'postgres', true);
  update fabrica_conteo_definiciones set dia_semana = v_hoy where id = v_def;
  perform set_config('role', 'authenticated', true);
  insert into fabrica_conteos (definicion_id, fecha, semana_desde, semana_hasta, creado_por)
    values (v_def, current_date + 31, current_date, current_date + 3, c_fab)
    returning id into v_c;
  update fabrica_conteos set motivo_fuera_de_dia = 'no hace falta', fuera_de_dia = true where id = v_c;
  perform cerrar_conteo_fabrica(v_c);
  v_res := v_res || jsonb_build_object('F5_ok', (select estado = 'cerrado' and not fuera_de_dia and motivo_fuera_de_dia is null
                                                  from fabrica_conteos where id = v_c));

  v_res := v_res || jsonb_build_object('TODO_OK',
    (v_res->>'F1_ok')::boolean and (v_res->>'F2_ok')::boolean and (v_res->>'F3_ok')::boolean
    and (v_res->>'F4_ok')::boolean and (v_res->>'F5_ok')::boolean);
  raise exception 'RESULTADO %', v_res;
end;
$$;
