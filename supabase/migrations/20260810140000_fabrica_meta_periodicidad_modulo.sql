-- Follow-up a la Fase 2, a partir de una conversación con el usuario sobre el
-- desvío que dejó compras_items.meta_semanal sin dropear: ese campo sí se
-- sigue usando en /admin/compras/pedidos y /admin/compras/stock, pero como
-- "stock mínimo" general de cualquier insumo (sin noción de período) — el
-- nombre "meta_semanal" estaba mal puesto para ese caso. La meta real con
-- período vive en la membresía del conteo, y ese período lo define la
-- definición (semanal/quincenal/mensual), no el ítem — de ahí que también
-- pierda el sufijo "_semanal".
--
-- También se agregan dos columnas de preparación a fabrica_conteo_definiciones:
--   - periodicidad: por ahora informativa/de UI. La rotación de fechas
--     (lib/fabrica/semanaConteo.ts) sigue siendo semanal — se generaliza
--     recién cuando exista un conteo quincenal/mensual real, porque mensual
--     en particular no tiene "día de la semana" y necesita otro tipo de ancla.
--   - modulo: prepara el terreno para que depósito (u otras áreas) tengan sus
--     propios conteos más adelante. No cambia el control de acceso — sigue
--     siendo tiene_acceso_fabrica() como antes.

alter table compras_items rename column meta_semanal to stock_minimo;

alter table fabrica_conteo_definicion_items rename column meta_semanal to meta;
alter table fabrica_conteo_items rename column meta_semanal to meta;

alter table fabrica_conteo_definiciones
  add column periodicidad text not null default 'semanal' check (periodicidad in ('semanal', 'quincenal', 'mensual')),
  add column modulo text not null default 'fabrica';

-- cerrar_conteo_fabrica: mismo cuerpo que la Fase 2, solo actualiza los
-- nombres de columna renombrados (dci.meta_semanal -> dci.meta, etc.).
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, fci.item_id, ci.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;
