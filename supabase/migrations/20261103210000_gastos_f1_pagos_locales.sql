-- ============================================================================
-- Gastos F1 (2026-11-03): locales, pagos con historial, vencimiento y adjuntos.
--
-- - locales_config pasa a ser la lista de locales de toda la app (los 9 de
--   gastos), con tiene_fudo (las sucursales que se consultan en Fudo),
--   caja_default (la caja de los pagos que vengan de Fudo) y orden.
--   gastos.local tiene FK a locales_config.sucursal.
-- - Los pagos salen de gastos y van a gastos_pagos: puede haber varios (pago
--   parcial) y deshacer uno lo anula, no lo borra. El estado del gasto lo
--   calcula gastos_recalcular_estado a partir de la suma de pagos vigentes.
-- - fecha_vencimiento, adjuntos del gasto (gastos_adjuntos) y las columnas de
--   origen, de Fudo y de recurrentes que usan F3 y F4, para no migrar dos veces.
-- - v_gastos sigue exponiendo fecha_pago, caja, comprobante_url y
--   pagado_por_nombre (del último pago vigente): la pantalla anterior sigue
--   andando con la vista nueva.
-- - Las funciones de Compras que tocaban las columnas de pago (notas de
--   crédito) y la que crea el gasto de una factura se ajustan sin otro cambio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Locales.
-- ----------------------------------------------------------------------------
alter table public.locales_config
  add column if not exists tiene_fudo   boolean not null default false,
  add column if not exists caja_default text references public.cajas(nombre) on update cascade on delete set null,
  add column if not exists orden        integer not null default 0;

-- Las que ya estaban son las sucursales con Fudo.
update public.locales_config set tiene_fudo = true;

insert into public.locales_config (sucursal, activo, tiene_fudo)
values ('YA! FABRICA', true, false), ('YA! ITUZAINGO', true, false), ('YA! GOYA', true, false), ('CHURROS TUBO', true, false)
on conflict (sucursal) do nothing;

update public.locales_config l
  set orden = o.orden,
      caja_default = coalesce(l.caja_default, (select c.nombre from public.cajas c where c.nombre = o.caja))
  from (values
    ('YA! FABRICA', 1, null), ('YA! SAN LORENZO', 2, 'San Lorenzo'), ('YA! PARAGUAY', 3, 'Paraguay'),
    ('YA! IRIGOYEN', 4, 'Irigoyen'), ('YA! CORDOBA', 5, 'Cordoba'), ('YA! ITUZAINGO', 6, 'Ituzaingo'),
    ('YA! GOYA', 7, 'Goya'), ('YA! UNIDAD', 8, 'La unidad'), ('CHURROS TUBO', 9, null)
  ) as o(sucursal, orden, caja)
  where l.sucursal = o.sucursal;

-- Un gasto viejo con un local que no está en la lista: el local se agrega
-- inactivo (no se ofrece para cargar, pero el gasto lo conserva).
insert into public.locales_config (sucursal, activo, tiene_fudo, orden)
select distinct g.local, false, false, 99
from public.gastos g
where not exists (select 1 from public.locales_config l where l.sucursal = g.local)
on conflict (sucursal) do nothing;

alter table public.gastos
  add constraint gastos_local_fkey foreign key (local)
  references public.locales_config(sucursal) on update cascade;

-- ----------------------------------------------------------------------------
-- 2. Columnas nuevas de gastos.
-- ----------------------------------------------------------------------------
alter table public.gastos
  add column if not exists origen               text not null default 'manual',
  add column if not exists fecha_vencimiento    date,
  -- F3: gastos sincronizados desde Fudo (solo lectura de Fudo).
  add column if not exists fudo_id              text,
  add column if not exists fudo_categoria       text,
  add column if not exists fudo_proveedor       text,
  add column if not exists fudo_estado          text,
  add column if not exists fudo_revisar         boolean not null default false,
  add column if not exists fudo_sincronizado_en timestamptz,
  -- F4: gastos que se repiten (la FK a gastos_recurrentes entra con la tabla).
  add column if not exists recurrente_id        uuid,
  add column if not exists periodo              text,
  add column if not exists a_confirmar          boolean not null default false;

alter table public.gastos
  add constraint gastos_origen_check check (origen in ('manual', 'factura', 'fudo', 'recurrente'));

update public.gastos g
  set origen = 'factura'
  from public.compras_facturas f
  where f.gasto_id = g.id and f.gasto_generado;

-- Un gasto de Fudo entra sin clasificar hasta que exista el plan de cuentas.
alter table public.gastos alter column rubro drop not null, alter column categoria drop not null;
alter table public.gastos
  add constraint gastos_clasificado_check check (origen = 'fudo' or (rubro is not null and categoria is not null));

-- 'Anulado': un gasto de Fudo que se canceló allá (F3). No suma en ningún total.
alter table public.gastos drop constraint if exists gastos_estado_check;
alter table public.gastos
  add constraint gastos_estado_check check (estado in ('Pendiente de pago', 'Parcial', 'Pagado', 'Anulado'));

create unique index if not exists gastos_fudo_unico on public.gastos (local, fudo_id) where fudo_id is not null;
create index if not exists idx_gastos_fecha on public.gastos (fecha desc, created_at desc);
create index if not exists idx_gastos_local_fecha on public.gastos (local, fecha desc);
create index if not exists idx_gastos_pendientes on public.gastos (local, fecha) where estado in ('Pendiente de pago', 'Parcial');

-- ----------------------------------------------------------------------------
-- 3. Pagos.
-- ----------------------------------------------------------------------------
create table if not exists public.gastos_pagos (
  id               uuid primary key default gen_random_uuid(),
  gasto_id         uuid not null references public.gastos(id) on delete cascade,
  fecha            date not null,
  monto            numeric(14,2) not null check (monto > 0),
  forma_pago       text not null,
  -- Null solo en pagos migrados que no tenían caja.
  caja             text,
  -- Ruta en el bucket privado comprobantes (o la URL completa de los registros viejos).
  comprobante_url  text,
  origen           text not null default 'app' check (origen in ('app', 'fudo')),
  fudo_payment_id  text,
  registrado_por   uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid references public.profiles(id) on delete set null,
  anulado_motivo   text
);
create index if not exists idx_gastos_pagos_gasto on public.gastos_pagos (gasto_id) where anulado_en is null;
create index if not exists idx_gastos_pagos_fecha on public.gastos_pagos (fecha) where anulado_en is null;

alter table public.gastos_pagos enable row level security;
drop policy if exists gastos_pagos_admin_lee on public.gastos_pagos;
create policy gastos_pagos_admin_lee on public.gastos_pagos for select using (es_admin());

-- Los pagos que ya estaban: uno por el total. Un gasto en $ 0 (cancelado con
-- una nota de crédito) queda pagado sin pago.
insert into public.gastos_pagos (gasto_id, fecha, monto, forma_pago, caja, comprobante_url, origen, registrado_por, created_at)
select g.id, coalesce(g.fecha_pago, g.fecha), g.monto, g.forma_pago, nullif(btrim(g.caja), ''),
       nullif(btrim(g.comprobante_url), ''), 'app', g.pagado_por, coalesce(g.created_at, now())
from public.gastos g
where g.estado = 'Pagado' and g.monto > 0;

-- "Parcial" nunca tuvo monto: vuelve a pendiente con una nota.
update public.gastos
  set estado = 'Pendiente de pago',
      observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
        'Estaba marcado como pagado en parte, sin monto: se registra el pago cuando se sepa cuánto se pagó.')
  where estado = 'Parcial';

drop view if exists public.v_gastos;
alter table public.gastos
  drop column if exists fecha_pago,
  drop column if exists caja,
  drop column if exists comprobante_url,
  drop column if exists pagado_por;

-- ----------------------------------------------------------------------------
-- 4. Adjuntos del gasto (factura o ticket), en el bucket comprobantes.
-- ----------------------------------------------------------------------------
create table if not exists public.gastos_adjuntos (
  id          uuid primary key default gen_random_uuid(),
  gasto_id    uuid not null references public.gastos(id) on delete cascade,
  ruta        text not null,
  nombre      text not null,
  tipo        text,
  tamano      bigint,
  subido_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_gastos_adjuntos_gasto on public.gastos_adjuntos (gasto_id);

alter table public.gastos_adjuntos enable row level security;
drop policy if exists gastos_adjuntos_admin_lee on public.gastos_adjuntos;
create policy gastos_adjuntos_admin_lee on public.gastos_adjuntos for select using (es_admin());

-- Quitar un adjunto borra el archivo: hasta ahora el bucket no dejaba borrar.
drop policy if exists "Admins delete comprobantes" on storage.objects;
create policy "Admins delete comprobantes" on storage.objects
  for delete using (bucket_id = 'comprobantes' and es_admin());

-- ----------------------------------------------------------------------------
-- 5. Vistas.
-- ----------------------------------------------------------------------------
create view public.v_gastos as
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
  -- Del último pago vigente (la pantalla anterior los lee con estos nombres).
  up.fecha as fecha_pago,
  up.caja,
  up.comprobante_url,
  up.forma_pago as ultimo_pago_forma,
  pp.nombre as pagado_por_nombre
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

grant select on public.v_gastos to authenticated;

create or replace view public.v_gastos_pagos as
select p.*, rp.nombre as registrado_por_nombre, ap.nombre as anulado_por_nombre
from gastos_pagos p
left join profiles rp on rp.id = p.registrado_por
left join profiles ap on ap.id = p.anulado_por
where es_admin();

grant select on public.v_gastos_pagos to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Estado del gasto: sale de la suma de pagos vigentes.
-- ----------------------------------------------------------------------------
-- Interna: la llaman las otras funciones, con la fila ya bloqueada.
create or replace function public.gastos_recalcular_estado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto  gastos%rowtype;
  v_pagado numeric;
  v_estado text;
begin
  select * into v_gasto from gastos where id = p_id;
  if not found or v_gasto.estado = 'Anulado' then
    return v_gasto.estado;
  end if;
  select coalesce(sum(monto), 0) into v_pagado
  from gastos_pagos where gasto_id = p_id and anulado_en is null;

  v_estado := case
    when v_pagado >= v_gasto.monto then 'Pagado'
    when v_pagado > 0 then 'Parcial'
    else 'Pendiente de pago'
  end;
  if v_estado is distinct from v_gasto.estado then
    update gastos set estado = v_estado where id = p_id;
  end if;
  return v_estado;
end;
$$;

revoke execute on function public.gastos_recalcular_estado(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Alta y edición.
-- ----------------------------------------------------------------------------
drop function if exists public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb);

-- p_pago solo en el alta: el gasto se carga ya pagado por el total
-- ({fecha_pago, caja, comprobante_url}), en la misma transacción.
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
  p_pago jsonb default null,
  p_fecha_vencimiento date default null
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
  v_monto   numeric := round(p_monto, 2);
  v_pagado  numeric;
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
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a 0.';
  end if;
  if nullif(btrim(p_forma_pago), '') is null then
    raise exception 'Elegí la forma de pago.';
  end if;

  if p_id is null then
    if nullif(btrim(p_rubro), '') is null or nullif(btrim(p_categoria), '') is null then
      raise exception 'Elegí el rubro y la categoría.';
    end if;
    if not exists (select 1 from locales_config where sucursal = btrim(p_local) and activo is not false) then
      raise exception 'Ese local no está en la lista de locales. Recargá la página y elegí de nuevo.';
    end if;
    if p_pago is not null and (
      nullif(p_pago->>'fecha_pago', '') is null or nullif(btrim(p_pago->>'caja'), '') is null
    ) then
      raise exception 'Para cargarlo como pagado, elegí la fecha de pago y la caja.';
    end if;

    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones,
                        created_by, fecha_vencimiento, origen)
    values (
      p_fecha, btrim(p_local), btrim(p_rubro), btrim(p_categoria), p_proveedor_id, v_monto,
      btrim(p_forma_pago), 'Pendiente de pago', nullif(btrim(p_observaciones), ''), auth.uid(),
      p_fecha_vencimiento, 'manual'
    )
    returning id into v_id;

    if p_pago is not null then
      insert into gastos_pagos (gasto_id, fecha, monto, forma_pago, caja, comprobante_url, registrado_por)
      values (v_id, (p_pago->>'fecha_pago')::date, v_monto, btrim(p_forma_pago), btrim(p_pago->>'caja'),
              nullif(btrim(p_pago->>'comprobante_url'), ''), auth.uid());
      perform gastos_recalcular_estado(v_id);
    end if;
    return v_id;
  end if;

  select * into v_gasto from gastos where id = p_id for update;
  if not found then
    raise exception 'No encontramos el gasto. Puede que alguien lo haya eliminado: recargá la página.';
  end if;
  if v_gasto.estado = 'Anulado' then
    raise exception 'Este gasto está anulado: no se edita.';
  end if;
  -- Un gasto de Fudo se clasifica en la app; el resto lo manda Fudo.
  if v_gasto.origen = 'fudo' then
    if v_monto <> v_gasto.monto or p_proveedor_id is distinct from v_gasto.proveedor_id
       or p_fecha <> v_gasto.fecha or btrim(p_local) <> v_gasto.local then
      raise exception 'Este gasto viene de Fudo: el monto, la fecha, el local y el proveedor se corrigen en Fudo.';
    end if;
  elsif nullif(btrim(p_rubro), '') is null or nullif(btrim(p_categoria), '') is null then
    raise exception 'Elegí el rubro y la categoría.';
  end if;

  select * into v_factura from compras_facturas where gasto_id = v_gasto.id;
  if found and (v_monto <> v_gasto.monto or p_proveedor_id is distinct from v_gasto.proveedor_id) then
    raise exception 'Este gasto salió de la factura %: el monto y el proveedor se corrigen en la factura.', v_factura.numero;
  end if;

  if btrim(p_local) <> v_gasto.local
     and not exists (select 1 from locales_config where sucursal = btrim(p_local) and activo is not false) then
    raise exception 'Ese local no está en la lista de locales. Recargá la página y elegí de nuevo.';
  end if;

  select coalesce(sum(monto), 0) into v_pagado from gastos_pagos where gasto_id = v_gasto.id and anulado_en is null;
  if v_monto < v_pagado then
    raise exception 'Ya se pagaron % de este gasto: el monto no puede ser menor. Si un pago está mal, anulalo primero.',
      _compras_pesos_txt(v_pagado);
  end if;

  update gastos
    set fecha = p_fecha,
        local = btrim(p_local),
        rubro = nullif(btrim(p_rubro), ''),
        categoria = nullif(btrim(p_categoria), ''),
        proveedor_id = p_proveedor_id,
        monto = v_monto,
        forma_pago = btrim(p_forma_pago),
        observaciones = nullif(btrim(p_observaciones), ''),
        fecha_vencimiento = p_fecha_vencimiento,
        a_confirmar = false
    where id = v_gasto.id;

  perform gastos_recalcular_estado(v_gasto.id);
  return v_gasto.id;
end;
$$;

revoke execute on function public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb, date) from public, anon;
grant execute on function public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Pagos: registrar, anular, deshacer (compatibilidad) y eliminar el gasto.
-- ----------------------------------------------------------------------------
drop function if exists public.gastos_registrar_pago(uuid, date, text, text, text);

-- p_monto null = el saldo (paga lo que falta). No se paga de más.
create or replace function public.gastos_registrar_pago(
  p_id uuid default null,
  p_fecha_pago date default null,
  p_forma_pago text default null,
  p_caja text default null,
  p_comprobante_url text default null,
  p_monto numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto  gastos%rowtype;
  v_pagado numeric;
  v_saldo  numeric;
  v_monto  numeric;
  v_id     uuid;
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
  if v_gasto.estado = 'Anulado' then
    raise exception 'Este gasto está anulado: no se paga.';
  end if;

  select coalesce(sum(monto), 0) into v_pagado from gastos_pagos where gasto_id = v_gasto.id and anulado_en is null;
  v_saldo := v_gasto.monto - v_pagado;
  if v_saldo <= 0 then
    raise exception 'Ese gasto ya está pagado. Recargá la página para verlo al día.';
  end if;

  v_monto := round(coalesce(p_monto, v_saldo), 2);
  if v_monto <= 0 then
    raise exception 'El monto del pago tiene que ser mayor a 0.';
  end if;
  if v_monto > v_saldo then
    raise exception 'El pago es mayor a lo que falta pagar (%).', _compras_pesos_txt(v_saldo);
  end if;

  insert into gastos_pagos (gasto_id, fecha, monto, forma_pago, caja, comprobante_url, registrado_por)
  values (v_gasto.id, p_fecha_pago, v_monto, btrim(p_forma_pago), btrim(p_caja),
          nullif(btrim(p_comprobante_url), ''), auth.uid())
  returning id into v_id;

  perform gastos_recalcular_estado(v_gasto.id);
  return v_id;
end;
$$;

revoke execute on function public.gastos_registrar_pago(uuid, date, text, text, text, numeric) from public, anon;
grant execute on function public.gastos_registrar_pago(uuid, date, text, text, text, numeric) to authenticated;

-- Anular un pago cargado por error: queda en el historial, no suma.
create or replace function public.gastos_anular_pago(p_pago_id uuid default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago gastos_pagos%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular pagos.';
  end if;
  select * into v_pago from gastos_pagos where id = p_pago_id;
  if not found then
    raise exception 'No encontramos ese pago. Recargá la página.';
  end if;
  perform 1 from gastos where id = v_pago.gasto_id for update;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago ya está anulado. Recargá la página para verlo al día.';
  end if;
  if v_pago.origen = 'fudo' then
    raise exception 'Ese pago viene de Fudo: no se anula desde acá.';
  end if;

  update gastos_pagos
    set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = nullif(btrim(p_motivo), '')
    where id = v_pago.id;
  perform gastos_recalcular_estado(v_pago.gasto_id);
end;
$$;

revoke execute on function public.gastos_anular_pago(uuid, text) from public, anon;
grant execute on function public.gastos_anular_pago(uuid, text) to authenticated;

-- Compatibilidad con la pantalla anterior ("Deshacer pago"): anula todos los
-- pagos vigentes de la app y el gasto vuelve a pendiente.
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
  if not exists (select 1 from gastos_pagos where gasto_id = v_gasto.id and anulado_en is null and origen = 'app') then
    raise exception 'Ese gasto no tiene pagos para deshacer. Recargá la página para verlo al día.';
  end if;

  update gastos_pagos
    set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = 'Se deshizo el pago desde Gastos.'
    where gasto_id = v_gasto.id and anulado_en is null and origen = 'app';
  perform gastos_recalcular_estado(v_gasto.id);
end;
$$;

-- Un gasto con pagos vigentes no se elimina (perdería el historial).
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
  delete from gastos where id = v_gasto.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Adjuntos: registrar y quitar (el archivo lo sube y lo borra la app).
-- ----------------------------------------------------------------------------
create or replace function public.gastos_agregar_adjunto(
  p_gasto_id uuid default null,
  p_ruta text default null,
  p_nombre text default null,
  p_tipo text default null,
  p_tamano bigint default null
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
    raise exception 'Solo un administrador puede adjuntar archivos.';
  end if;
  if not exists (select 1 from gastos where id = p_gasto_id) then
    raise exception 'No encontramos el gasto. Recargá la página.';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_nombre), '') is null then
    raise exception 'No se pudo registrar el archivo. Probá subirlo de nuevo.';
  end if;
  insert into gastos_adjuntos (gasto_id, ruta, nombre, tipo, tamano, subido_por)
  values (p_gasto_id, btrim(p_ruta), btrim(p_nombre), nullif(btrim(p_tipo), ''), p_tamano, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.gastos_agregar_adjunto(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.gastos_agregar_adjunto(uuid, text, text, text, bigint) to authenticated;

-- Devuelve la ruta para que la app borre el archivo del bucket.
create or replace function public.gastos_quitar_adjunto(p_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruta text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede quitar archivos.';
  end if;
  delete from gastos_adjuntos where id = p_id returning ruta into v_ruta;
  return v_ruta;
end;
$$;

revoke execute on function public.gastos_quitar_adjunto(uuid) from public, anon;
grant execute on function public.gastos_quitar_adjunto(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Compras: el gasto de una factura nace con origen 'factura', y las notas
--     de crédito ya no escriben las columnas de pago (se fueron de gastos).
--     Cuerpos de 20261005180000 y 20261006150000 con solo esos cambios.
-- ----------------------------------------------------------------------------
create or replace function public.compras_confirmar_factura(
  p_factura_id uuid default null,
  p_mercaderia_llego boolean default null,
  p_actualizar_precios boolean default false,
  p_gasto_existente_id uuid default null,
  p_gasto_local text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_remito     compras_remitos%rowtype;
  v_gasto      gastos%rowtype;
  v_codigo     text;
  v_codigo_ped text;
  v_tiene_rem  boolean;
  v_mov        record;
  v_despues    numeric;
  v_impacto    jsonb := '[]'::jsonb;
  v_gasto_id   uuid;
  v_generado   boolean := false;
  v_local      text;
  -- A2b
  v_lote       uuid := gen_random_uuid();
  v_precio     record;
  v_par        compras_item_proveedores%rowtype;
  v_precios    int := 0;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede confirmar facturas.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;
  v_codigo_ped := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if v_factura.estado <> 'borrador' then
    raise exception 'La factura ya está %.', v_factura.estado;
  end if;
  if not exists (select 1 from compras_factura_items where factura_id = v_factura.id) then
    raise exception 'La factura no tiene líneas.';
  end if;

  -- El gasto se valida antes de mover stock: si falla, no queda nada a medias.
  if p_gasto_existente_id is not null then
    select * into v_gasto from gastos where id = p_gasto_existente_id for update;
    if not found then
      raise exception 'Ese gasto ya no existe. Recargá la página y elegí de nuevo.';
    end if;
    if v_gasto.proveedor_id is distinct from v_factura.proveedor_id then
      raise exception 'Ese gasto es de otro proveedor: no se puede vincular a esta factura.';
    end if;
    if exists (select 1 from compras_facturas where gasto_id = v_gasto.id) then
      raise exception 'Ese gasto ya está vinculado a otra factura. Recargá la página y elegí de nuevo.';
    end if;
  else
    v_local := coalesce(
      nullif(btrim(p_gasto_local), ''),
      (select valor #>> '{}' from compras_config where clave = 'gasto.local'),
      'YA! FABRICA'
    );
  end if;

  v_tiene_rem := exists (select 1 from compras_remitos where pedido_id = v_pedido.id);
  if not v_tiene_rem and p_mercaderia_llego is null then
    raise exception 'El pedido no tiene remitos: contanos si la mercadería ya llegó.';
  end if;

  if not v_tiene_rem and p_mercaderia_llego then
    update compras_pedidos
      set ultima_secuencia_remito = greatest(
        ultima_secuencia_remito,
        (select coalesce(max(secuencia), 0) from compras_remitos where pedido_id = v_pedido.id)
      ) + 1
      where id = v_pedido.id
      returning ultima_secuencia_remito into v_pedido.ultima_secuencia_remito;

    insert into compras_remitos (pedido_id, secuencia, fecha, creado_por, origen, factura_id)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, v_factura.fecha, auth.uid(), 'factura', v_factura.id)
    returning * into v_remito;
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

    -- Solo lo que es mercadería: líneas con insumo o que corresponden al pedido
    -- (una línea libre sin insumo, como el flete, no es un ítem recibido: FA7).
    -- A2b: cantidad son las cajas (también cuando se cobra por kg); los kg van aparte.
    insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)
    select v_remito.id, fi.pedido_item_id, fi.item_id, fi.descripcion, fi.cantidad,
           case when fi.item_id is not null then fi.cantidad_base end
    from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.cantidad > 0
      and (fi.item_id is not null or fi.pedido_item_id is not null);

    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, v_mov.total, 'entrada_remito',
        'Remito ' || v_codigo || ' (desde factura ' || v_factura.numero || ')',
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;

    -- A2b (E10)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id, 'factura_numero', v_factura.numero,
      'lineas', compras_lineas_remito_snapshot(v_remito.id)));
  end if;

  -- A2b (E7): el precio de referencia viaja con su unidad. Un insumo puede venir
  -- en más de una línea: se usa la última de la factura (la más abajo en el papel).
  -- Orden de bloqueo: pedido → factura → stock → par (FOR UPDATE) → KEY SHARE del
  -- insumo (historial). compras_guardar_insumo toma NO KEY UPDATE: no se cruzan.
  if coalesce(p_actualizar_precios, false) then
    for v_precio in
      select distinct on (fi.item_id) fi.item_id, fi.precio_unitario, fi.precio_por
      from compras_factura_items fi
      where fi.factura_id = v_factura.id and fi.item_id is not null and fi.precio_unitario > 0
      order by fi.item_id, fi.orden desc, fi.id desc
    loop
      select * into v_par from compras_item_proveedores
      where item_id = v_precio.item_id and proveedor_id = v_factura.proveedor_id and activo
      for update;
      continue when not found;
      continue when v_par.precio_ref is not distinct from v_precio.precio_unitario
                and v_par.cobra_por = v_precio.precio_por;
      update compras_item_proveedores
        set precio_ref = v_precio.precio_unitario, cobra_por = v_precio.precio_por
        where id = v_par.id;
      insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, origen, creado_por)
      select v_precio.item_id, v_lote, c.campo, v_factura.proveedor_id, c.ant, c.nue, 'factura', auth.uid()
      from (values
        ('proveedor.cobra_por',  v_par.cobra_por,                    v_precio.precio_por),
        ('proveedor.precio_ref', _compras_num_txt(v_par.precio_ref), _compras_num_txt(v_precio.precio_unitario))
      ) c(campo, ant, nue)
      where c.ant is distinct from c.nue;
      v_precios := v_precios + 1;
    end loop;
  end if;

  -- Gasto (F6 del 22-09 / FA10).
  if p_gasto_existente_id is not null then
    v_gasto_id := v_gasto.id;
    update gastos
      set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Vinculado a la factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || '.')
      where id = v_gasto.id;
  elsif v_factura.total > 0 then
    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones, created_by, origen)
    values (
      v_factura.fecha,
      v_local,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.rubro'), 'MATERIA PRIMA'),
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.categoria'), 'MATERIA PRIMA'),
      v_factura.proveedor_id,
      v_factura.total,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.forma_pago'), 'Transferencia'),
      'Pendiente de pago',
      'Factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || ' (se creó al confirmar la factura).',
      auth.uid(),
      'factura'
    )
    returning id into v_gasto_id;
    v_generado := true;
  end if;

  update compras_facturas
    set estado = 'confirmada',
        confirmada_en = now(),
        confirmada_por = auth.uid(),
        mercaderia_llego = case when v_tiene_rem then null else p_mercaderia_llego end,
        gasto_id = v_gasto_id,
        gasto_generado = v_generado
    where id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);
  perform compras_recalcular_diferencias_factura(v_factura.id);

  return jsonb_build_object(
    'remito_generado', v_codigo,
    'impacto', v_impacto,
    'gasto_id', v_gasto_id,
    'gasto_creado', v_generado,
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id),
    'precios_actualizados', v_precios  -- A2b
  );
end;
$$;

create or replace function public._compras_nc_aplicar_gasto(p_nc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc     compras_facturas%rowtype;
  v_fo     compras_facturas%rowtype;
  v_gasto  gastos%rowtype;
  v_codigo text;
  v_desc   numeric;
  v_caso   text;
  v_antes  numeric;
  v_desp   numeric;
begin
  select * into v_nc from compras_facturas where id = p_nc_id;
  select * into v_fo from compras_facturas where id = v_nc.factura_origen_id;
  select _compras_codigo_devolucion(p.numero, d.secuencia) into v_codigo
  from compras_devoluciones d join compras_pedidos p on p.id = d.pedido_id
  where d.nota_credito_id = v_nc.id;

  if v_fo.gasto_id is not null then
    select * into v_gasto from gastos where id = v_fo.gasto_id for update;
  end if;

  if v_fo.gasto_id is null or v_gasto.id is null then
    v_caso := 'sin_gasto';
  elsif v_gasto.estado in ('Pagado', 'Parcial') then
    v_caso := 'a_favor';
    v_antes := v_gasto.monto;
    v_desp := v_gasto.monto;
  else
    v_antes := v_gasto.monto;
    v_desc := least(v_nc.total, v_gasto.monto);
    v_desp := v_gasto.monto - v_desc;
    if v_desp = 0 then
      -- D4: queda en $ 0 y pagado con la nota de crédito.
      v_caso := 'cancelo_gasto';
      update gastos
        set monto = 0,
            estado = 'Pagado',
            forma_pago = 'Nota de crédito',
            observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
              'Nota de crédito N° ' || v_nc.numero || coalesce(' (' || v_codigo || ')', '') || ': -' || _compras_pesos_txt(v_desc)
              || '. Cubrió todo el gasto.')
        where id = v_gasto.id;
    else
      v_caso := 'descontado';
      update gastos
        set monto = monto - v_desc,
            observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
              'Nota de crédito N° ' || v_nc.numero || coalesce(' (' || v_codigo || ')', '') || ': -' || _compras_pesos_txt(v_desc))
        where id = v_gasto.id;
    end if;
  end if;

  update compras_facturas
    set nc_gasto = v_caso,
        gasto_descontado = v_desc,
        gasto_forma_pago_anterior = case when v_caso = 'cancelo_gasto' then v_gasto.forma_pago end
    where id = v_nc.id;

  return jsonb_build_object('gasto', v_caso, 'gasto_id', v_gasto.id, 'monto_antes', v_antes, 'monto_despues', v_desp);
end;
$$;

create or replace function public._compras_nc_revertir_gasto(p_nc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc     compras_facturas%rowtype;
  v_fo     compras_facturas%rowtype;
  v_gasto  gastos%rowtype;
  v_codigo text;
  v_otra   text;
  v_antes  numeric;
  v_desp   numeric;
begin
  select * into v_nc from compras_facturas where id = p_nc_id;
  select * into v_fo from compras_facturas where id = v_nc.factura_origen_id;
  select _compras_codigo_devolucion(p.numero, d.secuencia) into v_codigo
  from compras_devoluciones d join compras_pedidos p on p.id = d.pedido_id
  where d.nota_credito_id = v_nc.id;

  if v_nc.nc_gasto not in ('descontado', 'cancelo_gasto') then
    return jsonb_build_object('gasto', v_nc.nc_gasto, 'gasto_id', v_fo.gasto_id);
  end if;

  if v_fo.gasto_id is not null then
    select * into v_gasto from gastos where id = v_fo.gasto_id for update;
  end if;
  if v_gasto.id is null then
    -- Lo borraron a mano: no hay a dónde devolver la plata.
    return jsonb_build_object('gasto', 'gasto_inexistente', 'gasto_id', null);
  end if;
  v_antes := v_gasto.monto;

  -- Otra NC canceló el gasto después de esta: esa se anula primero.
  select f.numero into v_otra
  from compras_facturas f
  where f.factura_origen_id = v_nc.factura_origen_id and f.tipo_comprobante = 'nota_credito'
    and f.estado = 'confirmada' and f.nc_gasto = 'cancelo_gasto' and f.id <> v_nc.id
  limit 1;
  if found and v_gasto.estado = 'Pagado' and v_gasto.forma_pago = 'Nota de crédito' then
    raise exception 'El gasto quedó cancelado por la nota de crédito N° %: anulá esa primero.', v_otra;
  end if;

  if v_nc.nc_gasto = 'descontado' then
    if v_gasto.estado <> 'Pendiente de pago' then
      raise exception 'El gasto de la factura % ya se pagó con el descuento de esta nota de crédito: no se puede anular. Si hay que corregirlo, hablalo con la administración.',
        v_fo.numero;
    end if;
    update gastos
      set monto = monto + v_nc.gasto_descontado,
          observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Se anuló la nota de crédito N° ' || v_nc.numero || coalesce(' (' || v_codigo || ')', '') || ': +' || _compras_pesos_txt(v_nc.gasto_descontado))
      where id = v_gasto.id
      returning monto into v_desp;
  else
    if not (v_gasto.estado = 'Pagado' and v_gasto.forma_pago = 'Nota de crédito') then
      raise exception 'El gasto de la factura % cambió después de esta nota de crédito: revisalo en Gastos antes de anular.', v_fo.numero;
    end if;
    update gastos
      set estado = 'Pendiente de pago',
          monto = monto + v_nc.gasto_descontado,
          forma_pago = coalesce(v_nc.gasto_forma_pago_anterior,
                                (select valor #>> '{}' from compras_config where clave = 'gasto.forma_pago'),
                                'Transferencia'),
          observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Se anuló la nota de crédito N° ' || v_nc.numero || coalesce(' (' || v_codigo || ')', '') || ': vuelve a pendiente (+'
            || _compras_pesos_txt(v_nc.gasto_descontado) || ').')
      where id = v_gasto.id
      returning monto into v_desp;
  end if;

  return jsonb_build_object('gasto', v_nc.nc_gasto, 'gasto_id', v_gasto.id, 'monto_antes', v_antes, 'monto_despues', v_desp);
end;
$$;
