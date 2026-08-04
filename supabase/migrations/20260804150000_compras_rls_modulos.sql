-- Las policies de las 7 tablas de Compras hardcodeaban rol IN ('admin','squad').
-- Un rol personalizado con algún módulo compras-* asignado en
-- modulos_permitidos pasaba el proxy y veía la pantalla, pero RLS le
-- devolvía cero filas porque no era exactamente 'squad'.
--
-- tiene_acceso_compras() reemplaza el nombre de rol hardcodeado por un
-- chequeo de módulos: mismo comportamiento de antes (acceso a las 7 tablas
-- si tiene AL MENOS UNO de los 5 módulos de Compras, no granular por
-- tabla — insumos/stock se leen desde pantallas cruzadas), pero ahora
-- funciona para cualquier rol, no solo 'squad'.
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
        or modulos_permitidos && array['compras-insumos','compras-stock','compras-pedidos','compras-remitos','compras-reportes']
      )
  );
$$;

drop policy "admin y squad manejan compras_items" on compras_items;
create policy "compras_items_acceso" on compras_items
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_stock_actual" on compras_stock_actual;
create policy "compras_stock_actual_acceso" on compras_stock_actual
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_pedidos" on compras_pedidos;
create policy "compras_pedidos_acceso" on compras_pedidos
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_pedido_items" on compras_pedido_items;
create policy "compras_pedido_items_acceso" on compras_pedido_items
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_remitos" on compras_remitos;
create policy "compras_remitos_acceso" on compras_remitos
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_remito_items" on compras_remito_items;
create policy "compras_remito_items_acceso" on compras_remito_items
  for all using (tiene_acceso_compras());

drop policy "admin y squad manejan compras_stock_movimientos" on compras_stock_movimientos;
create policy "compras_stock_movimientos_acceso" on compras_stock_movimientos
  for all using (tiene_acceso_compras());
