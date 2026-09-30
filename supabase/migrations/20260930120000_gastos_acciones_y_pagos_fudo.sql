-- ============================================================================
-- Sección Gastos rehecha (2026-09-30): editar, eliminar, registrar y deshacer
-- pagos por RPC, y el registro de pagos de gastos de Fudo.
--
-- Un gasto que salió de una factura de compras (compras_facturas.gasto_id, F5)
-- no deja cambiar el monto ni el proveedor, y no se elimina desde Gastos: se
-- corrige o se anula la factura.
--
-- Pagos de Fudo: 20260622200306_009_fudo_pagos_v2.sql quiso crear fudo_pagos
-- para anotar los pagos hechos desde la app, pero la tabla ya existía con la
-- forma de la sincronización de Fudo (create table if not exists no hizo nada).
-- El registro nunca existió y "Dar pago" sobre un gasto de Fudo fallaba
-- siempre. Va en una tabla propia, fudo_gastos_pagados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pagos de gastos de Fudo registrados desde la app.
-- ----------------------------------------------------------------------------
create table if not exists public.fudo_gastos_pagados (
  id               uuid primary key default gen_random_uuid(),
  fudo_expense_id  text not null,
  sucursal         text not null,
  descripcion      text,
  monto            numeric(14,2) not null,
  fecha_gasto      date,
  fecha_pago       date not null,
  forma_pago       text not null,
  caja             text not null,
  comprobante_url  text,
  pagado_por       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  constraint fudo_gastos_pagados_unico unique (fudo_expense_id, sucursal)
);
create index if not exists idx_fudo_gastos_pagados_fecha on public.fudo_gastos_pagados (fecha_pago desc);

alter table public.fudo_gastos_pagados enable row level security;
drop policy if exists fudo_gastos_pagados_admin on public.fudo_gastos_pagados;
create policy fudo_gastos_pagados_admin on public.fudo_gastos_pagados
  for select using (es_admin());

-- ----------------------------------------------------------------------------
-- 2. Vista de gastos con nombres y la factura de la que salió.
-- ----------------------------------------------------------------------------
create or replace view public.v_gastos as
select
  g.id, g.fecha, g.local, g.rubro, g.categoria, g.proveedor_id, g.monto, g.forma_pago, g.estado,
  g.observaciones, g.comprobante_url, g.fecha_pago, g.caja, g.created_at,
  pr.nombre as proveedor_nombre,
  pc.nombre as creado_por_nombre,
  pp.nombre as pagado_por_nombre,
  f.id as factura_id,
  f.numero as factura_numero,
  ped.numero as factura_pedido_numero
from gastos g
left join proveedores pr on pr.id = g.proveedor_id
left join profiles pc on pc.id = g.created_by
left join profiles pp on pp.id = g.pagado_por
left join compras_facturas f on f.gasto_id = g.id
left join compras_pedidos ped on ped.id = f.pedido_id
where es_admin();

grant select on public.v_gastos to authenticated;

create or replace view public.v_fudo_gastos_pagados as
select p.*, pr.nombre as pagado_por_nombre
from fudo_gastos_pagados p
left join profiles pr on pr.id = p.pagado_por
where es_admin();

grant select on public.v_fudo_gastos_pagados to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Gastos: alta/edición, pago, deshacer pago, eliminar.
-- ----------------------------------------------------------------------------

-- Alta (p_id null) o edición. p_pago solo se usa en el alta: un gasto que se
-- carga ya pagado ({fecha_pago, caja, comprobante_url}), en la misma transacción.
create or replace function public.gastos_guardar(
  p_id uuid default null,
  p_fecha date default null,
  p_local text default null,
  p_rubro text default null,
  p_categoria text default null,
  p_proveedor_id uuid default null,
  p_monto numeric default null,
  p_forma_pago text default null,
  p_observaciones text default null,
  p_pago jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto   gastos%rowtype;
  v_factura compras_facturas%rowtype;
  v_id      uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar gastos.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha del gasto.';
  end if;
  if nullif(btrim(p_local), '') is null then
    raise exception 'Elegí el local al que corresponde el gasto.';
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

  if p_id is null then
    if p_pago is not null and (
      nullif(p_pago->>'fecha_pago', '') is null or nullif(btrim(p_pago->>'caja'), '') is null
    ) then
      raise exception 'Para cargarlo como pagado, elegí la fecha de pago y la caja.';
    end if;

    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones,
                        created_by, fecha_pago, caja, comprobante_url, pagado_por)
    values (
      p_fecha, btrim(p_local), btrim(p_rubro), btrim(p_categoria), p_proveedor_id, round(p_monto, 2),
      btrim(p_forma_pago),
      case when p_pago is null then 'Pendiente de pago' else 'Pagado' end,
      nullif(btrim(p_observaciones), ''),
      auth.uid(),
      (p_pago->>'fecha_pago')::date,
      nullif(btrim(p_pago->>'caja'), ''),
      nullif(btrim(p_pago->>'comprobante_url'), ''),
      case when p_pago is null then null else auth.uid() end
    )
    returning id into v_id;
    return v_id;
  end if;

  select * into v_gasto from gastos where id = p_id for update;
  if not found then
    raise exception 'No encontramos el gasto. Puede que alguien lo haya eliminado: recargá la página.';
  end if;

  select * into v_factura from compras_facturas where gasto_id = v_gasto.id;
  if found and (round(p_monto, 2) <> v_gasto.monto or p_proveedor_id is distinct from v_gasto.proveedor_id) then
    raise exception 'Este gasto salió de la factura %: el monto y el proveedor se corrigen en la factura.', v_factura.numero;
  end if;

  update gastos
    set fecha = p_fecha,
        local = btrim(p_local),
        rubro = btrim(p_rubro),
        categoria = btrim(p_categoria),
        proveedor_id = p_proveedor_id,
        monto = round(p_monto, 2),
        forma_pago = btrim(p_forma_pago),
        observaciones = nullif(btrim(p_observaciones), '')
    where id = v_gasto.id;

  return v_gasto.id;
end;
$$;

revoke execute on function public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb) from public, anon;
grant execute on function public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb) to authenticated;

create or replace function public.gastos_registrar_pago(
  p_id uuid default null,
  p_fecha_pago date default null,
  p_forma_pago text default null,
  p_caja text default null,
  p_comprobante_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto gastos%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede registrar pagos.';
  end if;
  if p_fecha_pago is null then
    raise exception 'Elegí la fecha del pago.';
  end if;
  if nullif(btrim(p_forma_pago), '') is null then
    raise exception 'Elegí la forma de pago.';
  end if;
  if nullif(btrim(p_caja), '') is null then
    raise exception 'Elegí de qué caja salió la plata.';
  end if;

  select * into v_gasto from gastos where id = p_id for update;
  if not found then
    raise exception 'No encontramos el gasto. Puede que alguien lo haya eliminado: recargá la página.';
  end if;
  if v_gasto.estado = 'Pagado' then
    raise exception 'Ese gasto ya está pagado. Recargá la página para verlo al día.';
  end if;

  update gastos
    set estado = 'Pagado',
        fecha_pago = p_fecha_pago,
        forma_pago = btrim(p_forma_pago),
        caja = btrim(p_caja),
        comprobante_url = coalesce(nullif(btrim(p_comprobante_url), ''), comprobante_url),
        pagado_por = auth.uid()
    where id = v_gasto.id;
end;
$$;

revoke execute on function public.gastos_registrar_pago(uuid, date, text, text, text) from public, anon;
grant execute on function public.gastos_registrar_pago(uuid, date, text, text, text) to authenticated;

-- Deshacer un pago cargado por error: vuelve a pendiente y se olvida de la
-- fecha, la caja y el comprobante de ese pago.
create or replace function public.gastos_deshacer_pago(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto gastos%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede deshacer pagos.';
  end if;
  select * into v_gasto from gastos where id = p_id for update;
  if not found then
    raise exception 'No encontramos el gasto. Recargá la página.';
  end if;
  if v_gasto.estado <> 'Pagado' then
    raise exception 'Ese gasto no está pagado. Recargá la página para verlo al día.';
  end if;

  update gastos
    set estado = 'Pendiente de pago',
        fecha_pago = null,
        caja = null,
        comprobante_url = null,
        pagado_por = null
    where id = v_gasto.id;
end;
$$;

revoke execute on function public.gastos_deshacer_pago(uuid) from public, anon;
grant execute on function public.gastos_deshacer_pago(uuid) to authenticated;

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
  delete from gastos where id = v_gasto.id;
end;
$$;

revoke execute on function public.gastos_eliminar(uuid) from public, anon;
grant execute on function public.gastos_eliminar(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Pagos de Fudo: registrar y deshacer.
-- ----------------------------------------------------------------------------
create or replace function public.fudo_registrar_pago(
  p_fudo_expense_id text default null,
  p_sucursal text default null,
  p_descripcion text default null,
  p_monto numeric default null,
  p_fecha_gasto date default null,
  p_fecha_pago date default null,
  p_forma_pago text default null,
  p_caja text default null,
  p_comprobante_url text default null
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
    raise exception 'Solo un administrador puede registrar pagos.';
  end if;
  if nullif(btrim(p_fudo_expense_id), '') is null or nullif(btrim(p_sucursal), '') is null then
    raise exception 'No encontramos ese gasto de Fudo. Recargá la página.';
  end if;
  if p_monto is null then
    raise exception 'Ese gasto de Fudo no tiene monto. Revisalo en Fudo.';
  end if;
  if p_fecha_pago is null then
    raise exception 'Elegí la fecha del pago.';
  end if;
  if nullif(btrim(p_forma_pago), '') is null then
    raise exception 'Elegí la forma de pago.';
  end if;
  if nullif(btrim(p_caja), '') is null then
    raise exception 'Elegí de qué caja salió la plata.';
  end if;

  insert into fudo_gastos_pagados (fudo_expense_id, sucursal, descripcion, monto, fecha_gasto, fecha_pago,
                                   forma_pago, caja, comprobante_url, pagado_por)
  values (btrim(p_fudo_expense_id), btrim(p_sucursal), nullif(btrim(p_descripcion), ''), round(p_monto, 2),
          p_fecha_gasto, p_fecha_pago, btrim(p_forma_pago), btrim(p_caja), nullif(btrim(p_comprobante_url), ''),
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.fudo_registrar_pago(text, text, text, numeric, date, date, text, text, text) from public, anon;
grant execute on function public.fudo_registrar_pago(text, text, text, numeric, date, date, text, text, text) to authenticated;

create or replace function public.fudo_deshacer_pago(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede deshacer pagos.';
  end if;
  delete from fudo_gastos_pagados where id = p_id;
end;
$$;

revoke execute on function public.fudo_deshacer_pago(uuid) from public, anon;
grant execute on function public.fudo_deshacer_pago(uuid) to authenticated;
