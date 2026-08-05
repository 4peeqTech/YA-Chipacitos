-- Import de insumos/materia prima del legacy Ya!ModuloCompra.
-- Los proveedores (18) ya se cargaron/actualizaron a mano contra la base real
-- antes de esta migración. Acá solo se relaja el esquema y se cargan sus insumos.

-- unidad deja de ser obligatoria: la mayoría de los proveedores importados
-- (todos salvo Global y Bolsaplast) no tienen ese dato en el legacy.
alter table compras_items alter column unidad drop not null;

-- Global — catálogo completo con unidad, meta semanal y coeficiente (ex consumo_por_masa,
-- renombrado por la Fase 1/2 de Fábrica que corrió en paralelo a esta migración).
insert into compras_items (proveedor_id, nombre, unidad, meta_semanal, coeficiente, orden)
select p.id, v.nombre, v.unidad, v.meta_semanal, v.coeficiente, v.orden
from proveedores p, (values
  ('Fécula de Mandioca', 'bolsas x 25kg', 0, 30, 1),
  ('Queso Barra',         'cajas x 16.5kg', 0, 1, 2),
  ('Queso Sardo',         'sardos x 3kg', 0, 4.5, 3),
  ('Margarina',           'cajas x 10kg', 0, 3, 4),
  ('Leche en Polvo',      'bolsas x 20kg', 0, 2, 5),
  ('Sal',                 'bolsas x 20kg', 0, 0.3, 6),
  ('Queso Pategrás',      'cajas x 9kg', 0, null, 7),
  ('Polvo de Hornear',    'potes x 4kg', 0, 0.3, 8)
) as v(nombre, unidad, meta_semanal, coeficiente, orden)
where upper(p.nombre) = 'GLOBAL';

-- Bolsaplast — catálogo completo con unidad y meta semanal (sin consumo por masa).
insert into compras_items (proveedor_id, nombre, unidad, meta_semanal, orden)
select p.id, v.nombre, v.unidad, v.meta_semanal, v.orden
from proveedores p, (values
  ('Bolsa Consorcio 90x120',              'Unid.', 5, 1),
  ('Bolsa Consorcio 60x90',               'Unid.', 7, 2),
  ('Bobina Baja Densidad 20x40',          'Unid.', 0, 3),
  ('Bobina Baja Densidad 45x60',          'Unid.', 6, 4),
  ('Bobina Baja Densidad 50x70',          'Unid.', 4, 5),
  ('Servilletas Intercalables Marrón',    'Cajas', 1.5, 6),
  ('Toallas Bobinas Papel Doble x2',      'Unid.', 4, 7)
) as v(nombre, unidad, meta_semanal, orden)
where upper(p.nombre) = 'BOLSAPLAST';

-- Resto de proveedores — solo nombre, sin unidad/meta/consumo (dato no disponible en el legacy).
insert into compras_items (proveedor_id, nombre, orden)
select p.id, v.nombre, v.orden
from proveedores p, (values
  ('MESO',                   'Vigilantes', 1),
  ('MESO',                   'Medialunas', 2),
  ('MESO',                   'Tradicionales', 3),
  ('MESO',                   'Crema Pastelera', 4),
  ('MESO',                   'Dulce de Leche', 5),
  ('MP DISTRIBUIDORA',       'Frutilla (kg)', 1),
  ('MP DISTRIBUIDORA',       'Frutos Rojos (kg)', 2),
  ('MP DISTRIBUIDORA',       'Ananá (kg)', 3),
  ('MP DISTRIBUIDORA',       'Mango (kg)', 4),
  ('HUEVO CAMPO',            'Cajones de Huevos B1', 1),
  ('MONTECARLO',             'Salame Fox 201 (piezas)', 1),
  ('MONTECARLO',             'Jamón (piezas)', 2),
  ('MONTECARLO',             'Embutidos varios', 3),
  ('ALBOR',                  'Maíz Cremoso 25kg (bolsas)', 1),
  ('TOME CAFE',              'Café 1kg (paquetes)', 1),
  ('TOME CAFE',              'Edulcorante en Sobre (cajas)', 2),
  ('TOME CAFE',              'Azúcar en Sobre (cajas)', 3),
  ('NUEVO MAYORISTA',        'Jamón Cocido Trozer', 1),
  ('MILKAUT',                'Leche Entera x12 Cajitas (cajas)', 1),
  ('AL SA',                  'Productos de Limpieza Varios', 1),
  ('BOLSAR',                 'Bolsas Papel N°3', 1),
  ('BOLSAR',                 'Bolsas Papel N°6', 2),
  ('BOLSAR',                 'Bobinas Papel Ya! Chipacitos', 3),
  ('IBERIA',                 'Cajitas Felices', 1),
  ('FABIMP',                 'Bolsas Camiseta Chica 30x40', 1),
  ('FABIMP',                 'Bolsas Camiseta Grande 40x50', 2),
  ('FABIMP',                 'Bolsas 1/2kg Clásico', 3),
  ('FABIMP',                 'Bolsas 1/2kg Salame', 4),
  ('FABIMP',                 'Bolsas 1/2kg Jamón', 5),
  ('FABIMP',                 'Bolsas 1/2kg Cheddar', 6),
  ('FABIMP',                 'Bolsas 1/2kg Queso Azul', 7),
  ('FABIMP',                 'Bolsas 1/2kg Maíz', 8),
  ('FABIMP',                 'Bolsas 1/2kg Anís', 9),
  ('FABIMP',                 'Bolsas 2kg', 10),
  ('FABIMP',                 'Bolsas 5kg', 11),
  ('FABIMP',                 'Bolsas 10kg', 12),
  ('CORRUGADOS AVELLANEDA',  'Cajas para Congelados', 1),
  ('AMERICAN MIDWISE',       'Guantes Nitrilo Negro Talle L', 1),
  ('AMERICAN MIDWISE',       'Guantes Nitrilo Negro Talle XL', 2),
  ('POLIINSUMOS',            'Vasos Smoothie', 1),
  ('POLIINSUMOS',            'Tapas', 2)
) as v(proveedor_nombre, nombre, orden)
where upper(p.nombre) = v.proveedor_nombre;
