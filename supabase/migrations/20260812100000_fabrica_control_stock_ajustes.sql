-- Ajustes de UX/lógica pedidos tras la QA en navegador de la Fase 2-4
-- (Conteos/Control de Stock):
--   1. fabrica_conteo_definiciones/definicion_items no tenían created_at —
--      el "orden" manual se reemplaza por orden de carga.
--   2. El ícono de cada definición pasa de ser un emoji libre a un nombre de
--      ícono de lucide-react (ver components/ui/IconoPicker.tsx) — se
--      actualizan los 3 registros semilla para no dejar datos huérfanos.
--   3. compras_solicitud_items suma stock_actual: al cerrar un conteo, la
--      solicitud a Compras debe indicar siempre cuánto stock había, y no solo
--      el sugerido — en particular cuando el stock ya cubre la proyección
--      (sugerido = 0) hay que poder decir "cubre con stock actual (N)" en vez
--      de mostrar una línea sin contexto.

alter table fabrica_conteo_definiciones
  add column created_at timestamptz not null default now();

alter table fabrica_conteo_definicion_items
  add column created_at timestamptz not null default now();

update fabrica_conteo_definiciones set icono = 'Package' where nombre = 'Bolsaplast';
update fabrica_conteo_definiciones set icono = 'Wheat' where nombre = 'Global';
update fabrica_conteo_definiciones set icono = 'Egg' where nombre = 'Huevos';

alter table compras_solicitud_items
  add column stock_actual numeric not null default 0;

-- cerrar_conteo_fabrica: mismo cuerpo que en 20260810140000_fabrica_meta_periodicidad_modulo.sql,
-- solo se agrega fci.cantidad como stock_actual en el insert de las líneas de la solicitud.
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
  select v_solicitud_id, fci.item_id, ci.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0, fci.cantidad
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;
