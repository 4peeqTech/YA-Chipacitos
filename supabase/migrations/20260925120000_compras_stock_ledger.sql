-- ============================================================================
-- F3 (Bloque 1 facturación), migración A: el stock pasa a ser un ledger.
--
-- compras_stock_movimientos es append-only y compras_stock_actual es la caché
-- de sum(delta) por insumo. Todo movimiento nuevo pasa por
-- compras_mover_stock(), que bloquea la fila del insumo (for update): dos
-- remitos del mismo insumo a la vez terminan con la suma de los dos (R4).
-- Las correcciones son contra-movimientos, nunca UPDATE ni DELETE.
--
-- Invariante (tiene que dar 0 filas desde acá):
--   select a.item_id from compras_stock_actual a
--   where a.cantidad <> (select coalesce(sum(delta),0)
--                        from compras_stock_movimientos m where m.item_id = a.item_id);
--
-- Excepción conocida hasta F7: ConteoDesplegable (fábrica) sigue escribiendo
-- compras_stock_actual + un movimiento desde el browser.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Movimientos: columnas de auditoría, tipos nuevos, índices.
-- ----------------------------------------------------------------------------
alter table compras_stock_movimientos
  add column if not exists motivo text,
  add column if not exists cantidad_antes numeric,
  add column if not exists cantidad_despues numeric,
  add column if not exists anula_movimiento_id uuid references compras_stock_movimientos(id);

alter table compras_stock_movimientos drop constraint if exists compras_stock_movimientos_tipo_check;

-- Las bajas por remito borrado/editado se guardaban como entrada_remito negativa.
update compras_stock_movimientos
  set tipo = 'salida_remito_anulado'
  where tipo = 'entrada_remito' and delta < 0;

alter table compras_stock_movimientos add constraint compras_stock_movimientos_tipo_check
  check (tipo in (
    'entrada_remito', 'salida_remito_anulado', 'ajuste_manual', 'conteo_fabrica',
    'ajuste_conteo', 'ajuste_factura', 'devolucion_proveedor', 'apertura', 'reversion'
  ));

alter table compras_stock_movimientos drop constraint if exists compras_stock_movimientos_delta_no_cero;
alter table compras_stock_movimientos add constraint compras_stock_movimientos_delta_no_cero
  check (delta <> 0) not valid;

create index if not exists idx_compras_stock_movimientos_item_fecha
  on compras_stock_movimientos (item_id, created_at desc);
create index if not exists idx_compras_stock_movimientos_remito
  on compras_stock_movimientos (remito_id);
-- Un movimiento se revierte una sola vez.
create unique index if not exists compras_stock_movimientos_anula_unico
  on compras_stock_movimientos (anula_movimiento_id)
  where anula_movimiento_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Apertura: lo que la caché tiene y el ledger no explica entra como un
--    movimiento 'apertura' por la diferencia. Así el stock que ve la gente no
--    cambia y el invariante queda en 0.
-- ----------------------------------------------------------------------------

-- Insumos con movimientos y sin fila en la caché: la app los mostraba en 0.
insert into compras_stock_actual (item_id, cantidad)
select distinct m.item_id, 0
from compras_stock_movimientos m
where not exists (select 1 from compras_stock_actual a where a.item_id = m.item_id)
on conflict (item_id) do nothing;

do $$
declare
  v_antes int;
  v_despues int;
begin
  select count(*) into v_antes
  from compras_stock_actual a
  where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id);
  raise notice 'Invariante antes de la apertura: % insumos fuera', v_antes;

  insert into compras_stock_movimientos (item_id, delta, tipo, motivo, cantidad_antes, cantidad_despues)
  select a.item_id, a.cantidad - l.saldo, 'apertura',
         'Saldo inicial del registro de movimientos', l.saldo, a.cantidad
  from compras_stock_actual a
  cross join lateral (
    select coalesce(sum(m.delta), 0) as saldo
    from compras_stock_movimientos m where m.item_id = a.item_id
  ) l
  where a.cantidad <> l.saldo;

  select count(*) into v_despues
  from compras_stock_actual a
  where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id);
  if v_despues <> 0 then
    raise exception 'La apertura dejó % insumos fuera del invariante', v_despues;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. compras_mover_stock: la única puerta de escritura del stock (interna).
--    F4, F5 y F6 la redefinen para sumar factura_id, discrepancia_id y
--    devolucion_id.
-- ----------------------------------------------------------------------------
create or replace function public.compras_mover_stock(
  p_item_id uuid,
  p_delta numeric,
  p_tipo text,
  p_motivo text default null,
  p_remito_id uuid default null,
  p_conteo_id uuid default null,
  p_anula_movimiento_id uuid default null
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

  -- Hasta F7 el conteo de fábrica escribe la caché con lo contado y un
  -- movimiento calculado desde lo que tenía su pantalla (puede estar viejo).
  -- Lo contado manda: si el ledger no llega a la caché, primero se registra
  -- esa diferencia como conteo y recién después el movimiento pedido.
  select coalesce(sum(delta), 0) into v_saldo
  from compras_stock_movimientos where item_id = p_item_id;
  if v_saldo <> v_antes then
    insert into compras_stock_movimientos (item_id, delta, tipo, motivo, cantidad_antes, cantidad_despues, creado_por)
    values (p_item_id, v_antes - v_saldo, 'conteo_fabrica', 'Diferencia del conteo de fábrica sin registrar', v_saldo, v_antes, auth.uid());
  end if;

  insert into compras_stock_movimientos (
    item_id, delta, tipo, motivo, remito_id, conteo_id, anula_movimiento_id,
    cantidad_antes, cantidad_despues, creado_por
  ) values (
    p_item_id, p_delta, p_tipo, nullif(btrim(p_motivo), ''), p_remito_id, p_conteo_id, p_anula_movimiento_id,
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

revoke execute on function public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Remitos: código interno R-0001-01 (número del pedido + secuencia).
--    El número impreso del proveedor ya no se guarda (N2): `numero` queda
--    legacy y nullable.
-- ----------------------------------------------------------------------------
alter table compras_remitos add column if not exists secuencia int;

update compras_remitos r
  set secuencia = s.n
  from (
    select id, row_number() over (partition by pedido_id order by fecha, created_at, id) as n
    from compras_remitos
  ) s
  where s.id = r.id and r.secuencia is null;

alter table compras_remitos alter column secuencia set not null;

-- Último número de remito dado por pedido: un código no se reusa aunque se
-- borre el remito (igual que los pedidos, N1: el hueco se acepta).
alter table compras_pedidos add column if not exists ultima_secuencia_remito int not null default 0;
update compras_pedidos p
  set ultima_secuencia_remito = s.maximo
  from (select pedido_id, max(secuencia) as maximo from compras_remitos group by pedido_id) s
  where s.pedido_id = p.id and p.ultima_secuencia_remito < s.maximo;
alter table compras_remitos drop constraint if exists compras_remitos_pedido_secuencia_key;
alter table compras_remitos add constraint compras_remitos_pedido_secuencia_key unique (pedido_id, secuencia);
alter table compras_remitos alter column numero drop not null;
drop index if exists uq_compras_remitos_pedido_numero;

-- ----------------------------------------------------------------------------
-- 5. Vista de movimientos con la auditoría nueva (columnas al final: create or
--    replace no deja reordenar).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_stock_movimientos as
select
  m.id,
  m.item_id,
  m.delta,
  m.tipo,
  m.remito_id,
  m.conteo_id,
  m.created_at,
  ci.nombre as item_nombre,
  p.nombre as creado_por_nombre,
  m.motivo,
  m.cantidad_antes,
  m.cantidad_despues,
  m.anula_movimiento_id,
  exists (select 1 from compras_stock_movimientos r where r.anula_movimiento_id = m.id) as revertido,
  case when rem.id is not null
    then 'R-' || lpad(ped.numero::text, 4, '0') || '-' || lpad(rem.secuencia::text, 2, '0')
  end as remito_codigo
from compras_stock_movimientos m
left join compras_items ci on ci.id = m.item_id
left join profiles p on p.id = m.creado_por
left join compras_remitos rem on rem.id = m.remito_id
left join compras_pedidos ped on ped.id = rem.pedido_id
where (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_stock_movimientos to authenticated;
