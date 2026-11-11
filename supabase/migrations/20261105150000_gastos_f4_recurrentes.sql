-- ============================================================================
-- Gastos F4 (2026-11-04): gastos que se repiten (alquiler, sueldos, servicios).
--
-- Una plantilla (gastos_recurrentes) genera, cada mes, un gasto pendiente de
-- pago el día configurado (el 31 cae el último día en los meses más cortos).
-- Si el monto varía (luz, agua), el gasto nace con el último monto y marcado
-- a_confirmar hasta que alguien lo edita. Generar dos veces el mismo mes es
-- imposible: hay un índice único por plantilla y período (YYYY-MM).
--
-- gastos_generar_recurrentes es idempotente: la llaman las pantallas de Gastos
-- al abrirse y el cron diario. Llena hacia atrás desde "desde", con un tope de
-- 12 meses.
-- ============================================================================

create table if not exists public.gastos_recurrentes (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  local             text not null references public.locales_config(sucursal) on update cascade,
  rubro             text not null,
  categoria         text not null,
  proveedor_id      uuid references public.proveedores(id) on delete restrict,
  monto             numeric(14,2) not null check (monto > 0),
  monto_variable    boolean not null default false,
  forma_pago        text not null,
  dia_del_mes       smallint not null check (dia_del_mes between 1 and 31),
  dias_para_vencer  smallint check (dias_para_vencer between 0 and 120),
  desde             date not null,
  hasta             date,
  activo            boolean not null default true,
  observaciones     text,
  creado_por        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint gastos_recurrentes_rango check (hasta is null or hasta >= desde)
);

alter table public.gastos_recurrentes enable row level security;
drop policy if exists gastos_recurrentes_admin_lee on public.gastos_recurrentes;
create policy gastos_recurrentes_admin_lee on public.gastos_recurrentes for select using (es_admin());

alter table public.gastos
  add constraint gastos_recurrente_fkey foreign key (recurrente_id)
  references public.gastos_recurrentes(id) on delete set null;
create unique index if not exists gastos_recurrente_periodo_unico
  on public.gastos (recurrente_id, periodo) where recurrente_id is not null;

-- Generan un admin (al abrir la pantalla) o el cron (service role).
create or replace function public._gastos_puede_sistema()
returns boolean
language sql
stable
set search_path = public
as $$
  select es_admin()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

revoke execute on function public._gastos_puede_sistema() from public, anon;
grant execute on function public._gastos_puede_sistema() to authenticated, service_role;

-- La fecha del gasto de un período: el día pedido, o el último del mes si no existe.
create or replace function public._gastos_dia_del_periodo(p_mes date, p_dia int)
returns date
language sql
immutable
as $$
  select (date_trunc('month', p_mes)::date
          + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1));
$$;

-- ----------------------------------------------------------------------------
-- Generar lo que corresponda hasta p_hasta (hoy en Argentina si no se pasa).
-- ----------------------------------------------------------------------------
create or replace function public.gastos_generar_recurrentes(p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta  date := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_r      gastos_recurrentes%rowtype;
  v_mes    date;
  v_fecha  date;
  v_monto  numeric;
  v_n      int := 0;
begin
  if not _gastos_puede_sistema() then
    raise exception 'Solo un administrador puede generar los gastos que se repiten.';
  end if;
  -- Dos aperturas a la vez no generan dos veces (además del índice único).
  perform pg_advisory_xact_lock(hashtext('gastos_recurrentes'));

  for v_r in select * from gastos_recurrentes where activo loop
    v_mes := greatest(date_trunc('month', v_r.desde)::date, (date_trunc('month', v_hasta) - interval '11 months')::date);
    while v_mes <= v_hasta loop
      v_fecha := _gastos_dia_del_periodo(v_mes, v_r.dia_del_mes);
      exit when v_fecha > v_hasta or (v_r.hasta is not null and v_fecha > v_r.hasta);
      if v_fecha >= v_r.desde
         and not exists (select 1 from gastos where recurrente_id = v_r.id and periodo = to_char(v_mes, 'YYYY-MM')) then
        -- Monto variable: el del último que se generó (ya corregido, si lo corrigieron).
        v_monto := v_r.monto;
        if v_r.monto_variable then
          select g.monto into v_monto from gastos g
          where g.recurrente_id = v_r.id order by g.periodo desc limit 1;
          v_monto := coalesce(v_monto, v_r.monto);
        end if;
        insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones,
                            created_by, origen, recurrente_id, periodo, a_confirmar, fecha_vencimiento)
        values (v_fecha, v_r.local, v_r.rubro, v_r.categoria, v_r.proveedor_id, v_monto, v_r.forma_pago,
                'Pendiente de pago', concat_ws(E'\n', v_r.nombre, nullif(btrim(v_r.observaciones), '')),
                v_r.creado_por, 'recurrente', v_r.id, to_char(v_mes, 'YYYY-MM'), v_r.monto_variable,
                case when v_r.dias_para_vencer is not null then v_fecha + v_r.dias_para_vencer end)
        on conflict do nothing;
        if found then v_n := v_n + 1; end if;
      end if;
      v_mes := (v_mes + interval '1 month')::date;
    end loop;
  end loop;
  return jsonb_build_object('generados', v_n);
end;
$$;

revoke execute on function public.gastos_generar_recurrentes(date) from public, anon;
grant execute on function public.gastos_generar_recurrentes(date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Plantillas: guardar, pausar/reactivar y eliminar.
-- ----------------------------------------------------------------------------
create or replace function public.gastos_recurrente_guardar(
  p_id uuid default null,
  p_nombre text default null,
  p_local text default null,
  p_rubro text default null,
  p_categoria text default null,
  p_proveedor_id uuid default null,
  p_monto numeric default null,
  p_monto_variable boolean default false,
  p_forma_pago text default null,
  p_dia_del_mes int default null,
  p_dias_para_vencer int default null,
  p_desde date default null,
  p_hasta date default null,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar gastos que se repiten.';
  end if;
  if nullif(btrim(p_nombre), '') is null then
    raise exception 'Poné un nombre, por ejemplo "Alquiler San Lorenzo".';
  end if;
  if not exists (select 1 from locales_config where sucursal = btrim(p_local) and activo is not false) then
    raise exception 'Elegí el local.';
  end if;
  if nullif(btrim(p_rubro), '') is null or nullif(btrim(p_categoria), '') is null then
    raise exception 'Elegí el rubro y la categoría.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a 0.';
  end if;
  if nullif(btrim(p_forma_pago), '') is null then
    raise exception 'Elegí la forma de pago.';
  end if;
  if p_dia_del_mes is null or p_dia_del_mes not between 1 and 31 then
    raise exception 'El día del mes va del 1 al 31.';
  end if;
  if p_dias_para_vencer is not null and p_dias_para_vencer not between 0 and 120 then
    raise exception 'Los días para vencer van de 0 a 120.';
  end if;
  if p_desde is null then
    raise exception 'Elegí desde cuándo se repite.';
  end if;
  if p_hasta is not null and p_hasta < p_desde then
    raise exception 'La fecha de fin no puede ser antes del inicio.';
  end if;

  if p_id is null then
    insert into gastos_recurrentes (nombre, local, rubro, categoria, proveedor_id, monto, monto_variable, forma_pago,
                                    dia_del_mes, dias_para_vencer, desde, hasta, observaciones, creado_por)
    values (btrim(p_nombre), btrim(p_local), btrim(p_rubro), btrim(p_categoria), p_proveedor_id, round(p_monto, 2),
            coalesce(p_monto_variable, false), btrim(p_forma_pago), p_dia_del_mes, p_dias_para_vencer, p_desde, p_hasta,
            nullif(btrim(p_observaciones), ''), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  -- Editar no toca los gastos ya generados: cambia los que vienen.
  update gastos_recurrentes
    set nombre = btrim(p_nombre), local = btrim(p_local), rubro = btrim(p_rubro), categoria = btrim(p_categoria),
        proveedor_id = p_proveedor_id, monto = round(p_monto, 2), monto_variable = coalesce(p_monto_variable, false),
        forma_pago = btrim(p_forma_pago), dia_del_mes = p_dia_del_mes, dias_para_vencer = p_dias_para_vencer,
        desde = p_desde, hasta = p_hasta, observaciones = nullif(btrim(p_observaciones), ''), updated_at = now()
    where id = p_id
    returning id into v_id;
  if v_id is null then
    raise exception 'No encontramos ese gasto que se repite. Recargá la página.';
  end if;
  return v_id;
end;
$$;

revoke execute on function public.gastos_recurrente_guardar(uuid, text, text, text, text, uuid, numeric, boolean, text, int, int, date, date, text) from public, anon;
grant execute on function public.gastos_recurrente_guardar(uuid, text, text, text, text, uuid, numeric, boolean, text, int, int, date, date, text) to authenticated;

-- Pausar no borra lo que ya se generó.
create or replace function public.gastos_recurrente_activar(p_id uuid default null, p_activo boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede pausar gastos que se repiten.';
  end if;
  update gastos_recurrentes set activo = coalesce(p_activo, true), updated_at = now() where id = p_id;
  if not found then
    raise exception 'No encontramos ese gasto que se repite. Recargá la página.';
  end if;
end;
$$;

revoke execute on function public.gastos_recurrente_activar(uuid, boolean) from public, anon;
grant execute on function public.gastos_recurrente_activar(uuid, boolean) to authenticated;

-- Eliminar solo si nunca generó nada; si generó, se pausa.
create or replace function public.gastos_recurrente_eliminar(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede eliminar gastos que se repiten.';
  end if;
  if exists (select 1 from gastos where recurrente_id = p_id) then
    raise exception 'Ya generó gastos: no se elimina, pausalo. Los gastos generados quedan como están.';
  end if;
  delete from gastos_recurrentes where id = p_id;
end;
$$;

revoke execute on function public.gastos_recurrente_eliminar(uuid) from public, anon;
grant execute on function public.gastos_recurrente_eliminar(uuid) to authenticated;

-- Para la lista: cuántos generó, el último y el próximo.
create or replace view public.v_gastos_recurrentes as
select r.*,
       pr.nombre as proveedor_nombre,
       u.periodo as ultimo_periodo,
       u.monto as ultimo_monto,
       coalesce(c.generados, 0) as generados,
       case when r.activo then (
         select f from (
           select _gastos_dia_del_periodo(m::date, r.dia_del_mes) as f
           from generate_series(date_trunc('month', greatest(r.desde, (now() at time zone 'America/Argentina/Buenos_Aires')::date)),
                                date_trunc('month', greatest(r.desde, (now() at time zone 'America/Argentina/Buenos_Aires')::date)) + interval '1 month',
                                interval '1 month') m
         ) x
         where x.f >= greatest(r.desde, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
           and not exists (select 1 from gastos g where g.recurrente_id = r.id and g.periodo = to_char(x.f, 'YYYY-MM'))
           and (r.hasta is null or x.f <= r.hasta)
         order by x.f limit 1
       ) end as proximo
from gastos_recurrentes r
left join proveedores pr on pr.id = r.proveedor_id
left join lateral (select g.periodo, g.monto from gastos g where g.recurrente_id = r.id order by g.periodo desc limit 1) u on true
left join lateral (select count(*) as generados from gastos g where g.recurrente_id = r.id) c on true
where es_admin();

grant select on public.v_gastos_recurrentes to authenticated;

-- ----------------------------------------------------------------------------
-- Eliminar un gasto generado por una plantilla lo anula (queda ocupando su
-- mes): si se borrara, la próxima generación lo volvería a crear.
-- Cuerpo de 20261103210000 con ese caso agregado.
-- ----------------------------------------------------------------------------
create or replace function public.gastos_eliminar(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto   gastos%rowtype;
  v_factura compras_facturas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede eliminar gastos.';
  end if;
  select * into v_gasto from gastos where id = p_id for update;
  if not found then
    return;
  end if;
  select * into v_factura from compras_facturas where gasto_id = v_gasto.id;
  if found then
    raise exception 'Este gasto salió de la factura %: no se elimina desde acá. Si la factura está mal, anulala.', v_factura.numero;
  end if;
  if v_gasto.origen = 'fudo' then
    raise exception 'Este gasto viene de Fudo: no se elimina desde acá. Si está mal, se anula en Fudo.';
  end if;
  if exists (select 1 from gastos_pagos where gasto_id = v_gasto.id and anulado_en is null) then
    raise exception 'Este gasto tiene pagos registrados: anulalos antes de eliminarlo.';
  end if;
  if v_gasto.recurrente_id is not null then
    update gastos set estado = 'Anulado', a_confirmar = false where id = v_gasto.id;
    return;
  end if;
  delete from gastos where id = v_gasto.id;
end;
$$;
