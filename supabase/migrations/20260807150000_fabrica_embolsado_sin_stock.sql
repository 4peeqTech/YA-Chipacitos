-- Embolsado deja de intentar mover stock: desde bb1fdaa el rol fabrica no
-- tiene acceso a Catálogo, así que no puede cargar los productos que le
-- faltan — el aviso "N líneas no mueven stock" dejó de ser accionable y
-- pasó a ser ruido constante. Cada línea ahora se guarda siempre con
-- producto_id = null, sin buscar match en `productos` ni llamar a
-- mover_stock_terminado. El registro (masa, sabor, tamaño, presentación,
-- kg) se sigue guardando igual — es el dato que más adelante se va a
-- mostrar en el administrador del ERP (fuera de alcance de este cambio).
--
-- La reversa por NETO de movimientos previos (loop que suma
-- fabrica_stock_terminado_mov por embolsado_id y revierte antes del
-- delete) se mantiene sin cambios: sigue siendo necesaria para deshacer
-- movimientos reales que hayan quedado de guardados anteriores a este
-- cambio, cuando el producto sí existía en el catálogo en ese momento.
--
-- El retorno pasa de integer (conteo de líneas sin producto) a void,
-- porque ya no hay nada que contar. create or replace no permite cambiar
-- el tipo de retorno, así que hay que dropear la firma vieja primero —
-- mismo cuidado que la migración anterior documentó para
-- guardar_produccion_fabrica: sin el drop, PostgREST podría seguir
-- resolviendo por una sobrecarga vieja cacheada.
drop function if exists public.guardar_embolsado_fabrica(date, uuid, uuid, jsonb);

create function public.guardar_embolsado_fabrica(
  p_fecha date,
  p_tamanio_id uuid,
  p_sabor_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  r record;
  v_embolsado_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e
    where (e->>'cantidad_kg')::numeric < 0
  ) then
    raise exception 'No se aceptan cantidades negativas';
  end if;

  -- Mismo advisory lock que la versión anterior: evita que dos guardados
  -- concurrentes del mismo pool lean el mismo neto de reversa.
  perform pg_advisory_xact_lock(hashtextextended(p_fecha::text || '|' || p_tamanio_id::text || '|' || p_sabor_id::text, 0));

  for r in
    select producto_id, sum(delta_kg) as neto
    from fabrica_stock_terminado_mov
    where tipo = 'produccion_embolsado'
      and embolsado_id in (
        select id from fabrica_embolsados
        where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id
      )
    group by producto_id
  loop
    if r.neto <> 0 then
      perform mover_stock_terminado(r.producto_id, -r.neto, 'produccion_embolsado', null, null);
    end if;
  end loop;

  delete from fabrica_embolsados
    where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id;

  -- group by + having > 0: mismo criterio que la versión anterior para
  -- permitir dos líneas con la misma presentación en la UI sin pisar el
  -- unique index, descartando ceros.
  for r in
    select presentacion_id, sum(cantidad_kg) as cantidad_kg
    from jsonb_to_recordset(coalesce(p_lineas, '[]'::jsonb)) as x(presentacion_id uuid, cantidad_kg numeric)
    group by presentacion_id
    having sum(cantidad_kg) > 0
  loop
    insert into fabrica_embolsados (fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg, producto_id, cargado_por, updated_at)
    values (p_fecha, p_tamanio_id, p_sabor_id, r.presentacion_id, r.cantidad_kg, null, auth.uid(), now())
    returning id into v_embolsado_id;
  end loop;
end;
$$;
