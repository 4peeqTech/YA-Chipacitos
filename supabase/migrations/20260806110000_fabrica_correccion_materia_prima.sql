-- Corrección de rumbo del módulo Fábrica/Compras tras feedback real del cliente:
-- separa depósito (compras_items) de materia prima real de producción
-- (fabrica_materia_prima), implementa el motor de cálculo real de la app legacy
-- (conteo en unidades de compra, no en kg), y arregla el bug de duplicate key en
-- fabrica_conteos. Contexto completo en docs/analisis-motor-calculo-legacy.md.

-- ============================================================================
-- 0. Bug crítico: como mucho un borrador vivo de fabrica_conteos en todo el
--    sistema (dos borradores simultáneos son la causa real del 23505 al cerrar).
-- ============================================================================

create unique index if not exists fabrica_conteos_un_borrador
  on fabrica_conteos (estado) where estado = 'borrador';

create or replace function public.eliminar_conteo_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  delete from fabrica_conteos where id = p_id and estado = 'borrador';

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;
end;
$$;

-- ============================================================================
-- Limpieza de datos de prueba: todavía no hay conteos reales en el proyecto
-- dev/test, así que en vez de migrar filas de fabrica_conteo_items desde
-- compras_items hacia fabrica_materia_prima se arranca de cero. Se desvincula
-- compras_pedidos.solicitud_id primero para no romper esa FK al borrar
-- compras_solicitudes (los pedidos en sí quedan, solo pierden la referencia
-- a la solicitud que los originó).
-- ============================================================================

update compras_pedidos set solicitud_id = null where solicitud_id is not null;
delete from compras_solicitudes;
delete from fabrica_conteos;

-- ============================================================================
-- 1. Materia prima real de producción (proveedor Global), separada de los
--    insumos de depósito que quedan en compras_items.
-- ============================================================================

create table if not exists fabrica_materia_prima (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id),
  nombre        text not null,
  unidad_compra text not null,
  kg_por_unidad numeric not null check (kg_por_unidad > 0),
  coeficiente   numeric not null default 0,
  precio        numeric,
  estado        text not null default 'activo' check (estado in ('activo', 'archivado')),
  created_at    timestamptz not null default now()
);

alter table fabrica_materia_prima enable row level security;
create policy "fabrica_materia_prima_acceso" on fabrica_materia_prima
  for all using (tiene_acceso_compras());

-- Nuevo módulo de la pantalla de Materia prima — se suma al set no granular
-- que ya gobierna tiene_acceso_compras() (ver 20260804150000_compras_rls_modulos.sql).
create or replace function public.tiene_acceso_compras()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-materia-prima', 'compras-stock', 'compras-pedidos',
          'compras-remitos', 'compras-reportes', 'compras-solicitudes', 'compras-pedido-base'
        ]
      )
  );
$$;

-- Coeficientes convertidos de "kg por batch de 30kg de fécula" (legacy) a
-- "kg de esta materia prima por kg de masa producida", usando el rendimiento
-- configurado (config.fabrica_rendimiento_masa ≈ 2.5 → 30kg fécula ≈ 75kg masa).
insert into fabrica_materia_prima (proveedor_id, nombre, unidad_compra, kg_por_unidad, coeficiente)
select p.id, v.nombre, v.unidad_compra, v.kg_por_unidad, v.coeficiente
from proveedores p, (values
  ('Fécula de Mandioca', 'Bolsa', 25,   0.4),
  ('Queso Barra',        'Caja',  16.5, 0.22),
  ('Queso Sardo',        'Sardo', 3,    0.06),
  ('Margarina',          'Caja',  10,   0.08),
  ('Leche en Polvo',     'Bolsa', 20,   0.01873),
  ('Sal',                'Bolsa', 20,   0.0112),
  ('Queso Pategrás',     'Caja',  9,    0),
  ('Polvo de Hornear',   'Pote',  4,    0.004)
) as v(nombre, unidad_compra, kg_por_unidad, coeficiente)
where upper(p.nombre) = 'GLOBAL';

-- ============================================================================
-- 5. materia_prima_id en paralelo a item_id en las tres tablas de Compras que
--    hoy solo apuntan a compras_items — se agrega acá (antes del seed de la
--    sección 4 y de la reescritura de fabrica_conteo_items de la sección 3,
--    que ya la necesitan).
-- ============================================================================

alter table compras_solicitud_items
  add column if not exists materia_prima_id uuid references fabrica_materia_prima(id);

alter table compras_plantilla_base
  add column if not exists materia_prima_id uuid references fabrica_materia_prima(id);

alter table compras_pedido_items
  add column if not exists materia_prima_id uuid references fabrica_materia_prima(id);

-- ============================================================================
-- 2. Insumos (depósito) — se simplifica: fuera los campos que eran específicos
--    del motor de cálculo genérico que se reemplaza por completo, adentro precio.
-- ============================================================================

alter table compras_items
  drop column if exists orden,
  drop column if exists base_calculo,
  drop column if exists coeficiente,
  drop column if exists incluir_en_conteo,
  add column if not exists precio numeric;

-- Las 8 filas de Global importadas por 20260805130000_import_insumos_legacy.sql
-- quedan superadas por fabrica_materia_prima (sección 1) — se archivan para que
-- no aparezcan duplicadas en Insumos ni en los selectores de catálogo.
update compras_items set estado = 'archivado'
where proveedor_id = (select id from proveedores where upper(nombre) = 'GLOBAL');

-- ============================================================================
-- 3. Conteo semanal de fábrica — pasa a ser solo materia prima, contada en
--    unidades de compra (no en kg). fabrica_conteo_items se repropone: sale la
--    FK a compras_items, entra materia_prima_id + snapshot de coeficiente
--    (columna que ya existía)/kg_por_unidad/unidad_compra al momento del cierre.
-- ============================================================================

alter table fabrica_conteo_items
  drop constraint if exists fabrica_conteo_items_conteo_id_item_id_key,
  drop constraint if exists fabrica_conteo_items_item_id_fkey,
  drop column if exists item_id,
  drop column if exists base_calculo,
  drop column if exists meta_semanal,
  add column if not exists materia_prima_id uuid references fabrica_materia_prima(id),
  add column if not exists kg_por_unidad numeric,
  add column if not exists unidad_compra text;

alter table fabrica_conteo_items alter column materia_prima_id set not null;
alter table fabrica_conteo_items add constraint fabrica_conteo_items_conteo_id_materia_prima_id_key unique (conteo_id, materia_prima_id);

-- Cierra un conteo en borrador: calcula necesidad (kg de masa que requiere cada
-- materia prima) y sugerido (unidades de compra a pedir, redondeando al medio)
-- por línea, marca el conteo cerrado, y crea la solicitud complementaria.
-- Misma fórmula que lib/fabrica/calculoSugerido.ts — duplicada a propósito para
-- que el cierre sea atómico en una transacción de base de datos.
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masa         numeric;
  v_solicitud_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select proyeccion_masa_kg
    into v_masa
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  update fabrica_conteo_items fci set
    coeficiente   = fmp.coeficiente,
    kg_por_unidad = fmp.kg_por_unidad,
    unidad_compra = fmp.unidad_compra,
    necesidad     = fmp.coeficiente * v_masa,
    sugerido      = case when fmp.kg_por_unidad > 0
                      then round(greatest(0, fmp.coeficiente * v_masa - fci.cantidad * fmp.kg_por_unidad) / fmp.kg_por_unidad)
                      else 0
                    end
  from fabrica_materia_prima fmp
  where fmp.id = fci.materia_prima_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, materia_prima_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, fci.materia_prima_id, fmp.proveedor_id, fmp.nombre, fmp.unidad_compra, fci.sugerido, fci.sugerido, fci.sugerido > 0
  from fabrica_conteo_items fci
  join fabrica_materia_prima fmp on fmp.id = fci.materia_prima_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;

-- ============================================================================
-- 4. Pedido base — seed de las 8 líneas reales del Pedido Base Global (sección
--    2.3 del documento legacy), apuntando a fabrica_materia_prima.
-- ============================================================================

insert into compras_plantilla_base (materia_prima_id, descripcion, proveedor_id, unidad, cantidad, orden)
select fmp.id, fmp.nombre, fmp.proveedor_id, fmp.unidad_compra, v.cantidad, v.orden
from fabrica_materia_prima fmp, (values
  ('Queso Barra',        40, 1),
  ('Queso Sardo',        60, 2),
  ('Fécula de Mandioca', 50, 3),
  ('Margarina',          30, 4),
  ('Queso Pategrás',      1, 5),
  ('Leche en Polvo',      4, 6),
  ('Sal',                 2, 7),
  ('Polvo de Hornear',    2, 8)
) as v(nombre, cantidad, orden)
where fmp.nombre = v.nombre;

-- ============================================================================
-- 5. (continuación) generar_solicitud_base / convertir_solicitud_a_pedidos
--    copian materia_prima_id junto con item_id.
-- ============================================================================

create or replace function public.generar_solicitud_base()
returns uuid
language plpgsql
security definer
as $$
declare
  v_solicitud_id uuid;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if exists (select 1 from compras_solicitudes where tipo = 'base' and estado = 'abierta') then
    raise exception 'Ya hay un pedido base pendiente de revisión en la bandeja de solicitudes';
  end if;

  insert into compras_solicitudes (tipo, estado, creado_por)
  values ('base', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, materia_prima_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, item_id, materia_prima_id, proveedor_id, descripcion, unidad, cantidad, cantidad, true
  from compras_plantilla_base
  where activo
  order by orden;

  return v_solicitud_id;
end;
$$;

create or replace function public.convertir_solicitud_a_pedidos(p_solicitud_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_proveedor_id uuid;
  v_pedido_id    uuid;
  v_creados      integer := 0;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  perform 1 from compras_solicitudes where id = p_solicitud_id and estado = 'abierta' for update;
  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  for v_proveedor_id in
    select distinct proveedor_id
    from compras_solicitud_items
    where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0
  loop
    insert into compras_pedidos (proveedor_id, estado, creado_por, solicitud_id)
    values (v_proveedor_id, 'borrador', auth.uid(), p_solicitud_id)
    returning id into v_pedido_id;

    insert into compras_pedido_items (pedido_id, item_id, materia_prima_id, descripcion, unidad, cantidad, orden)
    select v_pedido_id, csi.item_id, csi.materia_prima_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.descripcion) - 1
    from compras_solicitud_items csi
    where csi.solicitud_id = p_solicitud_id
      and csi.proveedor_id = v_proveedor_id
      and csi.incluir
      and csi.cantidad_ajustada > 0;

    v_creados := v_creados + 1;
  end loop;

  update compras_solicitudes
    set estado = 'convertida', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id;

  return v_creados;
end;
$$;
