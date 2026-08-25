-- Operario obligatorio en Producción (y columna preparada en Embolsado/
-- Congelados para la Fase 4). Nullable a nivel columna: el histórico
-- existente queda en NULL, la obligatoriedad la exige el RPC.
alter table fabrica_producciones add column if not exists operario_fabrica_id uuid references fabrica_operarios(id);
alter table fabrica_embolsados   add column if not exists operario_fabrica_id uuid references fabrica_operarios(id);

-- drop obligatorio: 8→9 args es un cambio de firma, create or replace
-- crearía una sobrecarga y PostgREST podría seguir resolviendo a la vieja
-- (mismo motivo documentado en 20260807140000_fabrica_embolsado_por_dia.sql:141).
drop function if exists public.guardar_produccion_fabrica(uuid, date, text, uuid, text, numeric, numeric, uuid);

create or replace function public.guardar_produccion_fabrica(
  p_id uuid,
  p_fecha date,
  p_turno text,
  p_sabor_id uuid,
  p_destino text,
  p_fecula_kg numeric,
  p_masa_kg numeric,
  p_tamanio_id uuid,
  p_operario_fabrica_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_fecha_actual date;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  p_fecha := coalesce(p_fecha, dia_fabrica());

  if not fabrica_puede_editar_fecha(p_fecha) then
    raise exception 'Solo se puede cargar producción de hoy o de ayer';
  end if;

  if p_operario_fabrica_id is null then
    raise exception 'Falta el operario';
  end if;

  if p_id is null then
    insert into fabrica_producciones
      (fecha, turno, operario_id, operario_fabrica_id, cargado_por, fecula_kg, masa_kg, sabor_id, destino, tamanio_id)
    values
      (p_fecha, p_turno, auth.uid(), p_operario_fabrica_id, auth.uid(), p_fecula_kg, p_masa_kg, p_sabor_id, p_destino, p_tamanio_id)
    returning id into v_id;
  else
    select fecha into v_fecha_actual from fabrica_producciones where id = p_id for update;

    if not found then
      raise exception 'Producción no encontrada';
    end if;

    if not fabrica_puede_editar_fecha(v_fecha_actual) then
      raise exception 'Esa producción es del % y ya no se puede editar', v_fecha_actual;
    end if;

    update fabrica_producciones set
      fecha                = p_fecha,
      turno                = p_turno,
      sabor_id              = p_sabor_id,
      destino               = p_destino,
      fecula_kg             = p_fecula_kg,
      masa_kg               = p_masa_kg,
      tamanio_id            = p_tamanio_id,
      operario_fabrica_id   = p_operario_fabrica_id,
      updated_at            = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
