-- Insumo ↔ proveedor pasa de 1:N (compras_items.proveedor_id) a M:N: un
-- insumo puede cotizarse con varios proveedores, con uno marcado principal
-- (el que se usa por default al armar pedidos/plantillas). compras_items.
-- proveedor_id NO se borra todavía — se sincroniza con el principal desde
-- el cliente y se dropea en una migración aparte tras QA de regresión.

create table if not exists compras_item_proveedores (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references compras_items(id) on delete cascade,
  proveedor_id     uuid not null references proveedores(id) on delete cascade,
  es_principal     boolean not null default false,
  precio_ref       numeric,
  codigo_proveedor text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (item_id, proveedor_id)
);
create index if not exists idx_cip_item_id      on compras_item_proveedores(item_id);
create index if not exists idx_cip_proveedor_id on compras_item_proveedores(proveedor_id);
-- Un solo principal por item
create unique index if not exists idx_cip_principal_unico
  on compras_item_proveedores(item_id) where es_principal;

-- Backfill desde la relación 1:N actual
insert into compras_item_proveedores (item_id, proveedor_id, es_principal)
select id, proveedor_id, true from compras_items where proveedor_id is not null
on conflict (item_id, proveedor_id) do nothing;

alter table compras_item_proveedores enable row level security;
create policy "compras_item_proveedores_lectura" on compras_item_proveedores
  for select to authenticated using (tiene_acceso_compras() or tiene_acceso_fabrica());
create policy "compras_item_proveedores_escritura" on compras_item_proveedores
  for all to authenticated using (tiene_acceso_compras()) with check (tiene_acceso_compras());

-- Vista de conveniencia: item + su proveedor principal. Evita reescribir
-- los consumidores que solo necesitan "el proveedor del item" (pedido-base,
-- reportes) mientras compras_items.proveedor_id sigue existiendo.
create or replace view v_compras_items as
select i.*, cip.proveedor_id as proveedor_principal_id, p.nombre as proveedor_principal_nombre
from compras_items i
left join compras_item_proveedores cip on cip.item_id = i.id and cip.es_principal
left join proveedores p on p.id = cip.proveedor_id;

-- La columna vieja se retira SOLO al final, tras verificar en QA que nadie la lee.
-- alter table compras_items drop column if exists proveedor_id;
