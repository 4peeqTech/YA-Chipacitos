-- Segunda corrección de rumbo: docs/analisis-motor-calculo-legacy.md (ya en el repo)
-- documenta que el conteo semanal real de la app legacy corre sobre TRES grupos con
-- motores de cálculo propios — Bolsaplast (depósito), Global (materia prima) y Huevos
-- (Huevo Campo) — no solo materia prima como asumió la migración anterior
-- (20260806110000). Esta migración alinea el esquema a los 5 "calculadores" reales:
--   1. Bolsaplast: faltante = max(0, meta_semanal − stock_actual)
--   2. Global "Complementario" (4 de 8 ítems): redondeo estándar (floor si falta <0.5
--      unidad, ceil si falta ≥0.5 — el mismo Math.round que ya usábamos)
--   3. Polvo de Hornear: calculador propio, redondeo siempre hacia arriba
--   4. Leche en Polvo / Sal / Queso Pategrás: sin calculador — stock informativo,
--      se reponen vía Pedido Base semanal, no vía el complementario
--   5. Huevos: no es catálogo, son 2 campos de planificación (cajones disponibles +
--      masas proyectadas, compartido con Global) — regla fija 90 huevos/masa,
--      360 huevos/cajón (12 maples × 30)
-- La proyección real del legacy es "número de masas" (batches de producción), no kg
-- continuos — se revierte esa conversión inventada en la migración anterior.

-- ============================================================================
-- Limpieza de datos de prueba: los conteos/solicitudes que puedan existir usan la
-- semántica vieja (kg continuos) — no tiene sentido migrarlos, se vuelve a arrancar
-- de cero (mismo criterio que la migración anterior).
-- ============================================================================

update compras_pedidos set solicitud_id = null where solicitud_id is not null;
delete from compras_solicitudes;
delete from fabrica_conteos;

-- ============================================================================
-- Bolsaplast se suma al conteo semanal de fábrica — necesita el flag de vuelta
-- (esta vez por el motivo correcto: son los 7 ítems reales del calculador
-- Bolsaplast del legacy) + que RLS le abra la puerta al rol fabrica en las
-- tablas de depósito que ahora edita desde su propia pantalla.
-- ============================================================================

alter table compras_items
  add column if not exists incluir_en_conteo boolean not null default false;

update compras_items set incluir_en_conteo = true
where proveedor_id = (select id from proveedores where upper(nombre) = 'BOLSAPLAST');

drop policy if exists "compras_items_acceso" on compras_items;
create policy "compras_items_acceso" on compras_items
  for all using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy if exists "compras_stock_actual_acceso" on compras_stock_actual;
create policy "compras_stock_actual_acceso" on compras_stock_actual
  for all using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy if exists "compras_stock_movimientos_acceso" on compras_stock_movimientos;
create policy "compras_stock_movimientos_acceso" on compras_stock_movimientos
  for all using (tiene_acceso_compras() or tiene_acceso_fabrica());

-- proveedores era admin-only a nivel RLS (deuda previa a esta migración: nunca se
-- actualizó cuando 20260804150000 introdujo tiene_acceso_compras() para el resto de
-- Compras) — cualquier squad con módulos de compras, o ahora fábrica, se quedaba sin
-- filas en los joins a proveedor. Se agrega una policy de SELECT adicional; el alta/
-- edición/baja de proveedores sigue siendo admin-only (policy "admin maneja
-- proveedores" ya existente, sin cambios).
create policy "proveedores_lectura_compras_fabrica" on proveedores
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

-- ============================================================================
-- fabrica_materia_prima: coeficiente vuelve a ser "kg por masa" (valor crudo del
-- legacy, sin dividir por rendimiento) + redondeo por ítem, porque no los 8 ítems
-- usan la misma regla al calcular cuánto pedir.
-- ============================================================================

alter table fabrica_materia_prima rename column coeficiente to kg_por_masa;

alter table fabrica_materia_prima
  add column if not exists redondeo text not null default 'estandar'
    check (redondeo in ('estandar', 'siempre_arriba', 'sin_calculo'));

update fabrica_materia_prima set kg_por_masa = v.kg_por_masa, redondeo = v.redondeo
from (values
  ('Fécula de Mandioca', 30,    'estandar'),
  ('Queso Barra',        16.5,  'estandar'),
  ('Queso Sardo',        4.5,   'estandar'),
  ('Margarina',          6,     'estandar'),
  ('Leche en Polvo',     1.405, 'sin_calculo'),
  ('Sal',                0.84,  'sin_calculo'),
  ('Queso Pategrás',     0,     'sin_calculo'),
  ('Polvo de Hornear',   0.3,   'siempre_arriba')
) as v(nombre, kg_por_masa, redondeo)
where fabrica_materia_prima.nombre = v.nombre;

-- ============================================================================
-- fabrica_conteos: la proyección real del legacy es "número de masas" (batches),
-- no kg continuos — mismo campo que usan tanto Global como Huevos. Se agrega el
-- campo de Huevos (no tiene catálogo propio, son 2 campos de planificación).
-- ============================================================================

alter table fabrica_conteos rename column proyeccion_masa_kg to masas_proyectadas;
alter table fabrica_conteos add column if not exists huevos_cajones_disponibles numeric not null default 0;

alter table fabrica_conteo_items rename column coeficiente to kg_por_masa;

-- ============================================================================
-- cerrar_conteo_fabrica: arma la solicitud complementaria con líneas de las 3
-- fuentes (materia prima, Bolsaplast, huevos), cada una con su propia regla.
-- ============================================================================

create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas             numeric;
  v_huevos_stock      numeric;
  v_huevos_falta      numeric;
  v_proveedor_huevos  uuid;
  v_solicitud_id      uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select masas_proyectadas, huevos_cajones_disponibles
    into v_masas, v_huevos_stock
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  -- Materia prima (Global): redondeo estándar salvo regla propia del ítem
  -- (Polvo de Hornear: siempre arriba; Leche/Sal/Pategrás: sin cálculo).
  update fabrica_conteo_items fci set
    kg_por_masa   = fmp.kg_por_masa,
    kg_por_unidad = fmp.kg_por_unidad,
    unidad_compra = fmp.unidad_compra,
    necesidad     = fmp.kg_por_masa * v_masas,
    sugerido      = case
                      when fmp.redondeo = 'sin_calculo' then 0
                      when fmp.kg_por_unidad <= 0 then 0
                      when fmp.redondeo = 'siempre_arriba' then
                        ceil(greatest(0, fmp.kg_por_masa * v_masas - fci.cantidad * fmp.kg_por_unidad) / fmp.kg_por_unidad)
                      else
                        round(greatest(0, fmp.kg_por_masa * v_masas - fci.cantidad * fmp.kg_por_unidad) / fmp.kg_por_unidad)
                    end
  from fabrica_materia_prima fmp
  where fmp.id = fci.materia_prima_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  -- Fuente 1: materia prima.
  insert into compras_solicitud_items
    (solicitud_id, materia_prima_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, fci.materia_prima_id, fmp.proveedor_id, fmp.nombre, fmp.unidad_compra, fci.sugerido, fci.sugerido, fci.sugerido > 0
  from fabrica_conteo_items fci
  join fabrica_materia_prima fmp on fmp.id = fci.materia_prima_id
  where fci.conteo_id = p_conteo_id;

  -- Fuente 2: Bolsaplast (depósito) — faltante = max(0, meta_semanal − stock_actual).
  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, ci.id, ci.proveedor_id, ci.nombre, ci.unidad,
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)),
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)),
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)) > 0
  from compras_items ci
  left join compras_stock_actual csa on csa.item_id = ci.id
  where ci.incluir_en_conteo and ci.estado = 'activo';

  -- Fuente 3: Huevos — sin catálogo propio, se calcula y se inserta directo.
  v_huevos_falta := greatest(0, ceil(v_masas * 90 / 360) - v_huevos_stock);
  select id into v_proveedor_huevos from proveedores where upper(nombre) = 'HUEVO CAMPO';
  if v_proveedor_huevos is not null then
    insert into compras_solicitud_items
      (solicitud_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
    values (v_solicitud_id, v_proveedor_huevos, 'Huevos', 'Cajones', v_huevos_falta, v_huevos_falta, v_huevos_falta > 0);
  end if;

  return v_solicitud_id;
end;
$$;
