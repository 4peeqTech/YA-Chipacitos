-- ============================================================================
-- Locales con Fudo (2026-11-13): se suman Vera, Santa Fe y Sáenz Peña.
--
-- Hoy tienen Fudo: Paraguay, Córdoba, San Lorenzo, Irigoyen, La Unidad, Vera,
-- Santa Fe y Sáenz Peña. Los tres nuevos entran a locales_config con Fudo y su
-- caja (la que usa la sincronización para los pagos en efectivo). Sus
-- credenciales van en FUDO_API_KEY_YA_VERA, FUDO_API_KEY_YA_SANTA_FE y
-- FUDO_API_KEY_YA_SAENZ_PENA (y los _SECRET_), como el resto.
-- Solo agrega: si ya existen, no se tocan.
-- ============================================================================

insert into public.cajas (nombre) values ('Vera'), ('Santa Fe'), ('Saenz Peña')
on conflict (nombre) do nothing;

insert into public.locales_config (sucursal, tiene_fudo, caja_default, orden, activo)
select v.sucursal, true, v.caja, coalesce((select max(orden) from public.locales_config), 0) + v.n, true
from (values ('YA! VERA', 'Vera', 1), ('YA! SANTA FE', 'Santa Fe', 2), ('YA! SAENZ PEÑA', 'Saenz Peña', 3))
  as v(sucursal, caja, n)
on conflict (sucursal) do nothing;
