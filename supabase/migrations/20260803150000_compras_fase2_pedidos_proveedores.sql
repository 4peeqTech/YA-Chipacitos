-- Fase 2 de Compras: pedidos a proveedores

alter table proveedores
  add column if not exists local text;

create table if not exists compras_pedidos (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id),
  estado        text not null default 'borrador' check (estado in ('borrador', 'enviado', 'cerrado')),
  mensaje       text,
  creado_por    uuid references profiles(id),
  created_at    timestamptz default now(),
  enviado_en    timestamptz,
  cerrado_en    timestamptz
);

create index if not exists idx_compras_pedidos_proveedor_id on compras_pedidos(proveedor_id);
create index if not exists idx_compras_pedidos_estado on compras_pedidos(estado);

alter table compras_pedidos enable row level security;

create policy "admin y squad manejan compras_pedidos" on compras_pedidos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_pedido_items (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references compras_pedidos(id) on delete cascade,
  item_id       uuid references compras_items(id),
  descripcion   text not null,
  unidad        text,
  cantidad      numeric not null default 0,
  orden         integer not null default 0
);

create index if not exists idx_compras_pedido_items_pedido_id on compras_pedido_items(pedido_id);

alter table compras_pedido_items enable row level security;

create policy "admin y squad manejan compras_pedido_items" on compras_pedido_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
