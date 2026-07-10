-- Modelo nuevo para datos sincronizados desde la API de Fudo.
-- Separado de las tablas internas (productos, proveedores, gastos) para no pisar
-- el modelo de negocio existente. Cada tabla guarda columnas tipadas clave +
-- el JSON crudo (raw) por si se necesita un atributo no modelado todavia.

create table if not exists public.fudo_categorias_producto (
  fudo_id text primary key,
  nombre text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_categorias_ingrediente (
  fudo_id text primary key,
  nombre text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_categorias_gasto (
  fudo_id text primary key,
  nombre text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_metodos_pago (
  fudo_id text primary key,
  nombre text,
  codigo text,
  activo boolean,
  posicion numeric,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_proveedores (
  fudo_id text primary key,
  nombre text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_clientes (
  fudo_id text primary key,
  nombre text,
  email text,
  telefono text,
  activo boolean,
  creado_en timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_productos (
  fudo_id text primary key,
  codigo text,
  nombre text,
  descripcion text,
  precio numeric,
  costo numeric,
  activo boolean,
  stock numeric,
  stock_control boolean,
  categoria_id text references public.fudo_categorias_producto(fudo_id),
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_ingredientes (
  fudo_id text primary key,
  nombre text,
  costo numeric,
  stock numeric,
  stock_control boolean,
  categoria_id text references public.fudo_categorias_ingrediente(fudo_id),
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_gastos (
  fudo_id text primary key,
  monto numeric,
  fecha date,
  descripcion text,
  estado text,
  cancelado boolean,
  categoria_id text references public.fudo_categorias_gasto(fudo_id),
  proveedor_id text references public.fudo_proveedores(fudo_id),
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_ventas (
  fudo_id text primary key,
  total numeric,
  tipo text,
  estado text,
  creado_en timestamptz,
  cerrado_en timestamptz,
  cliente_id text references public.fudo_clientes(fudo_id),
  comentario text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_venta_items (
  fudo_id text primary key,
  venta_id text references public.fudo_ventas(fudo_id),
  producto_id text,
  cantidad numeric,
  precio numeric,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_pagos (
  fudo_id text primary key,
  monto numeric,
  cancelado boolean,
  creado_en timestamptz,
  metodo_pago_id text references public.fudo_metodos_pago(fudo_id),
  venta_id text references public.fudo_ventas(fudo_id),
  gasto_id text references public.fudo_gastos(fudo_id),
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.fudo_sync_log (
  id bigserial primary key,
  recurso text,
  iniciado_en timestamptz,
  finalizado_en timestamptz,
  registros integer,
  status text,
  error text
);

-- RLS: solo admin puede leer (mismo modelo de roles que el resto de la app)
alter table public.fudo_categorias_producto enable row level security;
alter table public.fudo_categorias_ingrediente enable row level security;
alter table public.fudo_categorias_gasto enable row level security;
alter table public.fudo_metodos_pago enable row level security;
alter table public.fudo_proveedores enable row level security;
alter table public.fudo_clientes enable row level security;
alter table public.fudo_productos enable row level security;
alter table public.fudo_ingredientes enable row level security;
alter table public.fudo_gastos enable row level security;
alter table public.fudo_ventas enable row level security;
alter table public.fudo_venta_items enable row level security;
alter table public.fudo_pagos enable row level security;
alter table public.fudo_sync_log enable row level security;

create policy "admin_select" on public.fudo_categorias_producto for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_categorias_ingrediente for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_categorias_gasto for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_metodos_pago for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_proveedores for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_clientes for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_productos for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_ingredientes for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_gastos for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_ventas for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_venta_items for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_pagos for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
create policy "admin_select" on public.fudo_sync_log for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));
