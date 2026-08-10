-- Fase 4 del plan catálogo/conteos/devolución: módulo de Devolución. Carga
-- libre por presentación (sin vincular pedido); el destino decide si la masa
-- vuelve al pool del día (reinserción) o se pierde sin tocar ningún total.
-- Mismo criterio de ventana hoy/ayer que Producción (fabrica_puede_editar_fecha).

create table if not exists fabrica_devolucion_motivos (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0,
  activo  boolean not null default true
);

insert into fabrica_devolucion_motivos (nombre, orden) values
  ('Producto en mal estado', 1),
  ('No se vendió / exceso de stock', 2),
  ('Error en el pedido', 3),
  ('Falla en el envase / bolsa', 4)
on conflict (nombre) do nothing;

-- Mismo criterio que fabrica_sabores/presentaciones/tamanios: lectura abierta
-- a cualquier autenticado, escritura reservada a Compras (se administra en
-- /admin/fabrica-parametros).
alter table fabrica_devolucion_motivos enable row level security;
create policy "fabrica_devolucion_motivos_lectura" on fabrica_devolucion_motivos
  for select using (auth.uid() is not null);
create policy "fabrica_devolucion_motivos_escritura" on fabrica_devolucion_motivos
  for all using (tiene_acceso_compras());

create table if not exists fabrica_devoluciones (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default dia_fabrica(),
  sabor_id        uuid not null references fabrica_sabores(id),
  tamanio_id      uuid not null references fabrica_tamanios(id),
  presentacion_id uuid not null references fabrica_presentaciones(id),
  cantidad_kg     numeric not null check (cantidad_kg > 0),
  motivo_id       uuid not null references fabrica_devolucion_motivos(id),
  destino         text not null check (destino in ('reinsercion', 'perdida')),
  notas           text,
  cargado_por     uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fabrica_devoluciones_fecha on fabrica_devoluciones(fecha);

-- Solo lectura vía RLS directa, mismo criterio que fabrica_producciones /
-- fabrica_embolsados: todo alta/edición/borrado pasa por las RPC de abajo
-- (security definer, bypassean RLS), acá solo se gobierna el SELECT. Lectura
-- también para Compras porque un futuro dashboard admin la va a consultar.
alter table fabrica_devoluciones enable row level security;
create policy "fabrica_devoluciones_lectura" on fabrica_devoluciones
  for select using (tiene_acceso_fabrica() or tiene_acceso_compras());

-- Alta o edición de una devolución. p_id null => alta; con valor => edita esa
-- fila. Mismo guard de fecha que guardar_produccion_fabrica: valida la fecha
-- GUARDADA en el update, no solo p_fecha, para que no se pueda arrastrar un
-- registro viejo al presente reescribiéndolo con una fecha de hoy.
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
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  p_fecha := coalesce(p_fecha, dia_fabrica());

  if not fabrica_puede_editar_fecha(p_fecha) then
    raise exception 'Solo se puede cargar una devolución de hoy o de ayer';
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

create or replace function public.eliminar_devolucion_fabrica(p_id uuid)
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

  select fecha into v_fecha from fabrica_devoluciones where id = p_id for update;

  if not found then
    raise exception 'Devolución no encontrada';
  end if;

  if not fabrica_puede_editar_fecha(v_fecha) then
    raise exception 'Esa devolución es del % y ya no se puede editar', v_fecha;
  end if;

  delete from fabrica_devoluciones where id = p_id;
end;
$$;
