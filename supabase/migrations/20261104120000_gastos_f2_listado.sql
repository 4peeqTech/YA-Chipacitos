-- ============================================================================
-- Gastos F2 (2026-11-04): la lista se consulta en el servidor.
--
-- - gastos_listar: el filtro único (período, estado, local, origen, búsqueda
--   sin acentos) que usan la lista paginada, el total de lo filtrado y
--   Pendientes. La app la llama con count exact y range().
-- - gastos_resumen: los tres números de arriba de Gastos (se ven igual que
--   antes) más el total de lo filtrado. "Pagado en el período" suma los pagos
--   por su fecha, ahora que puede haber varios por gasto.
-- - gastos_pendientes_resumen: cantidad y total por local para Pendientes.
-- - gastos_anular_pago bloquea el gasto antes de leer el pago (dos personas
--   anulando el mismo pago a la vez: la segunda ve que ya está anulado).
-- ============================================================================

-- Minúsculas y sin acentos, para buscar "cordoba" y encontrar "Córdoba".
create or replace function public._gastos_norm(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
$$;

create or replace function public.gastos_listar(
  p_desde date default null,
  p_hasta date default null,
  -- todos | pendientes (pendiente o parcial) | pagados | anulados
  p_estado text default 'todos',
  p_local text default null,
  p_q text default null,
  p_origen text default null,
  -- nuevos (más nuevo arriba) | viejos
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
                               v.factura_numero, v.fudo_categoria, v.fudo_proveedor,
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

revoke execute on function public.gastos_listar(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.gastos_listar(date, date, text, text, text, text, text) to authenticated;

-- Los números de arriba miran el período (y nada más, como antes); el total
-- de lo filtrado mira todos los filtros.
create or replace function public.gastos_resumen(
  p_desde date default null,
  p_hasta date default null,
  p_estado text default 'todos',
  p_local text default null,
  p_q text default null,
  p_origen text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
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
    'total_periodo', coalesce((
      select sum(monto) from v_gastos
      where estado <> 'Anulado' and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)
    ), 0),
    'gastos_periodo', (
      select count(*) from v_gastos
      where estado <> 'Anulado' and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)
    ),
    'filtrado_total', coalesce((select sum(monto) from gastos_listar(p_desde, p_hasta, p_estado, p_local, p_q, p_origen)), 0)
  );
$$;

revoke execute on function public.gastos_resumen(date, date, text, text, text, text) from public, anon;
grant execute on function public.gastos_resumen(date, date, text, text, text, text) to authenticated;

-- Pendientes: un renglón por local con lo que falta pagar (por saldo).
create or replace function public.gastos_pendientes_resumen(
  p_desde date default null,
  p_hasta date default null,
  p_local text default null,
  p_q text default null
)
returns table (local text, cantidad bigint, total numeric, vencidos bigint)
language sql
stable
set search_path = public
as $$
  select g.local, count(*), coalesce(sum(g.saldo), 0), count(*) filter (where g.vencido)
  from gastos_listar(p_desde, p_hasta, 'pendientes', p_local, p_q, null, 'viejos') g
  group by g.local
  order by g.local;
$$;

revoke execute on function public.gastos_pendientes_resumen(date, date, text, text) from public, anon;
grant execute on function public.gastos_pendientes_resumen(date, date, text, text) to authenticated;

create or replace function public.gastos_anular_pago(p_pago_id uuid default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto_id uuid;
  v_pago     gastos_pagos%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular pagos.';
  end if;
  select gasto_id into v_gasto_id from gastos_pagos where id = p_pago_id;
  if not found then
    raise exception 'No encontramos ese pago. Recargá la página.';
  end if;
  -- Primero el gasto: así dos anulaciones del mismo pago van en fila.
  perform 1 from gastos where id = v_gasto_id for update;
  select * into v_pago from gastos_pagos where id = p_pago_id;
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
