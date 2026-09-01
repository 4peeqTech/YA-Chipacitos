-- 20260805130000_import_insumos_legacy.sql matchea por upper(nombre) exacto contra
-- 17 proveedores que en dev/qa ya existían (cargados a mano). En prod, 5 de esos 17
-- todavía no existen — sin este alta, el import de más abajo no encuentra el
-- proveedor y esas líneas de compras_items simplemente no se crean, sin error.
-- No-op en dev/qa: los 5 ya existen ahí.
insert into proveedores (nombre)
select v.nombre
from (values ('MESO'), ('TOME CAFE'), ('NUEVO MAYORISTA'), ('AL SA'), ('AMERICAN MIDWISE')) as v(nombre)
where not exists (
  select 1 from proveedores p where upper(p.nombre) = upper(v.nombre)
);
