-- Tabla de operarios de fábrica (personal a cargo del supervisor). No son
-- usuarios de auth — solo nombre + activo, mismo patrón que
-- fabrica_sabores/fabrica_tamanios (20260804160000_fabrica_fase1_parametros.sql).
create table if not exists fabrica_operarios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activo     boolean not null default true,
  orden      integer not null default 0,
  created_at timestamptz not null default now()
);

alter table fabrica_operarios enable row level security;
create policy "fabrica_operarios_lectura" on fabrica_operarios
  for select to authenticated using (true);
create policy "fabrica_operarios_escritura" on fabrica_operarios
  for all using (tiene_acceso_compras()) with check (tiene_acceso_compras());
