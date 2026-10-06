-- ============================================================================
-- B4 — permisos de compras_devolucion_items (revisión, vuelta 1).
--
-- La política de lectura (tiene_acceso_compras()) dejaba a un rol de Compras
-- leer precio_correcto directo de la tabla, salteando el es_admin() de
-- v_compras_devoluciones. Se pasa a grants por columna: anon y authenticated
-- leen todo menos precio_correcto. La vista (corre como dueña) y las RPC
-- (security definer) no cambian, así que Compras sigue registrando y anulando
-- devoluciones con mercadería (D6) y admin ve el precio por la vista.
--
-- La RLS queda igual. Escribir directo ya estaba revocado (150000). Solo dev/QA.
-- ============================================================================

revoke select on compras_devolucion_items from anon, authenticated;
grant select (id, devolucion_id, pedido_item_id, item_id, factura_item_id, descripcion, unidad,
              cantidad, cantidad_base, orden)
  on compras_devolucion_items to authenticated;
