-- ============================================================================
-- F5 (Bloque 1 facturación): diferencias factura/recepción y gasto automático.
--
-- Diferencias (FA9): una factura confirmada se compara, insumo por insumo, con
-- lo que llegó por remitos. Lo que no coincide queda en
-- compras_factura_discrepancias. Mientras la recepción no esté completa se
-- muestra como "Pendiente de llegar"; completa, se resuelve con Ajustar stock,
-- Reclamo al proveedor o Ignorar, y cada una se puede revertir.
-- La mantiene compras_recalcular_diferencias_factura(), desde cero, sin
-- triggers: la llaman confirmar factura y guardar remito (F6: devoluciones).
--
-- Gasto (F6 del 22-09, FA10): confirmar la factura crea el gasto "Pendiente de
-- pago" o vincula uno cargado a mano. El local se elige al confirmar (default
-- en compras_config); rubro, categoría y forma de pago salen de compras_config
-- (decisión del usuario, 2026-09-29).
--
-- Cuerpos de partida: 20260928190000_compras_facturas.sql (mover_stock,
-- confirmar y anular factura, v_compras_facturas, v_compras_pedido_eventos) y
-- 20260925121000_compras_rpcs_remitos_stock.sql (guardar remito, revertir
-- movimiento).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Defaults del gasto automático.
-- ----------------------------------------------------------------------------
insert into public.compras_config (clave, valor, descripcion) values
  ('gasto.local', '"YA! FABRICA"'::jsonb,
   'Local que viene elegido al confirmar una factura de compras (se puede cambiar en cada factura).'),
  ('gasto.rubro', '"MATERIA PRIMA"'::jsonb,
   'Rubro del gasto que se crea al confirmar una factura de compras.'),
  ('gasto.categoria', '"MATERIA PRIMA"'::jsonb,
   'Categoría del gasto que se crea al confirmar una factura de compras.'),
  ('gasto.forma_pago', '"Transferencia"'::jsonb,
   'Forma de pago con la que nace el gasto de una factura. Se reemplaza por la real al pagarlo.')
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Diferencias entre lo facturado y lo recibido.
--    Una fila por insumo (clave = 'item:<item_id>'): el stock es por insumo, y
--    comparar por línea del pedido partía en dos diferencias opuestas un mismo
--    insumo cargado como línea libre en el remito (P7) y como línea del pedido
--    en la factura (salió del code-review). pedido_item_id queda como
--    referencia cuando hay una sola línea del pedido para ese insumo.
-- ----------------------------------------------------------------------------
create table if not exists compras_factura_discrepancias (
  id                 uuid primary key default gen_random_uuid(),
  factura_id         uuid not null references compras_facturas(id) on delete cascade,
  clave              text not null,
  pedido_item_id     uuid references compras_pedido_items(id) on delete set null,
  item_id            uuid not null references compras_items(id),
  descripcion        text not null,
  unidad             text,
  cantidad_recibida  numeric not null,
  cantidad_facturada numeric not null,
  diferencia         numeric generated always as (cantidad_facturada - cantidad_recibida) stored,
  resolucion         text not null default 'pendiente'
    check (resolucion in ('pendiente', 'ajusta_stock', 'reclamo_proveedor', 'ignorada')),
  movimiento_id      uuid references compras_stock_movimientos(id),
  nota               text,
  resuelto_por       uuid references profiles(id),
  resuelto_en        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint compras_factura_discrepancias_clave_unica unique (factura_id, clave),
  constraint compras_factura_discrepancias_ajuste_con_movimiento
    check (resolucion <> 'ajusta_stock' or movimiento_id is not null)
);
create index if not exists idx_compras_factura_discrepancias_pendientes
  on compras_factura_discrepancias (factura_id) where resolucion = 'pendiente';

alter table compras_factura_discrepancias enable row level security;
-- Solo lectura para admin: se escribe únicamente por RPC.
drop policy if exists compras_factura_discrepancias_admin on compras_factura_discrepancias;
create policy compras_factura_discrepancias_admin on compras_factura_discrepancias
  for select using (es_admin());

alter table compras_stock_movimientos
  add column if not exists discrepancia_id uuid references compras_factura_discrepancias(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3. Gasto de la factura. Un solo puntero (factura → gasto): gasto_generado
--    dice si lo creó la factura (se borra al anularla) o si era un gasto
--    cargado a mano que se vinculó (se desvincula).
-- ----------------------------------------------------------------------------
alter table compras_facturas
  add column if not exists gasto_id uuid references gastos(id) on delete set null,
  add column if not exists gasto_generado boolean not null default false;
create unique index if not exists compras_facturas_gasto_unico
  on compras_facturas (gasto_id) where gasto_id is not null;

-- ----------------------------------------------------------------------------
-- 4. compras_mover_stock suma discrepancia_id (cuerpo de 20260928190000).
-- ----------------------------------------------------------------------------
drop function if exists public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid);

create or replace function public.compras_mover_stock(
  p_item_id uuid,
  p_delta numeric,
  p_tipo text,
  p_motivo text default null,
  p_remito_id uuid default null,
  p_conteo_id uuid default null,
  p_anula_movimiento_id uuid default null,
  p_factura_id uuid default null,
  p_discrepancia_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes numeric;
  v_saldo numeric;
  v_id    uuid;
begin
  if p_delta is null or p_delta = 0 then
    return null;
  end if;

  insert into compras_stock_actual (item_id, cantidad) values (p_item_id, 0)
  on conflict (item_id) do nothing;

  select cantidad into v_antes from compras_stock_actual where item_id = p_item_id for update;

  -- Hasta F7 el conteo de fábrica escribe la caché con lo contado: lo contado
  -- manda. Si el ledger no llega a la caché, primero se registra esa diferencia.
  select coalesce(sum(delta), 0) into v_saldo
  from compras_stock_movimientos where item_id = p_item_id;
  if v_saldo <> v_antes then
    insert into compras_stock_movimientos (item_id, delta, tipo, motivo, cantidad_antes, cantidad_despues, creado_por)
    values (p_item_id, v_antes - v_saldo, 'conteo_fabrica', 'Diferencia del conteo de fábrica sin registrar', v_saldo, v_antes, auth.uid());
  end if;

  insert into compras_stock_movimientos (
    item_id, delta, tipo, motivo, remito_id, conteo_id, anula_movimiento_id, factura_id, discrepancia_id,
    cantidad_antes, cantidad_despues, creado_por
  ) values (
    p_item_id, p_delta, p_tipo, nullif(btrim(p_motivo), ''), p_remito_id, p_conteo_id, p_anula_movimiento_id,
    p_factura_id, p_discrepancia_id,
    v_antes, v_antes + p_delta, auth.uid()
  )
  returning id into v_id;

  update compras_stock_actual
    set cantidad = v_antes + p_delta,
        actualizado_en = now(),
        actualizado_por = auth.uid()
    where item_id = p_item_id;

  return v_id;
end;
$$;

revoke execute on function public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Cálculo y recálculo de diferencias (internas).
-- ----------------------------------------------------------------------------

-- Lo facturado contra lo recibido, por insumo. Solo líneas con insumo: una línea
-- sin insumo (flete, FA7) no es mercadería y no genera diferencia. Cuenta
-- también lo que llegó y no está en la factura (facturada = 0).
create or replace function public.compras_diferencias_calculadas(p_factura_id uuid)
returns table (
  clave text, pedido_item_id uuid, item_id uuid, descripcion text, unidad text,
  recibida numeric, facturada numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select id, pedido_id from compras_facturas where id = p_factura_id
  ),
  facturado as (
    select fi.item_id, sum(fi.cantidad) as cantidad
    from compras_factura_items fi
    join f on f.id = fi.factura_id
    where fi.item_id is not null
    group by fi.item_id
  ),
  recibido as (
    select ri.item_id, sum(ri.cantidad) as cantidad
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    join f on f.pedido_id = r.pedido_id
    where ri.item_id is not null
    group by ri.item_id
  ),
  -- La línea del pedido de ese insumo, solo si hay exactamente una.
  lineas as (
    select pi.item_id, (array_agg(pi.id))[1] as pedido_item_id
    from compras_pedido_items pi
    join f on f.pedido_id = pi.pedido_id
    where pi.item_id is not null
    group by pi.item_id
    having count(*) = 1
  )
  select 'item:' || coalesce(fa.item_id, re.item_id)::text,
         l.pedido_item_id,
         coalesce(fa.item_id, re.item_id),
         i.nombre,
         i.unidad,
         coalesce(re.cantidad, 0),
         coalesce(fa.cantidad, 0)
  from facturado fa
  full join recibido re on re.item_id = fa.item_id
  join compras_items i on i.id = coalesce(fa.item_id, re.item_id)
  left join lineas l on l.item_id = coalesce(fa.item_id, re.item_id);
$$;

revoke execute on function public.compras_diferencias_calculadas(uuid) from public, anon, authenticated;

-- Desde cero. Las pendientes se crean, actualizan o borran según el cálculo.
-- Una resuelta como Reclamo o Ignorar vuelve a pendiente si cambiaron sus
-- números y desaparece si ahora coincide. Una ajustada en el stock no se toca:
-- si un remito la cambiaría, se frena (R3) y el remito no se guarda.
create or replace function public.compras_recalcular_diferencias_factura(p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura  compras_facturas%rowtype;
  v_ajustada record;
begin
  select * into v_factura from compras_facturas where id = p_factura_id;
  if not found or v_factura.tipo_comprobante <> 'factura' then
    return;
  end if;
  if v_factura.estado <> 'confirmada' then
    delete from compras_factura_discrepancias where factura_id = p_factura_id;
    return;
  end if;

  select d.descripcion into v_ajustada
  from compras_factura_discrepancias d
  left join compras_diferencias_calculadas(p_factura_id) c on c.clave = d.clave
  where d.factura_id = p_factura_id
    and d.resolucion = 'ajusta_stock'
    and (coalesce(c.recibida, 0) <> d.cantidad_recibida or coalesce(c.facturada, 0) <> d.cantidad_facturada)
  limit 1;
  if found then
    raise exception 'La línea "%" ya se ajustó desde la factura de este pedido. Para registrar el remito, primero hay que revertir ese ajuste (en la factura, "Diferencias con lo recibido").',
      v_ajustada.descripcion;
  end if;

  delete from compras_factura_discrepancias d
  where d.factura_id = p_factura_id
    and d.resolucion <> 'ajusta_stock'
    and not exists (
      select 1 from compras_diferencias_calculadas(p_factura_id) c
      where c.clave = d.clave and c.facturada <> c.recibida
    );

  update compras_factura_discrepancias d
    set cantidad_recibida = c.recibida,
        cantidad_facturada = c.facturada,
        pedido_item_id = c.pedido_item_id,
        descripcion = c.descripcion,
        unidad = c.unidad,
        resolucion = 'pendiente',
        nota = null,
        resuelto_por = null,
        resuelto_en = null,
        updated_at = now()
    from compras_diferencias_calculadas(p_factura_id) c
    where d.factura_id = p_factura_id
      and c.clave = d.clave
      and d.resolucion <> 'ajusta_stock'
      and (d.cantidad_recibida <> c.recibida or d.cantidad_facturada <> c.facturada);

  insert into compras_factura_discrepancias (
    factura_id, clave, pedido_item_id, item_id, descripcion, unidad, cantidad_recibida, cantidad_facturada
  )
  select p_factura_id, c.clave, c.pedido_item_id, c.item_id, c.descripcion, c.unidad, c.recibida, c.facturada
  from compras_diferencias_calculadas(p_factura_id) c
  where c.facturada <> c.recibida
  on conflict (factura_id, clave) do nothing;
end;
$$;

revoke execute on function public.compras_recalcular_diferencias_factura(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Guardar remito: recalcula las diferencias de la factura del pedido (R3).
--    Cuerpo de 20260925121000 + la última línea antes del return.
-- ----------------------------------------------------------------------------
create or replace function public.compras_guardar_remito(
  p_remito_id uuid default null,
  p_pedido_id uuid default null,
  p_fecha date default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id   uuid;
  v_pedido      compras_pedidos%rowtype;
  v_remito      compras_remitos%rowtype;
  v_es_nuevo    boolean := p_remito_id is null;
  v_codigo      text;
  v_ids         uuid[];
  v_antes       jsonb;
  v_linea       record;
  v_item_id     uuid;
  v_pi_id       uuid;
  v_mov         record;
  v_despues     numeric;
  v_impacto     jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas del remito vienen mal armadas. Recargá la página.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha del remito.';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Cargá al menos una línea con cantidad.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, 0) <= 0
  ) then
    raise exception 'Cada línea necesita una descripción y una cantidad mayor a 0.';
  end if;

  -- Pedido primero (orden de bloqueo), después el remito.
  if v_es_nuevo then
    v_pedido_id := p_pedido_id;
    if v_pedido_id is null then
      raise exception 'Elegí el pedido al que corresponde el remito.';
    end if;
  else
    select pedido_id into v_pedido_id from compras_remitos where id = p_remito_id;
    if not found then
      raise exception 'No encontramos el remito. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    if p_pedido_id is not null and p_pedido_id <> v_pedido_id then
      raise exception 'Un remito no se puede pasar a otro pedido: eliminalo y cargalo en el correcto.';
    end if;
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'El pedido % todavía no se envió: marcalo como enviado antes de cargar un remito.',
      'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  if v_es_nuevo then
    -- El pedido está bloqueado: el contador no se pisa entre dos cargas.
    update compras_pedidos
      set ultima_secuencia_remito = greatest(
        ultima_secuencia_remito,
        (select coalesce(max(secuencia), 0) from compras_remitos where pedido_id = v_pedido.id)
      ) + 1
      where id = v_pedido.id
      returning ultima_secuencia_remito into v_pedido.ultima_secuencia_remito;
    insert into compras_remitos (pedido_id, secuencia, fecha, creado_por)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, p_fecha, auth.uid())
    returning * into v_remito;
  else
    select * into v_remito from compras_remitos where id = p_remito_id for update;
    if not found then
      raise exception 'No encontramos el remito. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    update compras_remitos set fecha = p_fecha where id = v_remito.id;
  end if;

  v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

  -- Ids de líneas que se conservan (tienen que ser de este remito).
  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(p_items) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_remito_items ri where ri.id = x.id and ri.remito_id = v_remito.id)
  ) then
    raise exception 'Alguien cambió este remito mientras lo editabas. Recargá la página.';
  end if;

  -- Lo que el remito sumaba por insumo antes de este guardado.
  select coalesce(jsonb_object_agg(item_id, total), '{}'::jsonb)
    into v_antes
  from (
    select item_id, sum(cantidad) as total
    from compras_remito_items
    where remito_id = v_remito.id and item_id is not null
    group by item_id
  ) s;

  delete from compras_remito_items ri
  where ri.remito_id = v_remito.id and ri.id <> all (v_ids);

  for v_linea in
    select e from jsonb_array_elements(p_items) as t(e)
  loop
    v_pi_id := nullif(v_linea.e->>'pedido_item_id', '')::uuid;
    if v_pi_id is not null then
      select pi.item_id into v_item_id
      from compras_pedido_items pi
      where pi.id = v_pi_id and pi.pedido_id = v_pedido.id;
      if not found then
        raise exception 'Una línea del pedido ya no existe (alguien editó el pedido). Recargá la página.';
      end if;
    else
      v_item_id := nullif(v_linea.e->>'item_id', '')::uuid;
      if v_item_id is not null and not exists (select 1 from compras_items where id = v_item_id) then
        raise exception 'Uno de los insumos elegidos ya no existe. Recargá la página.';
      end if;
    end if;

    if nullif(v_linea.e->>'id', '') is not null then
      update compras_remito_items
        set pedido_item_id = v_pi_id,
            item_id = v_item_id,
            descripcion = btrim(v_linea.e->>'descripcion'),
            cantidad = (v_linea.e->>'cantidad')::numeric
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad)
      values (v_remito.id, v_pi_id, v_item_id, btrim(v_linea.e->>'descripcion'), (v_linea.e->>'cantidad')::numeric);
    end if;
  end loop;

  -- Reconciliación por diferencia, insumo por insumo.
  for v_mov in
    select coalesce(n.item_id, a.item_id) as item_id,
           coalesce(n.total, 0) - coalesce(a.total, 0) as delta
    from (
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    ) n
    full join (
      select key::uuid as item_id, value::numeric as total from jsonb_each_text(v_antes)
    ) a on a.item_id = n.item_id
  loop
    continue when v_mov.delta = 0;
    perform compras_mover_stock(
      v_mov.item_id,
      v_mov.delta,
      case when v_mov.delta > 0 then 'entrada_remito' else 'salida_remito_anulado' end,
      case when v_es_nuevo then 'Remito ' || v_codigo else 'Remito ' || v_codigo || ' editado' end,
      v_remito.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
    v_impacto := v_impacto || jsonb_build_object(
      'item_id', v_mov.item_id,
      'nombre', (select nombre from compras_items where id = v_mov.item_id),
      'unidad', (select unidad from compras_items where id = v_mov.item_id),
      'delta', v_mov.delta,
      'cantidad_despues', v_despues
    );
  end loop;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  -- F5: un remito que llega después de la factura (FA2, R3) mueve sus diferencias.
  perform compras_recalcular_diferencias_factura(f.id)
  from compras_facturas f
  where f.pedido_id = v_pedido.id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada';

  return jsonb_build_object(
    'id', v_remito.id,
    'secuencia', v_remito.secuencia,
    'codigo', v_codigo,
    'impacto', v_impacto
  );
end;
$$;

revoke execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Resolver y revertir una diferencia (solo admin).
-- ----------------------------------------------------------------------------
create or replace function public.compras_resolver_diferencia(
  p_diferencia_id uuid default null,
  p_resolucion text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_dif        compras_factura_discrepancias%rowtype;
  v_mov_id     uuid;
  v_despues    numeric;
  v_codigo     text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede resolver diferencias de facturas.';
  end if;
  if p_resolucion is null or p_resolucion not in ('ajusta_stock', 'reclamo_proveedor', 'ignorada') then
    raise exception 'Elegí qué hacer con la diferencia.';
  end if;

  select d.factura_id, f.pedido_id into v_factura_id, v_pedido_id
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  where d.id = p_diferencia_id;
  if not found then
    raise exception 'Esa diferencia ya no está: puede que un remito la haya hecho coincidir. Recargá la página.';
  end if;

  -- Orden de bloqueo: pedido → factura → diferencia → stock.
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = v_factura_id for update;
  select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id for update;
  if not found then
    raise exception 'Esa diferencia ya no está: puede que un remito la haya hecho coincidir. Recargá la página.';
  end if;

  v_codigo := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if v_factura.estado <> 'confirmada' then
    raise exception 'La factura ya no está confirmada. Recargá la página.';
  end if;
  if v_dif.resolucion <> 'pendiente' then
    raise exception 'Esa diferencia ya se resolvió. Recargá la página para ver cómo quedó.';
  end if;
  if v_pedido.estado_recepcion not in ('recibido', 'cerrado_manual', 'devuelto') then
    raise exception 'Todavía falta recibir mercadería de %. Esperá el próximo remito o, si no va a llegar, cerrá el pedido a mano.', v_codigo;
  end if;

  if p_resolucion = 'ajusta_stock' then
    v_mov_id := compras_mover_stock(
      v_dif.item_id, v_dif.diferencia, 'ajuste_factura',
      'Diferencia con la factura ' || v_factura.numero || ' (' || v_codigo || ')'
        || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
      null, null, null, v_factura.id, v_dif.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_dif.item_id;
  end if;

  update compras_factura_discrepancias
    set resolucion = p_resolucion,
        movimiento_id = v_mov_id,
        nota = nullif(btrim(p_nota), ''),
        resuelto_por = auth.uid(),
        resuelto_en = now(),
        updated_at = now()
    where id = v_dif.id;

  return jsonb_build_object(
    'resolucion', p_resolucion,
    'delta', case when v_mov_id is null then null else v_dif.diferencia end,
    'cantidad_despues', v_despues
  );
end;
$$;

revoke execute on function public.compras_resolver_diferencia(uuid, text, text) from public, anon;
grant execute on function public.compras_resolver_diferencia(uuid, text, text) to authenticated;

create or replace function public.compras_revertir_diferencia(p_diferencia_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_dif        compras_factura_discrepancias%rowtype;
  v_mov        compras_stock_movimientos%rowtype;
  v_despues    numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede revertir diferencias de facturas.';
  end if;

  select d.factura_id, f.pedido_id into v_factura_id, v_pedido_id
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  where d.id = p_diferencia_id;
  if not found then
    raise exception 'Esa diferencia ya no está. Recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = v_factura_id for update;
  select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id for update;
  if not found then
    raise exception 'Esa diferencia ya no está. Recargá la página.';
  end if;
  if v_dif.resolucion = 'pendiente' then
    raise exception 'Esa diferencia ya está pendiente. Recargá la página.';
  end if;

  if v_dif.resolucion = 'ajusta_stock' then
    select * into v_mov from compras_stock_movimientos where id = v_dif.movimiento_id;
    perform compras_mover_stock(
      v_mov.item_id, -v_mov.delta, 'reversion',
      'Se revirtió el ajuste por la factura ' || v_factura.numero,
      null, null, v_mov.id, v_factura.id, v_dif.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
  end if;

  update compras_factura_discrepancias
    set resolucion = 'pendiente',
        movimiento_id = null,
        nota = null,
        resuelto_por = null,
        resuelto_en = null,
        updated_at = now()
    where id = v_dif.id;

  perform compras_recalcular_diferencias_factura(v_factura.id);

  return jsonb_build_object(
    'delta', case when v_mov.id is null then null else -v_mov.delta end,
    'cantidad_despues', v_despues
  );
end;
$$;

revoke execute on function public.compras_revertir_diferencia(uuid) from public, anon;
grant execute on function public.compras_revertir_diferencia(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Revertir desde Stock: un ajuste que salió de una diferencia se revierte
--    desde la factura, para que la diferencia no quede marcada como ajustada.
--    Cuerpo de 20260925121000 + ese bloqueo.
-- ----------------------------------------------------------------------------
create or replace function public.compras_revertir_movimiento(
  p_movimiento_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov     compras_stock_movimientos%rowtype;
  v_id      uuid;
  v_despues numeric;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué revertís el ajuste: queda en el historial del insumo.';
  end if;

  select * into v_mov from compras_stock_movimientos where id = p_movimiento_id for update;
  if not found then
    raise exception 'No encontramos ese movimiento. Recargá la página.';
  end if;
  if v_mov.tipo not in ('ajuste_manual', 'ajuste_conteo', 'ajuste_factura') then
    raise exception 'Solo se pueden revertir ajustes. Un remito se corrige editándolo o eliminándolo.';
  end if;
  if v_mov.discrepancia_id is not null then
    raise exception 'Ese ajuste salió de una diferencia con la factura: revertilo desde la factura, en "Diferencias con lo recibido".';
  end if;
  if exists (select 1 from compras_stock_movimientos where anula_movimiento_id = v_mov.id) then
    raise exception 'Ese ajuste ya se revirtió.';
  end if;
  -- Los movimientos anteriores al saldo inicial (sin cantidad_despues) ya
  -- quedaron absorbidos por la apertura: revertirlos descuadraría el stock.
  if v_mov.cantidad_despues is null then
    raise exception 'Ese ajuste es anterior al registro de movimientos: si el stock no coincide, cargá un ajuste nuevo.';
  end if;

  v_id := compras_mover_stock(
    v_mov.item_id, -v_mov.delta, 'reversion', p_motivo, null, null, v_mov.id
  );
  select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;

  return jsonb_build_object('movimiento_id', v_id, 'delta', -v_mov.delta, 'despues', v_despues);
end;
$$;

revoke execute on function public.compras_revertir_movimiento(uuid, text) from public, anon;
grant execute on function public.compras_revertir_movimiento(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Gasto: candidatos (FA10), confirmar y anular.
-- ----------------------------------------------------------------------------

-- Gastos del mismo proveedor que podrían ser esta factura cargada a mano:
-- monto ±1 %, fecha ±15 días y sin factura vinculada.
create or replace function public.compras_buscar_gasto_candidato(
  p_proveedor_id uuid default null,
  p_monto numeric default null,
  p_fecha date default null
)
returns table (
  id uuid, fecha date, monto numeric, estado text, local text, categoria text, observaciones text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ver los gastos.';
  end if;
  if p_proveedor_id is null or p_monto is null or p_monto <= 0 or p_fecha is null then
    return;
  end if;

  return query
  select g.id, g.fecha, g.monto, g.estado, g.local, g.categoria, g.observaciones
  from gastos g
  where g.proveedor_id = p_proveedor_id
    and abs(g.monto - p_monto) <= p_monto * 0.01
    and g.fecha between p_fecha - 15 and p_fecha + 15
    and not exists (select 1 from compras_facturas f where f.gasto_id = g.id)
  order by abs(g.monto - p_monto), abs(g.fecha - p_fecha)
  limit 5;
end;
$$;

revoke execute on function public.compras_buscar_gasto_candidato(uuid, numeric, date) from public, anon;
grant execute on function public.compras_buscar_gasto_candidato(uuid, numeric, date) to authenticated;

-- Confirmar: cuerpo de 20260928190000 + las diferencias y el gasto.
drop function if exists public.compras_confirmar_factura(uuid, boolean, boolean);

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
    insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad)
    select v_remito.id, fi.pedido_item_id, fi.item_id, fi.descripcion, fi.cantidad
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
  end if;

  if coalesce(p_actualizar_precios, false) then
    -- Un insumo puede venir en más de una línea (dos bultos, dos precios). Sin
    -- elegir cuál, el UPDATE tomaría una fila al azar: se usa la última línea
    -- de la factura para ese insumo, que es la que quedó más abajo en el papel.
    update compras_item_proveedores ip
      set precio_ref = u.precio_unitario
      from (
        select distinct on (fi.item_id) fi.item_id, fi.precio_unitario
        from compras_factura_items fi
        where fi.factura_id = v_factura.id and fi.item_id is not null and fi.precio_unitario > 0
        order by fi.item_id, fi.orden desc, fi.id desc
      ) u
      where u.item_id = ip.item_id
        and ip.proveedor_id = v_factura.proveedor_id
        and ip.activo;
  end if;

  -- Gasto (F6 del 22-09 / FA10).
  if p_gasto_existente_id is not null then
    v_gasto_id := v_gasto.id;
    update gastos
      set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Vinculado a la factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || '.')
      where id = v_gasto.id;
  elsif v_factura.total > 0 then
    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones, created_by)
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
      auth.uid()
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
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id)
  );
end;
$$;

revoke execute on function public.compras_confirmar_factura(uuid, boolean, boolean, uuid, text) from public, anon;
grant execute on function public.compras_confirmar_factura(uuid, boolean, boolean, uuid, text) to authenticated;

-- Anular: cuerpo de 20260928190000 + los ajustes de stock y el gasto.
create or replace function public.compras_anular_factura(
  p_factura_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id    uuid;
  v_pedido       compras_pedidos%rowtype;
  v_factura      compras_facturas%rowtype;
  v_gasto        gastos%rowtype;
  v_remito       compras_remitos%rowtype;
  v_codigo       text;
  v_mov          record;
  v_despues      numeric;
  v_impacto      jsonb := '[]'::jsonb;
  v_gasto_accion text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular facturas.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la factura: queda registrado.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;

  if v_factura.estado <> 'confirmada' then
    raise exception 'Solo se anula una factura confirmada. Un borrador se descarta.';
  end if;

  if exists (
    select 1 from compras_factura_discrepancias
    where factura_id = v_factura.id and resolucion = 'ajusta_stock'
  ) then
    raise exception 'Esta factura tiene diferencias que ya ajustaron el stock. Revertí esos ajustes (en "Diferencias con lo recibido") antes de anularla.';
  end if;

  if v_factura.gasto_id is not null then
    select * into v_gasto from gastos where id = v_factura.gasto_id for update;
    if found then
      if v_gasto.estado in ('Pagado', 'Parcial') then
        raise exception 'El gasto de esta factura ya está %: no se puede anular. Para corregirla, registrá una nota de crédito.',
          case v_gasto.estado when 'Pagado' then 'pagado' else 'pagado en parte' end;
      end if;
      update compras_facturas set gasto_id = null, gasto_generado = false where id = v_factura.id;
      if v_factura.gasto_generado then
        -- Existía solo por esta factura: dejarlo haría que alguien lo pague.
        delete from gastos where id = v_gasto.id;
        v_gasto_accion := 'eliminado';
      else
        update gastos
          set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
                'Se desvinculó de la factura ' || v_factura.numero || ', que se anuló: ' || btrim(p_motivo) || '.')
          where id = v_gasto.id;
        v_gasto_accion := 'desvinculado';
      end if;
    end if;
  end if;

  for v_remito in
    select * from compras_remitos where factura_id = v_factura.id and origen = 'factura' for update
  loop
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');
    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, -v_mov.total, 'salida_remito_anulado',
        'Remito ' || v_codigo || ' eliminado al anular la factura ' || v_factura.numero,
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', -v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;
    delete from compras_remitos where id = v_remito.id;
  end loop;

  update compras_facturas
    set estado = 'anulada',
        anulada_en = now(),
        anulada_por = auth.uid(),
        anulada_motivo = btrim(p_motivo)
    where id = v_factura.id;

  -- Sin factura confirmada no hay nada contra qué comparar.
  delete from compras_factura_discrepancias where factura_id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('remito_eliminado', v_codigo, 'impacto', v_impacto, 'gasto', v_gasto_accion);
end;
$$;

revoke execute on function public.compras_anular_factura(uuid, text) from public, anon;
grant execute on function public.compras_anular_factura(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Vistas.
-- ----------------------------------------------------------------------------

-- Lista de facturas: suma al final el gasto, las diferencias pendientes y la
-- recepción del pedido (define si las diferencias se pueden resolver).
create or replace view public.v_compras_facturas as
select
  f.id, f.pedido_id, f.proveedor_id, f.tipo_comprobante, f.numero, f.numero_normalizado,
  f.fecha, f.fecha_vencimiento, f.subtotal, f.iva, f.total, f.total_papel, f.mercaderia_llego,
  f.estado, f.observaciones, f.created_at, f.confirmada_en, f.anulada_en, f.anulada_motivo,
  ped.numero as pedido_numero,
  pr.nombre as proveedor_nombre,
  pc.nombre as creado_por_nombre,
  pcf.nombre as confirmada_por_nombre,
  pa.nombre as anulada_por_nombre,
  f.gasto_id,
  f.gasto_generado,
  g.estado as gasto_estado,
  g.local as gasto_local,
  ped.estado_recepcion as pedido_estado_recepcion,
  (select count(*) from compras_factura_discrepancias d
    where d.factura_id = f.id and d.resolucion = 'pendiente')::int as diferencias_pendientes
from compras_facturas f
join compras_pedidos ped on ped.id = f.pedido_id
left join proveedores pr on pr.id = f.proveedor_id
left join profiles pc on pc.id = f.creado_por
left join profiles pcf on pcf.id = f.confirmada_por
left join profiles pa on pa.id = f.anulada_por
left join gastos g on g.id = f.gasto_id
where es_admin();

grant select on public.v_compras_facturas to authenticated;

-- Diferencias con quién las resolvió (profiles no se lee entre usuarios).
create or replace view public.v_compras_factura_diferencias as
select
  d.id, d.factura_id, f.pedido_id, d.clave, d.pedido_item_id, d.item_id, d.descripcion, d.unidad,
  d.cantidad_recibida, d.cantidad_facturada, d.diferencia, d.resolucion, d.movimiento_id, d.nota,
  d.resuelto_en, pr.nombre as resuelto_por_nombre
from compras_factura_discrepancias d
join compras_facturas f on f.id = d.factura_id
left join profiles pr on pr.id = d.resuelto_por
where es_admin();

grant select on public.v_compras_factura_diferencias to authenticated;

-- Historial del pedido: suma las diferencias resueltas (solo admin, como la
-- factura). detalle = '<resolucion>|<insumo>'. Cuerpo de 20260928190000 + la rama.
create or replace view public.v_compras_pedido_eventos as
select * from (
  select p.id as pedido_id, 'creado'::text as tipo, p.created_at as fecha,
         pr.nombre as persona, null::text as detalle, null::uuid as remito_id
  from compras_pedidos p
  left join profiles pr on pr.id = p.creado_por
  union all
  select p.id, 'enviado', p.enviado_en, pr.nombre, null, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.enviado_por
  where p.enviado_en is not null
  union all
  select r.pedido_id, 'remito', r.created_at, pr.nombre, r.fecha::text, r.id
  from compras_remitos r
  left join profiles pr on pr.id = r.creado_por
  union all
  select p.id, 'cerrado', p.cerrado_manual_en, pr.nombre, p.cierre_motivo, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.cerrado_manual_por
  where p.cerrado_manual_en is not null
  union all
  select p.id, 'reabierto', p.reabierto_en, pr.nombre, null, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.reabierto_por
  where p.reabierto_en is not null
  union all
  select f.pedido_id, 'factura', f.confirmada_en, pr.nombre, f.numero, null
  from compras_facturas f
  left join profiles pr on pr.id = f.confirmada_por
  where f.confirmada_en is not null and f.tipo_comprobante = 'factura' and es_admin()
  union all
  select f.pedido_id, 'factura_anulada', f.anulada_en, pr.nombre, f.numero, null
  from compras_facturas f
  left join profiles pr on pr.id = f.anulada_por
  where f.anulada_en is not null and es_admin()
  union all
  select f.pedido_id, 'diferencia', d.resuelto_en, pr.nombre, d.resolucion || '|' || d.descripcion, null
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  left join profiles pr on pr.id = d.resuelto_por
  where d.resuelto_en is not null and es_admin()
) e
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Backfill: diferencias de las facturas confirmadas antes de F5 (en prod no
--     hay ninguna; en dev, las de la prueba de F4). Su gasto no se crea solo:
--     se confirmaron antes de que existiera.
-- ----------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from compras_facturas where estado = 'confirmada' and tipo_comprobante = 'factura'
  loop
    perform compras_recalcular_diferencias_factura(v_id);
  end loop;
end;
$$;
