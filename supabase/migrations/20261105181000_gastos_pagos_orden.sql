-- Dos pagos registrados en la misma transacción (cargar ya pagado y otro, o un
-- lote) tenían el mismo created_at y "el último pago" de v_gastos salía al
-- azar. clock_timestamp avanza dentro de la transacción.
alter table public.gastos_pagos alter column created_at set default clock_timestamp();
