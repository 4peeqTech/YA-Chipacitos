-- Fase 4 de Compras: reportes — tabla de movimientos de stock
-- Arranca vacía: no hay reconstrucción retroactiva de movimientos previos
-- a esta fase (compras_stock_actual nunca guardó historial).

create table if not exists compras_stock_movimientos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references compras_items(id) on delete cascade,
  delta        numeric not null,
  tipo         text not null check (tipo in ('entrada_remito', 'ajuste_manual')),
  remito_id    uuid references compras_remitos(id) on delete set null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_compras_stock_movimientos_item_id on compras_stock_movimientos(item_id);

alter table compras_stock_movimientos enable row level security;

create policy "admin y squad manejan compras_stock_movimientos" on compras_stock_movimientos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
