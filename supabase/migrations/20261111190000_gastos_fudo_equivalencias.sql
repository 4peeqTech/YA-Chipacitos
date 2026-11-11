-- ============================================================================
-- Gastos G3 (2026-11-11): los gastos de Fudo se clasifican solos.
--
-- Una equivalencia dice "lo que en Fudo dice X va a la cuenta Y". "Lo que dice
-- Fudo" es la categoría del gasto, o su proveedor si no tiene categoría: los
-- locales usan los dos campos para lo mismo ("Logistica", "Cubre Franco",
-- "Bolsaplast" aparecen en uno o en otro).
--
-- - Al sincronizar, un gasto de Fudo sin cuenta toma la de su equivalencia
--   (lo hace el trigger de gastos: gastos_fudo_aplicar no cambia).
-- - Guardar o cambiar una equivalencia clasifica los que ya estaban.
-- - Lo clasificado a mano nunca se pisa: cuenta_automatica distingue uno de otro.
-- ============================================================================

alter table public.gastos add column if not exists cuenta_automatica boolean not null default false;

-- "Lo que dice Fudo", normalizado (minúsculas, sin tildes ni espacios de más).
create or replace function public._gastos_fudo_etiqueta(p_categoria text, p_proveedor text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(
    _gastos_norm(coalesce(nullif(btrim(p_categoria), ''), nullif(btrim(p_proveedor), ''))), '\s+', ' ', 'g')), '');
$$;

create table if not exists public.gastos_fudo_equivalencias (
  etiqueta         text primary key,
  -- Como se ve en Fudo, para mostrar.
  texto            text not null,
  cuenta           text not null references public.plan_cuentas(codigo) on update cascade on delete restrict,
  actualizado_por  uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table public.gastos_fudo_equivalencias enable row level security;
drop policy if exists gastos_fudo_equivalencias_admin_lee on public.gastos_fudo_equivalencias;
create policy gastos_fudo_equivalencias_admin_lee on public.gastos_fudo_equivalencias for select using (es_admin());

-- ----------------------------------------------------------------------------
-- Trigger de la cuenta (el de G2) con la equivalencia de Fudo.
-- ----------------------------------------------------------------------------
create or replace function public._gastos_cuenta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan plan_cuentas%rowtype;
  v_eq   text;
begin
  if new.cuenta is null and tg_op = 'INSERT' and new.origen = 'factura' then
    new.cuenta := coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.cuenta'), '5.1.01.01');
  end if;

  if tg_op = 'UPDATE' and new.cuenta is distinct from old.cuenta then
    -- La cambió una persona, salvo que venga de guardar una equivalencia.
    new.cuenta_automatica := new.cuenta is not null and coalesce(current_setting('gastos.por_equivalencia', true), '') = 'on';
  end if;

  -- Fudo: lo que no se clasificó a mano toma la equivalencia de lo que dice Fudo.
  if new.origen = 'fudo' and (new.cuenta is null or new.cuenta_automatica)
     and (tg_op = 'INSERT' or new.fudo_categoria is distinct from old.fudo_categoria
          or new.fudo_proveedor is distinct from old.fudo_proveedor) then
    select e.cuenta into v_eq
    from gastos_fudo_equivalencias e
    where e.etiqueta = _gastos_fudo_etiqueta(new.fudo_categoria, new.fudo_proveedor)
      and _gastos_cuenta_valida(e.cuenta);
    new.cuenta := v_eq;
    new.cuenta_automatica := v_eq is not null;
  end if;

  if new.cuenta is null then
    new.rubro := null;
    new.categoria := null;
    new.cuenta_automatica := false;
    return new;
  end if;
  -- Solo se valida al elegirla: un gasto viejo sigue editable aunque su cuenta
  -- deje de usarse en Gastos en una versión nueva del plan.
  if (tg_op = 'INSERT' or new.cuenta is distinct from old.cuenta) and not _gastos_cuenta_valida(new.cuenta) then
    raise exception 'La cuenta % no se usa en Gastos. Elegí otra.', new.cuenta;
  end if;
  select * into v_plan from plan_cuentas where codigo = new.cuenta;
  new.rubro := v_plan.rubro_gasto;
  new.categoria := v_plan.categoria_gasto;
  return new;
end;
$$;

drop trigger if exists gastos_cuenta on public.gastos;
create trigger gastos_cuenta
  before insert or update of cuenta, fudo_categoria, fudo_proveedor on public.gastos
  for each row execute function public._gastos_cuenta();

-- ----------------------------------------------------------------------------
-- La vista suma si la cuenta la puso una equivalencia (al final).
-- ----------------------------------------------------------------------------
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
  g.fudo_descripcion,
  g.cuenta,
  cu.nombre as cuenta_nombre,
  cu.uso_gastos,
  g.cuenta_automatica
from gastos g
left join plan_cuentas cu on cu.codigo = g.cuenta
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

-- ----------------------------------------------------------------------------
-- Lo que dice Fudo, agrupado: cuántos gastos, cuántos sin cuenta y su equivalencia.
-- ----------------------------------------------------------------------------
create or replace function public.gastos_fudo_etiquetas()
returns table (
  etiqueta text, texto text, locales text[], gastos bigint, sin_clasificar bigint, a_mano bigint, monto numeric,
  cuenta text, cuenta_nombre text
)
language sql
stable
set search_path = public
as $$
  select x.etiqueta,
         coalesce(e.texto, x.texto),
         x.locales, x.gastos, x.sin_clasificar, x.a_mano, x.monto,
         e.cuenta, cu.nombre
  from (
    select _gastos_fudo_etiqueta(g.fudo_categoria, g.fudo_proveedor) as etiqueta,
           mode() within group (order by coalesce(nullif(btrim(g.fudo_categoria), ''), nullif(btrim(g.fudo_proveedor), ''))) as texto,
           array_agg(distinct g.local order by g.local) as locales,
           count(*) as gastos,
           count(*) filter (where g.cuenta is null) as sin_clasificar,
           count(*) filter (where g.cuenta is not null and not g.cuenta_automatica) as a_mano,
           sum(g.monto) as monto
    from gastos g
    where g.origen = 'fudo' and g.estado <> 'Anulado' and es_admin()
    group by 1
  ) x
  left join gastos_fudo_equivalencias e on e.etiqueta = x.etiqueta
  left join plan_cuentas cu on cu.codigo = e.cuenta
  order by x.sin_clasificar desc, x.gastos desc, 2;
$$;

revoke execute on function public.gastos_fudo_etiquetas() from public, anon;
grant execute on function public.gastos_fudo_etiquetas() to authenticated;

-- p_cuenta vacío = sacar la equivalencia (lo que clasificó vuelve a "sin clasificar").
-- Devuelve cuántos gastos cambiaron.
create or replace function public.gastos_fudo_equivalencia_guardar(p_texto text default null, p_cuenta text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etiqueta text := _gastos_fudo_etiqueta(p_texto, null);
  v_cuenta   text := nullif(btrim(p_cuenta), '');
  v_n        integer;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede clasificar los gastos de Fudo.';
  end if;
  if v_etiqueta is null then
    raise exception 'Falta lo que dice Fudo.';
  end if;
  perform set_config('gastos.por_equivalencia', 'on', true);

  if v_cuenta is null then
    delete from gastos_fudo_equivalencias where etiqueta = v_etiqueta;
    update gastos set cuenta = null
      where origen = 'fudo' and cuenta_automatica
        and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = v_etiqueta;
    get diagnostics v_n = row_count;
  else
    if not _gastos_cuenta_valida(v_cuenta) then
      raise exception 'La cuenta % no se usa en Gastos. Elegí otra.', v_cuenta;
    end if;
    insert into gastos_fudo_equivalencias (etiqueta, texto, cuenta, actualizado_por)
    values (v_etiqueta, btrim(p_texto), v_cuenta, auth.uid())
    on conflict (etiqueta) do update
      set cuenta = excluded.cuenta, actualizado_por = excluded.actualizado_por, updated_at = now();
    update gastos set cuenta = v_cuenta
      where origen = 'fudo' and (cuenta is null or cuenta_automatica) and cuenta is distinct from v_cuenta
        and _gastos_fudo_etiqueta(fudo_categoria, fudo_proveedor) = v_etiqueta;
    get diagnostics v_n = row_count;
  end if;

  perform set_config('gastos.por_equivalencia', '', true);
  return v_n;
end;
$$;

revoke execute on function public.gastos_fudo_equivalencia_guardar(text, text) from public, anon;
grant execute on function public.gastos_fudo_equivalencia_guardar(text, text) to authenticated;
