CREATE POLICY "local actualiza items de sus pedidos"
ON pedido_items FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM pedidos
    WHERE pedidos.id = pedido_items.pedido_id
      AND pedidos.local_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pedidos
    WHERE pedidos.id = pedido_items.pedido_id
      AND pedidos.local_id = auth.uid()
  )
);
