-- Corrección de la migración del rol (20260813100000): el supervisor de
-- fábrica tiene que poder ver y editar sin límite de fecha, igual que admin
-- — la migración anterior renombró el literal de rol pero dejó la ventana
-- hoy/ayer aplicada también al supervisor. Necesario ahora que las tres
-- pantallas de carga (Producción, Congelados, Devolución) suman un date
-- picker libre.
create or replace function public.fabrica_puede_editar_fecha(p_fecha date)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(get_user_rol(), '') in ('admin', 'supervisor_fabrica')
      or (p_fecha is not null and p_fecha between dia_fabrica() - 1 and dia_fabrica());
$$;

-- Fase 4: Embolsado -> Congelados. Se rompe el acople con Producción: cargar
-- masa para congelado ya no genera un "pool" que limite lo que se puede
-- embolsar. Se admiten N cargas por (fecha, tamaño, sabor, presentación),
-- igual que Producción admite N cargas por turno.
drop index if exists idx_fabrica_embolsados_pool;

-- producto_id quedó permanentemente en null desde 20260807150000
-- (guardar_embolsado_fabrica ya no lo setea) — sin consumidores.
alter table fabrica_embolsados drop column if exists producto_id;

drop function if exists public.guardar_embolsado_fabrica(date, uuid, uuid, jsonb);

-- Calcada sobre guardar_produccion_fabrica (20260807140000...sql) — mismos
-- guards, mismo criterio de "re-leer la fecha guardada antes de mutar".
create or replace function public.guardar_congelado_fabrica(
  p_id uuid,
  p_fecha date,
  p_tamanio_id uuid,
  p_sabor_id uuid,
  p_presentacion_id uuid,
  p_cantidad_kg numeric,
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
    raise exception 'Solo se puede cargar o editar congelados de hoy o de ayer';
  end if;

  if p_cantidad_kg is null or p_cantidad_kg <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_operario_fabrica_id is null then
    raise exception 'Falta el operario';
  end if;

  if p_id is null then
    insert into fabrica_embolsados
      (fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg, operario_fabrica_id, cargado_por, updated_at)
    values
      (p_fecha, p_tamanio_id, p_sabor_id, p_presentacion_id, p_cantidad_kg, p_operario_fabrica_id, auth.uid(), now())
    returning id into v_id;
  else
    select fecha into v_fecha_actual from fabrica_embolsados where id = p_id for update;

    if not found then
      raise exception 'Congelado no encontrado';
    end if;

    if not fabrica_puede_editar_fecha(v_fecha_actual) then
      raise exception 'Ese congelado es del % y ya no se puede editar', v_fecha_actual;
    end if;

    update fabrica_embolsados set
      fecha               = p_fecha,
      tamanio_id           = p_tamanio_id,
      sabor_id             = p_sabor_id,
      presentacion_id      = p_presentacion_id,
      cantidad_kg          = p_cantidad_kg,
      operario_fabrica_id  = p_operario_fabrica_id,
      updated_at           = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.eliminar_congelado_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_fecha date;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select fecha into v_fecha from fabrica_embolsados where id = p_id for update;

  if not found then
    raise exception 'Congelado no encontrado';
  end if;

  if not fabrica_puede_editar_fecha(v_fecha) then
    raise exception 'Ese congelado es del % y ya no se puede editar', v_fecha;
  end if;

  delete from fabrica_embolsados where id = p_id;
end;
$$;
