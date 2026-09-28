-- ============================================================================
-- F4 (Bloque 1 facturación): facturas de proveedor.
--
-- 1 factura = 1 pedido (decisión F1 del 22-09). La factura guarda el número
-- impreso (único por proveedor, normalizado a dígitos: N3), líneas con
-- cantidad × precio y alícuota de IVA por línea (F2/F3). El precio vive solo
-- acá (F5): el remito no lo pide.
--
-- Directo a factura (F4): si el pedido no tiene remitos, al confirmar se
-- pregunta si llegó la mercadería. Sí → se genera R-xxxx-NN con
-- origen='factura' y el stock suma. No → queda "Facturado · falta recibir".
-- El stock sale siempre de remitos: un solo camino.
--
-- Solo admin (P1): RLS y RPCs con es_admin().
-- F5 suma diferencias factura/recepción y el gasto automático.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. IVA por insumo (se copia a la línea de la factura y ahí es editable).
-- ----------------------------------------------------------------------------
alter table compras_items add column if not exists alicuota_iva numeric(5,2) not null default 21;
alter table compras_items drop constraint if exists compras_items_alicuota_iva_valida;
alter table compras_items add constraint compras_items_alicuota_iva_valida
  check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27));

-- ----------------------------------------------------------------------------
-- 2. Facturas y sus líneas.
-- ----------------------------------------------------------------------------
create table if not exists compras_facturas (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references compras_pedidos(id) on delete restrict,
  proveedor_id       uuid not null references proveedores(id),   -- = el del pedido (lo fija la RPC)
  tipo_comprobante   text not null default 'factura' check (tipo_comprobante in ('factura', 'nota_credito')),
  factura_origen_id  uuid references compras_facturas(id),        -- NC → factura (F6)
  numero             text not null check (nullif(btrim(numero), '') is not null),
  numero_normalizado text generated always as (regexp_replace(numero, '[^0-9]', '', 'g')) stored,
  fecha              date not null,
  fecha_vencimiento  date,
  subtotal           numeric(14,2) not null default 0,
  iva                numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  total_papel        numeric(14,2),                               -- solo referencia (FA6)
  mercaderia_llego   boolean,                                     -- respuesta de FA1/FA2
  estado             text not null default 'borrador' check (estado in ('borrador', 'confirmada', 'anulada')),
  observaciones      text,
  creado_por         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  confirmada_en      timestamptz,
  confirmada_por     uuid references profiles(id),
  anulada_en         timestamptz,
  anulada_por        uuid references profiles(id),
  anulada_motivo     text
);

create unique index if not exists compras_facturas_numero_unique
  on compras_facturas (proveedor_id, tipo_comprobante, numero_normalizado) where estado <> 'anulada';
create unique index if not exists compras_facturas_una_por_pedido
  on compras_facturas (pedido_id) where tipo_comprobante = 'factura' and estado <> 'anulada';
create index if not exists idx_compras_facturas_estado on compras_facturas (estado);

create table if not exists compras_factura_items (
  id              uuid primary key default gen_random_uuid(),
  factura_id      uuid not null references compras_facturas(id) on delete cascade,
  pedido_item_id  uuid references compras_pedido_items(id) on delete restrict,
  item_id         uuid references compras_items(id),
  descripcion     text not null,
  unidad          text,
  cantidad        numeric not null check (cantidad >= 0),
  precio_unitario numeric(14,4) not null default 0 check (precio_unitario >= 0),
  alicuota_iva    numeric(5,2) not null default 21 check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27)),
  subtotal        numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  iva             numeric(14,2) generated always as (round(round(cantidad * precio_unitario, 2) * alicuota_iva / 100, 2)) stored,
  orden           int not null default 0
);
create index if not exists idx_compras_factura_items_factura on compras_factura_items (factura_id);

alter table compras_facturas enable row level security;
alter table compras_factura_items enable row level security;

drop policy if exists compras_facturas_admin on compras_facturas;
create policy compras_facturas_admin on compras_facturas for all using (es_admin()) with check (es_admin());
drop policy if exists compras_factura_items_admin on compras_factura_items;
create policy compras_factura_items_admin on compras_factura_items for all using (es_admin()) with check (es_admin());

-- Remitos generados desde una factura (FA1) y movimientos con su factura.
alter table compras_remitos
  add column if not exists origen text not null default 'manual',
  add column if not exists factura_id uuid references compras_facturas(id) on delete set null;
alter table compras_remitos drop constraint if exists compras_remitos_origen_check;
alter table compras_remitos add constraint compras_remitos_origen_check check (origen in ('manual', 'factura'));

alter table compras_stock_movimientos
  add column if not exists factura_id uuid references compras_facturas(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3. compras_mover_stock suma factura_id (cuerpo de 20260925120000 + el param).
-- ----------------------------------------------------------------------------
drop function if exists public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid);

create or replace function public.compras_mover_stock(
  p_item_id uuid,
  p_delta numeric,
  p_tipo text,
  p_motivo text default null,
  p_remito_id uuid default null,
  p_conteo_id uuid default null,
  p_anula_movimiento_id uuid default null,
  p_factura_id uuid default null
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
    item_id, delta, tipo, motivo, remito_id, conteo_id, anula_movimiento_id, factura_id,
    cantidad_antes, cantidad_despues, creado_por
  ) values (
    p_item_id, p_delta, p_tipo, nullif(btrim(p_motivo), ''), p_remito_id, p_conteo_id, p_anula_movimiento_id, p_factura_id,
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

revoke execute on function public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Recálculo del pedido: suma el eje de facturación (cuerpo de
--    20260924200000 + estado_facturacion). F6 lo extiende con devoluciones.
-- ----------------------------------------------------------------------------
create or replace function public.compras_recalcular_estado_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido       compras_pedidos%rowtype;
  v_recepcion    text;
  v_facturacion  text;
  v_lineas       integer;
  v_cubiertas    integer;
  v_con_algo     integer;
  v_remitos      integer;
  v_legacy       text;
begin
  -- auth.uid() null = migración o service role.
  if auth.uid() is not null and not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    return;
  end if;

  if v_pedido.estado_recepcion in ('cerrado_manual', 'devuelto') then
    -- Estados que se ponen a mano (o que calcula F6): no se tocan.
    v_recepcion := v_pedido.estado_recepcion;
  elsif v_pedido.enviado_en is null then
    v_recepcion := 'sin_enviar';
  else
    select count(*),
           count(*) filter (where recibido >= cantidad),
           count(*) filter (where recibido > 0)
      into v_lineas, v_cubiertas, v_con_algo
    from (
      select pi.cantidad, coalesce(sum(ri.cantidad), 0) as recibido
      from compras_pedido_items pi
      left join compras_remito_items ri on ri.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
      group by pi.id, pi.cantidad
    ) l;

    select count(*) into v_remitos from compras_remitos where pedido_id = p_pedido_id;

    if v_lineas > 0 and v_cubiertas = v_lineas then
      v_recepcion := 'recibido';
    elsif v_con_algo > 0 or v_remitos > 0 then
      -- Llegó un remito aunque no cubra ninguna línea (líneas "sin corresponder").
      v_recepcion := 'parcial';
    else
      v_recepcion := 'enviado';
    end if;
  end if;

  v_facturacion := case
    when exists (
      select 1 from compras_facturas
      where pedido_id = p_pedido_id and tipo_comprobante = 'factura' and estado = 'confirmada'
    ) then 'facturado'
    else 'sin_facturar'
  end;

  v_legacy := case
    when v_recepcion = 'sin_enviar' then 'borrador'
    when v_recepcion in ('recibido', 'cerrado_manual', 'devuelto') then 'cerrado'
    else 'enviado'
  end;

  update compras_pedidos
    set estado_recepcion = v_recepcion,
        estado_facturacion = v_facturacion,
        estado = v_legacy,
        cerrado_en = case
          when v_legacy = 'cerrado' then coalesce(cerrado_en, cerrado_manual_en, now())
          else null
        end
    where id = p_pedido_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Eliminar remito: ahora se frena si el pedido está facturado (R2/FA8).
--    Cuerpo de 20260925121000 + el bloqueo.
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

  if v_pedido.estado_facturacion = 'facturado' then
    raise exception 'El pedido % está facturado. Anulá la factura primero.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
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

-- ----------------------------------------------------------------------------
-- 6. RPCs de factura (solo admin).
-- ----------------------------------------------------------------------------

-- Alta o edición de un borrador. p_items:
-- [{id?, pedido_item_id?, item_id?, descripcion, unidad?, cantidad, precio_unitario, alicuota_iva}]
create or replace function public.compras_guardar_factura(
  p_factura_id uuid default null,
  p_pedido_id uuid default null,
  p_numero text default null,
  p_fecha date default null,
  p_vencimiento date default null,
  p_total_papel numeric default null,
  p_observaciones text default null,
  p_items jsonb default '[]'::jsonb,
  p_ids_conocidos uuid[] default null
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
  v_ids        uuid[];
  v_linea      record;
  v_pi_id      uuid;
  v_item_id    uuid;
  v_existente  record;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar facturas.';
  end if;
  if nullif(btrim(p_numero), '') is null or regexp_replace(p_numero, '[^0-9]', '', 'g') = '' then
    raise exception 'Cargá el número de la factura, tal como figura en el papel.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha de la factura.';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'El vencimiento no puede ser anterior a la fecha de la factura.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, -1) < 0
       or coalesce((e->>'precio_unitario')::numeric, -1) < 0
  ) then
    raise exception 'Cada línea necesita descripción, cantidad y precio (0 o más).';
  end if;

  -- Pedido primero (orden de bloqueo), después la factura.
  if p_factura_id is null then
    v_pedido_id := p_pedido_id;
    if v_pedido_id is null then
      raise exception 'Elegí el pedido al que corresponde la factura.';
    end if;
  else
    select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
    if not found then
      raise exception 'No encontramos la factura. Puede que alguien la haya descartado: recargá la página.';
    end if;
    if p_pedido_id is not null and p_pedido_id <> v_pedido_id then
      raise exception 'Una factura no se puede pasar a otro pedido: descartala y cargala en el correcto.';
    end if;
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'El pedido % todavía no se envió: no se le puede cargar factura.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  -- Número repetido para el proveedor (FA3): mensaje con el pedido de la otra.
  select f.id, p.numero as pedido_numero into v_existente
  from compras_facturas f
  join compras_pedidos p on p.id = f.pedido_id
  where f.proveedor_id = v_pedido.proveedor_id
    and f.tipo_comprobante = 'factura'
    and f.estado <> 'anulada'
    and f.numero_normalizado = regexp_replace(p_numero, '[^0-9]', '', 'g')
    and f.id is distinct from p_factura_id
  limit 1;
  if found then
    raise exception 'Ya cargaste la factura % de este proveedor (pedido %).',
      btrim(p_numero), 'P-' || lpad(v_existente.pedido_numero::text, 4, '0');
  end if;

  if p_factura_id is null then
    if exists (
      select 1 from compras_facturas
      where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado <> 'anulada'
    ) then
      raise exception 'El pedido % ya tiene una factura cargada. Abrila desde la lista de facturas.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    insert into compras_facturas (pedido_id, proveedor_id, numero, fecha, fecha_vencimiento, total_papel, observaciones, creado_por)
    values (v_pedido.id, v_pedido.proveedor_id, btrim(p_numero), p_fecha, p_vencimiento, p_total_papel,
            nullif(btrim(p_observaciones), ''), auth.uid())
    returning * into v_factura;
  else
    select * into v_factura from compras_facturas where id = p_factura_id for update;
    if v_factura.estado <> 'borrador' then
      raise exception 'La factura ya está %: no se puede editar.', case v_factura.estado when 'confirmada' then 'confirmada (anulala para corregirla)' else 'anulada' end;
    end if;
    update compras_facturas
      set numero = btrim(p_numero),
          fecha = p_fecha,
          fecha_vencimiento = p_vencimiento,
          total_papel = p_total_papel,
          observaciones = nullif(btrim(p_observaciones), '')
      where id = v_factura.id;
  end if;

  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_factura_items fi where fi.id = x.id and fi.factura_id = v_factura.id)
  ) then
    raise exception 'Alguien cambió esta factura mientras la editabas. Recargá la página.';
  end if;

  -- Lo que no viene en p_items se borra. Eso es correcto solo si la pantalla
  -- tenía TODAS las líneas: si cargó de menos (por un tope de filas, por
  -- ejemplo) borraría líneas que el usuario nunca vio. p_ids_conocidos son las
  -- líneas que la pantalla tenía al abrir; si alguna existente no está ahí,
  -- frenamos antes de borrar nada.
  if p_ids_conocidos is not null and exists (
    select 1 from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.id <> all (p_ids_conocidos)
  ) then
    raise exception 'Esta factura tiene líneas que no se cargaron en pantalla. Recargá la página antes de guardar.';
  end if;

  delete from compras_factura_items fi where fi.factura_id = v_factura.id and fi.id <> all (v_ids);

  for v_linea in
    select e, (ord - 1)::int as orden
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord)
  loop
    v_pi_id := nullif(v_linea.e->>'pedido_item_id', '')::uuid;
    if v_pi_id is not null then
      select pi.item_id into v_item_id from compras_pedido_items pi where pi.id = v_pi_id and pi.pedido_id = v_pedido.id;
      if not found then
        raise exception 'Una línea del pedido ya no existe (alguien editó el pedido). Recargá la página.';
      end if;
    else
      v_item_id := nullif(v_linea.e->>'item_id', '')::uuid;
    end if;

    if nullif(v_linea.e->>'id', '') is not null then
      update compras_factura_items
        set pedido_item_id = v_pi_id,
            item_id = v_item_id,
            descripcion = btrim(v_linea.e->>'descripcion'),
            unidad = nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            precio_unitario = (v_linea.e->>'precio_unitario')::numeric,
            alicuota_iva = coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
            orden = v_linea.orden
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_factura_items (factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad, precio_unitario, alicuota_iva, orden)
      values (
        v_factura.id, v_pi_id, v_item_id, btrim(v_linea.e->>'descripcion'),
        nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
        (v_linea.e->>'cantidad')::numeric,
        (v_linea.e->>'precio_unitario')::numeric,
        coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
        v_linea.orden
      );
    end if;
  end loop;

  update compras_facturas f
    set subtotal = t.subtotal, iva = t.iva, total = t.subtotal + t.iva
    from (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(iva), 0) as iva
      from compras_factura_items where factura_id = v_factura.id
    ) t
    where f.id = v_factura.id;

  -- 'items' vuelven en el orden en que se mandaron: la pantalla los pega a sus
  -- líneas, así un segundo guardado las actualiza en vez de duplicarlas.
  return (
    select jsonb_build_object(
      'id', f.id, 'subtotal', f.subtotal, 'iva', f.iva, 'total', f.total,
      'items', coalesce((
        select jsonb_agg(fi.id order by fi.orden)
        from compras_factura_items fi where fi.factura_id = f.id
      ), '[]'::jsonb)
    )
    from compras_facturas f where f.id = v_factura.id
  );
end;
$$;

drop function if exists public.compras_guardar_factura(uuid, uuid, text, date, date, numeric, text, jsonb);
revoke execute on function public.compras_guardar_factura(uuid, uuid, text, date, date, numeric, text, jsonb, uuid[]) from public, anon;
grant execute on function public.compras_guardar_factura(uuid, uuid, text, date, date, numeric, text, jsonb, uuid[]) to authenticated;

-- Confirmar un borrador. Si el pedido no tiene remitos, p_mercaderia_llego es
-- obligatorio: true genera el remito "desde factura" y suma stock (FA1); false
-- deja el pedido "Facturado · falta recibir" (FA2).
create or replace function public.compras_confirmar_factura(
  p_factura_id uuid default null,
  p_mercaderia_llego boolean default null,
  p_actualizar_precios boolean default false
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
  v_codigo     text;
  v_tiene_rem  boolean;
  v_mov        record;
  v_despues    numeric;
  v_impacto    jsonb := '[]'::jsonb;
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

  if v_factura.estado <> 'borrador' then
    raise exception 'La factura ya está %.', v_factura.estado;
  end if;
  if not exists (select 1 from compras_factura_items where factura_id = v_factura.id) then
    raise exception 'La factura no tiene líneas.';
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

  update compras_facturas
    set estado = 'confirmada',
        confirmada_en = now(),
        confirmada_por = auth.uid(),
        mercaderia_llego = case when v_tiene_rem then null else p_mercaderia_llego end
    where id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('remito_generado', v_codigo, 'impacto', v_impacto);
end;
$$;

revoke execute on function public.compras_confirmar_factura(uuid, boolean, boolean) from public, anon;
grant execute on function public.compras_confirmar_factura(uuid, boolean, boolean) to authenticated;

-- Anular una factura confirmada (FA8). Si generó el remito "desde factura", lo
-- elimina y revierte su stock. F5 le suma: no se anula con diferencias
-- ajustadas y desvincula el gasto.
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
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_remito     compras_remitos%rowtype;
  v_codigo     text;
  v_mov        record;
  v_despues    numeric;
  v_impacto    jsonb := '[]'::jsonb;
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

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('remito_eliminado', v_codigo, 'impacto', v_impacto);
end;
$$;

revoke execute on function public.compras_anular_factura(uuid, text) from public, anon;
grant execute on function public.compras_anular_factura(uuid, text) to authenticated;

-- Descartar un borrador (se borra: nunca movió stock ni confirmó nada).
create or replace function public.compras_descartar_factura(p_factura_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura compras_facturas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede descartar facturas.';
  end if;
  select * into v_factura from compras_facturas where id = p_factura_id for update;
  if not found then
    return;
  end if;
  if v_factura.estado <> 'borrador' then
    raise exception 'Solo se descarta un borrador. Una factura confirmada se anula.';
  end if;
  delete from compras_facturas where id = v_factura.id;
end;
$$;

revoke execute on function public.compras_descartar_factura(uuid) from public, anon;
grant execute on function public.compras_descartar_factura(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Lista de facturas con nombres (profiles no se lee entre usuarios).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_facturas as
select
  f.id, f.pedido_id, f.proveedor_id, f.tipo_comprobante, f.numero, f.numero_normalizado,
  f.fecha, f.fecha_vencimiento, f.subtotal, f.iva, f.total, f.total_papel, f.mercaderia_llego,
  f.estado, f.observaciones, f.created_at, f.confirmada_en, f.anulada_en, f.anulada_motivo,
  ped.numero as pedido_numero,
  pr.nombre as proveedor_nombre,
  pc.nombre as creado_por_nombre,
  pcf.nombre as confirmada_por_nombre,
  pa.nombre as anulada_por_nombre
from compras_facturas f
join compras_pedidos ped on ped.id = f.pedido_id
left join proveedores pr on pr.id = f.proveedor_id
left join profiles pc on pc.id = f.creado_por
left join profiles pcf on pcf.id = f.confirmada_por
left join profiles pa on pa.id = f.anulada_por
where es_admin();

grant select on public.v_compras_facturas to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Historial del pedido: suma la factura. Las dos ramas nuevas piden
--    es_admin() porque el número de la factura es dato de admin (P1), aunque
--    el resto del historial lo vea todo Compras.
--    Cuerpo de 20260924200000 + las dos ramas.
-- ----------------------------------------------------------------------------
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
) e
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;
