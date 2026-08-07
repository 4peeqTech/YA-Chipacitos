-- Bug: fabrica_materia_prima_acceso (20260806110000) solo chequea
-- tiene_acceso_compras(), nunca se sumó tiene_acceso_fabrica() como sí se hizo
-- en la misma fecha para compras_items/compras_stock_actual/proveedores
-- (20260806120000). El rol fabrica sin módulos de compras no podía leer la
-- tabla, así que en /fabrica/stock el chip "Global" siempre mostraba 0 ítems.

drop policy if exists "fabrica_materia_prima_acceso" on fabrica_materia_prima;
create policy "fabrica_materia_prima_acceso" on fabrica_materia_prima
  for all using (tiene_acceso_compras() or tiene_acceso_fabrica());
