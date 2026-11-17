-- Devoluciones de fábrica: de dónde viene cada devolución y sabor siempre
-- (también en migas).
--
-- Pedido de Marcos (2026-11-17): poder filtrar las devoluciones por lugar de
-- procedencia y sabor ("en Goya se devuelve mucho clásico"). Que el supervisor
-- corrija devoluciones viejas ya lo permite la base; faltaba el botón en la app.
--
-- Aditiva: la columna nueva es nullable (las devoluciones viejas quedan
-- "Sin dato") y guardar_devolucion_fabrica suma un parámetro con default,
-- así el código anterior sigue llamándola con los mismos argumentos.

-- 1. Catálogo de procedencias (editable en Parámetros › Fábrica)

create table if not exists fabrica_devolucion_procedencias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0,
  activo  boolean not null default true
);

insert into fabrica_devolucion_procedencias (nombre, orden) values
  ('Córdoba', 1),
  ('Goya', 2),
  ('Irigoyen', 3),
  ('Ituzaingó', 4),
  ('La Unidad', 5),
  ('Paraguay', 6),
  ('San Lorenzo', 7),
  ('Santa Fe', 8),
  ('Supermax', 9),
  ('Otro', 10)
on conflict (nombre) do nothing;

alter table fabrica_devolucion_procedencias enable row level security;

create policy "fabrica_devolucion_procedencias_lectura" on fabrica_devolucion_procedencias
  for select using (auth.uid() is not null);

create policy "fabrica_devolucion_procedencias_escritura" on fabrica_devolucion_procedencias
  for all using (tiene_acceso_compras());

-- 2. Columna en devoluciones

alter table fabrica_devoluciones
  add column if not exists procedencia_id uuid references fabrica_devolucion_procedencias(id);

create index if not exists idx_fabrica_devoluciones_procedencia on fabrica_devoluciones(procedencia_id);

-- 3. Guardar: procedencia obligatoria y sabor obligatorio también en los
-- motivos sin detalle (migas). Quién edita qué fecha no cambia: lo decide
-- fabrica_puede_editar_fecha (admin y supervisor_fabrica, cualquier fecha).

drop function if exists public.guardar_devolucion_fabrica(uuid, date, uuid, uuid, uuid, numeric, uuid, text, text);

create or replace function public.guardar_devolucion_fabrica(
  p_id uuid,
  p_fecha date,
  p_sabor_id uuid,
  p_tamanio_id uuid,
  p_presentacion_id uuid,
  p_cantidad_kg numeric,
  p_motivo_id uuid,
  p_destino text,
  p_notas text,
  p_procedencia_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_fecha_actual date;
  v_requiere_detalle boolean;
  v_requiere_cantidad boolean;
  v_destino_default text;
  v_activo boolean;
  v_procedencia_activa boolean;
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

  if p_procedencia_id is null then
    raise exception 'Elegí de dónde viene la devolución';
  end if;

  select activo into v_procedencia_activa
    from fabrica_devolucion_procedencias where id = p_procedencia_id;

  if not found then
    raise exception 'Ese lugar de procedencia no existe';
  end if;

  if p_sabor_id is null then
    raise exception 'Elegí el sabor';
  end if;

  if v_requiere_detalle then
    if p_tamanio_id is null or p_presentacion_id is null then
      raise exception 'Faltan datos del producto devuelto';
    end if;
    if p_cantidad_kg is null or p_cantidad_kg <= 0 then
      raise exception 'Cargá una cantidad mayor a cero';
    end if;
    p_destino := coalesce(p_destino, v_destino_default);
  else
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
    if not v_activo then
      raise exception 'Ese motivo de devolución está desactivado';
    end if;
    if not v_procedencia_activa then
      raise exception 'Ese lugar de procedencia está desactivado';
    end if;

    insert into fabrica_devoluciones
      (fecha, sabor_id, tamanio_id, presentacion_id, cantidad_kg, motivo_id, destino, notas, procedencia_id, cargado_por)
    values
      (p_fecha, p_sabor_id, p_tamanio_id, p_presentacion_id, p_cantidad_kg, p_motivo_id, p_destino, p_notas, p_procedencia_id, auth.uid())
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
      procedencia_id  = p_procedencia_id,
      updated_at      = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
