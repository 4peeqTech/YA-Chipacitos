-- El motivo pasa a decidir qué campos pide el formulario de devolución.
-- Motivos como "Migas" o "Error en el pedido" no tienen sabor/presentación:
-- forzar esos campos ensuciaba los datos con valores inventados. Ahora cada
-- motivo declara si pide detalle del producto y, si no, qué cantidad/destino
-- usar — la RPC guardar_devolucion_fabrica normaliza según ese flag.

alter table fabrica_devolucion_motivos
  add column if not exists requiere_detalle  boolean not null default true,
  add column if not exists requiere_cantidad boolean not null default true,
  add column if not exists destino_default   text not null default 'reinsercion'
    check (destino_default in ('reinsercion', 'perdida'));

-- Un motivo que pide detalle siempre pide la cantidad: requiere_cantidad solo
-- tiene sentido como sub-opción de requiere_detalle = false.
alter table fabrica_devolucion_motivos
  add constraint fabrica_devolucion_motivos_cantidad_coherente
  check (requiere_detalle = false or requiere_cantidad = true);

-- Los 4 motivos seed ya quedaron en true/true/reinsercion por default — cero
-- cambio de comportamiento para ellos.

alter table fabrica_devoluciones
  alter column sabor_id        drop not null,
  alter column tamanio_id      drop not null,
  alter column presentacion_id drop not null,
  alter column cantidad_kg     drop not null;

alter table fabrica_devoluciones drop constraint if exists fabrica_devoluciones_cantidad_kg_check;
alter table fabrica_devoluciones
  add constraint fabrica_devoluciones_cantidad_kg_check
  check (cantidad_kg is null or cantidad_kg > 0);

-- destino sigue NOT NULL: siempre se resuelve, del formulario o del
-- destino_default del motivo.

create or replace function public.guardar_devolucion_fabrica(
  p_id uuid,
  p_fecha date,
  p_sabor_id uuid,
  p_tamanio_id uuid,
  p_presentacion_id uuid,
  p_cantidad_kg numeric,
  p_motivo_id uuid,
  p_destino text,
  p_notas text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_fecha_actual date;
  v_requiere_detalle boolean;
  v_requiere_cantidad boolean;
  v_destino_default text;
  v_activo boolean;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  p_fecha := coalesce(p_fecha, dia_fabrica());

  if not fabrica_puede_editar_fecha(p_fecha) then
    raise exception 'Solo se puede cargar una devolución de hoy o de ayer';
  end if;

  if p_motivo_id is null then
    raise exception 'Elegí un motivo de devolución';
  end if;

  select requiere_detalle, requiere_cantidad, destino_default, activo
    into v_requiere_detalle, v_requiere_cantidad, v_destino_default, v_activo
    from fabrica_devolucion_motivos where id = p_motivo_id;

  if not found then
    raise exception 'El motivo de devolución no existe';
  end if;

  -- Un motivo desactivado no puede usarse en un alta nueva, pero sí puede
  -- seguir en registros viejos que se editan.
  if p_id is null and not v_activo then
    raise exception 'Ese motivo de devolución está desactivado';
  end if;

  if v_requiere_detalle then
    if p_sabor_id is null or p_tamanio_id is null or p_presentacion_id is null then
      raise exception 'Faltan datos del producto devuelto';
    end if;
    if p_cantidad_kg is null or p_cantidad_kg <= 0 then
      raise exception 'Cargá una cantidad mayor a cero';
    end if;
    p_destino := coalesce(p_destino, v_destino_default);
  else
    -- El motivo manda: se ignora cualquier detalle que llegue del cliente.
    p_sabor_id := null;
    p_tamanio_id := null;
    p_presentacion_id := null;
    p_destino := v_destino_default;
    if v_requiere_cantidad then
      if p_cantidad_kg is null or p_cantidad_kg <= 0 then
        raise exception 'Cargá una cantidad mayor a cero';
      end if;
    else
      p_cantidad_kg := null;
    end if;
  end if;

  if p_id is null then
    insert into fabrica_devoluciones
      (fecha, sabor_id, tamanio_id, presentacion_id, cantidad_kg, motivo_id, destino, notas, cargado_por)
    values
      (p_fecha, p_sabor_id, p_tamanio_id, p_presentacion_id, p_cantidad_kg, p_motivo_id, p_destino, p_notas, auth.uid())
    returning id into v_id;
  else
    select fecha into v_fecha_actual from fabrica_devoluciones where id = p_id for update;

    if not found then
      raise exception 'Devolución no encontrada';
    end if;

    if not fabrica_puede_editar_fecha(v_fecha_actual) then
      raise exception 'Esa devolución es del % y ya no se puede editar', v_fecha_actual;
    end if;

    update fabrica_devoluciones set
      fecha           = p_fecha,
      sabor_id        = p_sabor_id,
      tamanio_id      = p_tamanio_id,
      presentacion_id = p_presentacion_id,
      cantidad_kg     = p_cantidad_kg,
      motivo_id       = p_motivo_id,
      destino         = p_destino,
      notas           = p_notas,
      updated_at      = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
