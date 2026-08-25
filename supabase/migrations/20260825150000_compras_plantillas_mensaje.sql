-- Plantillas de mensaje de pedido editables desde la UI. Hoy el formato del
-- mensaje de WhatsApp está hardcodeado en construirMensajePedido() — esto
-- permite tener varias plantillas nombradas, con una default, sin tocar código.

create table if not exists compras_plantillas_mensaje (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  cuerpo     text not null,
  es_default boolean not null default false,
  activo     boolean not null default true,
  orden      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_plantilla_default_unica
  on compras_plantillas_mensaje(es_default) where es_default;

alter table compras_plantillas_mensaje enable row level security;
create policy "compras_plantillas_mensaje_lectura" on compras_plantillas_mensaje
  for select to authenticated using (tiene_acceso_compras());
create policy "compras_plantillas_mensaje_escritura" on compras_plantillas_mensaje
  for all to authenticated using (es_admin()) with check (es_admin());

-- Seed: reproduce exactamente el formato actual de construirMensajePedido()
-- (lib/compras/pedidoMensaje.ts) para que el día 1 nada cambie visualmente.
insert into compras_plantillas_mensaje (nombre, cuerpo, es_default, orden)
values (
  'Pedido estándar',
  E'🧾 *PEDIDO {{proveedor}}* — {{dia}} {{fecha}}{{entrega}}\n\n*Detalle del pedido:*\n{{items}}{{facturacion}}',
  true,
  0
)
on conflict (nombre) do nothing;
