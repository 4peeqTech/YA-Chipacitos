-- Análisis A0 — Receta vs. consumo real (Bloque 2)
-- Ver docs/analisis-receta-consumo.md para el método y la lectura de cada consulta.
--
-- SOLO LECTURA: todas las consultas son SELECT. No hay INSERT/UPDATE/DDL.
-- Corrida validada contra DEV (fafckqysyvtlslfnpzrh), que tiene solo datos de prueba.
-- Para correr contra PROD hace falta autorización explícita del usuario
-- (regla vigente desde 2026-10-05: no se toca prod, ni para leer).
--
-- Cómo correr cada bloque (el CLI exige --linked junto con --project-ref;
-- NO hace `supabase link`, solo apunta esta consulta al ref indicado):
--   supabase db query --linked --project-ref <REF> "<consulta>"
--   supabase db query --linked --project-ref <REF> -f <archivo con una consulta>
--
-- Supuestos (parámetros en el CTE `params` de cada consulta):
--   fecula_por_masa   = 30   kg de fécula en una masa completa (R2)
--   masa_kg_por_masa  = 75   kg de masa que salen de una masa completa (mediana
--                            de la planilla legacy; el form precarga fécula × 2,5)
--   tz                = America/Argentina/Buenos_Aires
-- Ventana de un período: desde el conteo i hasta el conteo i+1 del mismo insumo.
--   * movimientos de stock: por timestamp, (t_i, t_fin]. t = último movimiento
--     conteo_fabrica de ese conteo e insumo; si no hay, cerrado_en.
--   * producción: por fecha, [fecha_i, fecha_fin). Supone que el conteo se hace
--     ANTES de producir ese día (pregunta abierta para Marcos).


-- ─────────────────────────────────────────────────────────────────────────────
-- Q0. Receta vigente (una sola, global, por masa)
-- ─────────────────────────────────────────────────────────────────────────────
select nombre, unidad, cantidad_por_unidad as base_por_unidad,
       cantidad_por_masa as base_por_masa,
       round(cantidad_por_masa / nullif(cantidad_por_unidad, 0), 3) as unidades_por_masa,
       a_demanda, estado
from compras_items
where cantidad_por_masa > 0
order by cantidad_por_masa desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q1. Conteos cerrados por lista (los descartados quedan afuera)
-- ─────────────────────────────────────────────────────────────────────────────
select d.nombre as lista, c.fecha, c.semana_desde, c.semana_hasta,
       c.masas_proyectadas, c.cerrado_en,
       lead(c.fecha) over (partition by c.definicion_id order by c.fecha, c.cerrado_en) as fecha_siguiente,
       (select count(*) from fabrica_conteo_items i where i.conteo_id = c.id and i.cantidad is null) as items_sin_contar
from fabrica_conteos c
left join fabrica_conteo_definiciones d on d.id = c.definicion_id
where c.estado = 'cerrado' and c.descartado_en is null
order by d.nombre, c.fecha, c.cerrado_en;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q2. Masas por período entre conteos Global — 3 criterios
--   filas      = 1 fila de fabrica_producciones = 1 masa (lo que hace hoy el
--                reporte de cumplimiento)
--   fecula     = sum(fecula_kg) / 30 (R2)
--   masa_kg    = sum(masa_kg) / 75
-- ─────────────────────────────────────────────────────────────────────────────
with params as (select 30.0::numeric as fecula_por_masa, 75.0::numeric as masa_kg_por_masa),
global as (
  select c.id, c.fecha,
         lead(c.fecha) over (order by c.fecha, c.cerrado_en) as fecha_fin
  from fabrica_conteos c
  join fabrica_conteo_definiciones d on d.id = c.definicion_id
  where d.nombre ilike 'global' and c.estado = 'cerrado' and c.descartado_en is null
)
select g.fecha as desde, g.fecha_fin as hasta,
       count(p.id) as masas_filas,
       round(sum(p.fecula_kg) / max(pa.fecula_por_masa), 1) as masas_fecula,
       round(sum(p.masa_kg) / max(pa.masa_kg_por_masa), 1) as masas_masa_kg,
       round(100.0 * (count(p.id) - sum(p.fecula_kg) / max(pa.fecula_por_masa))
             / nullif(sum(p.fecula_kg) / max(pa.fecula_por_masa), 0), 1) as dif_filas_pct,
       round(100.0 * (sum(p.masa_kg) / max(pa.masa_kg_por_masa) - sum(p.fecula_kg) / max(pa.fecula_por_masa))
             / nullif(sum(p.fecula_kg) / max(pa.fecula_por_masa), 0), 1) as dif_masa_kg_pct,
       round(sum(p.masa_kg) / nullif(sum(p.fecula_kg), 0), 3) as kg_masa_por_kg_fecula
from global g
cross join params pa
left join fabrica_producciones p on p.fecha >= g.fecha and p.fecha < g.fecha_fin
where g.fecha_fin is not null
group by g.fecha, g.fecha_fin
order by g.fecha;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q3a. Distribución de fecula_kg (10 / 20 / 30 / otros)
-- ─────────────────────────────────────────────────────────────────────────────
select case when fecula_kg = 30 then '30'
            when fecula_kg = 20 then '20'
            when fecula_kg = 10 then '10'
            else 'otro (' || fecula_kg::text || ')' end as fecula_kg,
       count(*) as cargas,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct_cargas,
       round(avg(masa_kg), 1) as masa_kg_promedio
from fabrica_producciones
group by 1
order by cargas desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q3b. Cargas por sabor y destino (los saborizados no tienen receta propia)
-- ─────────────────────────────────────────────────────────────────────────────
with params as (select 30.0::numeric as fecula_por_masa)
select coalesce(s.nombre, '(sin sabor)') as sabor, p.destino,
       count(*) as cargas,
       round(sum(p.fecula_kg) / max(pa.fecula_por_masa), 1) as masas_fecula,
       round(100.0 * sum(p.fecula_kg) / sum(sum(p.fecula_kg)) over (), 1) as pct_masas,
       round(sum(p.masa_kg) / nullif(sum(p.fecula_kg), 0), 2) as kg_masa_por_kg_fecula
from fabrica_producciones p
cross join params pa
left join fabrica_sabores s on s.id = p.sabor_id
group by 1, 2
order by masas_fecula desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q4. Balance por insumo de receta y por período entre conteos consecutivos
--     (consulta principal: tabla "receta vs. real")
--
--   inicio      = contado en el conteo i      × base_por_unidad
--   remitos     = entrada_remito + salida_remito_anulado en la ventana × base_por_unidad
--   otros       = cualquier otro movimiento salvo el pisado del conteo (ajustes
--                 manuales, de factura, apertura, reversión) × base_por_unidad
--   pisado del conteo = conteo_fabrica del conteo i+1, o bien (antes de la
--                 migración 20260908140000, cuando el conteo grababa 'ajuste_manual'
--                 sin conteo_id) los ajuste_manual sin conteo_id del día del
--                 conteo i+1 (fecha del conteo o día de cierre). Un ajuste
--                 manual real de Compras ese mismo día queda mal clasificado:
--                 se ve en la columna ajustes_dia_conteo.
--   fin         = contado en el conteo i+1    × base_por_unidad
--   real        = inicio + remitos + otros − fin
--   teorico     = masas (fécula/30) del período × base_por_masa
--   dif         = real − teorico;  dif_pct = dif / teorico
--   conteo_dice = −Σ delta del pisado del conteo i+1 × base_por_unidad
--                 (lo que "faltó" según el pisado del conteo: con el stock
--                 al día debería parecerse a `real`)
--   conteos_intermedios = movimientos conteo_fabrica de OTROS conteos dentro de
--                 la ventana (un conteo descartado igual pisó stock): si es > 0
--                 el período no es confiable.
-- ─────────────────────────────────────────────────────────────────────────────
with params as (select 30.0::numeric as fecula_por_masa, 'America/Argentina/Buenos_Aires'::text as tz),
ci as (
  select i.item_id, it.nombre, c.id as conteo_id, c.fecha, i.cantidad,
         coalesce(nullif(i.cantidad_por_unidad, 0), it.cantidad_por_unidad) as cpu,
         it.cantidad_por_masa as cpm,
         coalesce((select max(m.created_at) from compras_stock_movimientos m
                   where m.conteo_id = c.id and m.item_id = i.item_id and m.tipo = 'conteo_fabrica'),
                  c.cerrado_en) as t
  from fabrica_conteo_items i
  join fabrica_conteos c on c.id = i.conteo_id
  join compras_items it on it.id = i.item_id
  where c.estado = 'cerrado' and c.descartado_en is null
    and it.cantidad_por_masa > 0
    and i.cantidad is not null
),
per as (
  select ci.*,
         lead(conteo_id) over w as conteo_fin,
         lead(fecha)     over w as fecha_fin,
         lead(t)         over w as t_fin,
         lead(cantidad)  over w as cantidad_fin
  from ci
  window w as (partition by item_id order by t)
),
movc as (
  -- clasifica cada movimiento de la ventana
  select p.item_id, p.conteo_id, m.delta,
         case
           when m.tipo in ('entrada_remito', 'salida_remito_anulado') then 'remito'
           when m.tipo = 'conteo_fabrica' and m.conteo_id = p.conteo_fin then 'pisado'
           when m.tipo = 'conteo_fabrica' then 'conteo_intermedio'
           when m.tipo = 'ajuste_manual' and m.conteo_id is null
                and (m.created_at at time zone pa.tz)::date in (p.fecha_fin, (p.t_fin at time zone pa.tz)::date)
             then 'pisado_legacy'
           else 'otro'
         end as clase
  from per p
  cross join params pa
  join compras_stock_movimientos m
    on m.item_id = p.item_id and m.created_at > p.t and m.created_at <= p.t_fin
  where p.conteo_fin is not null
),
mov as (
  select p.item_id, p.conteo_id,
         coalesce(sum(mc.delta) filter (where mc.clase = 'remito'), 0) as remitos,
         coalesce(sum(mc.delta) filter (where mc.clase in ('otro', 'conteo_intermedio')), 0) as otros,
         count(mc.delta) filter (where mc.clase = 'conteo_intermedio') as conteos_intermedios,
         count(mc.delta) filter (where mc.clase = 'pisado_legacy') as ajustes_dia_conteo,
         coalesce(sum(mc.delta) filter (where mc.clase in ('pisado', 'pisado_legacy')), 0) as delta_conteo_fin
  from per p
  left join movc mc on mc.item_id = p.item_id and mc.conteo_id = p.conteo_id
  where p.conteo_fin is not null
  group by p.item_id, p.conteo_id
),
masas as (
  select p.item_id, p.conteo_id,
         coalesce(sum(pr.fecula_kg), 0) / max(pa.fecula_por_masa) as masas,
         count(pr.id) as cargas
  from per p
  cross join params pa
  left join fabrica_producciones pr on pr.fecha >= p.fecha and pr.fecha < p.fecha_fin
  where p.conteo_fin is not null
  group by p.item_id, p.conteo_id
),
bal as (
  select p.nombre, p.fecha as desde, p.fecha_fin as hasta, p.cpu, p.cpm,
         round(ma.masas, 1) as masas, ma.cargas,
         p.cantidad * p.cpu          as inicio,
         mo.remitos * p.cpu          as remitos,
         mo.otros * p.cpu            as otros,
         p.cantidad_fin * p.cpu      as fin,
         (p.cantidad + mo.remitos + mo.otros - p.cantidad_fin) * p.cpu as real,
         ma.masas * p.cpm            as teorico,
         -mo.delta_conteo_fin * p.cpu as conteo_dice,
         mo.conteos_intermedios, mo.ajustes_dia_conteo
  from per p
  join mov mo on mo.item_id = p.item_id and mo.conteo_id = p.conteo_id
  join masas ma on ma.item_id = p.item_id and ma.conteo_id = p.conteo_id
)
select nombre, desde, hasta, masas, cargas,
       round(inicio, 2) as inicio, round(remitos, 2) as remitos, round(otros, 2) as otros,
       round(fin, 2) as fin, round(real, 2) as real, round(teorico, 2) as teorico,
       round(real - teorico, 2) as dif,
       round(100.0 * (real - teorico) / nullif(teorico, 0), 1) as dif_pct,
       round(real / nullif(masas, 0), 3) as real_por_masa,
       cpm as receta_por_masa,
       round(conteo_dice, 2) as conteo_dice,
       conteos_intermedios, ajustes_dia_conteo
from bal
order by nombre, desde;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q5. Resumen por insumo: consumo real por masa sumando todos los períodos
--     confiables (sin conteos intermedios, con masas > 0). Es la base de la
--     recomendación de valores iniciales.
--     Reusar el CTE de Q4 (params … bal) y reemplazar el SELECT final por:
-- ─────────────────────────────────────────────────────────────────────────────
-- select nombre, cpm as receta_por_masa,
--        count(*) as periodos, round(sum(masas), 1) as masas,
--        round(sum(real), 2) as real, round(sum(teorico), 2) as teorico,
--        round(sum(real) / nullif(sum(masas), 0), 3) as real_por_masa,
--        round(100.0 * (sum(real) - sum(teorico)) / nullif(sum(teorico), 0), 1) as dif_pct,
--        round(stddev_samp(real / nullif(masas, 0)), 3) as desvio_por_masa
-- from bal
-- where conteos_intermedios = 0 and masas > 0
-- group by nombre, cpm
-- order by cpm desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q6. Calidad de dato — remitos de insumos de receta: cantidades sospechosas
--     (kg cargados como cajas, decimales en unidades enteras, valores enormes)
-- ─────────────────────────────────────────────────────────────────────────────
select it.nombre, it.unidad, it.cantidad_por_unidad,
       count(*) as lineas,
       min(ri.cantidad) as min, percentile_cont(0.5) within group (order by ri.cantidad) as mediana,
       max(ri.cantidad) as max,
       count(*) filter (where ri.cantidad <> trunc(ri.cantidad)) as con_decimales,
       count(*) filter (where ri.cantidad > 5 * (select percentile_cont(0.5) within group (order by x.cantidad)
                                                 from compras_remito_items x where x.item_id = ri.item_id)) as mayores_5x_mediana
from compras_remito_items ri
join compras_items it on it.id = ri.item_id
where it.cantidad_por_masa > 0
group by it.nombre, it.unidad, it.cantidad_por_unidad
order by it.nombre;


-- ─────────────────────────────────────────────────────────────────────────────
-- Q7. Calidad de dato — unidad del pedido / factura distinta de la del insumo
--     (si hay, las entradas pueden estar en otra unidad: el dato no sirve)
-- ─────────────────────────────────────────────────────────────────────────────
select 'pedido' as origen, it.nombre, it.unidad as unidad_insumo, pi.unidad as unidad_linea, count(*) as lineas
from compras_pedido_items pi
join compras_items it on it.id = pi.item_id
where it.cantidad_por_masa > 0
  and lower(coalesce(pi.unidad, '')) <> lower(coalesce(it.unidad, ''))
group by 1, 2, 3, 4
union all
select 'factura', it.nombre, it.unidad, fi.unidad, count(*)
from compras_factura_items fi
join compras_items it on it.id = fi.item_id
where it.cantidad_por_masa > 0
  and lower(coalesce(fi.unidad, '')) <> lower(coalesce(it.unidad, ''))
group by 1, 2, 3, 4
order by 1, 2;
-- En PROD compras_factura_items puede no existir todavía (F4 está solo en dev):
-- si falla, correr solo la mitad 'pedido'.


-- ─────────────────────────────────────────────────────────────────────────────
-- Q8. Calidad de dato — conteos que pisaron stock sin cerrarse o descartados
--     (sus movimientos conteo_fabrica igual cambiaron compras_stock_actual)
-- ─────────────────────────────────────────────────────────────────────────────
select d.nombre as lista, c.fecha, c.estado, c.descartado_en is not null as descartado,
       count(m.id) as movimientos_conteo, round(sum(abs(m.delta)), 2) as suma_abs_delta
from fabrica_conteos c
left join fabrica_conteo_definiciones d on d.id = c.definicion_id
join compras_stock_movimientos m on m.conteo_id = c.id and m.tipo = 'conteo_fabrica'
where c.estado <> 'cerrado' or c.descartado_en is not null
group by d.nombre, c.fecha, c.estado, c.descartado_en
order by c.fecha;
