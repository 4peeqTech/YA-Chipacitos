-- ============================================================================
-- Gastos F5 (2026-11-04): se borra lo que quedó sin uso.
--
-- - Pagos de Fudo anotados aparte (fudo_gastos_pagados, su vista y sus RPC):
--   desde F3 los gastos de Fudo están en gastos y se pagan con gastos_pagos.
-- - gastos_deshacer_pago: la pantalla anterior "deshacía" el pago entero; ahora
--   se anula cada pago (gastos_anular_pago) y queda en el historial.
--
-- fudo_gastos (la copia de la sincronización de junio) NO se borra: fudo_pagos
-- de esa misma sincronización la referencia. Ese conjunto (ventas, pagos,
-- productos, fudo_sync_log) no es de gastos y queda como está.
--
-- Sin cascade: si algo todavía dependiera de esto, la migración falla en vez
-- de llevárselo puesto.
-- ============================================================================

drop function if exists public.fudo_registrar_pago(text, text, text, numeric, date, date, text, text, text);
drop function if exists public.fudo_deshacer_pago(uuid);
drop view if exists public.v_fudo_gastos_pagados;
drop table if exists public.fudo_gastos_pagados;

drop function if exists public.gastos_deshacer_pago(uuid);

