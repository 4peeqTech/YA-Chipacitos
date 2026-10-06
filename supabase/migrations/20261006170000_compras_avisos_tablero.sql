-- ============================================================================
-- B5 — Avisos y tablero de compras (docs/bloque2/plan-B5.md §3).
--
-- Todo es nuevo: no redefine ninguna función, vista ni política de otra fase.
-- Las reglas de otras fases se REPLICAN con cita (E7); los escenarios
-- (docs/bloque2/escenarios-B5.sql) comparan cada réplica contra su original.
--
--   1. compras_config: pedidos.dias_demora + avisos.* (seed, sin pisar).
--   2. compras_avisos_enviados: el "ya avisé" (un aviso por episodio).
--   3. compras_avisos_corridas: log de cada corrida (cron, manual, remito).
--   4. Helpers de candidatos (_compras_*), compartidos por el cron y el tablero.
--   5. compras_avisos_tomar: toma atómica de lo que hay que avisar (service_role).
--   6. compras_tablero_resumen: KPIs agregados del dashboard (montos solo admin).
--
-- Solo dev/QA. Prod no se toca.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Configuración (§3.1)
-- ---------------------------------------------------------------------------

insert into public.compras_config (clave, valor, descripcion) values
  ('pedidos.dias_demora',           '3'::jsonb,    'Días desde el envío para considerar demorado un pedido que no llegó completo.'),
  ('avisos.remito_listo.activo',    'true'::jsonb, 'Avisar a admin cuando un pedido queda listo para facturar.'),
  ('avisos.pedido_demorado.activo', 'true'::jsonb, 'Avisar los pedidos demorados (usa pedidos.dias_demora).'),
  ('avisos.diferencias.activo',     'true'::jsonb, 'Avisar diferencias de factura sin resolver.'),
  ('avisos.diferencias.dias',       '3'::jsonb,    'Días que una diferencia puede quedar pendiente antes de avisar.'),
  ('avisos.nc_pendiente.activo',    'true'::jsonb, 'Avisar devoluciones que esperan la nota de crédito.'),
  ('avisos.nc_pendiente.dias',      '7'::jsonb,    'Días esperando la nota de crédito antes de avisar.'),
  ('avisos.stock_bajo.activo',      'true'::jsonb, 'Avisar insumos bajo el mínimo que no tienen un pedido abierto.'),
  ('avisos.repetir_dias',           '0'::jsonb,    'Cada cuántos días repetir un aviso que sigue sin resolverse (0 = no repetir).')
on conflict (clave) do nothing;

-- Un valor que no castea cae en el default: nunca rompe el cron.
create function public._compras_config_num(p_clave text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when (valor #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (valor #>> '{}')::numeric end
    from compras_config where clave = p_clave
  ), p_default)
$$;

create function public._compras_config_bool(p_clave text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case lower(btrim(valor #>> '{}')) when 'true' then true when 'false' then false end
    from compras_config where clave = p_clave
  ), p_default)
$$;


-- ---------------------------------------------------------------------------
-- 2. compras_avisos_enviados (§3.2, E1/E2)
-- ---------------------------------------------------------------------------

create table public.compras_avisos_enviados (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('remito_listo', 'pedido_demorado', 'diferencias', 'nc_pendiente', 'stock_bajo')),
  entidad_id      uuid not null,          -- pedido, devolución o insumo según el tipo
  pedido_id       uuid,                   -- para el link y para acotar por pedido (null en stock_bajo)
  huella          text not null default '',
  primer_aviso_en timestamptz not null default now(),
  enviado_en      timestamptz not null default now(),   -- último envío (para repetir_dias)
  envios          int not null default 1,
  unique (tipo, entidad_id)
);
-- Sin FK a la entidad, a propósito: una entidad borrada deja de ser candidata y
-- la próxima toma borra su fila.
create index on public.compras_avisos_enviados (enviado_en desc);

alter table public.compras_avisos_enviados enable row level security;
create policy compras_avisos_enviados_lectura on public.compras_avisos_enviados
  for select to authenticated using (es_admin());
-- Sin políticas de escritura: solo escribe compras_avisos_tomar (security definer).


-- ---------------------------------------------------------------------------
-- 3. compras_avisos_corridas (§3.3, E13)
-- ---------------------------------------------------------------------------

create table public.compras_avisos_corridas (
  id         uuid primary key default gen_random_uuid(),
  origen     text not null check (origen in ('cron', 'manual', 'remito')),
  corrida_en timestamptz not null default now(),
  por        uuid references public.profiles(id) on delete set null,   -- quien tocó "Revisar ahora"
  resultado  jsonb not null default '{}'::jsonb,                       -- { tipo: { candidatos, avisados, destinatarios } }
  error      text
);
create index on public.compras_avisos_corridas (corrida_en desc);

alter table public.compras_avisos_corridas enable row level security;
create policy compras_avisos_corridas_lectura on public.compras_avisos_corridas
  for select to authenticated using (es_admin());
-- La inserta el runner con service role.


-- ---------------------------------------------------------------------------
-- 4. Helpers de candidatos (§3.4). Leen tablas base: las vistas de compras
--    devuelven 0 filas con service role (auth.uid() null).
-- ---------------------------------------------------------------------------

-- (a) Por recibir: esperan mercadería (también los facturados antes de que llegue).
create function public._compras_pedidos_por_recibir()
returns table (pedido_id uuid, numero int, proveedor_nombre text, enviado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.numero, pr.nombre, p.enviado_en
  from compras_pedidos p
  left join proveedores pr on pr.id = p.proveedor_id
  where p.estado_recepcion in ('enviado', 'parcial')
$$;

-- (b) Demorados. Replica estaDemorado (lib/compras/estadoPedido.ts):
-- floor((ahora − enviado)/día) ≥ N  ⇔  enviado ≤ ahora − N días.
create function public._compras_pedidos_demorados(p_dias int)
returns table (pedido_id uuid, numero int, proveedor_nombre text, enviado_en timestamptz, dias int)
language sql
stable
security definer
set search_path = public
as $$
  select a.pedido_id, a.numero, a.proveedor_nombre, a.enviado_en,
         floor(extract(epoch from (now() - a.enviado_en)) / 86400)::int
  from _compras_pedidos_por_recibir() a
  where a.enviado_en is not null
    and a.enviado_en <= now() - make_interval(days => p_dias)
$$;

-- (c) Por facturar. Replica filtroDelPedido = 'por_facturar' (estadoPedido.ts) /
-- recibidoSinFacturar (reportes.ts, E14 de B3): recibido, o cerrado a mano con
-- algo recibido (= tiene remito, como _compras_pedidos_abiertos_de), sin factura.
create function public._compras_pedidos_por_facturar()
returns table (pedido_id uuid, numero int, proveedor_id uuid, proveedor_nombre text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.numero, p.proveedor_id, pr.nombre,
         (select max(coalesce(r.created_at, r.fecha::timestamptz)) from compras_remitos r where r.pedido_id = p.id)
  from compras_pedidos p
  left join proveedores pr on pr.id = p.proveedor_id
  where p.estado_facturacion = 'sin_facturar'
    and (p.estado_recepcion = 'recibido'
         or (p.estado_recepcion = 'cerrado_manual'
             and exists (select 1 from compras_remitos r where r.pedido_id = p.id)))
$$;

-- (d) Con diferencias. Replica hayDiferencias (app/admin/compras/pedidos/modelo.ts):
-- factura confirmada con alguna discrepancia pendiente y recepcionCompleta
-- (lib/compras/diferencias.ts). "Pendiente desde" = updated_at: el recálculo
-- devuelve la fila a pendiente con updated_at = now() (no la recrea).
create function public._compras_pedidos_con_diferencias()
returns table (pedido_id uuid, numero int, proveedor_nombre text, factura_id uuid, pendientes int, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.numero, pr.nombre, (array_agg(f.id order by f.confirmada_en desc nulls last))[1],
         count(*)::int, min(x.updated_at)
  from compras_pedidos p
  join compras_facturas f on f.pedido_id = p.id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'
  join compras_factura_discrepancias x on x.factura_id = f.id and x.resolucion = 'pendiente'
  left join proveedores pr on pr.id = p.proveedor_id
  where p.estado_recepcion in ('recibido', 'cerrado_manual', 'devuelto')
  group by p.id, p.numero, pr.nombre
$$;

-- (e) Devoluciones que esperan su NC. Copia TEXTUAL de la expresión
-- espera_nota_credito de v_compras_devoluciones (20261006153000). Si alguien la
-- cambia allá, la cambia acá y corre S11 de escenarios-B5.sql.
-- desde = cuando hay una factura que la NC tiene que corregir.
create function public._compras_devoluciones_esperan_nc()
returns table (devolucion_id uuid, pedido_id uuid, numero int, secuencia int, codigo text, proveedor_nombre text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.pedido_id, ped.numero, d.secuencia,
         _compras_codigo_devolucion(ped.numero, d.secuencia), pr.nombre,
         greatest(d.created_at, (
           select min(f.confirmada_en) from compras_facturas f
           where f.pedido_id = d.pedido_id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'))
  from compras_devoluciones d
  join compras_pedidos ped on ped.id = d.pedido_id
  left join proveedores pr on pr.id = ped.proveedor_id
  where (d.estado = 'activa' and not d.repone and d.nota_credito_id is null
    and exists (
      select 1 from compras_facturas f
      where f.pedido_id = d.pedido_id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'
        and (
          -- Registrada contra esa factura: lo que se devolvió estaba facturado.
          d.factura_id = f.id
          -- Registrada antes (D1): solo si la factura cobró de más lo devuelto (diferencia > 0 abierta).
          or exists (select 1 from compras_factura_discrepancias x
                     join compras_devolucion_items di on di.devolucion_id = d.id and di.item_id = x.item_id
                     where x.factura_id = f.id and x.diferencia > 0 and x.resolucion in ('pendiente', 'reclamo_proveedor'))
        )))
$$;

-- (f) Insumos bajo el mínimo. Replica StockClient (app/admin/compras/stock):
-- activo y cantidad < stock_minimo, sin fila de stock = 0. en_pedido = está en un
-- pedido abierto a recepción (aproximación: un parcial con esa línea ya completa cuenta).
create function public._compras_insumos_bajo_minimo()
returns table (item_id uuid, nombre text, unidad text, cantidad numeric, minimo numeric, en_pedido boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.nombre, i.unidad, coalesce(s.cantidad, 0), i.stock_minimo,
         exists (select 1 from compras_pedido_items pi
                 join compras_pedidos p on p.id = pi.pedido_id
                 where pi.item_id = i.id and p.estado_recepcion in ('sin_enviar', 'enviado', 'parcial'))
  from compras_items i
  left join compras_stock_actual s on s.item_id = i.id
  where i.estado = 'activo'
    and coalesce(s.cantidad, 0) < coalesce(i.stock_minimo, 0)
$$;

-- Candidatos de cada tipo pedido, con los umbrales de la config. Interno.
create function public._compras_avisos_candidatos(p_tipos text[], p_pedido_id uuid)
returns table (
  tipo text, entidad_id uuid, pedido_id uuid, huella text,
  numero int, codigo text, proveedor_nombre text, insumo_nombre text, unidad text,
  cantidad numeric, minimo numeric, dias int, pendientes int
)
language sql
stable
security definer
set search_path = public
as $$
  select 'remito_listo', c.pedido_id, c.pedido_id, '', c.numero, null::text, c.proveedor_nombre,
         null::text, null::text, null::numeric, null::numeric, null::int, null::int
  from _compras_pedidos_por_facturar() c
  where 'remito_listo' = any(p_tipos) and (p_pedido_id is null or c.pedido_id = p_pedido_id)
  union all
  select 'pedido_demorado', b.pedido_id, b.pedido_id, b.enviado_en::text, b.numero, null, b.proveedor_nombre,
         null, null, null, null, b.dias, null
  from _compras_pedidos_demorados(_compras_config_num('pedidos.dias_demora', 3)::int) b
  where 'pedido_demorado' = any(p_tipos) and (p_pedido_id is null or b.pedido_id = p_pedido_id)
  union all
  select 'diferencias', d.pedido_id, d.pedido_id, '', d.numero, null, d.proveedor_nombre,
         null, null, null, null, floor(extract(epoch from (now() - d.desde)) / 86400)::int, d.pendientes
  from _compras_pedidos_con_diferencias() d
  where 'diferencias' = any(p_tipos) and (p_pedido_id is null or d.pedido_id = p_pedido_id)
    and d.desde <= now() - make_interval(days => _compras_config_num('avisos.diferencias.dias', 3)::int)
  union all
  select 'nc_pendiente', e.devolucion_id, e.pedido_id, '', e.numero, e.codigo, e.proveedor_nombre,
         null, null, null, null, floor(extract(epoch from (now() - e.desde)) / 86400)::int, null
  from _compras_devoluciones_esperan_nc() e
  where 'nc_pendiente' = any(p_tipos) and (p_pedido_id is null or e.pedido_id = p_pedido_id)
    and e.desde <= now() - make_interval(days => _compras_config_num('avisos.nc_pendiente.dias', 7)::int)
  union all
  -- stock_bajo no se acota por pedido.
  select 'stock_bajo', f.item_id, null, '', null, null, null,
         f.nombre, f.unidad, f.cantidad, f.minimo, null, null
  from _compras_insumos_bajo_minimo() f
  where 'stock_bajo' = any(p_tipos) and not f.en_pedido
$$;


-- ---------------------------------------------------------------------------
-- 5. compras_avisos_tomar (§3.5, E1–E3): calcula candidatos, rearma (borra lo
--    resuelto), toma lo nuevo y devuelve SOLO lo que hay que avisar. No manda nada.
-- ---------------------------------------------------------------------------

create function public.compras_avisos_tomar(p_tipos text[] default null, p_pedido_id uuid default null)
returns table (
  tipo text, entidad_id uuid, pedido_id uuid,
  numero int, codigo text, proveedor_nombre text, insumo_nombre text, unidad text,
  cantidad numeric, minimo numeric, dias int, pendientes int, repetido boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tipos   text[];
  v_repetir int := greatest(_compras_config_num('avisos.repetir_dias', 0)::int, 0);
  v_cands   jsonb;
begin
  -- El cron, "Revisar ahora" y los remitos pueden correr a la vez: se serializan.
  perform pg_advisory_xact_lock(hashtext('compras_avisos'));

  -- Un tipo apagado no se toma (ni se rearma: si se vuelve a prender, no repite).
  select coalesce(array_agg(t), '{}') into v_tipos
  from unnest(coalesce(p_tipos, array['remito_listo', 'pedido_demorado', 'diferencias', 'nc_pendiente', 'stock_bajo'])) t
  where t in ('remito_listo', 'pedido_demorado', 'diferencias', 'nc_pendiente', 'stock_bajo')
    and _compras_config_bool('avisos.' || t || '.activo', true);

  if cardinality(v_tipos) = 0 then
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_cands
  from _compras_avisos_candidatos(v_tipos, p_pedido_id) c;

  -- Rearma: lo que dejó de estar en falta se borra; el próximo episodio vuelve a avisar.
  delete from compras_avisos_enviados e
  where e.tipo = any(v_tipos)
    and (p_pedido_id is null or e.tipo = 'stock_bajo' or e.pedido_id = p_pedido_id)
    and not exists (
      select 1 from jsonb_to_recordset(v_cands) as c(tipo text, entidad_id uuid)
      where c.tipo = e.tipo and c.entidad_id = e.entidad_id);

  -- Toma: nuevo, otra huella (otro episodio) o le toca repetir.
  return query
  with cands as (
    select * from jsonb_to_recordset(v_cands) as c(
      tipo text, entidad_id uuid, pedido_id uuid, huella text,
      numero int, codigo text, proveedor_nombre text, insumo_nombre text, unidad text,
      cantidad numeric, minimo numeric, dias int, pendientes int)
  ),
  tomados as (
    insert into compras_avisos_enviados as e (tipo, entidad_id, pedido_id, huella)
    select c.tipo, c.entidad_id, c.pedido_id, coalesce(c.huella, '') from cands c
    on conflict (tipo, entidad_id) do update
      set huella          = excluded.huella,
          pedido_id       = excluded.pedido_id,
          enviado_en      = now(),
          envios          = case when e.huella is distinct from excluded.huella then 1 else e.envios + 1 end,
          primer_aviso_en = case when e.huella is distinct from excluded.huella then now() else e.primer_aviso_en end
      where e.huella is distinct from excluded.huella
         or (v_repetir > 0 and e.enviado_en <= now() - make_interval(days => v_repetir))
    returning e.tipo, e.entidad_id, e.envios
  )
  select c.tipo, c.entidad_id, c.pedido_id, c.numero, c.codigo, c.proveedor_nombre, c.insumo_nombre, c.unidad,
         c.cantidad, c.minimo, c.dias, c.pendientes, t.envios > 1
  from tomados t
  join cands c on c.tipo = t.tipo and c.entidad_id = t.entidad_id
  order by c.tipo, c.numero nulls last, c.insumo_nombre;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. compras_tablero_resumen (§3.6, E10): agregados, cero filas. Los campos de
--    admin vienen en null para el resto, desde la base.
-- ---------------------------------------------------------------------------

create function public.compras_tablero_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin  boolean := es_admin();
  v_dias   int := greatest(_compras_config_num('pedidos.dias_demora', 3)::int, 1);
  v_res    jsonb;
  v_est    numeric;
  v_sin    int;
  v_pend   numeric;
  v_favor  numeric;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_res := jsonb_build_object(
    'dias_demora', v_dias,
    'por_recibir', (select count(*) from _compras_pedidos_por_recibir()),
    'demorados', (select count(*) from _compras_pedidos_demorados(v_dias)),
    'por_facturar', (select count(*) from _compras_pedidos_por_facturar()),
    'stock_bajo', (select count(*) from _compras_insumos_bajo_minimo()),
    'stock_bajo_sin_pedido', (select count(*) from _compras_insumos_bajo_minimo() where not en_pedido));

  if not v_admin then
    return v_res || jsonb_build_object(
      'por_facturar_estimado', null, 'por_facturar_sin_precio', null, 'diferencias', null,
      'nc_pendientes', null, 'deuda_pendiente', null, 'deuda_a_favor', null);
  end if;

  -- D3: lo recibido neto de los pedidos por facturar, a precio_ref del proveedor, sin IVA.
  -- Neto como v_compras_pedido_pendiente (recibido − devuelto con mercadería).
  select coalesce(sum(l.cant * l.precio_ref) filter (where l.precio_ref is not null), 0),
         count(*) filter (where l.precio_ref is null)::int
    into v_est, v_sin
  from (
    select ip.precio_ref,
           case when coalesce(ip.cobra_por, i.cobra_por_default) = 'base'
                then case when r.completo
                          then coalesce(r.recibido_base, 0) - coalesce(dv.devuelto_base, 0)
                          else (coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0)) * coalesce(i.cantidad_por_unidad, 1) end
                else coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0) end as cant
    from _compras_pedidos_por_facturar() pf
    join compras_pedido_items pi on pi.pedido_id = pf.pedido_id
    left join compras_items i on i.id = pi.item_id
    left join compras_item_proveedores ip on ip.item_id = pi.item_id and ip.proveedor_id = pf.proveedor_id
    left join lateral (
      select sum(ri.cantidad) as recibido, sum(ri.cantidad_base) as recibido_base,
             bool_and(ri.cantidad_base is not null) as completo
      from compras_remito_items ri where ri.pedido_item_id = pi.id
    ) r on true
    left join lateral (
      select sum(di.cantidad) as devuelto,
             sum(coalesce(di.cantidad_base, di.cantidad * i.cantidad_por_unidad)) as devuelto_base
      from compras_devolucion_items di
      join compras_devoluciones d on d.id = di.devolucion_id
      where di.pedido_item_id = pi.id and d.estado = 'activa' and d.devuelve_mercaderia
    ) dv on true
    where coalesce(r.recibido, 0) > 0
  ) l;
  -- Una línea sin item_id no tiene precio_ref: cuenta como "sin precio" por el left join.

  -- Deuda: replica estadoPago + resumirPagos (lib/compras/reportes.ts) sobre
  -- comprobantes confirmados; la NC hereda el gasto de su factura origen (v_compras_facturas).
  select coalesce(sum(case when f.tipo_comprobante = 'nota_credito' then -f.total else f.total end)
                    filter (where not (f.tipo_comprobante = 'nota_credito' and f.nc_gasto in ('a_favor', 'sin_gasto'))
                              and coalesce(f.gasto_id, fo.gasto_id) is not null
                              and coalesce(g.estado, go.estado) is distinct from 'Pagado'), 0),
         coalesce(sum(-f.total) filter (where f.tipo_comprobante = 'nota_credito' and f.nc_gasto = 'a_favor'), 0)
    into v_pend, v_favor
  from compras_facturas f
  left join gastos g on g.id = f.gasto_id
  left join compras_facturas fo on fo.id = f.factura_origen_id
  left join gastos go on go.id = fo.gasto_id
  where f.estado = 'confirmada'
    and (f.tipo_comprobante = 'nota_credito' and f.nc_gasto = 'a_favor'
         or (coalesce(f.gasto_id, fo.gasto_id) is not null and coalesce(g.estado, go.estado) is distinct from 'Pagado'));

  return v_res || jsonb_build_object(
    'por_facturar_estimado', round(v_est, 2),
    'por_facturar_sin_precio', v_sin,
    'diferencias', (select count(*) from _compras_pedidos_con_diferencias()),
    'nc_pendientes', (select count(distinct pedido_id) from _compras_devoluciones_esperan_nc()),
    'deuda_pendiente', round(v_pend, 2),
    'deuda_a_favor', round(v_favor, 2));
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Grants (§3.7)
-- ---------------------------------------------------------------------------

revoke execute on function public._compras_config_num(text, numeric) from public, anon, authenticated;
revoke execute on function public._compras_config_bool(text, boolean) from public, anon, authenticated;
revoke execute on function public._compras_pedidos_por_recibir() from public, anon, authenticated;
revoke execute on function public._compras_pedidos_demorados(int) from public, anon, authenticated;
revoke execute on function public._compras_pedidos_por_facturar() from public, anon, authenticated;
revoke execute on function public._compras_pedidos_con_diferencias() from public, anon, authenticated;
revoke execute on function public._compras_devoluciones_esperan_nc() from public, anon, authenticated;
revoke execute on function public._compras_insumos_bajo_minimo() from public, anon, authenticated;
revoke execute on function public._compras_avisos_candidatos(text[], uuid) from public, anon, authenticated;

revoke execute on function public.compras_avisos_tomar(text[], uuid) from public, anon, authenticated;
grant execute on function public.compras_avisos_tomar(text[], uuid) to service_role;

revoke execute on function public.compras_tablero_resumen() from public, anon;
grant execute on function public.compras_tablero_resumen() to authenticated;
