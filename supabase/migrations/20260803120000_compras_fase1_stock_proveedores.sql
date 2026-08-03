-- Fase 1 de Compras: maneja_stock en proveedores + catálogo de insumos + stock actual

alter table proveedores
  add column if not exists maneja_stock boolean not null default false;

create table if not exists compras_items (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references proveedores(id),
  nombre            text not null,
  unidad            text not null,
  meta_semanal      numeric not null default 0,
  consumo_por_masa  numeric,
  orden             integer not null default 0,
  estado            text not null default 'activo' check (estado in ('activo', 'archivado')),
  created_at        timestamptz default now()
);

create index if not exists idx_compras_items_proveedor_id on compras_items(proveedor_id);

alter table compras_items enable row level security;

create policy "admin y squad manejan compras_items" on compras_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_stock_actual (
  item_id         uuid primary key references compras_items(id) on delete cascade,
  cantidad        numeric not null default 0,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references profiles(id)
);

alter table compras_stock_actual enable row level security;

create policy "admin y squad manejan compras_stock_actual" on compras_stock_actual
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
