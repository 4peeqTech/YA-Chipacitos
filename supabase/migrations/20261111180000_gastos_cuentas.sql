-- ============================================================================
-- Gastos G2 (2026-11-11): cada gasto se clasifica con una cuenta del plan.
--
-- - gastos.cuenta (FK a plan_cuentas). Un trigger valida que sea imputable y
--   que se use en Gastos, y copia rubro y categoría del plan: los filtros, la
--   búsqueda, el Resumen y compras_buscar_gasto_candidato siguen leyendo
--   gastos.rubro y gastos.categoria. Ninguna pantalla los escribe.
-- - Un gasto que crea una factura de compras toma la cuenta de compras_config
--   ('gasto.cuenta'), también en el trigger: compras_confirmar_factura no cambia.
-- - Los gastos que ya estaban pasan de su categoría vieja a una cuenta. Lo que
--   no tenga equivalencia va a 1.4.01.01 «Partidas pendientes de imputación».
-- - Las plantillas de gastos que se repiten guardan la cuenta en lugar de
--   rubro y categoría.
-- - gastos_listar y gastos_resumen filtran por cuenta y separan lo que no es
--   gasto (uso_gastos = 'otro_pago') del total gastado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columna y trigger.
-- ----------------------------------------------------------------------------
alter table public.gastos
  add column if not exists cuenta text references public.plan_cuentas(codigo) on update cascade on delete restrict;
create index if not exists idx_gastos_cuenta on public.gastos (cuenta);

create or replace function public._gastos_cuenta_valida(p_cuenta text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from plan_cuentas where codigo = p_cuenta and imputable and uso_gastos is not null);
$$;

create or replace function public._gastos_cuenta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan plan_cuentas%rowtype;
begin
  if new.cuenta is null and tg_op = 'INSERT' and new.origen = 'factura' then
    new.cuenta := coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.cuenta'), '5.1.01.01');
  end if;
  if new.cuenta is null then
    new.rubro := null;
    new.categoria := null;
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
  before insert or update of cuenta on public.gastos
  for each row execute function public._gastos_cuenta();

-- ----------------------------------------------------------------------------
-- 2. Los gastos que ya estaban: de la categoría vieja a una cuenta.
-- ----------------------------------------------------------------------------
create temporary table _categoria_a_cuenta (categoria text primary key, cuenta text not null) on commit drop;
insert into _categoria_a_cuenta values
  ('MATERIA PRIMA', '5.1.01.01'), ('LACTEOS / QUESO', '5.1.01.01'), ('HUEVOS', '5.1.01.02'),
  ('HARINA / ALMIDON', '5.1.01.01'), ('SAL / CONDIMENTOS', '5.1.01.04'), ('FRUTAS', '5.1.03.03'),
  ('MERCADERIA DE REVENTA', '5.1.03.04'),
  ('INSUMOS', '5.1.02.04'), ('EMBALAJE / BOLSAS', '5.1.02.01'), ('ETIQUETAS', '5.1.02.03'),
  ('INSUMOS DE LIMPIEZA', '5.3.04.02'), ('LIBRERIA / PAPELERIA', '5.6.04.01'),
  ('PERSONAL', '5.2.01.01'), ('SUELDOS PRODUCCION', '5.2.01.01'), ('SUELDOS SUCURSAL', '5.2.01.01'),
  ('SUELDOS ADMINISTRACION', '5.2.01.01'), ('CARGAS SOCIALES / SINDICATO', '5.2.03.01'),
  ('ART / COBERTURA MEDICA', '5.2.03.03'),
  ('IMPUESTO PROVINCIAL', '5.7.01.01'), ('PLAN DE PAGO', '2.3.01.04'),
  ('ALQUILER', '5.3.02.01'), ('ELECTRICIDAD', '5.3.01.01'), ('AGUA', '5.3.01.02'),
  ('INTERNET / TELEFONIA', '5.3.01.04'), ('SISTEMA', '5.6.02.01'),
  ('CONTADOR', '5.6.01.01'), ('DISEÑO', '5.5.01.03'), ('LEGAL', '5.6.01.02'), ('CONSULTORIA', '5.6.05.01'),
  ('COMBUSTIBLE', '5.4.01.01'), ('MANTENIMIENTO VEHICULO', '5.4.02.01'), ('FLETE / CORREO', '5.4.03.01'),
  ('SEGURO VEHICULO', '5.6.03.01'), ('MOVIMIENTO INTERNO', '1.1.03.01');
-- 'IMPUESTO NACIONAL' no tiene una sola cuenta (IVA, Ganancias, F.931…): va a partidas pendientes.

update public.gastos g
  set cuenta = coalesce((select m.cuenta from _categoria_a_cuenta m where m.categoria = upper(btrim(g.categoria))), '1.4.01.01')
  where g.cuenta is null and (g.origen <> 'fudo' or g.categoria is not null);

alter table public.gastos drop constraint if exists gastos_clasificado_check;
alter table public.gastos
  add constraint gastos_clasificado_check check (origen = 'fudo' or cuenta is not null);

-- La factura de compras crea el gasto con esta cuenta (se cambia en el gasto).
delete from public.compras_config where clave in ('gasto.rubro', 'gasto.categoria');
insert into public.compras_config (clave, valor, descripcion) values
  ('gasto.cuenta', '"5.1.01.01"'::jsonb, 'Cuenta del plan con la que se crea el gasto al confirmar una factura de compras.')
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Vista: la cuenta, su nombre y si es gasto (agregadas al final).
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
  cu.uso_gastos
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
-- 4. Lista y números: filtro por cuenta.
--    p_cuenta: '' = todo · 'sin' = sin clasificar · 'otros' = no es gasto ·
--    un código = esa cuenta o todo lo que cuelga de ella (rubro, categoría).
-- ----------------------------------------------------------------------------
drop function if exists public.gastos_resumen(date, date, text, text, text, text);
drop function if exists public.gastos_listar(date, date, text, text, text, text, text);

create function public.gastos_listar(
  p_desde date default null,
  p_hasta date default null,
  p_estado text default 'todos',
  p_local text default null,
  p_q text default null,
  p_origen text default null,
  p_orden text default 'nuevos',
  p_cuenta text default null
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
    and case coalesce(nullif(btrim(p_cuenta), ''), '')
          when '' then true
          when 'sin' then v.cuenta is null
          when 'otros' then v.uso_gastos = 'otro_pago'
          else v.cuenta = btrim(p_cuenta) or v.cuenta like btrim(p_cuenta) || '.%'
        end
    and (
      nullif(btrim(p_q), '') is null
      or strpos(
        _gastos_norm(concat_ws(' ', v.proveedor_nombre, v.cuenta_nombre, v.categoria, v.rubro, v.local, v.observaciones,
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

revoke execute on function public.gastos_listar(date, date, text, text, text, text, text, text) from public, anon;
grant execute on function public.gastos_listar(date, date, text, text, text, text, text, text) to authenticated;

-- "Gastado en el período" deja afuera lo que no es gasto (retiros, bienes de
-- uso, capital de préstamos…), que se informa aparte. Lo pendiente y lo pagado
-- siguen siendo toda la plata.
create function public.gastos_resumen(
  p_desde date default null,
  p_hasta date default null,
  p_estado text default 'todos',
  p_local text default null,
  p_q text default null,
  p_origen text default null,
  p_cuenta text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with periodo as (
    select monto, uso_gastos, cuenta, origen from v_gastos
    where estado <> 'Anulado' and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)
  )
  select jsonb_build_object(
    'pendiente', coalesce((select sum(saldo) from v_gastos where estado in ('Pendiente de pago', 'Parcial')), 0),
    'pendientes_count', (select count(*) from v_gastos where estado in ('Pendiente de pago', 'Parcial')),
    'pagado_periodo', coalesce((
      select sum(p.monto)
      from gastos_pagos p
      join v_gastos g on g.id = p.gasto_id
      where p.anulado_en is null and g.estado <> 'Anulado'
        and (p_desde is null or p.fecha >= p_desde) and (p_hasta is null or p.fecha <= p_hasta)
    ), 0),
    'total_periodo', coalesce((select sum(monto) from periodo where uso_gastos is distinct from 'otro_pago'), 0),
    'gastos_periodo', (select count(*) from periodo where uso_gastos is distinct from 'otro_pago'),
    'otros_periodo', coalesce((select sum(monto) from periodo where uso_gastos = 'otro_pago'), 0),
    'otros_count', (select count(*) from periodo where uso_gastos = 'otro_pago'),
    'sin_clasificar_count', (select count(*) from periodo where cuenta is null),
    'filtrado_total', coalesce((select sum(monto) from gastos_listar(p_desde, p_hasta, p_estado, p_local, p_q, p_origen, 'nuevos', p_cuenta)), 0)
  );
$$;

revoke execute on function public.gastos_resumen(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.gastos_resumen(date, date, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Alta y edición: p_cuenta en lugar de rubro y categoría.
-- ----------------------------------------------------------------------------
drop function if exists public.gastos_guardar(uuid, date, text, text, text, uuid, numeric, text, text, jsonb, date);

create function public.gastos_guardar(
  p_id uuid default null,
  p_fecha date default null,
  p_local text default null,
  p_cuenta text default null,
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
  v_cuenta  text := nullif(btrim(p_cuenta), '');
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
    if v_cuenta is null then
      raise exception 'Elegí la cuenta del gasto.';
    end if;
    if not exists (select 1 from locales_config where sucursal = btrim(p_local) and activo is not false) then
      raise exception 'Ese local no está en la lista de locales. Recargá la página y elegí de nuevo.';
    end if;
    if p_pago is not null and (
      nullif(p_pago->>'fecha_pago', '') is null or nullif(btrim(p_pago->>'caja'), '') is null
    ) then
      raise exception 'Para cargarlo como pagado, elegí la fecha de pago y la caja.';
    end if;

    insert into gastos (fecha, local, cuenta, proveedor_id, monto, forma_pago, estado, observaciones,
                        created_by, fecha_vencimiento, origen)
    values (
      p_fecha, btrim(p_local), v_cuenta, p_proveedor_id, v_monto,
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
  -- Un gasto de Fudo se clasifica en la app (o queda sin clasificar); el resto lo manda Fudo.
  if v_gasto.origen = 'fudo' then
    if v_monto <> v_gasto.monto or p_proveedor_id is distinct from v_gasto.proveedor_id
       or p_fecha <> v_gasto.fecha or btrim(p_local) <> v_gasto.local then
      raise exception 'Este gasto viene de Fudo: el monto, la fecha, el local y el proveedor se corrigen en Fudo.';
    end if;
  elsif v_cuenta is null then
    raise exception 'Elegí la cuenta del gasto.';
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
        cuenta = v_cuenta,
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

revoke execute on function public.gastos_guardar(uuid, date, text, text, uuid, numeric, text, text, jsonb, date) from public, anon;
grant execute on function public.gastos_guardar(uuid, date, text, text, uuid, numeric, text, text, jsonb, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Gastos que se repiten: la plantilla guarda la cuenta.
-- ----------------------------------------------------------------------------
drop view if exists public.v_gastos_recurrentes;

alter table public.gastos_recurrentes
  add column if not exists cuenta text references public.plan_cuentas(codigo) on update cascade on delete restrict;
update public.gastos_recurrentes r
  set cuenta = coalesce((select m.cuenta from _categoria_a_cuenta m where m.categoria = upper(btrim(r.categoria))), '1.4.01.01')
  where r.cuenta is null;
alter table public.gastos_recurrentes
  alter column cuenta set not null,
  drop column if exists rubro,
  drop column if exists categoria;

create view public.v_gastos_recurrentes as
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
       ) end as proximo,
       cu.nombre as cuenta_nombre
from gastos_recurrentes r
left join plan_cuentas cu on cu.codigo = r.cuenta
left join proveedores pr on pr.id = r.proveedor_id
left join lateral (select g.periodo, g.monto from gastos g where g.recurrente_id = r.id order by g.periodo desc limit 1) u on true
left join lateral (select count(*) as generados from gastos g where g.recurrente_id = r.id) c on true
where es_admin();

grant select on public.v_gastos_recurrentes to authenticated;

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
        insert into gastos (fecha, local, cuenta, proveedor_id, monto, forma_pago, estado, observaciones,
                            created_by, origen, recurrente_id, periodo, a_confirmar, fecha_vencimiento)
        values (v_fecha, v_r.local, v_r.cuenta, v_r.proveedor_id, v_monto, v_r.forma_pago,
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

drop function if exists public.gastos_recurrente_guardar(uuid, text, text, text, text, uuid, numeric, boolean, text, int, int, date, date, text);

create function public.gastos_recurrente_guardar(
  p_id uuid default null,
  p_nombre text default null,
  p_local text default null,
  p_cuenta text default null,
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
  v_id     uuid;
  v_cuenta text := nullif(btrim(p_cuenta), '');
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
  if v_cuenta is null then
    raise exception 'Elegí la cuenta del gasto.';
  end if;
  -- Al editar, la cuenta que ya tenía se acepta aunque haya dejado de usarse en Gastos.
  if not _gastos_cuenta_valida(v_cuenta)
     and not exists (select 1 from gastos_recurrentes where id = p_id and cuenta = v_cuenta) then
    raise exception 'La cuenta % no se usa en Gastos. Elegí otra.', v_cuenta;
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
    insert into gastos_recurrentes (nombre, local, cuenta, proveedor_id, monto, monto_variable, forma_pago,
                                    dia_del_mes, dias_para_vencer, desde, hasta, observaciones, creado_por)
    values (btrim(p_nombre), btrim(p_local), v_cuenta, p_proveedor_id, round(p_monto, 2),
            coalesce(p_monto_variable, false), btrim(p_forma_pago), p_dia_del_mes, p_dias_para_vencer, p_desde, p_hasta,
            nullif(btrim(p_observaciones), ''), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  -- Editar no toca los gastos ya generados: cambia los que vienen.
  update gastos_recurrentes
    set nombre = btrim(p_nombre), local = btrim(p_local), cuenta = v_cuenta,
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

revoke execute on function public.gastos_recurrente_guardar(uuid, text, text, text, uuid, numeric, boolean, text, int, int, date, date, text) from public, anon;
grant execute on function public.gastos_recurrente_guardar(uuid, text, text, text, uuid, numeric, boolean, text, int, int, date, date, text) to authenticated;
