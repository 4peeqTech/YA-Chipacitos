-- Cierre de la migración M:N (20260825140000_compras_items_proveedores_mn.sql):
-- se retira compras_items.proveedor_id, la columna 1:N que quedó como puente
-- sincronizada desde el cliente. El único lector que quedaba en la base era
-- cerrar_conteo_fabrica(); se reescribe acá antes del drop.
--
-- Verificado sobre dev antes de escribir esta migración: los 58 insumos tienen
-- un proveedor con es_principal en compras_item_proveedores y coincide 1:1 con
-- el proveedor_id viejo, así que el cambio no altera qué proveedor se asigna.

-- 1. cerrar_conteo_fabrica: mismo cuerpo que en
--    20260812100000_fabrica_control_stock_ajustes.sql, con un solo cambio: el
--    proveedor de cada línea de la solicitud sale del principal en
--    compras_item_proveedores en vez de compras_items.proveedor_id.
--    El índice único parcial idx_cip_principal_unico garantiza a lo sumo un
--    principal por insumo, así que el left join no multiplica filas.
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, stock_actual)
  select v_solicitud_id, fci.item_id, cip.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0, fci.cantidad
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  left join compras_item_proveedores cip on cip.item_id = ci.id and cip.es_principal
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;

-- 2. Drop de la columna. v_compras_items la arrastra por el `i.*`, y
--    `create or replace view` no puede quitar columnas: hay que recrear la
--    vista. El índice idx_compras_items_proveedor_id y la FK a proveedores
--    caen solos con la columna.
drop view if exists v_compras_items;

alter table compras_items drop column if exists proveedor_id;

create view v_compras_items as
select i.*, cip.proveedor_id as proveedor_principal_id, p.nombre as proveedor_principal_nombre
from compras_items i
left join compras_item_proveedores cip on cip.item_id = i.id and cip.es_principal
left join proveedores p on p.id = cip.proveedor_id;
