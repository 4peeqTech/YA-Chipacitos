-- A2a, vuelta 1 de revisión (artifacts/review-a2a-insumos-base). 150000 y
-- 160000 ya están aplicadas en dev: los arreglos van acá.
--   1. Deadlock con cerrar_conteo_fabrica: el cierre bloquea el conteo y
--      después, al insertar compras_solicitud_items, toma FOR KEY SHARE sobre
--      compras_items. Archivar tomaba FOR UPDATE del insumo antes que el
--      conteo (orden inverso).
--      - Archivar solo cambia estado (no es clave): FOR NO KEY UPDATE, que no
--        choca con KEY SHARE.
--      - Eliminar necesita FOR UPDATE: bloquea primero los conteos en borrador
--        que tienen el insumo y recién después el insumo, el mismo orden que
--        el cierre.
--   2. Índices por item_id en las tablas que cuenta v_compras_insumos_resumen
--      (y compras_eliminar_insumo). No existían con otro nombre en dev.
--   3. La consulta de release del encabezado de 20261005160000 usaba
--      profiles.email, que no existe. La correcta (probada en dev, solo lectura):
--
--   select u.email, p.nombre, p.rol, p.modulos_permitidos
--   from profiles p join auth.users u on u.id = p.id
--   where p.estado = 'activo' and p.rol <> 'admin' and 'fabrica-conteos' = any(p.modulos_permitidos)
--     and not p.modulos_permitidos && array['compras-insumos','compras-stock','compras-pedidos','compras-reportes'];

-- ---------------------------------------------------------------------------
-- 1a. compras_archivar_insumo: cuerpo de 20261005150000, con FOR NO KEY UPDATE
-- ---------------------------------------------------------------------------

create or replace function public.compras_archivar_insumo(
  p_item_id uuid default null, p_archivar boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item     compras_items%rowtype;
  v_nuevo    text := case when coalesce(p_archivar, true) then 'archivado' else 'activo' end;
  v_quitados integer := 0;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  -- NO KEY UPDATE: el cierre de un conteo toma KEY SHARE sobre el insumo (FK
  -- de compras_solicitud_items) con el conteo ya bloqueado; un FOR UPDATE acá
  -- antes de bloquear el conteo arma un deadlock.
  select * into v_item from compras_items where id = p_item_id for no key update;
  if not found then raise exception 'No encontramos el insumo. Recargá la página.'; end if;
  if v_item.estado = v_nuevo then
    raise exception '%', case when v_nuevo = 'archivado' then 'Ya está archivado.' else 'Ya está activo.' end;
  end if;

  update compras_items set estado = v_nuevo where id = p_item_id;
  perform _compras_item_hist(p_item_id, gen_random_uuid(), 'estado', null, v_item.estado, v_nuevo);

  if v_nuevo = 'archivado' then
    perform 1 from fabrica_conteos c
    where c.estado = 'borrador'
      and exists (select 1 from fabrica_conteo_items fci where fci.conteo_id = c.id and fci.item_id = p_item_id)
    order by c.id
    for update;

    delete from fabrica_conteo_items fci using fabrica_conteos c
    where c.id = fci.conteo_id and c.estado = 'borrador' and fci.item_id = p_item_id;
    get diagnostics v_quitados = row_count;
  end if;

  return jsonb_build_object(
    'estado', v_nuevo,
    'borradores_quitados', v_quitados,
    'listas', coalesce((
      select jsonb_agg(x.nombre order by x.orden, x.nombre) from (
        select distinct d.nombre, d.orden
        from fabrica_conteo_definicion_items di
        join fabrica_conteo_definiciones d on d.id = di.definicion_id
        where di.item_id = p_item_id and di.activo and d.activo
      ) x), '[]'::jsonb),
    'pedido_base', (select count(*) from compras_plantilla_base where item_id = p_item_id and activo),
    'stock', coalesce((select cantidad from compras_stock_actual where item_id = p_item_id), 0));
end $$;

-- ---------------------------------------------------------------------------
-- 1b. compras_eliminar_insumo: cuerpo de 20261005150000, con los locks en el
--     orden del cierre (primero los conteos, después el insumo)
-- ---------------------------------------------------------------------------

create or replace function public.compras_eliminar_insumo(p_item_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item   compras_items%rowtype;
  v_partes text[] := '{}';
  v_n      bigint;
  v_stock  numeric;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  -- Primero los conteos en borrador que tienen el insumo, como el cierre.
  perform 1 from fabrica_conteos c
  where c.estado = 'borrador'
    and exists (select 1 from fabrica_conteo_items fci where fci.conteo_id = c.id and fci.item_id = p_item_id)
  order by c.id
  for update;

  select * into v_item from compras_items where id = p_item_id for update;
  if not found then raise exception 'No encontramos el insumo. Recargá la página.'; end if;

  -- Historia: si hay alguna, no se elimina (se archiva).
  select count(*) into v_n from compras_stock_movimientos where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' movimiento de stock' else ' movimientos de stock' end); end if;
  select count(distinct pedido_id) into v_n from compras_pedido_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' pedido' else ' pedidos' end); end if;
  select count(distinct remito_id) into v_n from compras_remito_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' remito' else ' remitos' end); end if;
  select count(distinct factura_id) into v_n from compras_factura_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' factura' else ' facturas' end); end if;
  select count(*) into v_n from compras_factura_discrepancias where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' diferencia de factura' else ' diferencias de factura' end); end if;
  select count(distinct solicitud_id) into v_n from compras_solicitud_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' solicitud' else ' solicitudes' end); end if;
  select count(distinct fci.conteo_id) into v_n
  from fabrica_conteo_items fci join fabrica_conteos c on c.id = fci.conteo_id
  where fci.item_id = p_item_id and c.estado <> 'borrador';
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' conteo' else ' conteos' end); end if;

  if cardinality(v_partes) > 0 then
    raise exception 'No se puede eliminar: tiene %. Archivalo: deja de aparecer y no pierde su historia.',
      case when cardinality(v_partes) = 1 then v_partes[1]
           else array_to_string(v_partes[1:cardinality(v_partes) - 1], ', ') || ' y ' || v_partes[cardinality(v_partes)]
      end;
  end if;

  select cantidad into v_stock from compras_stock_actual where item_id = p_item_id;
  if coalesce(v_stock, 0) <> 0 then
    raise exception 'No se puede eliminar: figura con stock % sin movimientos que lo expliquen. Avisale a soporte.',
      _compras_num_txt(v_stock);
  end if;

  -- Configuración: se va con él (los conteos ya están bloqueados).
  delete from fabrica_conteo_items fci using fabrica_conteos c
  where c.id = fci.conteo_id and c.estado = 'borrador' and fci.item_id = p_item_id;
  delete from fabrica_conteo_definicion_items where item_id = p_item_id;
  delete from compras_plantilla_base where item_id = p_item_id;
  delete from compras_item_proveedores where item_id = p_item_id;
  delete from compras_stock_actual where item_id = p_item_id;
  delete from compras_items where id = p_item_id;   -- el historial cae por cascade

  return jsonb_build_object('nombre', v_item.nombre);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Índices por item_id
-- ---------------------------------------------------------------------------

create index if not exists idx_compras_solicitud_items_item_id       on public.compras_solicitud_items (item_id);
create index if not exists idx_compras_factura_items_item_id         on public.compras_factura_items (item_id);
create index if not exists idx_compras_remito_items_item_id          on public.compras_remito_items (item_id);
create index if not exists idx_compras_factura_discrepancias_item_id on public.compras_factura_discrepancias (item_id);
