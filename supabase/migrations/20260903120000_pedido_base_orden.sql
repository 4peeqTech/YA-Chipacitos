-- Pedido base: orden real (drag & drop) + propagación aguas abajo hasta
-- solicitudes y pedidos por proveedor.

-- 1.1 Normalizar compras_plantilla_base.orden a una secuencia densa 1..N.
-- Las 8 filas sembradas conservan su lugar; las que quedaron en 0 se mandan
-- al final en orden alfabético (determinista).
with ranked as (
  select id, row_number() over (
    order by (case when orden = 0 then 1 else 0 end), orden, descripcion
  ) as nuevo
  from compras_plantilla_base
)
update compras_plantilla_base p set orden = r.nuevo
from ranked r where r.id = p.id;

create index if not exists idx_compras_plantilla_base_orden
  on compras_plantilla_base(orden);

-- 1.2 RPC de reordenamiento: una sola llamada, atómica, misma guarda de
-- acceso que el resto del módulo.
create or replace function public.reordenar_plantilla_base(p_ids uuid[])
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  update compras_plantilla_base p
    set orden = t.pos
  from (select id, ordinality::int as pos
        from unnest(p_ids) with ordinality as u(id, ordinality)) t
  where t.id = p.id;
end;
$$;

-- 1.3 compras_solicitud_items gana orden.
alter table compras_solicitud_items
  add column if not exists orden integer not null default 0;

-- Backfill de las solicitudes ya existentes por descripcion, para que el
-- comportamiento no cambie de golpe en las abiertas.
with ranked as (
  select id, row_number() over (partition by solicitud_id order by descripcion) as nuevo
  from compras_solicitud_items
)
update compras_solicitud_items i set orden = r.nuevo
from ranked r where r.id = i.id;

-- 1.4 generar_solicitud_base(): mismo cuerpo que en
--     20260810120000_fabrica_catalogo_unico.sql:131-160, solo cambia el
--     INSERT final: agrega `orden` a la lista de columnas y lo selecciona
--     de la plantilla.
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, orden)
  select v_solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad, cantidad, true, orden
  from compras_plantilla_base
  where activo
  order by orden;

  return v_solicitud_id;
end;
$$;

-- 1.5 cerrar_conteo_fabrica(): mismo cuerpo que en
--     20260901150000_compras_items_drop_proveedor_id.sql:16-87, solo el
--     INSERT final suma `orden` tomado de fabrica_conteo_definicion_items.
--     left join + coalesce: un join filtraría ítems del conteo sin fila en
--     la definición y cambiaría qué se inserta.
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas         numeric;
  v_definicion_id uuid;
  v_solicitud_id  uuid;
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

-- 1.6 convertir_solicitud_a_pedidos(): mismo cuerpo que en
--     20260810120000_fabrica_catalogo_unico.sql:162-207, único cambio en el
--     row_number() del INSERT final: hereda el orden de la solicitud.
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

    insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden)
    select v_pedido_id, csi.item_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.orden, csi.descripcion) - 1
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
