-- ============================================================================
-- A1 (Bloque 2) — correcciones de la revisión (review-a1-conteo-controla).
-- 20261005120000_fabrica_conteo_controla.sql ya está aplicada en dev: esto va
-- aparte.
--
--   1. descartar_solicitud bloquea el conteo (for update) antes de mirar si hay
--      diferencias aplicadas. Sin el lock, un "aplicar" en vuelo podía commitear
--      después del exists y dejar un ajuste vivo en un conteo descartado, sin
--      forma de revertirlo (el RPC rechaza descartados y D9 lo bloquea en Stock).
--   2. Fábrica solo puede tocar borradores desde el navegador: el update de
--      fabrica_conteos (retarget de la ventana y masas) queda acotado a
--      estado = 'borrador' en using y en with check, y el alta solo crea
--      borradores. Antes podía pasar un conteo cerrado a borrador o a
--      descartado, y un re-cierre pisaba diferencias aplicadas. Cerrar y
--      descartar siguen por RPC (security definer). Como defensa extra, el
--      cierre solo marca 'pendiente' donde diferencia_estado es null.
--   3. v_fabrica_conteo_diferencias suma movido_mientras_contaba: lo que se
--      movió el stock del insumo entre que Fábrica lo contó (contado_en) y el
--      cierre. Un remito en ese lapso entra en el teórico y genera una
--      diferencia falsa: la UI avisa (decisión: avisar, no bloquear).
--   4. v_compras_conteos_historial suma diferencias_resueltas (count), en vez
--      de que la página lea todas las filas resueltas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. descartar_solicitud: cuerpo de 20261005120000 + lock del conteo.
-- ----------------------------------------------------------------------------
create or replace function public.descartar_solicitud(p_solicitud_id uuid, p_motivo text default null)
returns void language plpgsql security definer as $$
declare v_conteo_id uuid;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  update compras_solicitudes
    set estado = 'descartada', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id and estado = 'abierta'
    returning conteo_id into v_conteo_id;

  if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;

  if v_conteo_id is not null then
    -- Mismo lock que compras_resolver_diferencias_conteo: un "aplicar" en
    -- vuelo termina antes (y el exists lo ve) o espera al descarte (y el RPC
    -- lo rechaza por descartado).
    perform 1 from fabrica_conteos where id = v_conteo_id for update;

    if exists (
         select 1 from fabrica_conteo_items where conteo_id = v_conteo_id and diferencia_estado = 'aplicada') then
      raise exception 'Este conteo tiene diferencias aplicadas al stock. Revertilas en Fábrica › Conteos antes de descartar la solicitud.';
    end if;
  end if;

  -- El índice fabrica_conteos_definicion_fecha_cerrado_unique es parcial sobre
  -- estado='cerrado': sacar el conteo de ese estado lo libera y deja que Fábrica
  -- lo rehaga el mismo día, sin borrar el conteo ni su snapshot de ítems.
  -- Una solicitud 'base' no tiene conteo_id: por eso el if.
  if v_conteo_id is not null then
    update fabrica_conteos
      set estado          = 'descartado',
          descartado_por  = auth.uid(),
          descartado_en   = now(),
          motivo_descarte = nullif(trim(p_motivo), '')
      where id = v_conteo_id and estado = 'cerrado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2a. RLS de fabrica_conteos: desde el navegador, solo borradores.
--     (fabrica_conteo_items ya no tiene policy de update desde 20261005120000.)
-- ----------------------------------------------------------------------------
drop policy if exists fabrica_conteos_modificacion on public.fabrica_conteos;
create policy fabrica_conteos_modificacion on public.fabrica_conteos
  for update
  using (tiene_acceso_fabrica() and estado = 'borrador')
  with check (tiene_acceso_fabrica() and estado = 'borrador');

drop policy if exists fabrica_conteos_alta on public.fabrica_conteos;
create policy fabrica_conteos_alta on public.fabrica_conteos
  for insert with check (tiene_acceso_fabrica() and estado = 'borrador');

-- ----------------------------------------------------------------------------
-- 2b. cerrar_conteo_fabrica: cuerpo de 20261005120000; el sellado solo marca
--     'pendiente' donde todavía no hay estado (nunca pisa una aplicada).
-- ----------------------------------------------------------------------------
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas         numeric;
  v_definicion_id uuid;
  v_solicitud_id  uuid;
  v_umbral        numeric;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select masas_proyectadas, definicion_id
    into v_masas, v_definicion_id
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  select coalesce((select (valor #>> '{}')::numeric from compras_config where clave = 'sobrestock.umbral_unidades'), 1)
    into v_umbral;

  -- A1: el conteo controla, no pisa. Se bloquea el stock de los insumos del
  -- conteo (for share, ordenado) para que un remito en vuelo termine antes del
  -- sellado o espere a que termine el cierre.
  perform 1
    from compras_stock_actual a
    where a.item_id in (select item_id from fabrica_conteo_items where conteo_id = p_conteo_id)
    order by a.item_id
    for share;

  -- Se sella el teórico. Lo no contado toma el stock del sistema (con piso 0)
  -- para que el sugerido y el sobrestock se calculen igual que siempre, y no
  -- genera diferencia (diferencia es null porque contado_en es null).
  update fabrica_conteo_items fci set
    stock_teorico = coalesce(a.cantidad, 0),
    cantidad      = case when fci.contado_en is null then greatest(coalesce(a.cantidad, 0), 0) else fci.cantidad end
  from fabrica_conteo_items f
  left join compras_stock_actual a on a.item_id = f.item_id
  where f.id = fci.id and fci.conteo_id = p_conteo_id;

  update fabrica_conteo_items fci set
    cantidad_por_masa   = ci.cantidad_por_masa,
    cantidad_por_unidad = ci.cantidad_por_unidad,
    redondeo            = ci.redondeo,
    modo_calculo        = dci.modo_calculo,
    meta                = dci.meta,
    cantidad_fija       = dci.cantidad_fija,
    necesidad           = ci.cantidad_por_masa * v_masas,
    sugerido            = case
                            when ci.redondeo = 'sin_calculo' then 0
                            when dci.modo_calculo = 'cantidad_fija' then dci.cantidad_fija
                            when dci.modo_calculo = 'meta_semanal' then greatest(0, dci.meta - fci.cantidad)
                            when dci.modo_calculo = 'por_masa' and ci.cantidad_por_unidad > 0 then greatest(
                              case ci.redondeo
                                when 'siempre_arriba' then
                                  ceil(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                when 'siempre_abajo' then
                                  floor(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                else
                                  round(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                              end,
                              case when dci.meta > 0 then greatest(0, dci.meta - fci.cantidad) else 0 end
                            )
                            else 0
                          end
  from compras_items ci
  join fabrica_conteo_definicion_items dci on dci.item_id = ci.id and dci.definicion_id = v_definicion_id
  where ci.id = fci.item_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteo_items fci set
    exceso                  = x.exceso,
    sobrestock              = coalesce(x.exceso >= v_umbral, false),
    descuento_base_sugerido = case
                                when x.exceso >= v_umbral and x.en_base > 0 then least(floor(x.exceso), x.en_base)
                              end
  from (
    select
      f.id,
      round(case
        when ci.a_demanda then
          case when ci.stock_maximo is not null then f.cantidad - ci.stock_maximo end
        when f.modo_calculo = 'por_masa' and coalesce(f.cantidad_por_masa, 0) <= 0 then
          null  -- por masa sin receta y sin la marca: no hay con qué comparar (Insumos lo avisa)
        when f.modo_calculo = 'por_masa' and f.cantidad_por_unidad > 0 and v_masas > 0 then
          f.cantidad - greatest(f.necesidad / f.cantidad_por_unidad, case when f.meta > 0 then f.meta else 0 end)
        when f.modo_calculo = 'meta_semanal' and f.meta > 0 then
          f.cantidad - f.meta
      end, 2) as exceso,
      coalesce((select sum(pb.cantidad) from compras_plantilla_base pb
                where pb.item_id = f.item_id and pb.activo), 0) as en_base
    from fabrica_conteo_items f
    join compras_items ci on ci.id = f.item_id
    where f.conteo_id = p_conteo_id
      and f.modo_calculo is not null
  ) x
  where x.id = fci.id;

  -- A1: las diferencias quedan pendientes hasta que Compras las resuelva.
  update fabrica_conteo_items
    set diferencia_estado = 'pendiente'
    where conteo_id = p_conteo_id and diferencia is not null and diferencia <> 0
      and diferencia_estado is null;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, stock_actual, orden)
  select v_solicitud_id, fci.item_id, cip.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0, fci.cantidad, coalesce(dci.orden, 0)
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  left join compras_item_proveedores cip on cip.item_id = ci.id and cip.es_principal
  left join fabrica_conteo_definicion_items dci on dci.item_id = fci.item_id and dci.definicion_id = v_definicion_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. v_fabrica_conteo_diferencias: columnas de 20261005120000 en el mismo
--    orden + movido_mientras_contaba al final.
-- ----------------------------------------------------------------------------
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
  and tiene_acceso_compras();

grant select on public.v_fabrica_conteo_diferencias to authenticated;

-- ----------------------------------------------------------------------------
-- 4. v_compras_conteos_historial: columnas de 20261005120000 + diferencias_resueltas.
-- ----------------------------------------------------------------------------
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
  case when tiene_acceso_compras() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado = 'pendiente'
  )::int end as diferencias_pendientes,
  case when tiene_acceso_compras() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado in ('aplicada', 'ignorada')
  )::int end as diferencias_resueltas
from fabrica_conteos c
join fabrica_conteo_definiciones d on d.id = c.definicion_id
left join profiles cp on cp.id = c.cerrado_por
where c.estado in ('cerrado', 'descartado')
  and (tiene_acceso_compras() or tiene_acceso_fabrica());

grant select on public.v_compras_conteos_historial to authenticated;
