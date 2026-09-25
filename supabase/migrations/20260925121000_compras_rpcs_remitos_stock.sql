-- ============================================================================
-- F3 (Bloque 1 facturación), migración B: remitos y ajustes de stock por RPC.
--
-- Todas validan tiene_acceso_compras(), mueven el stock solo con
-- compras_mover_stock() y, si tocan remitos, terminan con
-- compras_recalcular_estado_pedido(). Orden de bloqueo: pedido → remito →
-- stock del insumo (el mismo en todas, así no hay deadlocks).
--
-- Reemplaza a lib/compras/stockRemito.ts (escribía stock desde el browser, sin
-- transacción) y al recálculo interino de F2 en RemitoForm/RemitosClient.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Alta o edición de un remito. p_items: [{id?, pedido_item_id?, item_id?, descripcion, cantidad}]
-- Si la línea corresponde a una del pedido, el insumo sale de esa línea; si es
-- libre, el insumo es opcional (sin insumo no mueve stock: P7).
-- El stock se reconcilia por diferencia por insumo (R1): editar 5 → 3 genera
-- un único movimiento de −2.
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
-- Eliminar un remito: contra-movimientos de todo lo que sumó, borrado y
-- recálculo (R2). F4 le agrega el bloqueo si el pedido está facturado.
-- ----------------------------------------------------------------------------
create or replace function public.compras_eliminar_remito(p_remito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_remito    compras_remitos%rowtype;
  v_codigo    text;
  v_mov       record;
  v_despues   numeric;
  v_impacto   jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select pedido_id into v_pedido_id from compras_remitos where id = p_remito_id;
  if not found then
    raise exception 'No encontramos el remito. Puede que alguien ya lo haya borrado: recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_remito from compras_remitos where id = p_remito_id for update;
  if not found then
    raise exception 'No encontramos el remito. Puede que alguien ya lo haya borrado: recargá la página.';
  end if;

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
      'Remito ' || v_codigo || ' eliminado', v_remito.id
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

  -- remito_items se borran en cascada; los movimientos quedan (remito_id → null)
  -- y el motivo conserva el código.
  delete from compras_remitos where id = v_remito.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('codigo', v_codigo, 'impacto', v_impacto);
end;
$$;

revoke execute on function public.compras_eliminar_remito(uuid) from public, anon;
grant execute on function public.compras_eliminar_remito(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Ajuste manual: se pide la cantidad a la que tiene que quedar y el motivo.
-- ----------------------------------------------------------------------------
create or replace function public.compras_ajustar_stock(
  p_item_id uuid default null,
  p_cantidad_objetivo numeric default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes numeric;
  v_id    uuid;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué ajustás el stock: queda en el historial del insumo.';
  end if;
  if p_cantidad_objetivo is null or p_cantidad_objetivo < 0 then
    raise exception 'La cantidad tiene que ser 0 o más.';
  end if;
  if not exists (select 1 from compras_items where id = p_item_id) then
    raise exception 'No encontramos el insumo. Recargá la página.';
  end if;

  insert into compras_stock_actual (item_id, cantidad) values (p_item_id, 0)
  on conflict (item_id) do nothing;
  -- Se compara contra el stock guardado (lo que ve la pantalla); si el ledger
  -- no llegaba, compras_mover_stock registra primero esa diferencia.
  select cantidad into v_antes from compras_stock_actual where item_id = p_item_id for update;

  if p_cantidad_objetivo = v_antes then
    raise exception 'El stock ya está en esa cantidad: no hay nada que ajustar.';
  end if;

  v_id := compras_mover_stock(p_item_id, p_cantidad_objetivo - v_antes, 'ajuste_manual', p_motivo);

  return jsonb_build_object('movimiento_id', v_id, 'antes', v_antes, 'despues', p_cantidad_objetivo);
end;
$$;

revoke execute on function public.compras_ajustar_stock(uuid, numeric, text) from public, anon;
grant execute on function public.compras_ajustar_stock(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Revertir un ajuste: contra-movimiento 'reversion' que apunta al original.
-- Solo ajustes (los remitos se corrigen editando el remito) y una sola vez
-- (lo garantiza también el índice único compras_stock_movimientos_anula_unico).
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
