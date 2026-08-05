-- Fase 2 del módulo Fábrica: conteo semanal de insumos + proyección de masa,
-- con cierre transaccional que dispara una solicitud de compra complementaria.
--
-- Nota de dependencia: `cerrar_conteo_fabrica` necesita compras_solicitudes /
-- compras_solicitud_items, documentadas en el plan recién para la Fase 3
-- (bandeja de Compras). Se crean acá, completas, porque el cierre del conteo
-- las necesita ya; la Fase 3 solo agrega compras_plantilla_base y la columna
-- compras_pedidos.solicitud_id sobre estas mismas tablas.

create table if not exists fabrica_conteos (
  id                       uuid primary key default gen_random_uuid(),
  fecha                    date not null,
  semana_desde             date not null,
  semana_hasta             date not null,
  proyeccion_masa_kg       numeric not null default 0,
  proyeccion_embolsado_kg  numeric not null default 0,
  estado                   text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  notas                    text,
  creado_por               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  cerrado_por              uuid references profiles(id),
  cerrado_en               timestamptz
);
create unique index if not exists fabrica_conteos_fecha_cerrado_unique
  on fabrica_conteos (fecha) where estado = 'cerrado';

-- Snapshot de la config del insumo al momento del cierre (base_calculo,
-- coeficiente, meta_semanal) — si Compras edita el coeficiente la semana que
-- viene, los conteos ya cerrados no cambian de número retroactivamente.
create table if not exists fabrica_conteo_items (
  id             uuid primary key default gen_random_uuid(),
  conteo_id      uuid not null references fabrica_conteos(id) on delete cascade,
  item_id        uuid not null references compras_items(id),
  cantidad       numeric not null default 0,
  base_calculo   text,
  coeficiente    numeric,
  meta_semanal   numeric,
  necesidad      numeric,
  sugerido       numeric,
  unique (conteo_id, item_id)
);
create index if not exists idx_fabrica_conteo_items_conteo_id on fabrica_conteo_items(conteo_id);

create table if not exists compras_solicitudes (
  id             uuid primary key default gen_random_uuid(),
  conteo_id      uuid references fabrica_conteos(id),
  tipo           text not null check (tipo in ('complementario', 'base')),
  estado         text not null default 'abierta' check (estado in ('abierta', 'convertida', 'descartada')),
  created_at     timestamptz not null default now(),
  creado_por     uuid references profiles(id),
  convertida_en  timestamptz,
  convertida_por uuid references profiles(id)
);
create unique index if not exists compras_solicitudes_conteo_unique
  on compras_solicitudes (conteo_id) where conteo_id is not null;

create table if not exists compras_solicitud_items (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid not null references compras_solicitudes(id) on delete cascade,
  item_id            uuid references compras_items(id),
  proveedor_id       uuid references proveedores(id),
  descripcion        text not null,
  unidad             text,
  cantidad_sugerida  numeric not null default 0,
  cantidad_ajustada  numeric not null default 0,
  incluir            boolean not null default true
);
create index if not exists idx_compras_solicitud_items_solicitud_id on compras_solicitud_items(solicitud_id);

-- Acceso: mismo helper que ya gobierna Compras (tiene_acceso_compras(), ver
-- 20260804150000_compras_rls_modulos.sql). Para Fábrica se agrega el
-- equivalente restringido a rol fabrica/admin — Compras solo lee conteos,
-- nunca escribe (decisión del plan: "Permisos del conteo: rol fabrica +
-- admin; Compras solo lee").
create or replace function public.tiene_acceso_fabrica()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and rol in ('fabrica', 'admin')
  );
$$;

alter table fabrica_conteos enable row level security;
create policy "fabrica_conteos_lectura" on fabrica_conteos
  for select using (tiene_acceso_fabrica() or tiene_acceso_compras());
create policy "fabrica_conteos_alta" on fabrica_conteos
  for insert with check (tiene_acceso_fabrica());
create policy "fabrica_conteos_modificacion" on fabrica_conteos
  for update using (tiene_acceso_fabrica());

alter table fabrica_conteo_items enable row level security;
create policy "fabrica_conteo_items_lectura" on fabrica_conteo_items
  for select using (tiene_acceso_fabrica() or tiene_acceso_compras());
create policy "fabrica_conteo_items_alta" on fabrica_conteo_items
  for insert with check (tiene_acceso_fabrica());
create policy "fabrica_conteo_items_modificacion" on fabrica_conteo_items
  for update using (tiene_acceso_fabrica());

alter table compras_solicitudes enable row level security;
create policy "compras_solicitudes_acceso" on compras_solicitudes
  for all using (tiene_acceso_compras());

alter table compras_solicitud_items enable row level security;
create policy "compras_solicitud_items_acceso" on compras_solicitud_items
  for all using (tiene_acceso_compras());

-- Cierra un conteo en borrador: calcula necesidad/sugerido por línea con la
-- misma fórmula que lib/fabrica/calculoSugerido.ts (duplicada acá a
-- propósito — es la única forma de que el cierre sea atómico en una
-- transacción de base de datos), marca el conteo cerrado, y crea la
-- solicitud complementaria con sus líneas. Evita repetir el read-then-write
-- sin transacción señalado como deuda en ARQUITECTURA.md §5.5/§11 para
-- compras_stock_actual.
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masa      numeric;
  v_embolsado numeric;
  v_solicitud_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select proyeccion_masa_kg, proyeccion_embolsado_kg
    into v_masa, v_embolsado
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  update fabrica_conteo_items fci set
    base_calculo = ci.base_calculo,
    coeficiente  = ci.coeficiente,
    meta_semanal = ci.meta_semanal,
    necesidad    = case ci.base_calculo
                     when 'kg_masa'      then coalesce(ci.coeficiente, 0) * v_masa
                     when 'kg_embolsado' then coalesce(ci.coeficiente, 0) * v_embolsado
                     else ci.meta_semanal
                   end,
    sugerido     = greatest(0, (case ci.base_calculo
                     when 'kg_masa'      then coalesce(ci.coeficiente, 0) * v_masa
                     when 'kg_embolsado' then coalesce(ci.coeficiente, 0) * v_embolsado
                     else ci.meta_semanal
                   end) - fci.cantidad)
  from compras_items ci
  where ci.id = fci.item_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, fci.item_id, ci.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;
