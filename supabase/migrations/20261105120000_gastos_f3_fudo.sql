-- ============================================================================
-- Gastos F3 (2026-11-04): los gastos de Fudo entran a la tabla gastos.
--
-- La app SOLO LEE Fudo (token + GET). Lo que trae se copia acá con
-- origen = 'fudo'; pagos, clasificación y anulaciones viven solo en esta base.
-- Nunca se escribe en Fudo.
--
-- gastos_fudo_aplicar recibe los gastos de una sucursal ya normalizados por la
-- app y concilia contra lo que hay, con los gastos bloqueados:
--   - nuevo en Fudo (no cancelado) → gasto pendiente, "sin clasificar";
--   - sus pagos que no son Cta. Cte. → pagos origen 'fudo' con la caja del local;
--   - si el gasto ya tiene pagos cargados en la app, Fudo no agrega pagos (no se
--     paga dos veces);
--   - cancelado en Fudo (o que ya no aparece) → Anulado si no tiene pagos de la
--     app; si los tiene, queda marcado fudo_revisar;
--   - los datos que manda Fudo (monto, fecha, descripción, categoría, proveedor)
--     se actualizan; lo que se carga en la app (rubro, categoría, observaciones,
--     vencimiento) no se pisa.
-- ============================================================================

alter table public.gastos add column if not exists fudo_descripcion text;

-- La vista suma la descripción de Fudo al final (create or replace solo deja agregar al final).
create or replace view public.v_gastos as
select
  g.id, g.fecha, g.local, g.rubro, g.categoria, g.proveedor_id, g.monto, g.forma_pago, g.estado,
  g.observaciones, g.created_at, g.origen, g.fecha_vencimiento,
  g.fudo_id, g.fudo_categoria, g.fudo_proveedor, g.fudo_estado, g.fudo_revisar, g.fudo_sincronizado_en,
  g.recurrente_id, g.periodo, g.a_confirmar,
  pr.nombre as proveedor_nombre,
  pc.nombre as creado_por_nombre,
  f.id as factura_id,
  f.numero as factura_numero,
  ped.numero as factura_pedido_numero,
  coalesce(pg.pagado, 0) as pagado,
  greatest(g.monto - coalesce(pg.pagado, 0), 0) as saldo,
  coalesce(pg.pagos, 0) as pagos,
  coalesce(adj.adjuntos, 0) as adjuntos,
  (g.estado in ('Pendiente de pago', 'Parcial') and g.fecha_vencimiento < current_date) as vencido,
  up.fecha as fecha_pago,
  up.caja,
  up.comprobante_url,
  up.forma_pago as ultimo_pago_forma,
  pp.nombre as pagado_por_nombre,
  g.fudo_descripcion
from gastos g
left join proveedores pr on pr.id = g.proveedor_id
left join profiles pc on pc.id = g.created_by
left join compras_facturas f on f.gasto_id = g.id
left join compras_pedidos ped on ped.id = f.pedido_id
left join lateral (
  select sum(p.monto) as pagado, count(*) as pagos
  from gastos_pagos p where p.gasto_id = g.id and p.anulado_en is null
) pg on true
left join lateral (
  select p.fecha, p.caja, p.comprobante_url, p.forma_pago, p.registrado_por
  from gastos_pagos p where p.gasto_id = g.id and p.anulado_en is null
  order by p.fecha desc, p.created_at desc limit 1
) up on true
left join profiles pp on pp.id = up.registrado_por
left join lateral (
  select count(*) as adjuntos from gastos_adjuntos a where a.gasto_id = g.id
) adj on true
where es_admin();

-- La búsqueda también mira la descripción de Fudo.
create or replace function public.gastos_listar(
  p_desde date default null,
  p_hasta date default null,
  p_estado text default 'todos',
  p_local text default null,
  p_q text default null,
  p_origen text default null,
  p_orden text default 'nuevos'
)
returns setof public.v_gastos
language sql
stable
set search_path = public
as $$
  select v.*
  from v_gastos v
  where (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
    and case coalesce(p_estado, 'todos')
          when 'pendientes' then v.estado in ('Pendiente de pago', 'Parcial')
          when 'pagados' then v.estado = 'Pagado'
          when 'anulados' then v.estado = 'Anulado'
          else true
        end
    and (nullif(btrim(p_local), '') is null or v.local = btrim(p_local))
    and (nullif(btrim(p_origen), '') is null or v.origen = btrim(p_origen))
    and (
      nullif(btrim(p_q), '') is null
      or strpos(
        _gastos_norm(concat_ws(' ', v.proveedor_nombre, v.categoria, v.rubro, v.local, v.observaciones,
                               v.factura_numero, v.fudo_descripcion, v.fudo_categoria, v.fudo_proveedor,
                               case when v.factura_pedido_numero is not null
                                    then 'P-' || lpad(v.factura_pedido_numero::text, 4, '0') end)),
        _gastos_norm(btrim(p_q))
      ) > 0
    )
  order by
    case when p_orden = 'viejos' then v.fecha end asc,
    case when p_orden is distinct from 'viejos' then v.fecha end desc,
    v.created_at desc,
    v.id desc;
$$;

-- ----------------------------------------------------------------------------
-- Registro de sincronizaciones (para "actualizado hace N minutos" y errores).
-- ----------------------------------------------------------------------------
create table if not exists public.gastos_fudo_sync (
  id             uuid primary key default gen_random_uuid(),
  local          text not null references public.locales_config(sucursal) on update cascade,
  origen         text not null check (origen in ('pantalla', 'boton', 'cron', 'script')),
  -- clock_timestamp: dos registros en la misma transacción no empatan.
  creado_en      timestamptz not null default clock_timestamp(),
  ok             boolean not null,
  resumen        jsonb,
  error          text,
  ejecutado_por  uuid references public.profiles(id) on delete set null
);
create index if not exists idx_gastos_fudo_sync_local on public.gastos_fudo_sync (local, creado_en desc);

alter table public.gastos_fudo_sync enable row level security;
drop policy if exists gastos_fudo_sync_admin_lee on public.gastos_fudo_sync;
create policy gastos_fudo_sync_admin_lee on public.gastos_fudo_sync for select using (es_admin());

-- Sincronizan un admin (pantalla, botón) o el cron con la service role.
create or replace function public._gastos_fudo_puede()
returns boolean
language sql
stable
set search_path = public
as $$
  select es_admin()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

revoke execute on function public._gastos_fudo_puede() from public, anon;
grant execute on function public._gastos_fudo_puede() to authenticated, service_role;

-- Último intento y último OK por sucursal con Fudo.
create or replace function public.gastos_fudo_estado()
returns table (local text, ultimo_ok timestamptz, ultimo_intento timestamptz, ultimo_error text)
language sql
stable
set search_path = public
as $$
  select l.sucursal,
         (select max(s.creado_en) from gastos_fudo_sync s where s.local = l.sucursal and s.ok),
         u.creado_en,
         case when u.ok then null else u.error end
  from locales_config l
  left join lateral (
    select s.creado_en, s.ok, s.error from gastos_fudo_sync s where s.local = l.sucursal order by s.creado_en desc limit 1
  ) u on true
  where l.tiene_fudo and l.activo is not false and es_admin()
  order by l.orden, l.sucursal;
$$;

revoke execute on function public.gastos_fudo_estado() from public, anon;
grant execute on function public.gastos_fudo_estado() to authenticated;

create or replace function public.gastos_fudo_registrar_error(
  p_local text default null,
  p_origen text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _gastos_fudo_puede() then
    raise exception 'Solo un administrador puede sincronizar Fudo.';
  end if;
  if not exists (select 1 from locales_config where sucursal = p_local) then
    return;
  end if;
  insert into gastos_fudo_sync (local, origen, ok, error, ejecutado_por)
  values (p_local, coalesce(p_origen, 'boton'), false, left(coalesce(p_error, 'Error desconocido'), 500), auth.uid());
end;
$$;

revoke execute on function public.gastos_fudo_registrar_error(text, text, text) from public, anon;
grant execute on function public.gastos_fudo_registrar_error(text, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Aplicar lo leído de Fudo para una sucursal.
--
-- p_items: [{ fudo_id, fecha, monto, descripcion, categoria, proveedor, estado,
--             cancelado, vencimiento, forma,
--             pagos: [{ id, fecha, monto, forma }] }]   -- sin los de Cta. Cte.
-- p_completo: la lectura trajo todas las páginas (si no, no se marca lo que falta).
-- ----------------------------------------------------------------------------
create or replace function public.gastos_fudo_aplicar(
  p_local text default null,
  p_items jsonb default '[]'::jsonb,
  p_completo boolean default false,
  p_origen text default 'boton'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja      text;
  v_it        jsonb;
  v_pago      jsonb;
  v_g         gastos%rowtype;
  v_ids       text[] := '{}';
  v_pagos_ids text[];
  v_app       int;
  v_pagado    numeric;
  v_monto     numeric;
  v_fecha     date;
  v_nuevos    int := 0;
  v_cambiados int := 0;
  v_pagos     int := 0;
  v_anulados  int := 0;
  v_revisar   int := 0;
  v_res       jsonb;
begin
  if not _gastos_fudo_puede() then
    raise exception 'Solo un administrador puede sincronizar Fudo.';
  end if;
  select caja_default into v_caja from locales_config where sucursal = p_local and tiene_fudo;
  if not found then
    raise exception 'El local % no tiene Fudo.', coalesce(p_local, '(vacío)');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Los gastos de Fudo tienen que venir en una lista.';
  end if;

  -- Una sincronización por sucursal a la vez.
  perform pg_advisory_xact_lock(hashtext('gastos_fudo:' || p_local));

  for v_it in select * from jsonb_array_elements(p_items) loop
    continue when nullif(v_it->>'fudo_id', '') is null;
    v_ids := v_ids || (v_it->>'fudo_id');
    v_monto := round(coalesce((v_it->>'monto')::numeric, 0), 2);
    v_fecha := coalesce((v_it->>'fecha')::date, current_date);

    select * into v_g from gastos where local = p_local and fudo_id = v_it->>'fudo_id' for update;

    if not found then
      -- Uno cancelado que la app nunca vio no se trae.
      continue when coalesce((v_it->>'cancelado')::boolean, false) or v_monto <= 0;
      insert into gastos (fecha, local, monto, forma_pago, estado, origen, fudo_id, fudo_descripcion, fudo_categoria,
                          fudo_proveedor, fudo_estado, fudo_sincronizado_en, fecha_vencimiento)
      values (v_fecha, p_local, v_monto, coalesce(nullif(v_it->>'forma', ''), 'Cta. Cte.'), 'Pendiente de pago', 'fudo',
              v_it->>'fudo_id', nullif(btrim(v_it->>'descripcion'), ''), nullif(btrim(v_it->>'categoria'), ''),
              nullif(btrim(v_it->>'proveedor'), ''), v_it->>'estado', now(), (v_it->>'vencimiento')::date)
      returning * into v_g;
      v_nuevos := v_nuevos + 1;
    else
      if v_g.monto is distinct from v_monto
         or v_g.fecha is distinct from v_fecha
         or v_g.fudo_descripcion is distinct from nullif(btrim(v_it->>'descripcion'), '')
         or v_g.fudo_categoria is distinct from nullif(btrim(v_it->>'categoria'), '')
         or v_g.fudo_proveedor is distinct from nullif(btrim(v_it->>'proveedor'), '')
         or v_g.fudo_estado is distinct from v_it->>'estado' then
        v_cambiados := v_cambiados + 1;
      end if;
      update gastos
        set monto = case when v_monto > 0 then v_monto else monto end,
            fecha = v_fecha,
            fudo_descripcion = nullif(btrim(v_it->>'descripcion'), ''),
            fudo_categoria = nullif(btrim(v_it->>'categoria'), ''),
            fudo_proveedor = nullif(btrim(v_it->>'proveedor'), ''),
            fudo_estado = v_it->>'estado',
            fudo_sincronizado_en = now(),
            -- El vencimiento de Fudo entra solo si en la app no se cargó uno.
            fecha_vencimiento = coalesce(fecha_vencimiento, (v_it->>'vencimiento')::date)
        where id = v_g.id
        returning * into v_g;
    end if;

    select count(*) into v_app from gastos_pagos where gasto_id = v_g.id and anulado_en is null and origen = 'app';

    if coalesce((v_it->>'cancelado')::boolean, false) then
      if v_app = 0 then
        if v_g.estado <> 'Anulado' then
          update gastos set estado = 'Anulado', fudo_revisar = false where id = v_g.id;
          v_anulados := v_anulados + 1;
        end if;
      elsif not v_g.fudo_revisar then
        update gastos set fudo_revisar = true where id = v_g.id;
        v_revisar := v_revisar + 1;
      end if;
      continue;
    end if;

    -- Lo descancelaron en Fudo: vuelve a contar.
    if v_g.estado = 'Anulado' then
      update gastos set estado = 'Pendiente de pago' where id = v_g.id;
    end if;

    if v_app = 0 then
      -- Los pagos de Fudo que faltan, y se anulan los que ya no vienen.
      v_pagos_ids := '{}';
      for v_pago in select * from jsonb_array_elements(coalesce(v_it->'pagos', '[]'::jsonb)) loop
        continue when nullif(v_pago->>'id', '') is null or coalesce((v_pago->>'monto')::numeric, 0) <= 0;
        v_pagos_ids := v_pagos_ids || (v_pago->>'id');
        if not exists (select 1 from gastos_pagos where gasto_id = v_g.id and fudo_payment_id = v_pago->>'id' and anulado_en is null) then
          insert into gastos_pagos (gasto_id, fecha, monto, forma_pago, caja, origen, fudo_payment_id)
          values (v_g.id, coalesce((v_pago->>'fecha')::date, v_g.fecha), round((v_pago->>'monto')::numeric, 2),
                  coalesce(nullif(v_pago->>'forma', ''), 'Fudo'), v_caja, 'fudo', v_pago->>'id');
          v_pagos := v_pagos + 1;
        end if;
      end loop;
      update gastos_pagos
        set anulado_en = now(), anulado_motivo = 'Ya no figura en Fudo.'
        where gasto_id = v_g.id and origen = 'fudo' and anulado_en is null and not (fudo_payment_id = any(v_pagos_ids));
      if v_g.fudo_revisar then
        update gastos set fudo_revisar = false where id = v_g.id;
      end if;
    else
      -- Pagado en la app: si Fudo bajó el monto por debajo de lo pagado, avisar.
      select coalesce(sum(monto), 0) into v_pagado from gastos_pagos where gasto_id = v_g.id and anulado_en is null;
      if v_pagado > v_g.monto and not v_g.fudo_revisar then
        update gastos set fudo_revisar = true where id = v_g.id;
        v_revisar := v_revisar + 1;
      end if;
    end if;

    perform gastos_recalcular_estado(v_g.id);
  end loop;

  -- Los que ya no vienen de Fudo (solo si se leyó todo).
  if p_completo then
    for v_g in
      select * from gastos
      where local = p_local and origen = 'fudo' and estado <> 'Anulado' and not (fudo_id = any(v_ids))
      for update
    loop
      if exists (select 1 from gastos_pagos where gasto_id = v_g.id and anulado_en is null and origen = 'app') then
        if not v_g.fudo_revisar then
          update gastos set fudo_revisar = true, fudo_estado = 'NO_FIGURA' where id = v_g.id;
          v_revisar := v_revisar + 1;
        end if;
      else
        update gastos set estado = 'Anulado', fudo_estado = 'NO_FIGURA' where id = v_g.id;
        v_anulados := v_anulados + 1;
      end if;
    end loop;
  end if;

  v_res := jsonb_build_object('leidos', jsonb_array_length(p_items), 'nuevos', v_nuevos, 'cambiados', v_cambiados,
                              'pagos', v_pagos, 'anulados', v_anulados, 'revisar', v_revisar, 'completo', p_completo);
  insert into gastos_fudo_sync (local, origen, ok, resumen, ejecutado_por)
  values (p_local, coalesce(p_origen, 'boton'), true, v_res, auth.uid());
  return v_res;
end;
$$;

revoke execute on function public.gastos_fudo_aplicar(text, jsonb, boolean, text) from public, anon;
grant execute on function public.gastos_fudo_aplicar(text, jsonb, boolean, text) to authenticated, service_role;
