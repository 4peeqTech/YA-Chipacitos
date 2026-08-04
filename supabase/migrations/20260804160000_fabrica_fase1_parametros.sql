-- Fase 1 del módulo Fábrica: tablas de parámetros (sabores, presentaciones,
-- tamaños), categorías de compras, y extensión de compras_items con lo
-- necesario para calcular el sugerido de compra por insumo
-- (kg_masa / kg_embolsado / meta_semanal). Sesión de base para las fases
-- siguientes (conteo semanal, producción, stock terminado).

create table if not exists fabrica_sabores (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0,
  activo  boolean not null default true
);

create table if not exists fabrica_presentaciones (
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null unique,
  peso_kg  numeric not null,
  orden    integer not null default 0,
  activo   boolean not null default true
);

create table if not exists fabrica_tamanios (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0,
  activo  boolean not null default true
);

create table if not exists compras_categorias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0
);

insert into fabrica_sabores (nombre, orden) values
  ('CLÁSICOS', 1), ('MAIZ', 2), ('ANIS', 3), ('SALAME', 4),
  ('JAMON', 5), ('QUESO AZUL', 6), ('CHEDDAR', 7)
on conflict (nombre) do nothing;

insert into fabrica_presentaciones (nombre, peso_kg, orden) values
  ('1/2 Kg.', 0.5, 1), ('2 Kg.', 2, 2), ('5 Kg.', 5, 3), ('10 Kg.', 10, 4)
on conflict (nombre) do nothing;

insert into fabrica_tamanios (nombre, orden) values
  ('CHICO', 1), ('MEDIO', 2)
on conflict (nombre) do nothing;

insert into compras_categorias (nombre, orden) values
  ('Materia prima', 1), ('Bolsas', 2), ('Limpieza', 3), ('Librería', 4)
on conflict (nombre) do nothing;

-- Lectura abierta a cualquier autenticado, escritura reservada a quien
-- tiene acceso a Compras (mismo helper que ya gobierna las 7 tablas de
-- Compras — ver 20260804150000_compras_rls_modulos.sql).
alter table fabrica_sabores enable row level security;
create policy "fabrica_sabores_lectura" on fabrica_sabores
  for select using (auth.uid() is not null);
create policy "fabrica_sabores_escritura" on fabrica_sabores
  for all using (tiene_acceso_compras());

alter table fabrica_presentaciones enable row level security;
create policy "fabrica_presentaciones_lectura" on fabrica_presentaciones
  for select using (auth.uid() is not null);
create policy "fabrica_presentaciones_escritura" on fabrica_presentaciones
  for all using (tiene_acceso_compras());

alter table fabrica_tamanios enable row level security;
create policy "fabrica_tamanios_lectura" on fabrica_tamanios
  for select using (auth.uid() is not null);
create policy "fabrica_tamanios_escritura" on fabrica_tamanios
  for all using (tiene_acceso_compras());

alter table compras_categorias enable row level security;
create policy "compras_categorias_lectura" on compras_categorias
  for select using (auth.uid() is not null);
create policy "compras_categorias_escritura" on compras_categorias
  for all using (tiene_acceso_compras());

-- Extensión de compras_items: categoría, base de cálculo del sugerido, y
-- si el insumo entra o no en el conteo semanal de fábrica.
alter table compras_items
  add column if not exists categoria_id uuid references compras_categorias(id),
  add column if not exists base_calculo text not null default 'meta_semanal'
    check (base_calculo in ('kg_masa', 'kg_embolsado', 'meta_semanal')),
  add column if not exists incluir_en_conteo boolean not null default true;

-- consumo_por_masa era "consumo por batch"; pasa a ser "consumo por kg" y
-- cambia de nombre para reflejarlo. Los insumos que ya tenían un valor
-- cargado se marcan con base_calculo='kg_masa' — hay que revisarlos en
-- pantalla antes de cerrar el primer conteo, la unidad cambió.
alter table compras_items rename column consumo_por_masa to coeficiente;
update compras_items set base_calculo = 'kg_masa' where coeficiente is not null;

insert into config (key, value) values ('fabrica_rendimiento_masa', '2.5')
on conflict (key) do nothing;
