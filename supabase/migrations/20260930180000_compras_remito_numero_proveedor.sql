-- Número de remito del proveedor (pedido de Marcos, 2026-09-30).
-- Revierte N2: se vuelve a guardar el número impreso que trae el proveedor, en
-- la columna legacy `numero` (nullable desde 20260925120000). Es opcional y
-- libre: no es único, el código interno sigue siendo R-0001-01.

comment on column public.compras_remitos.numero is
  'Número de remito que imprime el proveedor (opcional, texto libre). El código interno es R-<pedido>-<secuencia>.';

-- La firma cambia (p_numero): se borra la de 4 argumentos para no dejar dos
-- sobrecargas con defaults que PostgREST no sabría elegir.
drop function if exists public.compras_guardar_remito(uuid, uuid, date, jsonb);

create or replace function public.compras_guardar_remito(
  p_remito_id uuid default null,
  p_pedido_id uuid default null,
  p_fecha date default null,
  p_items jsonb default '[]'::jsonb,
  p_numero text default null
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
    insert into compras_remitos (pedido_id, secuencia, fecha, numero, creado_por)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, p_fecha, nullif(btrim(p_numero), ''), auth.uid())
    returning * into v_remito;
  else
    select * into v_remito from compras_remitos where id = p_remito_id for update;
    if not found then
      raise exception 'No encontramos el remito. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    update compras_remitos set fecha = p_fecha, numero = nullif(btrim(p_numero), '') where id = v_remito.id;
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

revoke execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb, text) to authenticated;
