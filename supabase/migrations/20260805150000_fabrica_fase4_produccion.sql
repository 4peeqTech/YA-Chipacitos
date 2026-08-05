-- Fase 4 del módulo Fábrica: carga de producción por turno (fécula + masa por
-- operario/turno/sabor/destino), con la sección anidada de embolsado cuando
-- el destino es congelado. El tamaño vive solo en fabrica_producciones — las
-- líneas de embolsado lo heredan por la FK, a diferencia de la planilla
-- donde se repite en las dos hojas.

create table if not exists fabrica_producciones (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null default current_date,
  turno         text not null check (turno in ('manana', 'tarde')),
  operario_id   uuid not null references profiles(id),
  cargado_por   uuid not null references profiles(id),
  fecula_kg     numeric not null default 0,
  masa_kg       numeric not null default 0,
  sabor_id      uuid not null references fabrica_sabores(id),
  destino       text not null check (destino in ('masa_locales', 'congelado_embolsado')),
  tamanio_id    uuid references fabrica_tamanios(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((destino = 'congelado_embolsado') = (tamanio_id is not null))
);
create index if not exists idx_fabrica_producciones_fecha_turno on fabrica_producciones(fecha, turno);

-- El tamaño se hereda de fabrica_producciones.tamanio_id vía produccion_id;
-- por eso no se repite acá. producto_id queda null hasta que la Fase 5
-- asigne la terna presentación×sabor×tamaño sobre `productos`.
create table if not exists fabrica_embolsados (
  id               uuid primary key default gen_random_uuid(),
  produccion_id    uuid not null references fabrica_producciones(id) on delete cascade,
  presentacion_id  uuid not null references fabrica_presentaciones(id),
  sabor_id         uuid not null references fabrica_sabores(id),
  cantidad_kg      numeric not null default 0,
  producto_id      uuid references productos(id)
);
create index if not exists idx_fabrica_embolsados_produccion_id on fabrica_embolsados(produccion_id);

-- Solo lectura vía RLS directa. Todo alta/edición/borrado pasa por las RPC
-- de abajo: la carga es producción + sus embolsados en una sola transacción
-- (evita dejar una producción sin sus líneas si algo falla a mitad de camino).
alter table fabrica_producciones enable row level security;
create policy "fabrica_producciones_lectura" on fabrica_producciones
  for select using (tiene_acceso_fabrica());

alter table fabrica_embolsados enable row level security;
create policy "fabrica_embolsados_lectura" on fabrica_embolsados
  for select using (tiene_acceso_fabrica());

-- config solo tenía lectura para admin (ver 20260602143353_add_config_table.sql);
-- fábrica necesita leer 'fabrica_rendimiento_masa' para precargar masa desde
-- fécula en el formulario de producción.
create policy "config_lectura_fabrica" on config
  for select using (tiene_acceso_fabrica());

-- Alta o edición de una producción y su lista de embolsados en una sola
-- transacción. p_id null => alta; p_id con valor => edita esa producción y
-- reemplaza sus líneas de embolsado. El operario es siempre quien está en
-- sesión (decisión del plan: "operario tomado de la sesión"), nunca un
-- parámetro elegible desde el cliente.
create or replace function public.guardar_produccion_fabrica(
  p_id uuid,
  p_fecha date,
  p_turno text,
  p_sabor_id uuid,
  p_destino text,
  p_fecula_kg numeric,
  p_masa_kg numeric,
  p_tamanio_id uuid,
  p_embolsados jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if p_id is null then
    insert into fabrica_producciones
      (fecha, turno, operario_id, cargado_por, fecula_kg, masa_kg, sabor_id, destino, tamanio_id)
    values
      (p_fecha, p_turno, auth.uid(), auth.uid(), p_fecula_kg, p_masa_kg, p_sabor_id, p_destino, p_tamanio_id)
    returning id into v_id;
  else
    update fabrica_producciones set
      fecha      = p_fecha,
      turno      = p_turno,
      sabor_id   = p_sabor_id,
      destino    = p_destino,
      fecula_kg  = p_fecula_kg,
      masa_kg    = p_masa_kg,
      tamanio_id = p_tamanio_id,
      updated_at = now()
    where id = p_id
    returning id into v_id;

    if not found then
      raise exception 'Producción no encontrada';
    end if;

    delete from fabrica_embolsados where produccion_id = v_id;
  end if;

  insert into fabrica_embolsados (produccion_id, presentacion_id, sabor_id, cantidad_kg)
  select v_id, (e->>'presentacion_id')::uuid, (e->>'sabor_id')::uuid, (e->>'cantidad_kg')::numeric
  from jsonb_array_elements(coalesce(p_embolsados, '[]'::jsonb)) e;

  return v_id;
end;
$$;

-- Borra una producción y, en cascada, sus embolsados.
create or replace function public.eliminar_produccion_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  delete from fabrica_producciones where id = p_id;

  if not found then
    raise exception 'Producción no encontrada';
  end if;
end;
$$;
