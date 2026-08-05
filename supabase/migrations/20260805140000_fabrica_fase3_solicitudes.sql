-- Fase 3 del módulo Fábrica: bandeja de solicitudes en Compras + plantilla
-- de pedido base. compras_solicitudes / compras_solicitud_items ya existen
-- desde la Fase 2 (el cierre del conteo las necesitaba); acá se agrega la
-- plantilla editable del pedido base y la columna que une un pedido con la
-- solicitud que lo originó.

create table if not exists compras_plantilla_base (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references compras_items(id),
  descripcion   text not null,
  proveedor_id  uuid not null references proveedores(id),
  unidad        text,
  cantidad      numeric not null default 0,
  orden         integer not null default 0,
  activo        boolean not null default true
);
create index if not exists idx_compras_plantilla_base_proveedor on compras_plantilla_base(proveedor_id);

alter table compras_plantilla_base enable row level security;
create policy "compras_plantilla_base_acceso" on compras_plantilla_base
  for all using (tiene_acceso_compras());

alter table compras_pedidos
  add column if not exists solicitud_id uuid references compras_solicitudes(id);

-- Los dos módulos nuevos (bandeja de solicitudes, pedido base) se suman al
-- set que ya gobierna tiene_acceso_compras() — ver
-- 20260804150000_compras_rls_modulos.sql para el porqué de chequear módulos
-- en vez de rol.
create or replace function public.tiene_acceso_compras()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-remitos',
          'compras-reportes', 'compras-solicitudes', 'compras-pedido-base'
        ]
      )
  );
$$;

-- Convierte una solicitud abierta en uno o más compras_pedidos en borrador,
-- uno por proveedor, con sus líneas (solo las tildadas "incluir" y con
-- cantidad ajustada > 0). Transaccional para no repetir el read-then-write
-- sin transacción señalado como deuda en ARQUITECTURA.md §5.5.
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
           row_number() over (order by csi.descripcion) - 1
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

-- Descarta una solicitud abierta sin generar pedidos (por ejemplo, un
-- conteo cerrado por error o un pedido base que no correspondía esa semana).
create or replace function public.descartar_solicitud(p_solicitud_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  update compras_solicitudes
    set estado = 'descartada', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id and estado = 'abierta';

  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;
end;
$$;

-- Genera la solicitud del pedido base de la semana a partir de la plantilla
-- editable. Evita duplicar si ya hay una solicitud base abierta sin resolver.
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad, cantidad, true
  from compras_plantilla_base
  where activo
  order by orden;

  return v_solicitud_id;
end;
$$;
