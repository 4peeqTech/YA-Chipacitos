-- Campos para cargar el remito al confirmar recepción
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS cantidad_recibida INTEGER,
  ADD COLUMN IF NOT EXISTS valor_total       NUMERIC(10,2);
