-- ============================================================================
-- B4 — Devoluciones al proveedor + nota de crédito (docs/bloque2/plan-B4.md §3).
--
-- Qué agrega:
--   1. compras_devolucion_motivos (parametrizable): dos flags deciden qué hace
--      el motivo (E1): devuelve_mercaderia (sale del stock) y corrige_precio.
--      Sin ninguno de los dos: "Facturado y no entregado" (corrige cantidad).
--   2. compras_devoluciones + compras_devolucion_items (D-0012-01). Guardan la
--      foto del motivo (E2): todo lo que se calcula después lee la copia.
--   3. La nota de crédito es una compras_facturas tipo 'nota_credito',
--      confirmada, con factura_origen_id. Sus líneas las arma el servidor (E5).
--      Baja el gasto pendiente de la factura, o queda "a favor" si ya se pagó
--      (E10); lo descontado se guarda y anular lo devuelve exacto.
--   4. RPC: compras_registrar_devolucion, compras_cargar_nota_credito,
--      compras_anular_nota_credito y compras_anular_devolucion.
--
-- Redefine (partiendo del último cuerpo de cada una):
--   compras_mover_stock               20260929120000:96-153 + p_devolucion_id
--   compras_recalcular_estado_pedido  20260928190000:163-243 + E7/E8 (devuelto pasa a calculado)
--   compras_diferencias_calculadas    20261005180000:1505-1571 + devoluciones y NC (E12)
--   compras_anular_factura            20261005180000:1376-1494 + E18
--   v_compras_pedido_pendiente        20261005180000:1580-1610
--   v_compras_facturas                20260929120000:1058-1082 (E11)
--   v_compras_factura_diferencias     20261005180000:1618-1649
--   v_compras_pedido_eventos          20261005140000:621-660 (drop + create)
--   compras_pedido_eventos_tipo_check (+ devolucion_registrada, devolucion_anulada)
--
-- No toca compras_guardar_remito / compras_eliminar_remito / compras_guardar_factura
-- / compras_confirmar_factura: la guarda "recibido ≥ devuelto" (E7) vive en el
-- recálculo del pedido, que todas llaman antes de terminar.
--
-- Invariante del ledger: cada movimiento pasa por compras_mover_stock, así que
-- compras_stock_actual.cantidad = Σ compras_stock_movimientos.delta por insumo.
--
-- Todo aditivo. Solo dev/QA: prod no se toca.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Motivos
-- ----------------------------------------------------------------------------
create table if not exists compras_devolucion_motivos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null check (nullif(btrim(nombre), '') is not null),
  devuelve_mercaderia  boolean not null default true,
  corrige_precio       boolean not null default false,
  orden                int not null default 0,
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint compras_devolucion_motivos_flags_validos check (not (devuelve_mercaderia and corrige_precio))
);
create unique index if not exists compras_devolucion_motivos_nombre_unico
  on compras_devolucion_motivos (lower(btrim(nombre)));

insert into compras_devolucion_motivos (nombre, devuelve_mercaderia, corrige_precio, orden) values
  ('Mercadería en mal estado', true,  false, 1),
  ('Producto equivocado',      true,  false, 2),
  ('Cantidad de más',          true,  false, 3),
  ('Vencido o por vencer',     true,  false, 4),
  ('Facturado y no entregado', false, false, 5),
  ('Precio mal facturado',     false, true,  6)
on conflict do nothing;

alter table compras_devolucion_motivos enable row level security;
drop policy if exists compras_devolucion_motivos_lectura on compras_devolucion_motivos;
create policy compras_devolucion_motivos_lectura on compras_devolucion_motivos
  for select using (tiene_acceso_compras());
drop policy if exists compras_devolucion_motivos_admin on compras_devolucion_motivos;
create policy compras_devolucion_motivos_admin on compras_devolucion_motivos
  for all using (es_admin()) with check (es_admin());

-- ----------------------------------------------------------------------------
-- 3.2 Devoluciones e ítems
-- ----------------------------------------------------------------------------
alter table compras_pedidos
  add column if not exists ultima_secuencia_devolucion int not null default 0;

create table if not exists compras_devoluciones (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references compras_pedidos(id) on delete restrict,
  secuencia            int not null,
  factura_id           uuid references compras_facturas(id) on delete restrict,   -- la factura que corrige (null si todavía no hay)
  motivo_id            uuid not null references compras_devolucion_motivos(id) on delete restrict,
  -- E2: foto del motivo
  motivo_nombre        text not null,
  devuelve_mercaderia  boolean not null,
  corrige_precio       boolean not null,
  repone               boolean not null,
  nota                 text,
  nota_credito_id      uuid references compras_facturas(id) on delete restrict,
  estado               text not null default 'activa' check (estado in ('activa', 'anulada')),
  creado_por           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  anulada_por          uuid references profiles(id),
  anulada_en           timestamptz,
  anulada_motivo       text,
  constraint compras_devoluciones_pedido_secuencia_key unique (pedido_id, secuencia),
  constraint compras_devoluciones_repone_con_mercaderia check (not repone or devuelve_mercaderia),
  constraint compras_devoluciones_repone_sin_nc check (not repone or nota_credito_id is null),
  constraint compras_devoluciones_anulada_con_motivo check (estado <> 'anulada' or nullif(btrim(anulada_motivo), '') is not null)
);
create index if not exists idx_compras_devoluciones_pedido on compras_devoluciones (pedido_id);
create unique index if not exists compras_devoluciones_nc_unica
  on compras_devoluciones (nota_credito_id) where nota_credito_id is not null;

create table if not exists compras_devolucion_items (
  id               uuid primary key default gen_random_uuid(),
  devolucion_id    uuid not null references compras_devoluciones(id) on delete cascade,
  pedido_item_id   uuid references compras_pedido_items(id) on delete restrict,
  item_id          uuid references compras_items(id) on delete restrict,
  factura_item_id  uuid references compras_factura_items(id) on delete restrict,   -- solo corrige_precio
  descripcion      text not null,
  unidad           text,
  cantidad         numeric not null check (cantidad > 0),
  cantidad_base    numeric check (cantidad_base is null or cantidad_base > 0),
  precio_correcto  numeric(14,4) check (precio_correcto is null or precio_correcto >= 0),   -- solo corrige_precio
  orden            int not null default 0,
  constraint compras_devolucion_items_con_referencia check (item_id is not null or factura_item_id is not null)
);
create index if not exists idx_compras_devolucion_items_devolucion on compras_devolucion_items (devolucion_id);
create index if not exists idx_compras_devolucion_items_item on compras_devolucion_items (item_id) where item_id is not null;

alter table compras_devoluciones enable row level security;
alter table compras_devolucion_items enable row level security;
drop policy if exists compras_devoluciones_lectura on compras_devoluciones;
create policy compras_devoluciones_lectura on compras_devoluciones for select using (tiene_acceso_compras());
drop policy if exists compras_devolucion_items_lectura on compras_devolucion_items;
create policy compras_devolucion_items_lectura on compras_devolucion_items for select using (tiene_acceso_compras());
-- Sin políticas de escritura: solo por RPC (security definer).
revoke insert, update, delete, truncate on compras_devoluciones, compras_devolucion_items from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3.3 Columnas nuevas en tablas existentes
-- ----------------------------------------------------------------------------
alter table compras_stock_movimientos
  add column if not exists devolucion_id uuid references compras_devoluciones(id) on delete set null;
create index if not exists idx_compras_stock_movimientos_devolucion
  on compras_stock_movimientos (devolucion_id) where devolucion_id is not null;

alter table compras_facturas
  add column if not exists nc_gasto text
    check (nc_gasto is null or nc_gasto in ('descontado', 'cancelo_gasto', 'a_favor', 'sin_gasto')),
  add column if not exists gasto_descontado numeric(14,2),
  add column if not exists gasto_forma_pago_anterior text;
alter table compras_facturas drop constraint if exists compras_facturas_nc_campos;
alter table compras_facturas add constraint compras_facturas_nc_campos
  check (tipo_comprobante = 'nota_credito' or (nc_gasto is null and gasto_descontado is null));
-- En dev hay 0 NC (§1.4): la constraint valida sin problemas.
alter table compras_facturas drop constraint if exists compras_facturas_nc_con_origen;
alter table compras_facturas add constraint compras_facturas_nc_con_origen
  check (tipo_comprobante <> 'nota_credito' or factura_origen_id is not null);

alter table compras_factura_discrepancias
  add column if not exists devolucion_id uuid references compras_devoluciones(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3.4 compras_mover_stock suma p_devolucion_id (cuerpo idéntico a 20260929120000:96-153).
--     Nota para A4: su redefinición parte de este cuerpo.
-- ----------------------------------------------------------------------------
drop function if exists public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid, uuid);

create or replace function public.compras_mover_stock(
  p_item_id uuid,
  p_delta numeric,
  p_tipo text,
  p_motivo text default null,
  p_remito_id uuid default null,
  p_conteo_id uuid default null,
  p_anula_movimiento_id uuid default null,
  p_factura_id uuid default null,
  p_discrepancia_id uuid default null,
  p_devolucion_id uuid default null   -- B4
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
    devolucion_id,  -- B4
    cantidad_antes, cantidad_despues, creado_por
  ) values (
    p_item_id, p_delta, p_tipo, nullif(btrim(p_motivo), ''), p_remito_id, p_conteo_id, p_anula_movimiento_id,
    p_factura_id, p_discrepancia_id,
    p_devolucion_id,  -- B4
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

revoke execute on function public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3.5 Helpers internos
-- ----------------------------------------------------------------------------

-- Lo devuelto con mercadería (devoluciones activas), por insumo y línea del pedido.
create or replace function public._compras_devuelto(p_pedido_id uuid)
returns table (
  item_id uuid, pedido_item_id uuid,
  devuelto numeric, devuelto_sin_repone numeric,
  devuelto_base numeric, devuelto_base_real boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select di.item_id, di.pedido_item_id,
         sum(di.cantidad),
         coalesce(sum(di.cantidad) filter (where not d.repone), 0),
         sum(coalesce(di.cantidad_base, di.cantidad * i.cantidad_por_unidad)),
         bool_and(di.cantidad_base is not null)
  from compras_devolucion_items di
  join compras_devoluciones d on d.id = di.devolucion_id
  join compras_items i on i.id = di.item_id
  where d.pedido_id = p_pedido_id and d.estado = 'activa' and d.devuelve_mercaderia
  group by di.item_id, di.pedido_item_id;
$$;

create or replace function public._compras_codigo_devolucion(p_numero int, p_secuencia int)
returns text language sql immutable set search_path = public as $$
  select 'D-' || lpad(p_numero::text, 4, '0') || '-' || lpad(p_secuencia::text, 2, '0');
$$;

-- Cantidades y pesos para los mensajes ("16,4" y "$ 1.250,50").
create or replace function public._compras_cant_txt(p numeric)
returns text language sql immutable set search_path = public as $$
  select replace(trim_scale(p)::text, '.', ',');
$$;

create or replace function public._compras_pesos_txt(p numeric)
returns text language sql immutable set search_path = public as $$
  select case when p < 0 then '-' else '' end || '$ '
      || translate(to_char(trunc(abs(round(p, 2))), 'FM999,999,999,990'), ',', '.')
      || case when abs(round(p, 2)) <> trunc(abs(round(p, 2)))
              then ',' || lpad(((abs(round(p, 2)) - trunc(abs(round(p, 2)))) * 100)::int::text, 2, '0')
              else '' end;
$$;

-- Foto de las líneas de una devolución para los eventos (sin precios).
create or replace function public.compras_lineas_devolucion_snapshot(p_devolucion_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', di.id, 'item_id', di.item_id, 'pedido_item_id', di.pedido_item_id,
           'descripcion', di.descripcion, 'unidad', di.unidad,
           'cantidad', di.cantidad, 'cantidad_base', di.cantidad_base,
           'unidad_base', i.unidad_base
         ) order by di.orden, di.id), '[]'::jsonb)
  from compras_devolucion_items di
  left join compras_items i on i.id = di.item_id
  where di.devolucion_id = p_devolucion_id;
$$;

-- E14: una diferencia ya ajustada en el stock desde la factura frena antes de mover nada.
create or replace function public._compras_exigir_sin_ajuste_factura(p_pedido_id uuid, p_item_ids uuid[], p_accion text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desc text;
begin
  select d.descripcion into v_desc
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  where f.pedido_id = p_pedido_id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'
    and d.resolucion = 'ajusta_stock' and d.item_id = any(p_item_ids)
  limit 1;
  if found then
    raise exception '% ya se ajustó desde la factura (en "Diferencias con lo recibido"). Revertí ese ajuste antes de %.', v_desc, p_accion;
  end if;
end;
$$;

-- E5: arma la NC desde los ítems de la devolución y la confirma.
-- p_lineas: [{devolucion_item_id, precio_unitario, alicuota_iva}], una por ítem.
create or replace function public._compras_crear_nota_credito(
  p_devolucion compras_devoluciones,
  p_factura compras_facturas,
  p_numero text,
  p_fecha date,
  p_lineas jsonb,
  p_total_papel numeric
)
returns compras_facturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc        compras_facturas%rowtype;
  v_codigo    text;
  v_ped_num   int;
  v_di        record;
  v_l         jsonb;
  v_fi        compras_factura_items%rowtype;
  v_ub        text;
  v_precio    numeric;
  v_alic      numeric;
  v_otras     numeric;
  v_existente record;
begin
  if nullif(btrim(p_numero), '') is null or regexp_replace(p_numero, '[^0-9]', '', 'g') = '' then
    raise exception 'Cargá el número de la nota de crédito, tal como figura en el papel.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha de la nota de crédito.';
  end if;
  if p_total_papel is not null and p_total_papel < 0 then
    raise exception 'El total según el papel no puede ser negativo.';
  end if;
  if jsonb_typeof(coalesce(p_lineas, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_lineas) <> (select count(*) from compras_devolucion_items where devolucion_id = p_devolucion.id)
     or exists (
       select 1 from jsonb_array_elements(p_lineas) l
       where not exists (select 1 from compras_devolucion_items di
                         where di.devolucion_id = p_devolucion.id and di.id::text = l->>'devolucion_item_id')
     )
     or (select count(distinct l->>'devolucion_item_id') from jsonb_array_elements(p_lineas) l) <> jsonb_array_length(p_lineas)
  then
    raise exception 'Las líneas de la nota de crédito vienen mal armadas. Recargá la página.';
  end if;

  select numero into v_ped_num from compras_pedidos where id = p_devolucion.pedido_id;
  v_codigo := _compras_codigo_devolucion(v_ped_num, p_devolucion.secuencia);

  -- Número repetido para el proveedor (mismo criterio que la factura, FA3).
  select f.numero into v_existente
  from compras_facturas f
  where f.proveedor_id = p_factura.proveedor_id and f.tipo_comprobante = 'nota_credito'
    and f.estado <> 'anulada' and f.numero_normalizado = regexp_replace(p_numero, '[^0-9]', '', 'g')
  limit 1;
  if found then
    raise exception 'Ya cargaste la nota de crédito % de este proveedor.', btrim(p_numero);
  end if;

  insert into compras_facturas (
    pedido_id, proveedor_id, tipo_comprobante, factura_origen_id, numero, fecha, total_papel,
    estado, observaciones, creado_por, confirmada_en, confirmada_por
  ) values (
    p_factura.pedido_id, p_factura.proveedor_id, 'nota_credito', p_factura.id, btrim(p_numero), p_fecha, p_total_papel,
    'confirmada', 'Nota de crédito de ' || v_codigo || ' (' || p_devolucion.motivo_nombre || ').',
    auth.uid(), now(), auth.uid()
  )
  returning * into v_nc;

  for v_di in
    select di.*, i.unidad_base as item_unidad_base
    from compras_devolucion_items di
    left join compras_items i on i.id = di.item_id
    where di.devolucion_id = p_devolucion.id
    order by di.orden, di.id
  loop
    select l into v_l from jsonb_array_elements(p_lineas) l where l->>'devolucion_item_id' = v_di.id::text;
    v_alic := nullif(v_l->>'alicuota_iva', '')::numeric;
    if v_alic is null or v_alic not in (0, 2.5, 5, 10.5, 21, 27) then
      raise exception 'Elegí la alícuota de IVA de cada línea de la nota de crédito.';
    end if;

    if p_devolucion.corrige_precio then
      select * into v_fi from compras_factura_items where id = v_di.factura_item_id and factura_id = p_factura.id;
      if not found then
        raise exception 'La línea de % ya no está en la factura %. Recargá la página.', v_di.descripcion, p_factura.numero;
      end if;
      if v_di.precio_correcto is null or v_di.precio_correcto >= v_fi.precio_unitario then
        raise exception 'El precio correcto de % tiene que ser menor que el facturado (%).', v_fi.descripcion, _compras_pesos_txt(v_fi.precio_unitario);
      end if;
      v_ub := case when v_fi.precio_por = 'base'
                   then coalesce((select unidad_base from compras_items where id = v_fi.item_id), 'kg')
                   else coalesce(v_fi.unidad, 'unidad') end;
      insert into compras_factura_items (factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad,
                                         precio_unitario, alicuota_iva, orden, cantidad_base, precio_por)
      values (v_nc.id, null, null,
              'Diferencia de precio · ' || v_fi.descripcion || ': de ' || _compras_pesos_txt(v_fi.precio_unitario)
                || ' a ' || _compras_pesos_txt(v_di.precio_correcto) || ' por ' || v_ub,
              v_ub, v_di.cantidad, v_fi.precio_unitario - v_di.precio_correcto, v_alic, v_di.orden, null, 'unidad');
    else
      v_precio := nullif(v_l->>'precio_unitario', '')::numeric;
      if v_precio is null or v_precio <= 0 then
        raise exception 'Cargá el precio de % en la nota de crédito (mayor que 0).', v_di.descripcion;
      end if;
      select * into v_fi from compras_factura_items
      where factura_id = p_factura.id and item_id = v_di.item_id
      order by orden desc, id desc
      limit 1;
      if not found then
        raise exception '% no está en la factura %: no se puede acreditar en la nota de crédito.', v_di.descripcion, p_factura.numero;
      end if;
      if v_fi.precio_por = 'base' and v_di.cantidad_base is null then
        raise exception 'Cargá los % devueltos de %: la factura lo cobra por %.',
          coalesce(v_di.item_unidad_base, 'kg'), v_di.descripcion, coalesce(v_di.item_unidad_base, 'kg');
      end if;
      insert into compras_factura_items (factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad,
                                         precio_unitario, alicuota_iva, orden, cantidad_base, precio_por)
      values (v_nc.id, v_di.pedido_item_id, v_di.item_id, v_di.descripcion, coalesce(v_fi.unidad, v_di.unidad),
              v_di.cantidad, v_precio, v_alic, v_di.orden, v_di.cantidad_base, v_fi.precio_por);
    end if;
  end loop;

  -- Misma expresión que compras_guardar_factura.
  update compras_facturas f
    set subtotal = t.subtotal, iva = t.iva, total = t.subtotal + t.iva
    from (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(iva), 0) as iva
      from compras_factura_items where factura_id = v_nc.id
    ) t
    where f.id = v_nc.id
    returning f.* into v_nc;

  if v_nc.total <= 0 then
    raise exception 'La nota de crédito quedó en $ 0. Revisá precios y cantidades.';
  end if;

  select coalesce(sum(total), 0) into v_otras
  from compras_facturas
  where factura_origen_id = p_factura.id and tipo_comprobante = 'nota_credito'
    and estado = 'confirmada' and id <> v_nc.id;
  if v_nc.total > p_factura.total - v_otras then
    raise exception 'La nota de crédito (%) supera lo que queda de la factura % (%). Revisá precios y cantidades.',
      _compras_pesos_txt(v_nc.total), p_factura.numero, _compras_pesos_txt(p_factura.total - v_otras);
  end if;

  return v_nc;
end;
$$;

-- E10: aplica la NC al gasto de la factura origen.
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
            fecha_pago = v_nc.fecha,
            pagado_por = auth.uid(),
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

-- E10 inverso: devuelve al gasto exactamente lo que la NC le descontó.
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
          fecha_pago = null,
          pagado_por = null,
          caja = null,
          observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Se anuló la nota de crédito N° ' || v_nc.numero || coalesce(' (' || v_codigo || ')', '') || ': vuelve a pendiente (+'
            || _compras_pesos_txt(v_nc.gasto_descontado) || ').')
      where id = v_gasto.id
      returning monto into v_desp;
  end if;

  return jsonb_build_object('gasto', v_nc.nc_gasto, 'gasto_id', v_gasto.id, 'monto_antes', v_antes, 'monto_despues', v_desp);
end;
$$;

-- E13: una devolución que espera su NC deja las diferencias > 0 de sus insumos
-- como "Reclamo al proveedor", con la nota. Sin factura confirmada o con NC, nada.
create or replace function public._compras_marcar_esperando_nc(p_devolucion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev     compras_devoluciones%rowtype;
  v_fac_id  uuid;
  v_codigo  text;
begin
  select * into v_dev from compras_devoluciones where id = p_devolucion_id;
  select id into v_fac_id from compras_facturas
  where pedido_id = v_dev.pedido_id and tipo_comprobante = 'factura' and estado = 'confirmada';
  if v_fac_id is null then
    return;
  end if;

  -- Las que el recálculo devolvió a pendiente dejan de apuntar a la devolución.
  update compras_factura_discrepancias set devolucion_id = null
  where devolucion_id = v_dev.id and resolucion = 'pendiente';

  if v_dev.estado <> 'activa' or v_dev.repone or v_dev.corrige_precio or v_dev.nota_credito_id is not null then
    return;
  end if;
  select _compras_codigo_devolucion(numero, v_dev.secuencia) into v_codigo from compras_pedidos where id = v_dev.pedido_id;

  update compras_factura_discrepancias
    set resolucion = 'reclamo_proveedor', devolucion_id = v_dev.id,
        nota = 'Esperando la nota de crédito de ' || v_codigo,
        resuelto_por = auth.uid(), resuelto_en = now(), updated_at = now()
    where factura_id = v_fac_id and resolucion in ('pendiente', 'reclamo_proveedor')
      and diferencia > 0
      and item_id in (select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.6 compras_recalcular_estado_pedido (E7, E8). Cuerpo de 20260928190000:163-243.
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
  -- B4
  v_excede       record;
  v_neto_total   numeric;
  v_sin_repone   boolean;
begin
  -- auth.uid() null = migración o service role.
  if auth.uid() is not null and not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    return;
  end if;

  -- B4 (E7): nunca menos recibido que devuelto, por insumo y por línea del pedido.
  if exists (select 1 from compras_devoluciones
             where pedido_id = p_pedido_id and estado = 'activa' and devuelve_mercaderia) then
    with dv as (
      select * from _compras_devuelto(p_pedido_id)
    ),
    rec_item as (
      select ri.item_id, sum(ri.cantidad) as c
      from compras_remito_items ri join compras_remitos r on r.id = ri.remito_id
      where r.pedido_id = p_pedido_id and ri.item_id is not null
      group by ri.item_id
    ),
    rec_linea as (
      select ri.pedido_item_id, sum(ri.cantidad) as c
      from compras_remito_items ri join compras_remitos r on r.id = ri.remito_id
      where r.pedido_id = p_pedido_id and ri.pedido_item_id is not null
      group by ri.pedido_item_id
    ),
    exc as (
      select dv.item_id, sum(dv.devuelto) as devuelto
      from dv left join rec_item ri on ri.item_id = dv.item_id
      group by dv.item_id
      having sum(dv.devuelto) > coalesce(max(ri.c), 0)
      union all
      select dv.item_id, sum(dv.devuelto)
      from dv left join rec_linea rl on rl.pedido_item_id = dv.pedido_item_id
      where dv.pedido_item_id is not null
      group by dv.item_id, dv.pedido_item_id
      having sum(dv.devuelto) > coalesce(max(rl.c), 0)
    )
    select exc.item_id, exc.devuelto, i.nombre, i.unidad into v_excede
    from exc join compras_items i on i.id = exc.item_id
    limit 1;
    if found then
      raise exception 'De % se devolvieron % % al proveedor (%): con este cambio quedaría menos recibido que devuelto. Anulá esa devolución primero.',
        v_excede.nombre, _compras_cant_txt(v_excede.devuelto), v_excede.unidad,
        (select string_agg(distinct _compras_codigo_devolucion(v_pedido.numero, d.secuencia), ', ')
         from compras_devoluciones d join compras_devolucion_items di on di.devolucion_id = d.id
         where d.pedido_id = p_pedido_id and d.estado = 'activa' and d.devuelve_mercaderia
           and di.item_id = v_excede.item_id);
    end if;
  end if;

  if v_pedido.estado_recepcion = 'cerrado_manual' then
    -- Se pone a mano: no se toca. (B4: devuelto pasa a calculado.)
    v_recepcion := v_pedido.estado_recepcion;
  elsif v_pedido.enviado_en is null then
    v_recepcion := 'sin_enviar';
  else
    -- B4 (E8): neto = recibido − devuelto; cubierto = neto + devuelto sin reposición.
    select count(*),
           count(*) filter (where recibido - devuelto + sin_repone >= cantidad),
           count(*) filter (where recibido - devuelto > 0)
      into v_lineas, v_cubiertas, v_con_algo
    from (
      select pi.cantidad,
             coalesce((select sum(ri.cantidad) from compras_remito_items ri where ri.pedido_item_id = pi.id), 0) as recibido,
             coalesce(dv.devuelto, 0) as devuelto,
             coalesce(dv.sin_repone, 0) as sin_repone
      from compras_pedido_items pi
      left join (
        select d.pedido_item_id, sum(d.devuelto) as devuelto, sum(d.devuelto_sin_repone) as sin_repone
        from _compras_devuelto(p_pedido_id) d
        where d.pedido_item_id is not null
        group by d.pedido_item_id
      ) dv on dv.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
    ) l;

    select count(*) into v_remitos from compras_remitos where pedido_id = p_pedido_id;

    select coalesce((select sum(ri.cantidad)
                     from compras_remito_items ri join compras_remitos r on r.id = ri.remito_id
                     where r.pedido_id = p_pedido_id and ri.item_id is not null), 0)
         - coalesce((select sum(d.devuelto) from _compras_devuelto(p_pedido_id) d), 0)
      into v_neto_total;
    v_sin_repone := exists (select 1 from compras_devoluciones
                            where pedido_id = p_pedido_id and estado = 'activa'
                              and devuelve_mercaderia and not repone);

    if v_lineas > 0 and v_cubiertas = v_lineas then
      if v_neto_total = 0 and v_sin_repone then
        v_recepcion := 'devuelto';
      else
        v_recepcion := 'recibido';
      end if;
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
-- 3.7 compras_diferencias_calculadas (E12). Cuerpo de 20261005180000:1505-1571.
--     recibida = remitos − devuelto (mercadería); facturada = factura − NC con insumo.
-- ----------------------------------------------------------------------------
drop function if exists public.compras_diferencias_calculadas(uuid);

create function public.compras_diferencias_calculadas(p_factura_id uuid)
returns table (
  clave text, pedido_item_id uuid, item_id uuid, descripcion text, unidad text,
  recibida numeric, facturada numeric,
  -- A2b: información en unidad base. *_real = false → al menos una línea sin kg reales (cae a nominal).
  unidad_base text, contenido numeric,
  recibida_base numeric, recibida_base_real boolean,
  facturada_base numeric, facturada_base_real boolean,
  -- B4: informativas
  devuelta numeric, acreditada numeric
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
    select fi.item_id, sum(fi.cantidad) as cantidad,
           sum(coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(fi.cantidad_base is not null) as base_real
    from compras_factura_items fi
    join f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where fi.item_id is not null
    group by fi.item_id
  ),
  recibido as (
    select ri.item_id, sum(ri.cantidad) as cantidad,
           sum(coalesce(ri.cantidad_base, ri.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(ri.cantidad_base is not null) as base_real
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    join f on f.pedido_id = r.pedido_id
    join compras_items i on i.id = ri.item_id
    where ri.item_id is not null
    group by ri.item_id
  ),
  -- B4: lo devuelto con mercadería (devoluciones activas del pedido).
  devuelto as (
    select d.item_id, sum(d.devuelto) as cantidad, sum(d.devuelto_base) as base,
           bool_and(d.devuelto_base_real) as base_real
    from f, _compras_devuelto(f.pedido_id) d
    group by d.item_id
  ),
  -- B4: lo acreditado por NC confirmadas de esta factura (solo líneas con insumo).
  acreditado as (
    select fi.item_id, sum(fi.cantidad) as cantidad,
           sum(coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(fi.cantidad_base is not null) as base_real
    from compras_facturas nc
    join compras_factura_items fi on fi.factura_id = nc.id
    join compras_items i on i.id = fi.item_id
    where nc.factura_origen_id = p_factura_id and nc.tipo_comprobante = 'nota_credito'
      and nc.estado = 'confirmada' and fi.item_id is not null
    group by fi.item_id
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
         coalesce(re.cantidad, 0) - coalesce(dv.cantidad, 0),
         coalesce(fa.cantidad, 0) - coalesce(ac.cantidad, 0),
         i.unidad_base,
         i.cantidad_por_unidad,
         case when re.base is null then null else re.base - coalesce(dv.base, 0) end,
         coalesce(re.base_real, false) and coalesce(dv.base_real, true),
         case when fa.base is null then null else fa.base - coalesce(ac.base, 0) end,
         coalesce(fa.base_real, false) and coalesce(ac.base_real, true),
         coalesce(dv.cantidad, 0),
         coalesce(ac.cantidad, 0)
  from facturado fa
  full join recibido re on re.item_id = fa.item_id
  join compras_items i on i.id = coalesce(fa.item_id, re.item_id)
  left join lineas l on l.item_id = coalesce(fa.item_id, re.item_id)
  left join devuelto dv on dv.item_id = coalesce(fa.item_id, re.item_id)
  left join acreditado ac on ac.item_id = coalesce(fa.item_id, re.item_id);
$$;

revoke execute on function public.compras_diferencias_calculadas(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3.13 Eventos: tipos nuevos (antes de las RPC que los escriben).
-- ----------------------------------------------------------------------------
alter table compras_pedido_eventos drop constraint if exists compras_pedido_eventos_tipo_check;
alter table compras_pedido_eventos add constraint compras_pedido_eventos_tipo_check check (tipo in (
  'creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje',
  'enviado', 'reenviado', 'cerrado', 'reabierto',
  'remito_creado', 'remito_editado', 'remito_eliminado',
  'devolucion_registrada', 'devolucion_anulada'   -- B4
));

-- ----------------------------------------------------------------------------
-- 3.8 compras_registrar_devolucion
-- p_items: [{pedido_item_id?, item_id?, factura_item_id?, cantidad, cantidad_base?, precio_correcto?}]
-- p_nota_credito: {numero, fecha, total_papel?, lineas: [{indice, precio_unitario, alicuota_iva}]}
--   indice = posición (desde 0) del ítem en p_items.
-- Orden de bloqueo (E17): pedido → factura → NC → gasto → devolución → stock.
-- ----------------------------------------------------------------------------
create or replace function public.compras_registrar_devolucion(
  p_pedido_id uuid default null,
  p_motivo_id uuid default null,
  p_repone boolean default false,
  p_items jsonb default '[]'::jsonb,
  p_nota text default null,
  p_nota_credito jsonb default null,
  p_diferencia_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo        compras_devolucion_motivos%rowtype;
  v_pedido        compras_pedidos%rowtype;
  v_factura       compras_facturas%rowtype;
  v_tiene_factura boolean;
  v_repone        boolean := coalesce(p_repone, false);
  v_cod_ped       text;
  v_codigo        text;
  v_proveedor     text;
  v_e             record;
  v_item          compras_items%rowtype;
  v_pi            compras_pedido_items%rowtype;
  v_pi_id         uuid;
  v_fi            compras_factura_items%rowtype;
  v_cant          numeric;
  v_base          numeric;
  v_max           numeric;
  v_lineas        jsonb := '[]'::jsonb;
  v_x             record;
  v_dev           compras_devoluciones%rowtype;
  v_mov           record;
  v_despues       numeric;
  v_impacto       jsonb := '[]'::jsonb;
  v_nc            compras_facturas%rowtype;
  v_nc_lineas     jsonb;
  v_gasto         jsonb;
  v_dif           compras_factura_discrepancias%rowtype;
  v_items_ids     uuid[];
begin
  -- 1. Acceso
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  select * into v_motivo from compras_devolucion_motivos where id = p_motivo_id;
  if not found or not v_motivo.activo then
    raise exception 'Ese motivo ya no está disponible. Recargá la página.';
  end if;
  if (not v_motivo.devuelve_mercaderia or p_nota_credito is not null) and not es_admin() then
    raise exception 'Solo un administrador puede registrar devoluciones que corrigen la factura o cargar notas de crédito.';
  end if;

  -- 2. Ítems
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Elegí qué se devuelve.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where nullif(e->>'cantidad', '') is null or (e->>'cantidad')::numeric <= 0) then
    raise exception 'Las cantidades a devolver tienen que ser mayores que 0.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
    raise exception 'Los kg tienen que ser mayores que 0 (o quedar vacíos).';
  end if;
  if p_nota is not null and length(p_nota) > 500 then
    raise exception 'La nota es muy larga (máximo 500 caracteres).';
  end if;

  -- 3. Bloqueos y estado
  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  v_cod_ped := 'P-' || lpad(v_pedido.numero::text, 4, '0');
  if v_pedido.estado_recepcion = 'sin_enviar' or v_pedido.enviado_en is null then
    raise exception 'El pedido % todavía no se envió: no hay nada para devolver.', v_cod_ped;
  end if;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  v_tiene_factura := found;
  select nombre into v_proveedor from proveedores where id = v_pedido.proveedor_id;

  if not v_motivo.devuelve_mercaderia then
    if not v_tiene_factura then
      raise exception 'Esta devolución corrige la factura, y el pedido % todavía no tiene una confirmada. Cargala primero.', v_cod_ped;
    end if;
    v_repone := false;
  end if;
  if v_repone and v_pedido.estado_recepcion = 'cerrado_manual' then
    raise exception 'El pedido está cerrado a mano: reabrilo para esperar la reposición, o registrá la devolución sin reposición.';
  end if;
  if v_repone and p_nota_credito is not null then
    raise exception 'Si el proveedor repone, no hay nota de crédito: la reposición ya está facturada. Elegí "No repone" para cargar la nota.';
  end if;
  if p_nota_credito is not null and not v_tiene_factura then
    raise exception 'Para cargar la nota de crédito, primero confirmá la factura del pedido.';
  end if;

  -- 4. Resolver cada ítem (descripción y unidad nunca del cliente).
  for v_e in select e, (ord - 1)::int as idx from jsonb_array_elements(p_items) with ordinality t(e, ord) loop
    v_cant := (v_e.e->>'cantidad')::numeric;
    v_base := nullif(v_e.e->>'cantidad_base', '')::numeric;

    if v_motivo.corrige_precio then
      select * into v_fi from compras_factura_items
      where id = nullif(v_e.e->>'factura_item_id', '')::uuid and factura_id = v_factura.id;
      if not found or v_fi.precio_unitario <= 0 then
        raise exception 'Elegí la línea de la factura con el precio mal cobrado. Recargá la página.';
      end if;
      if v_cant > (case when v_fi.precio_por = 'base' then v_fi.cantidad_base else v_fi.cantidad end) then
        raise exception 'De % se cobraron % %: no se puede corregir el precio de más que eso.',
          v_fi.descripcion, _compras_cant_txt(case when v_fi.precio_por = 'base' then v_fi.cantidad_base else v_fi.cantidad end),
          case when v_fi.precio_por = 'base' then coalesce((select unidad_base from compras_items where id = v_fi.item_id), 'kg')
               else coalesce(v_fi.unidad, '') end;
      end if;
      if nullif(v_e.e->>'precio_correcto', '') is null then
        raise exception 'Cargá el precio correcto de %.', v_fi.descripcion;
      end if;
      if (v_e.e->>'precio_correcto')::numeric < 0 or (v_e.e->>'precio_correcto')::numeric >= v_fi.precio_unitario then
        raise exception 'El precio correcto de % tiene que ser menor que el facturado (%).', v_fi.descripcion, _compras_pesos_txt(v_fi.precio_unitario);
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_fi.item_id, 'pedido_item_id', v_fi.pedido_item_id, 'factura_item_id', v_fi.id,
        'descripcion', v_fi.descripcion,
        'unidad', case when v_fi.precio_por = 'base'
                       then coalesce((select unidad_base from compras_items where id = v_fi.item_id), 'kg')
                       else v_fi.unidad end,
        'cantidad', v_cant, 'cantidad_base', null,
        'precio_correcto', (v_e.e->>'precio_correcto')::numeric);
      continue;
    end if;

    select * into v_item from compras_items where id = nullif(v_e.e->>'item_id', '')::uuid;
    if not found then
      raise exception 'Falta el insumo de una línea. Recargá la página.';
    end if;

    if v_motivo.devuelve_mercaderia then
      v_pi_id := nullif(v_e.e->>'pedido_item_id', '')::uuid;
      if v_pi_id is not null then
        select * into v_pi from compras_pedido_items where id = v_pi_id and pedido_id = v_pedido.id;
        if not found or v_pi.item_id is distinct from v_item.id then
          raise exception 'Esa línea no es de este pedido. Recargá la página.';
        end if;
      elsif (select count(*) from compras_pedido_items where pedido_id = v_pedido.id and item_id = v_item.id) = 1 then
        -- Una sola línea de ese insumo: se usa, si lo que llegó por esa línea alcanza
        -- (lo que llegó como línea libre del remito queda contra el insumo).
        select * into v_pi from compras_pedido_items where pedido_id = v_pedido.id and item_id = v_item.id;
        if coalesce((select sum(ri.cantidad) from compras_remito_items ri where ri.pedido_item_id = v_pi.id), 0)
           - coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.pedido_item_id = v_pi.id), 0)
           - coalesce((select sum((x->>'cantidad')::numeric) from jsonb_array_elements(v_lineas) x
                       where x->>'pedido_item_id' = v_pi.id::text), 0)
           >= v_cant then
          v_pi_id := v_pi.id;
        end if;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_item.id, 'pedido_item_id', v_pi_id, 'factura_item_id', null,
        'descripcion', v_item.nombre,
        'unidad', coalesce((select unidad from compras_pedido_items where id = v_pi_id), v_item.unidad),
        'cantidad', v_cant, 'cantidad_base', v_base, 'precio_correcto', null);
    else
      -- Facturado y no entregado: el insumo tiene que estar en la factura.
      select * into v_fi from compras_factura_items
      where factura_id = v_factura.id and item_id = v_item.id
      order by orden desc, id desc limit 1;
      if not found then
        raise exception '% no está en la factura %: no hay nada que reclamar.', v_item.nombre, v_factura.numero;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_item.id, 'pedido_item_id', v_fi.pedido_item_id, 'factura_item_id', null,
        'descripcion', v_item.nombre, 'unidad', coalesce(v_fi.unidad, v_item.unidad),
        'cantidad', v_cant, 'cantidad_base', v_base, 'precio_correcto', null);
    end if;
  end loop;

  -- Máximos (las cantidades del lote se suman por insumo / por línea).
  if v_motivo.devuelve_mercaderia then
    for v_x in
      select x.item_id, sum(x.cantidad) as cant, i.nombre, i.unidad,
             coalesce((select sum(ri.cantidad) from compras_remito_items ri join compras_remitos r on r.id = ri.remito_id
                       where r.pedido_id = v_pedido.id and ri.item_id = x.item_id), 0) as llego,
             coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.item_id = x.item_id), 0) as devuelto
      from jsonb_to_recordset(v_lineas) as x(item_id uuid, cantidad numeric)
      join compras_items i on i.id = x.item_id
      group by x.item_id, i.nombre, i.unidad
    loop
      if v_x.cant > v_x.llego - v_x.devuelto then
        raise exception 'De % llegaron % % y ya se devolvieron %: como mucho podés devolver % %.',
          v_x.nombre, _compras_cant_txt(v_x.llego), v_x.unidad, _compras_cant_txt(v_x.devuelto),
          _compras_cant_txt(greatest(v_x.llego - v_x.devuelto, 0)), v_x.unidad;
      end if;
    end loop;
    for v_x in
      select x.pedido_item_id, sum(x.cantidad) as cant, max(x.descripcion) as nombre, max(x.unidad) as unidad,
             coalesce((select sum(ri.cantidad) from compras_remito_items ri where ri.pedido_item_id = x.pedido_item_id), 0) as llego,
             coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.pedido_item_id = x.pedido_item_id), 0) as devuelto
      from jsonb_to_recordset(v_lineas) as x(pedido_item_id uuid, cantidad numeric, descripcion text, unidad text)
      where x.pedido_item_id is not null
      group by x.pedido_item_id
    loop
      if v_x.cant > v_x.llego - v_x.devuelto then
        raise exception 'De % llegaron % % y ya se devolvieron %: como mucho podés devolver % %.',
          v_x.nombre, _compras_cant_txt(v_x.llego), v_x.unidad, _compras_cant_txt(v_x.devuelto),
          _compras_cant_txt(greatest(v_x.llego - v_x.devuelto, 0)), v_x.unidad;
      end if;
    end loop;
  elsif not v_motivo.corrige_precio then
    for v_x in
      select x.item_id, sum(x.cantidad) as cant, i.nombre, max(x.unidad) as unidad,
             coalesce((select sum(fi.cantidad) from compras_factura_items fi
                       where fi.factura_id = v_factura.id and fi.item_id = x.item_id), 0) as facturado,
             coalesce((select sum(fi.cantidad) from compras_facturas nc join compras_factura_items fi on fi.factura_id = nc.id
                       where nc.factura_origen_id = v_factura.id and nc.tipo_comprobante = 'nota_credito'
                         and nc.estado = 'confirmada' and fi.item_id = x.item_id), 0)
             + coalesce((select sum(di.cantidad) from compras_devoluciones d join compras_devolucion_items di on di.devolucion_id = d.id
                         where d.pedido_id = v_pedido.id and d.estado = 'activa' and not d.devuelve_mercaderia
                           and not d.corrige_precio and d.nota_credito_id is null and di.item_id = x.item_id), 0) as reclamado
      from jsonb_to_recordset(v_lineas) as x(item_id uuid, cantidad numeric, unidad text)
      join compras_items i on i.id = x.item_id
      group by x.item_id, i.nombre
    loop
      if v_x.cant > v_x.facturado - v_x.reclamado then
        raise exception 'De % se facturaron % % y ya se reclamaron %: como mucho % %.',
          v_x.nombre, _compras_cant_txt(v_x.facturado), v_x.unidad, _compras_cant_txt(v_x.reclamado),
          _compras_cant_txt(greatest(v_x.facturado - v_x.reclamado, 0)), v_x.unidad;
      end if;
    end loop;
  end if;

  select array_agg(distinct x.item_id) into v_items_ids
  from jsonb_to_recordset(v_lineas) as x(item_id uuid) where x.item_id is not null;

  if p_diferencia_id is not null then
    select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id;
    if not found or not v_tiene_factura or v_dif.factura_id <> v_factura.id
       or not coalesce(v_dif.item_id = any(v_items_ids), false) then
      raise exception 'Esa diferencia es de otro insumo. Recargá la página.';
    end if;
  end if;

  -- 5. Guarda R3 (E14). La corrección de precio no cambia cantidades: no la necesita.
  if not v_motivo.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id, v_items_ids, 'registrar la devolución');
  end if;

  -- 6. Alta
  update compras_pedidos
    set ultima_secuencia_devolucion = greatest(
      ultima_secuencia_devolucion,
      (select coalesce(max(secuencia), 0) from compras_devoluciones where pedido_id = v_pedido.id)
    ) + 1
    where id = v_pedido.id
    returning ultima_secuencia_devolucion into v_pedido.ultima_secuencia_devolucion;

  insert into compras_devoluciones (pedido_id, secuencia, factura_id, motivo_id, motivo_nombre, devuelve_mercaderia,
                                    corrige_precio, repone, nota, creado_por)
  values (v_pedido.id, v_pedido.ultima_secuencia_devolucion, v_factura.id, v_motivo.id, v_motivo.nombre,
          v_motivo.devuelve_mercaderia, v_motivo.corrige_precio, v_repone, nullif(btrim(p_nota), ''), auth.uid())
  returning * into v_dev;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  insert into compras_devolucion_items (devolucion_id, pedido_item_id, item_id, factura_item_id, descripcion, unidad,
                                        cantidad, cantidad_base, precio_correcto, orden)
  select v_dev.id, x.pedido_item_id, x.item_id, x.factura_item_id, x.descripcion, x.unidad,
         x.cantidad, x.cantidad_base, x.precio_correcto, x.idx
  from jsonb_to_recordset(v_lineas) as x(idx int, item_id uuid, pedido_item_id uuid, factura_item_id uuid,
                                          descripcion text, unidad text, cantidad numeric, cantidad_base numeric,
                                          precio_correcto numeric);

  -- 7. Stock (solo con mercadería), un movimiento por insumo, en unidad de compra.
  if v_motivo.devuelve_mercaderia then
    for v_mov in
      select di.item_id, sum(di.cantidad) as total,
             case when bool_and(di.cantidad_base is not null) then sum(di.cantidad_base) end as base,
             max(i.unidad_base) as unidad_base
      from compras_devolucion_items di join compras_items i on i.id = di.item_id
      where di.devolucion_id = v_dev.id
      group by di.item_id
    loop
      perform compras_mover_stock(
        v_mov.item_id, -v_mov.total, 'devolucion_proveedor',
        'Devolución ' || v_codigo || ' a ' || coalesce(v_proveedor, 'proveedor') || ': ' || v_motivo.nombre
          || coalesce(' (' || _compras_cant_txt(v_mov.base) || ' ' || coalesce(v_mov.unidad_base, 'kg') || ')', ''),
        null, null, null, v_factura.id, null, v_dev.id
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
  end if;

  -- 8. Nota de crédito
  if p_nota_credito is not null then
    if jsonb_typeof(p_nota_credito->'lineas') <> 'array' then
      raise exception 'Las líneas de la nota de crédito vienen mal armadas. Recargá la página.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'devolucion_item_id', di.id,
             'precio_unitario', l->'precio_unitario',
             'alicuota_iva', l->'alicuota_iva')), '[]'::jsonb)
      into v_nc_lineas
    from jsonb_array_elements(p_nota_credito->'lineas') l
    join compras_devolucion_items di on di.devolucion_id = v_dev.id and di.orden = (l->>'indice')::int;

    v_nc := _compras_crear_nota_credito(v_dev, v_factura, p_nota_credito->>'numero',
              nullif(p_nota_credito->>'fecha', '')::date, v_nc_lineas,
              nullif(p_nota_credito->>'total_papel', '')::numeric);
    update compras_devoluciones set nota_credito_id = v_nc.id where id = v_dev.id returning * into v_dev;
    v_gasto := _compras_nc_aplicar_gasto(v_nc.id);
    select * into v_nc from compras_facturas where id = v_nc.id;
  end if;

  -- 9. Evento (sin montos: lo lee cualquiera con Compras)
  perform compras_registrar_evento_pedido(v_pedido.id, 'devolucion_registrada', jsonb_build_object(
    'devolucion_id', v_dev.id, 'secuencia', v_dev.secuencia, 'motivo', v_dev.motivo_nombre,
    'devuelve_mercaderia', v_dev.devuelve_mercaderia, 'corrige_precio', v_dev.corrige_precio,
    'repone', v_dev.repone, 'nota', v_dev.nota,
    'lineas', compras_lineas_devolucion_snapshot(v_dev.id)));

  -- 10. Recálculos (el del pedido incluye la guarda E7)
  perform compras_recalcular_estado_pedido(v_pedido.id);
  if v_tiene_factura then
    perform compras_recalcular_diferencias_factura(v_factura.id);
    -- 11. E13
    perform _compras_marcar_esperando_nc(v_dev.id);
  end if;

  return jsonb_build_object(
    'id', v_dev.id,
    'codigo', v_codigo,
    'impacto', v_impacto,
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = v_pedido.id),
    'nota_credito', case when v_nc.id is null then null else jsonb_build_object(
      'id', v_nc.id, 'numero', v_nc.numero, 'total', v_nc.total,
      'gasto', v_gasto->>'gasto', 'monto_antes', v_gasto->'monto_antes', 'monto_despues', v_gasto->'monto_despues') end,
    'diferencias_pendientes', case when v_tiene_factura then
      (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id and resolucion = 'pendiente') else 0 end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.9 compras_cargar_nota_credito (la NC llega después, D3)
-- p_lineas: [{devolucion_item_id, precio_unitario, alicuota_iva}]
-- ----------------------------------------------------------------------------
create or replace function public.compras_cargar_nota_credito(
  p_devolucion_id uuid default null,
  p_numero text default null,
  p_fecha date default null,
  p_lineas jsonb default '[]'::jsonb,
  p_total_papel numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_factura   compras_facturas%rowtype;
  v_dev       compras_devoluciones%rowtype;
  v_nc        compras_facturas%rowtype;
  v_gasto     jsonb;
  v_codigo    text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar notas de crédito.';
  end if;
  select pedido_id into v_pedido_id from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  if not found then
    raise exception 'Para cargar la nota de crédito, primero confirmá la factura del pedido.';
  end if;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  if v_dev.estado <> 'activa' then
    raise exception 'Esa devolución está anulada.';
  end if;
  if v_dev.nota_credito_id is not null then
    raise exception 'Esa devolución ya tiene su nota de crédito: N° %.',
      (select numero from compras_facturas where id = v_dev.nota_credito_id);
  end if;
  if v_dev.repone then
    raise exception 'La devolución % es con reposición: no lleva nota de crédito.', v_codigo;
  end if;

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'cargar la nota de crédito');
  end if;

  v_nc := _compras_crear_nota_credito(v_dev, v_factura, p_numero, p_fecha, p_lineas, p_total_papel);
  -- La factura activa manda (si la de la devolución se anuló, se reescribe).
  update compras_devoluciones set nota_credito_id = v_nc.id, factura_id = v_factura.id
  where id = v_dev.id returning * into v_dev;
  v_gasto := _compras_nc_aplicar_gasto(v_nc.id);
  select * into v_nc from compras_facturas where id = v_nc.id;

  perform compras_recalcular_diferencias_factura(v_factura.id);
  perform _compras_marcar_esperando_nc(v_dev.id);

  return jsonb_build_object(
    'nota_credito', jsonb_build_object(
      'id', v_nc.id, 'numero', v_nc.numero, 'total', v_nc.total,
      'gasto', v_gasto->>'gasto', 'monto_antes', v_gasto->'monto_antes', 'monto_despues', v_gasto->'monto_despues'),
    'diferencias_pendientes',
      (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id and resolucion = 'pendiente')
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.10 compras_anular_nota_credito (E19) y compras_anular_devolucion (D4)
-- ----------------------------------------------------------------------------

-- Anula la NC de una devolución sin tocar la devolución ni el stock.
-- Interna: la usan las dos RPC de abajo, con los bloqueos ya tomados.
create or replace function public._compras_anular_nc_de_devolucion(p_dev compras_devoluciones, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc    compras_facturas%rowtype;
  v_gasto jsonb;
begin
  select * into v_nc from compras_facturas where id = p_dev.nota_credito_id for update;
  if not found or v_nc.estado <> 'confirmada' then
    raise exception 'La nota de crédito de esa devolución ya no está confirmada. Recargá la página.';
  end if;
  v_gasto := _compras_nc_revertir_gasto(v_nc.id);
  update compras_facturas
    set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
    where id = v_nc.id;
  update compras_devoluciones set nota_credito_id = null where id = p_dev.id;
  return v_gasto || jsonb_build_object('numero', v_nc.numero, 'factura_origen_id', v_nc.factura_origen_id);
end;
$$;

create or replace function public.compras_anular_nota_credito(
  p_devolucion_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_nc_id     uuid;
  v_factura   compras_facturas%rowtype;
  v_dev       compras_devoluciones%rowtype;
  v_res       jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular notas de crédito.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la nota de crédito: queda registrado.';
  end if;
  select pedido_id, nota_credito_id into v_pedido_id, v_nc_id from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;
  if v_nc_id is null then
    raise exception 'Esa devolución no tiene nota de crédito. Recargá la página.';
  end if;

  -- pedido → factura origen → NC (en el helper) → gasto → devolución
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select fo.* into v_factura from compras_facturas nc join compras_facturas fo on fo.id = nc.factura_origen_id
  where nc.id = v_nc_id;
  perform 1 from compras_facturas where id = v_factura.id for update;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  if v_dev.nota_credito_id is distinct from v_nc_id then
    raise exception 'La devolución cambió mientras tanto. Recargá la página.';
  end if;

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'anular la nota de crédito');
  end if;

  v_res := _compras_anular_nc_de_devolucion(v_dev, p_motivo);

  if v_factura.estado = 'confirmada' then
    perform compras_recalcular_diferencias_factura(v_factura.id);
    perform _compras_marcar_esperando_nc(v_dev.id);
  end if;

  return jsonb_build_object('gasto', v_res->>'gasto', 'monto_antes', v_res->'monto_antes', 'monto_despues', v_res->'monto_despues');
end;
$$;

create or replace function public.compras_anular_devolucion(
  p_devolucion_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id   uuid;
  v_pedido      compras_pedidos%rowtype;
  v_factura     compras_facturas%rowtype;
  v_tiene_fac   boolean;
  v_dev         compras_devoluciones%rowtype;
  v_codigo      text;
  v_tiene_nc    boolean;
  v_nc_res      jsonb;
  v_mov         record;
  v_despues     numeric;
  v_impacto     jsonb := '[]'::jsonb;
  v_snap        jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;
  v_tiene_nc := v_dev.nota_credito_id is not null;
  if v_tiene_nc and not es_admin() then
    raise exception 'Esta devolución tiene nota de crédito: la anula un administrador.';
  end if;
  if not v_dev.devuelve_mercaderia and not es_admin() then
    raise exception 'Esta devolución corrige la factura: la anula un administrador.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la devolución: queda en el historial.';
  end if;
  v_pedido_id := v_dev.pedido_id;

  -- pedido → factura → NC → gasto → devolución
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  v_tiene_fac := found;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  if v_dev.estado <> 'activa' then
    raise exception 'Esa devolución ya está anulada. Recargá la página.';
  end if;
  if (v_dev.nota_credito_id is not null) <> v_tiene_nc then
    raise exception 'La devolución cambió mientras tanto. Recargá la página.';
  end if;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'anular la devolución');
  end if;

  if v_tiene_nc then
    v_nc_res := _compras_anular_nc_de_devolucion(v_dev, 'Se anuló la devolución ' || v_codigo || ': ' || btrim(p_motivo));
  end if;

  -- Stock: se revierte lo que se movió (no lo que diga hoy el motivo, E2).
  for v_mov in
    select m.id, m.item_id, m.delta, m.factura_id
    from compras_stock_movimientos m
    where m.devolucion_id = v_dev.id and m.tipo = 'devolucion_proveedor'
    order by m.created_at, m.id
  loop
    perform compras_mover_stock(
      v_mov.item_id, -v_mov.delta, 'reversion',
      'Se anuló la devolución ' || v_codigo || ': ' || btrim(p_motivo),
      null, null, v_mov.id, v_mov.factura_id, null, v_dev.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
    v_impacto := v_impacto || jsonb_build_object(
      'item_id', v_mov.item_id,
      'nombre', (select nombre from compras_items where id = v_mov.item_id),
      'unidad', (select unidad from compras_items where id = v_mov.item_id),
      'delta', -v_mov.delta,
      'cantidad_despues', v_despues
    );
  end loop;

  update compras_devoluciones
    set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now(), anulada_motivo = btrim(p_motivo)
    where id = v_dev.id;

  -- Las diferencias que esperaban esta devolución vuelven a pendiente; el recálculo
  -- decide si siguen o desaparecen.
  update compras_factura_discrepancias
    set devolucion_id = null,
        resolucion = case when resolucion = 'reclamo_proveedor' then 'pendiente' else resolucion end,
        nota = case when resolucion = 'reclamo_proveedor' then null else nota end,
        resuelto_por = case when resolucion = 'reclamo_proveedor' then null else resuelto_por end,
        resuelto_en = case when resolucion = 'reclamo_proveedor' then null else resuelto_en end,
        updated_at = now()
    where devolucion_id = v_dev.id;

  v_snap := compras_lineas_devolucion_snapshot(v_dev.id);
  perform compras_registrar_evento_pedido(v_pedido.id, 'devolucion_anulada', jsonb_build_object(
    'devolucion_id', v_dev.id, 'secuencia', v_dev.secuencia, 'motivo', v_dev.motivo_nombre,
    'motivo_anulacion', btrim(p_motivo), 'lineas', v_snap, 'tenia_nota_credito', v_tiene_nc));

  perform compras_recalcular_estado_pedido(v_pedido.id);
  if v_tiene_fac then
    perform compras_recalcular_diferencias_factura(v_factura.id);
  end if;

  return jsonb_build_object(
    'impacto', v_impacto,
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = v_pedido.id),
    'nota_credito_anulada', v_tiene_nc,
    'gasto', v_nc_res->>'gasto',
    'monto_despues', v_nc_res->'monto_despues'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.11 compras_anular_factura: cuerpo de 20261005180000:1376-1494 + E18.
-- ----------------------------------------------------------------------------
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
  v_snap         jsonb;  -- A2b
  v_lista        text;   -- B4
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

  -- B4 (E18)
  if v_factura.tipo_comprobante = 'nota_credito' then
    raise exception 'Una nota de crédito se anula desde su devolución, en el detalle del pedido.';
  end if;

  if v_factura.estado <> 'confirmada' then
    raise exception 'Solo se anula una factura confirmada. Un borrador se descarta.';
  end if;

  -- B4 (E18)
  select string_agg('N° ' || nc.numero || coalesce(' (' || _compras_codigo_devolucion(v_pedido.numero, d.secuencia) || ')', ''), ', ')
    into v_lista
  from compras_facturas nc
  left join compras_devoluciones d on d.nota_credito_id = nc.id
  where nc.factura_origen_id = v_factura.id and nc.estado = 'confirmada';
  if v_lista is not null then
    raise exception 'Esta factura tiene notas de crédito (%). Anulalas desde sus devoluciones antes de anular la factura.', v_lista;
  end if;
  select string_agg(_compras_codigo_devolucion(v_pedido.numero, d.secuencia), ', ' order by d.secuencia) into v_lista
  from compras_devoluciones d
  where d.factura_id = v_factura.id and d.estado = 'activa' and not d.devuelve_mercaderia;
  if v_lista is not null then
    raise exception 'La devolución % corrige esta factura. Anulala antes de anular la factura.', v_lista;
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
    v_snap := compras_lineas_remito_snapshot(v_remito.id);  -- A2b
    delete from compras_remitos where id = v_remito.id;
    -- A2b (E10, E14)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id,
      'motivo', 'Se anuló la factura ' || v_factura.numero || ': ' || btrim(p_motivo),
      'lineas', v_snap));
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

-- ----------------------------------------------------------------------------
-- 3.12 Vistas (columnas nuevas al final)
-- ----------------------------------------------------------------------------

-- 1. Devoluciones. Los montos y el precio correcto, solo para admin (E15).
create or replace view public.v_compras_devoluciones as
select
  d.id, d.pedido_id, ped.numero as pedido_numero, d.secuencia,
  _compras_codigo_devolucion(ped.numero, d.secuencia) as codigo,
  ped.proveedor_id, pr.nombre as proveedor_nombre,
  d.factura_id, d.motivo_id, d.motivo_nombre, d.devuelve_mercaderia, d.corrige_precio, d.repone, d.nota,
  d.estado, d.created_at, pc.nombre as creado_por_nombre,
  d.anulada_en, pa.nombre as anulada_por_nombre, d.anulada_motivo,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', di.id, 'pedido_item_id', di.pedido_item_id, 'item_id', di.item_id,
             'factura_item_id', di.factura_item_id, 'descripcion', di.descripcion, 'unidad', di.unidad,
             'cantidad', di.cantidad, 'cantidad_base', di.cantidad_base,
             'unidad_base', i.unidad_base,
             'precio_correcto', case when es_admin() then di.precio_correcto end
           ) order by di.orden, di.id)
    from compras_devolucion_items di
    left join compras_items i on i.id = di.item_id
    where di.devolucion_id = d.id
  ), '[]'::jsonb) as lineas,
  d.nota_credito_id,
  case when es_admin() then nc.numero end           as nc_numero,
  case when es_admin() then nc.fecha end            as nc_fecha,
  case when es_admin() then nc.total end            as nc_total,
  case when es_admin() then nc.estado end           as nc_estado,
  case when es_admin() then nc.nc_gasto end         as nc_gasto,
  case when es_admin() then nc.gasto_descontado end as nc_gasto_descontado,
  case when es_admin() then fa.numero end           as factura_numero,
  (d.estado = 'activa' and not d.repone and d.nota_credito_id is null
    and exists (select 1 from compras_facturas f
                where f.pedido_id = d.pedido_id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'))
    as espera_nota_credito
from compras_devoluciones d
join compras_pedidos ped on ped.id = d.pedido_id
left join proveedores pr on pr.id = ped.proveedor_id
left join profiles pc on pc.id = d.creado_por
left join profiles pa on pa.id = d.anulada_por
left join compras_facturas nc on nc.id = d.nota_credito_id
left join compras_facturas fa on fa.id = d.factura_id
where tiene_acceso_compras();

grant select on public.v_compras_devoluciones to authenticated;

-- 2. Pendiente por línea: cubierto = recibido − devuelto + devuelto sin reposición (E8).
create or replace view public.v_compras_pedido_pendiente as
select
  pi.id as pedido_item_id,
  pi.pedido_id,
  pi.item_id,
  pi.descripcion,
  pi.unidad,
  pi.orden,
  pi.cantidad,
  coalesce(r.recibido, 0) as recibido,
  greatest(pi.cantidad - (coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0) + coalesce(dv.devuelto_sin_repone, 0)), 0) as pendiente,
  greatest((coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0) + coalesce(dv.devuelto_sin_repone, 0)) - pi.cantidad, 0) as excedente,
  coalesce(r.remitos, 0) as remitos,
  -- A2b
  i.unidad_base,
  i.cantidad_por_unidad as contenido,
  case when pi.item_id is null then null else coalesce(ip.cobra_por, i.cobra_por_default) end as cobra_por,
  r.recibido_base,
  coalesce(r.recibido_base_completo, false) as recibido_base_completo,
  -- B4
  coalesce(dv.devuelto, 0) as devuelto,
  coalesce(dv.devuelto_sin_repone, 0) as devuelto_sin_repone,
  dv.devuelto_base
from compras_pedido_items pi
join compras_pedidos p on p.id = pi.pedido_id
left join compras_items i on i.id = pi.item_id
left join compras_item_proveedores ip on ip.item_id = pi.item_id and ip.proveedor_id = p.proveedor_id
left join lateral (
  select sum(ri.cantidad) as recibido, count(distinct ri.remito_id) as remitos,
         sum(ri.cantidad_base) as recibido_base,
         bool_and(ri.cantidad_base is not null) as recibido_base_completo
  from compras_remito_items ri
  where ri.pedido_item_id = pi.id
) r on true
left join lateral (
  -- Inline (no _compras_devuelto): el EXECUTE se chequea contra quien consulta.
  select sum(di.cantidad) as devuelto,
         coalesce(sum(di.cantidad) filter (where not d.repone), 0) as devuelto_sin_repone,
         sum(coalesce(di.cantidad_base, di.cantidad * i.cantidad_por_unidad)) as devuelto_base
  from compras_devolucion_items di
  join compras_devoluciones d on d.id = di.devolucion_id
  where di.pedido_item_id = pi.id and d.estado = 'activa' and d.devuelve_mercaderia
) dv on true
where tiene_acceso_compras();

grant select on public.v_compras_pedido_pendiente to authenticated;

-- 3. Facturas: la NC hereda el gasto de su factura origen (E11).
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
  coalesce(f.gasto_id, fo.gasto_id) as gasto_id,
  f.gasto_generado,
  coalesce(g.estado, go.estado) as gasto_estado,
  coalesce(g.local, go.local) as gasto_local,
  ped.estado_recepcion as pedido_estado_recepcion,
  (select count(*) from compras_factura_discrepancias d
    where d.factura_id = f.id and d.resolucion = 'pendiente')::int as diferencias_pendientes,
  -- B4
  f.factura_origen_id,
  fo.numero as factura_origen_numero,
  f.nc_gasto,
  f.gasto_descontado,
  coalesce(g.monto, go.monto) as gasto_monto,
  dv.id as devolucion_id,
  case when dv.id is not null then _compras_codigo_devolucion(ped.numero, dv.secuencia) end as devolucion_codigo,
  coalesce((select sum(nc.total) from compras_facturas nc
            where nc.factura_origen_id = f.id and nc.tipo_comprobante = 'nota_credito' and nc.estado = 'confirmada'), 0)
    as notas_credito_total
from compras_facturas f
join compras_pedidos ped on ped.id = f.pedido_id
left join proveedores pr on pr.id = f.proveedor_id
left join profiles pc on pc.id = f.creado_por
left join profiles pcf on pcf.id = f.confirmada_por
left join profiles pa on pa.id = f.anulada_por
left join gastos g on g.id = f.gasto_id
left join compras_facturas fo on fo.id = f.factura_origen_id
left join gastos go on go.id = fo.gasto_id
-- La devolución de una NC (también anulada): el código que escribe _compras_crear_nota_credito.
left join compras_devoluciones dv
  on f.tipo_comprobante = 'nota_credito'
 and dv.pedido_id = f.pedido_id
 and dv.secuencia = nullif(substring(f.observaciones from 'D-[0-9]+-([0-9]+)'), '')::int
where es_admin();

grant select on public.v_compras_facturas to authenticated;

-- 4. Diferencias: kg netos de devoluciones y NC (misma regla que compras_diferencias_calculadas).
create or replace view public.v_compras_factura_diferencias as
select
  d.id, d.factura_id, f.pedido_id, d.clave, d.pedido_item_id, d.item_id, d.descripcion, d.unidad,
  d.cantidad_recibida, d.cantidad_facturada, d.diferencia, d.resolucion, d.movimiento_id, d.nota,
  d.resuelto_en, pr.nombre as resuelto_por_nombre,
  -- A2b
  i.unidad_base,
  i.cantidad_por_unidad as contenido,
  re.base as recibida_base,
  coalesce(re.base_real, false) as recibida_base_real,
  fa.base as facturada_base,
  coalesce(fa.base_real, false) as facturada_base_real,
  -- B4
  coalesce(dvl.cantidad, 0) as devuelta,
  coalesce(acl.cantidad, 0) as acreditada,
  d.devolucion_id,
  case when dv.id is not null then _compras_codigo_devolucion(pd.numero, dv.secuencia) end as devolucion_codigo
from compras_factura_discrepancias d
join compras_facturas f on f.id = d.factura_id
left join profiles pr on pr.id = d.resuelto_por
left join compras_items i on i.id = d.item_id
left join compras_devoluciones dv on dv.id = d.devolucion_id
left join compras_pedidos pd on pd.id = dv.pedido_id
left join lateral (
  select sum(x.signo * coalesce(x.cantidad_base, x.cantidad * i.cantidad_por_unidad)) as base,
         bool_and(x.cantidad_base is not null) filter (where x.signo = 1)
           and coalesce(bool_and(x.cantidad_base is not null) filter (where x.signo = -1), true) as base_real
  from (
    select 1 as signo, fi.cantidad, fi.cantidad_base
    from compras_factura_items fi
    where fi.factura_id = d.factura_id and fi.item_id = d.item_id
    union all
    select -1, fi.cantidad, fi.cantidad_base
    from compras_facturas nc join compras_factura_items fi on fi.factura_id = nc.id
    where nc.factura_origen_id = d.factura_id and nc.tipo_comprobante = 'nota_credito' and nc.estado = 'confirmada'
      and fi.item_id = d.item_id
  ) x
  having count(*) filter (where x.signo = 1) > 0
) fa on true
left join lateral (
  select sum(x.signo * coalesce(x.cantidad_base, x.cantidad * i.cantidad_por_unidad)) as base,
         bool_and(x.cantidad_base is not null) filter (where x.signo = 1)
           and coalesce(bool_and(x.cantidad_base is not null) filter (where x.signo = -1), true) as base_real
  from (
    select 1 as signo, ri.cantidad, ri.cantidad_base
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    where r.pedido_id = f.pedido_id and ri.item_id = d.item_id
    union all
    select -1, di.cantidad, di.cantidad_base
    from compras_devoluciones dd join compras_devolucion_items di on di.devolucion_id = dd.id
    where dd.pedido_id = f.pedido_id and dd.estado = 'activa' and dd.devuelve_mercaderia and di.item_id = d.item_id
  ) x
  having count(*) filter (where x.signo = 1) > 0
) re on true
left join lateral (
  select sum(di.cantidad) as cantidad
  from compras_devoluciones dd join compras_devolucion_items di on di.devolucion_id = dd.id
  where dd.pedido_id = f.pedido_id and dd.estado = 'activa' and dd.devuelve_mercaderia and di.item_id = d.item_id
) dvl on true
left join lateral (
  select sum(fi.cantidad) as cantidad
  from compras_facturas nc join compras_factura_items fi on fi.factura_id = nc.id
  where nc.factura_origen_id = d.factura_id and nc.tipo_comprobante = 'nota_credito' and nc.estado = 'confirmada'
    and fi.item_id = d.item_id
) acl on true
where es_admin();

grant select on public.v_compras_factura_diferencias to authenticated;

-- 5. Historial: la NC anulada no es "factura anulada"; NC y NC anulada solo admin (E16).
drop view if exists public.v_compras_pedido_eventos;

create view public.v_compras_pedido_eventos as
select * from (
  -- Todo lo que registran las RPC.
  select e.id, e.pedido_id, e.tipo, e.creado_en as fecha,
         e.creado_por as persona_id, pr.nombre as persona, e.detalle
  from compras_pedido_eventos e
  left join profiles pr on pr.id = e.creado_por
  union all
  -- Remitos que todavía no tienen su fila (todos, hasta que A2b escriba remito_creado).
  select r.id, r.pedido_id, 'remito_creado', r.created_at,
         r.creado_por, pr.nombre,
         jsonb_build_object('remito_id', r.id, 'secuencia', r.secuencia, 'fecha', r.fecha)
  from compras_remitos r
  left join profiles pr on pr.id = r.creado_por
  where not exists (
    select 1 from compras_pedido_eventos e
    where e.tipo = 'remito_creado' and e.detalle->>'remito_id' = r.id::text
  )
  union all
  select f.id, f.pedido_id, 'factura', f.confirmada_en, f.confirmada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.confirmada_por
  where f.confirmada_en is not null and f.tipo_comprobante = 'factura' and es_admin()
  union all
  select f.id, f.pedido_id, 'factura_anulada', f.anulada_en, f.anulada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.anulada_por
  where f.anulada_en is not null and f.tipo_comprobante = 'factura' and es_admin()   -- B4
  union all
  select d.id, f.pedido_id, 'diferencia', d.resuelto_en, d.resuelto_por, pr.nombre,
         jsonb_build_object('resolucion', d.resolucion, 'insumo', d.descripcion,
                            'item_id', d.item_id, 'factura_id', f.id)
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  left join profiles pr on pr.id = d.resuelto_por
  where d.resuelto_en is not null and es_admin()
  -- B4: notas de crédito. Una NC anulada ya no está en devoluciones.nota_credito_id:
  -- la devolución sale del código que _compras_crear_nota_credito escribe en sus
  -- observaciones (la NC no se edita), igual en las dos ramas.
  union all
  select f.id, f.pedido_id, 'nota_credito', f.confirmada_en, f.confirmada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero, 'total', f.total,
                            'factura_origen_id', f.factura_origen_id, 'devolucion_id', dv.id,
                            'secuencia', dv.secuencia, 'gasto', f.nc_gasto)
  from compras_facturas f
  left join profiles pr on pr.id = f.confirmada_por
  left join compras_devoluciones dv
    on dv.pedido_id = f.pedido_id
   and dv.secuencia = nullif(substring(f.observaciones from 'D-[0-9]+-([0-9]+)'), '')::int
  where f.tipo_comprobante = 'nota_credito' and f.confirmada_en is not null and es_admin()
  union all
  select f.id, f.pedido_id, 'nota_credito_anulada', f.anulada_en, f.anulada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero, 'total', f.total,
                            'factura_origen_id', f.factura_origen_id, 'motivo', f.anulada_motivo,
                            'devolucion_id', dv.id, 'secuencia', dv.secuencia)
  from compras_facturas f
  left join profiles pr on pr.id = f.anulada_por
  left join compras_devoluciones dv
    on dv.pedido_id = f.pedido_id
   and dv.secuencia = nullif(substring(f.observaciones from 'D-[0-9]+-([0-9]+)'), '')::int
  where f.tipo_comprobante = 'nota_credito' and f.anulada_en is not null and es_admin()
) v
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;

-- ----------------------------------------------------------------------------
-- 3.14 Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.compras_registrar_devolucion(uuid, uuid, boolean, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.compras_registrar_devolucion(uuid, uuid, boolean, jsonb, text, jsonb, uuid) to authenticated;
revoke execute on function public.compras_cargar_nota_credito(uuid, text, date, jsonb, numeric) from public, anon;
grant execute on function public.compras_cargar_nota_credito(uuid, text, date, jsonb, numeric) to authenticated;
revoke execute on function public.compras_anular_nota_credito(uuid, text) from public, anon;
grant execute on function public.compras_anular_nota_credito(uuid, text) to authenticated;
revoke execute on function public.compras_anular_devolucion(uuid, text) from public, anon;
grant execute on function public.compras_anular_devolucion(uuid, text) to authenticated;
revoke execute on function public.compras_anular_factura(uuid, text) from public, anon;
grant execute on function public.compras_anular_factura(uuid, text) to authenticated;

revoke execute on function public._compras_devuelto(uuid) from public, anon, authenticated;
revoke execute on function public._compras_exigir_sin_ajuste_factura(uuid, uuid[], text) from public, anon, authenticated;
revoke execute on function public._compras_crear_nota_credito(compras_devoluciones, compras_facturas, text, date, jsonb, numeric) from public, anon, authenticated;
revoke execute on function public._compras_nc_aplicar_gasto(uuid) from public, anon, authenticated;
revoke execute on function public._compras_nc_revertir_gasto(uuid) from public, anon, authenticated;
revoke execute on function public._compras_marcar_esperando_nc(uuid) from public, anon, authenticated;
revoke execute on function public._compras_anular_nc_de_devolucion(compras_devoluciones, text) from public, anon, authenticated;
revoke execute on function public.compras_lineas_devolucion_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public._compras_cant_txt(numeric) from public, anon, authenticated;
revoke execute on function public._compras_pesos_txt(numeric) from public, anon, authenticated;
-- Inmutable y sin tablas: lo usan las vistas (el EXECUTE se chequea contra quien consulta).
revoke execute on function public._compras_codigo_devolucion(int, int) from public, anon;
grant execute on function public._compras_codigo_devolucion(int, int) to authenticated;
