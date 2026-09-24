-- El pedido base guarda el stock del sistema al generarse.
-- Hasta ahora generar_solicitud_base() no completaba stock_actual y la
-- columna tomaba 0 por defecto: la solicitud base mostraba "0" en todas las
-- líneas aunque hubiera stock. Ahora:
--   * stock_actual acepta null ("no se sabe") y deja de tener default 0;
--   * las líneas base viejas (todas en 0, nunca se completaron) pasan a null;
--   * generar_solicitud_base() copia compras_stock_actual al generar.
-- En la UI, la columna se llama "Stock al generar" en las solicitudes base y
-- "Stock al contar" en las complementarias.

alter table public.compras_solicitud_items
  alter column stock_actual drop not null,
  alter column stock_actual drop default;

update public.compras_solicitud_items csi
  set stock_actual = null
  from public.compras_solicitudes s
  where s.id = csi.solicitud_id
    and s.tipo = 'base'
    and csi.stock_actual = 0;

-- generar_solicitud_base(): mismo cuerpo que en
-- 20260924120000_fabrica_sobrestock.sql. Único cambio: el INSERT de las
-- líneas suma stock_actual desde compras_stock_actual (null en líneas libres,
-- 0 si el insumo nunca tuvo stock cargado).
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, orden, stock_actual)
  select v_solicitud_id, pb.item_id, pb.proveedor_id, pb.descripcion, pb.unidad, pb.cantidad, pb.cantidad, true, pb.orden,
         case when pb.item_id is not null then coalesce(sa.cantidad, 0) end
  from compras_plantilla_base pb
  left join compras_stock_actual sa on sa.item_id = pb.item_id
  where pb.activo
  order by pb.orden;

  -- Si un ítem tiene varias líneas en la plantilla (por ejemplo, dos
  -- proveedores), la sugerencia va solo a la primera: así "Aplicar todas"
  -- nunca descuenta más de lo que sobra.
  update compras_solicitud_items csi set
    descuento_sugerido = least(s.descuento, csi.cantidad_sugerida),
    descuento_origen   = s.origen
  from compras_sugerencias_sobrestock(v_solicitud_id) s
  where csi.solicitud_id = v_solicitud_id
    and csi.item_id = s.item_id
    and csi.cantidad_sugerida > 0
    and csi.id = (
      select c2.id from compras_solicitud_items c2
      where c2.solicitud_id = v_solicitud_id and c2.item_id = s.item_id and c2.cantidad_sugerida > 0
      order by c2.orden, c2.id
      limit 1
    );

  return v_solicitud_id;
end;
$$;
