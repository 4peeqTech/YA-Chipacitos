-- A2a §8 — fabrica-conteos solo lee conteos (docs/bloque2/plan-A2a.md §8).
--
-- 20260914120000 sumó fabrica-conteos a tiene_acceso_compras() para que la
-- vista del historial de conteos siguiera pasando el gate cuando la pantalla
-- se mudó a Fábrica. El efecto colateral: con SOLO ese módulo se pasaban
-- todos los RPCs y las policies de escritura de Compras.
--   1. tiene_lectura_conteos(): compras, fábrica, o el módulo fabrica-conteos.
--   2. tiene_acceso_compras() vuelve a los cuatro módulos compras-*.
--   3. Lo que lee la pantalla de Conteos (admin › Fábrica › Conteos) pasa a
--      tiene_lectura_conteos(). Aplicar / ignorar / revertir diferencias sigue
--      exigiendo tiene_acceso_compras() (la RPC no cambia).
--
-- Antes de la release, para saber a quién afecta en prod (plan §8.3):
--   select email, rol, modulos_permitidos from profiles
--   where estado = 'activo' and rol <> 'admin' and 'fabrica-conteos' = any(modulos_permitidos)
--     and not modulos_permitidos && array['compras-insumos','compras-stock','compras-pedidos','compras-reportes'];

-- ----------------------------------------------------------------------------
-- 1. tiene_lectura_conteos()
-- ----------------------------------------------------------------------------
create or replace function public.tiene_lectura_conteos() returns boolean
language sql stable security definer set search_path = public as $$
  select tiene_acceso_compras() or tiene_acceso_fabrica() or exists (
    select 1 from profiles
    where id = auth.uid() and estado = 'activo' and 'fabrica-conteos' = any(modulos_permitidos)
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. tiene_acceso_compras() sin fabrica-conteos
-- ----------------------------------------------------------------------------
create or replace function public.tiene_acceso_compras()
returns boolean
language sql
stable security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'
        ]
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Lecturas de la pantalla de Conteos
-- ----------------------------------------------------------------------------

-- v_fabrica_conteo_diferencias: cuerpo de 20261005130000, cambia solo el where.
create or replace view public.v_fabrica_conteo_diferencias as
select
  fci.id,
  fci.conteo_id,
  fci.item_id,
  ci.nombre                as item_nombre,
  ci.unidad,
  fci.cantidad             as contado,
  fci.contado_en,
  fci.stock_teorico,
  fci.diferencia,
  fci.diferencia_estado,
  fci.diferencia_mov_id,
  fci.diferencia_nota,
  fci.diferencia_resuelta_en,
  rp.nombre                as diferencia_resuelta_por_nombre,
  c.estado                 as conteo_estado,
  c.fecha                  as conteo_fecha,
  c.cerrado_en             as conteo_cerrado_en,
  d.nombre                 as definicion_nombre,
  coalesce(sa.cantidad, 0) as stock_hoy,
  -- D4: lo que se movió desde el cierre, sin contar lo que este conteo aplicó o revirtió.
  case when fci.stock_teorico is not null then
    coalesce(sa.cantidad, 0) - fci.stock_teorico - coalesce((
      select sum(m.delta) from compras_stock_movimientos m
      where m.conteo_id = c.id and m.item_id = fci.item_id and m.tipo in ('ajuste_conteo', 'reversion')
    ), 0)
  end                      as movido_desde_cierre,
  sup.conteo_id            as superado_por_conteo_id,
  sup.etiqueta             as superado_por,
  -- Lo que se movió el stock entre que Fábrica contó el ítem y el cierre (un
  -- remito en ese lapso entra en el teórico: la diferencia puede ser falsa).
  case when fci.stock_teorico is not null and fci.contado_en is not null and c.cerrado_en is not null then
    coalesce((
      select sum(m.delta) from compras_stock_movimientos m
      where m.item_id = fci.item_id and m.created_at > fci.contado_en and m.created_at <= c.cerrado_en
    ), 0)
  end                      as movido_mientras_contaba
from fabrica_conteo_items fci
join fabrica_conteos c on c.id = fci.conteo_id
join fabrica_conteo_definiciones d on d.id = c.definicion_id
join compras_items ci on ci.id = fci.item_id
left join compras_stock_actual sa on sa.item_id = fci.item_id
left join profiles rp on rp.id = fci.diferencia_resuelta_por
left join lateral (
  select c2.id as conteo_id, d2.nombre || ' ' || to_char(c2.fecha, 'DD/MM') as etiqueta
  from fabrica_conteo_items f2
  join fabrica_conteos c2 on c2.id = f2.conteo_id
  join fabrica_conteo_definiciones d2 on d2.id = c2.definicion_id
  where f2.item_id = fci.item_id and c2.estado = 'cerrado' and f2.contado_en is not null
    and c.cerrado_en is not null and c2.cerrado_en > c.cerrado_en
  order by c2.cerrado_en
  limit 1
) sup on true
where c.estado in ('cerrado', 'descartado')
  and tiene_lectura_conteos();

grant select on public.v_fabrica_conteo_diferencias to authenticated;

-- v_compras_conteos_historial: cuerpo de 20261005130000, cambian el where y
-- los dos contadores de diferencias.
create or replace view public.v_compras_conteos_historial as
select
  c.id,
  c.fecha,
  c.semana_desde,
  c.semana_hasta,
  c.masas_proyectadas,
  c.cerrado_en,
  d.id as definicion_id,
  d.nombre as definicion_nombre,
  d.icono as definicion_icono,
  cp.nombre as cerrado_por_nombre,
  c.estado,
  (select s.id     from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_id,
  (select s.estado from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_estado,
  case when tiene_lectura_conteos() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado = 'pendiente'
  )::int end as diferencias_pendientes,
  case when tiene_lectura_conteos() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado in ('aplicada', 'ignorada')
  )::int end as diferencias_resueltas
from fabrica_conteos c
join fabrica_conteo_definiciones d on d.id = c.definicion_id
left join profiles cp on cp.id = c.cerrado_por
where c.estado in ('cerrado', 'descartado')
  and tiene_lectura_conteos();

grant select on public.v_compras_conteos_historial to authenticated;

-- Policies de lectura que usa la pantalla.
alter policy fabrica_conteos_lectura on public.fabrica_conteos
  using (tiene_lectura_conteos());
alter policy fabrica_conteo_items_lectura on public.fabrica_conteo_items
  using (tiene_lectura_conteos());
-- La pantalla embebe compras_items(nombre, unidad) en fabrica_conteo_items.
alter policy compras_items_lectura on public.compras_items
  using (tiene_lectura_conteos());
-- Umbral conteo.diferencia_resaltar_pct.
alter policy compras_config_lectura on public.compras_config
  using (tiene_lectura_conteos());
