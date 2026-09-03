-- Datos de facturación como dato de la app, editables desde /admin/compras/facturacion.
-- Hoy viven hardcodeados en lib/compras/pedidoMensaje.ts (LOCALES) y el pedido no guarda
-- a dónde se factura: sale del local del proveedor, que es text libre sin validar.

create table if not exists locales_facturacion (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,   -- 'paraguay' | 'lagrana' — compat con proveedores.local
  nombre       text not null,          -- 'Paraguay 388'   (etiqueta de los selects)
  sucursal     text not null,          -- 'SUC. PARAGUAY'  → {{local_suc}}
  razon_social text not null,          -- 'YA ! CHIPACITOS' → {{razon_social}}
  cuit         text not null,          -- '33-71770212-9'  → {{local_cuit}}
  direccion    text not null,          -- 'PARAGUAY 388'   → {{local_direccion}}
  activo       boolean not null default true,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table locales_facturacion enable row level security;
create policy "locales_facturacion_lectura" on locales_facturacion
  for select to authenticated using (tiene_acceso_compras());
create policy "locales_facturacion_escritura" on locales_facturacion
  for all to authenticated using (es_admin()) with check (es_admin());

-- Seed: reproduce exactamente los dos locales de LOCALES en pedidoMensaje.ts,
-- para que el día 1 nada cambie visualmente.
insert into locales_facturacion (slug, nombre, sucursal, razon_social, cuit, direccion, orden)
values
  ('paraguay', 'Paraguay 388', 'SUC. PARAGUAY', 'YA ! CHIPACITOS', '33-71770212-9', 'PARAGUAY 388', 0),
  ('lagrana', 'Gdor. Lagraña 388', 'SUC. GDOR. LAGRAÑA', 'YA ! CHIPACITOS', '33-71770212-9', 'GDOR. LAGRAÑA 388', 1)
on conflict (slug) do nothing;

alter table proveedores add column if not exists local_facturacion_id uuid references locales_facturacion(id);
update proveedores p set local_facturacion_id = lf.id
  from locales_facturacion lf
  where p.local = lf.slug and p.local_facturacion_id is null;

alter table compras_pedidos add column if not exists local_facturacion_id uuid references locales_facturacion(id);
update compras_pedidos cp set local_facturacion_id = p.local_facturacion_id
  from proveedores p
  where cp.proveedor_id = p.id and cp.local_facturacion_id is null;
