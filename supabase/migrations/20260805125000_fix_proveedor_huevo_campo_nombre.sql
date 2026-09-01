-- El proveedor de huevos quedó cargado con nombres distintos en cada ambiente
-- ("Huevo Campo" en dev/qa, "HUEVOS DE CAMPO" en prod). Varias migraciones de
-- este mismo batch matchean por upper(nombre) = 'HUEVO CAMPO' (import de
-- insumos legacy, seed de "Huevos" y maneja_stock en fabrica_catalogo_unico)
-- — sin este fix esas migraciones no encuentran el proveedor en prod y las
-- líneas correspondientes de compras_items simplemente no se crean, sin error.
-- No-op en dev/qa: ya tiene el nombre correcto.
update proveedores set nombre = 'Huevo Campo' where upper(nombre) = 'HUEVOS DE CAMPO';
