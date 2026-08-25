-- Módulo Proveedores: pasa a tener sección propia en el menú (antes vivía
-- bajo Parámetros) y suma cuit para completar los datos de contacto que hoy
-- se piden a mano por WhatsApp/mail. Se alinea la policy de escritura al
-- patrón es_admin() (with check) introducido en 20260825120000, reemplazando
-- la policy vieja que usaba una subquery inline sin with check.

alter table proveedores
  add column if not exists cuit text,
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "admin maneja proveedores" on proveedores;
create policy "proveedores_escritura" on proveedores
  for all to authenticated using (es_admin()) with check (es_admin());

-- proveedores_lectura_compras_fabrica (20260806120000) no se toca.
