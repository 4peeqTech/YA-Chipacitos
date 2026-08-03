-- Fase 3 de Compras: remitos (recepción de mercadería)

create table if not exists compras_remitos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references compras_pedidos(id) on delete cascade,
  numero       text not null,
  fecha        date not null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz default now()
);

create index if not exists idx_compras_remitos_pedido_id on compras_remitos(pedido_id);
create unique index if not exists uq_compras_remitos_pedido_numero on compras_remitos(pedido_id, numero);

alter table compras_remitos enable row level security;

create policy "admin y squad manejan compras_remitos" on compras_remitos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_remito_items (
  id             uuid primary key default gen_random_uuid(),
  remito_id      uuid not null references compras_remitos(id) on delete cascade,
  pedido_item_id uuid references compras_pedido_items(id) on delete set null,
  item_id        uuid references compras_items(id),
  descripcion    text not null,
  cantidad       numeric not null default 0,
  precio         numeric
);

create index if not exists idx_compras_remito_items_remito_id on compras_remito_items(remito_id);
create index if not exists idx_compras_remito_items_pedido_item_id on compras_remito_items(pedido_item_id);

alter table compras_remito_items enable row level security;

create policy "admin y squad manejan compras_remito_items" on compras_remito_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
