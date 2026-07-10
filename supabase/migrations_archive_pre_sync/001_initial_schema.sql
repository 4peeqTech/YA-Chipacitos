-- ================================================
-- YA! Chipacitos — Schema inicial
-- ================================================

-- Perfiles de usuario
create table profiles (
  id uuid references auth.users primary key,
  nombre text not null,
  rol text check (rol in ('local','deposito','fabrica','admin')) not null,
  local_nombre text,
  created_at timestamptz default now()
);

-- Catálogo de productos e insumos
create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  unidad text default 'unidad',
  tipo text check (tipo in ('producto','insumo')) not null,
  destino text check (destino in ('fabrica','deposito')) not null,
  activo boolean default true,
  created_at timestamptz default now()
);

-- Pedidos
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  local_id uuid references profiles(id),
  local_nombre text not null,
  destino text check (destino in ('fabrica','deposito')) not null,
  estado text check (estado in ('pendiente','preparando','enviado','recibido')) default 'pendiente',
  notas text,
  created_at timestamptz default now(),
  enviado_at timestamptz,
  recibido_at timestamptz
);

-- Ítems de cada pedido
create table pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id) on delete cascade,
  producto_id uuid references productos(id),
  producto_nombre text not null,
  cantidad integer not null check (cantidad > 0),
  created_at timestamptz default now()
);

-- Ventas importadas desde Posberry (CSV)
create table ventas_posberry (
  id uuid primary key default gen_random_uuid(),
  local_id uuid references profiles(id),
  local_nombre text,
  fecha date not null,
  producto_nombre text not null,
  cantidad integer not null,
  importe numeric(10,2),
  archivo_origen text,
  created_at timestamptz default now()
);

-- Log de conciliaciones
create table conciliaciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  local_id uuid references profiles(id),
  producto_nombre text not null,
  vendido integer default 0,
  pedido integer default 0,
  diferencia integer generated always as (vendido - pedido) stored,
  tiene_alerta boolean generated always as (vendido > pedido) stored,
  created_at timestamptz default now()
);

-- ================================================
-- Función de recálculo de conciliación
-- ================================================
create or replace function recalcular_conciliacion(p_fecha date, p_local_id uuid)
returns void as $$
begin
  delete from conciliaciones
  where fecha = p_fecha and local_id = p_local_id;

  insert into conciliaciones (fecha, local_id, producto_nombre, vendido, pedido)
  select
    p_fecha,
    p_local_id,
    producto_nombre,
    coalesce(sum(case when fuente='venta' then cantidad end), 0) as vendido,
    coalesce(sum(case when fuente='pedido' then cantidad end), 0) as pedido
  from (
    select producto_nombre, cantidad, 'venta' as fuente
    from ventas_posberry
    where fecha = p_fecha and local_id = p_local_id
    union all
    select pi.producto_nombre, pi.cantidad, 'pedido' as fuente
    from pedido_items pi
    join pedidos p on p.id = pi.pedido_id
    where date(p.created_at) = p_fecha and p.local_id = p_local_id
  ) combined
  group by producto_nombre;
end;
$$ language plpgsql security definer;

-- ================================================
-- Row Level Security
-- ================================================

alter table profiles enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table ventas_posberry enable row level security;
alter table conciliaciones enable row level security;

-- Helper para obtener el rol del usuario actual
create or replace function get_user_rol()
returns text as $$
  select rol from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Profiles
create policy "usuarios ven su propio perfil" on profiles
  for select using (id = auth.uid() or get_user_rol() = 'admin');

create policy "admin puede insertar perfiles" on profiles
  for insert with check (get_user_rol() = 'admin');

create policy "admin puede actualizar perfiles" on profiles
  for update using (get_user_rol() = 'admin');

-- Productos (todos los autenticados pueden ver activos)
create policy "autenticados ven productos activos" on productos
  for select using (auth.uid() is not null);

create policy "fabrica y admin gestionan productos" on productos
  for all using (get_user_rol() in ('fabrica', 'admin'));

create policy "deposito y admin gestionan insumos" on productos
  for all using (get_user_rol() in ('deposito', 'admin'));

-- Pedidos
create policy "local ve sus pedidos" on pedidos
  for select using (local_id = auth.uid() or get_user_rol() in ('admin', 'fabrica', 'deposito'));

create policy "local crea pedidos" on pedidos
  for insert with check (local_id = auth.uid() and get_user_rol() = 'local');

create policy "operadores actualizan pedidos" on pedidos
  for update using (
    get_user_rol() in ('admin', 'fabrica', 'deposito')
    or (local_id = auth.uid() and get_user_rol() = 'local')
  );

-- Pedido items
create policy "todos los autenticados ven items" on pedido_items
  for select using (auth.uid() is not null);

create policy "local crea items de sus pedidos" on pedido_items
  for insert with check (
    exists (
      select 1 from pedidos p
      where p.id = pedido_id and p.local_id = auth.uid()
    )
  );

-- Ventas Posberry
create policy "local ve sus ventas" on ventas_posberry
  for select using (local_id = auth.uid() or get_user_rol() = 'admin');

create policy "admin inserta ventas" on ventas_posberry
  for insert with check (get_user_rol() = 'admin');

-- Conciliaciones
create policy "admin ve conciliaciones" on conciliaciones
  for select using (get_user_rol() = 'admin');

create policy "sistema maneja conciliaciones" on conciliaciones
  for all using (get_user_rol() = 'admin');

-- ================================================
-- Habilitar Realtime en pedidos
-- ================================================
alter publication supabase_realtime add table pedidos;
