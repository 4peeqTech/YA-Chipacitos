# Análisis: proveedores e insumos/materia prima en Ya!ModuloCompra (legacy)

Extraído de `index.html` (config global `const config = {...}` + módulo "Stock" del HTML), para corroborar antes de importar a Ya!Chipacitos.

## Contexto (aclarado por el usuario, 2026-08-05)

Este HTML lo armó el cliente por su cuenta — no es un desarrollo profesional previo. Le funciona parcialmente y lo usa principalmente para hacer cuentas y generar mensajes de WhatsApp a los proveedores. Lo que se pidió es profesionalizarlo y llevarlo al ERP (Ya!Chipacitos, ya en desarrollo). Consecuencias para el import:

- **Materia prima e insumo son lo mismo en el ERP** — no hace falta preservar la categoría legacy como un campo del modelo de datos. Se mantiene abajo solo como referencia de origen, no como decisión de diseño.
- **Toda la información disponible es la de este módulo** — no hay otra planilla ni fuente en papel con más detalle (confirmado).
- **Global y Bolsaplast son los únicos con catálogo completo** (nombre + unidad + meta + consumo por masa). El resto de los proveedores son "más chicos" en importancia y **no van a tener esos campos** — la carga de unidad/meta/consumo por masa no debería ser obligatoria al cargar un proveedor ni al cargar un insumo en el ERP, para poder importarlos igual sin esos datos.

## 1. Lista maestra de proveedores (`config.proveedores`, 17 en total + 1 a confirmar)

El código los separa en dos categorías (comentario en el propio archivo). Esta separación queda como referencia de origen únicamente — en el ERP no hay distinción de modelo de datos entre materia prima e insumo (ver Contexto):

**Materia prima (9):** Global, Meso, MP Distribuidora, Huevo Campo, Montecarlo, Albor, Tome Cafe, Nuevo Mayorista, Milkaut

**Insumos / empaque (8):** Bolsaplast, AL SA, Bolsar, Iberia, Fabimp, Corrugados Avellaneda, American Midwise, Poliinsumos

Cada uno tiene además una sigla corta (`config.siglas`) y un local de asignación para facturación/entrega (`config.asignacion`: `paraguay` = Local Paraguay 388, `lagrana` = Local Gdor. Lagraña 388):

| Proveedor | Categoría | Sigla | Local asignado |
|---|---|---|---|
| Global | Materia prima | GLOBAL | Paraguay 388 |
| Meso | Materia prima | MESO | Paraguay 388 |
| MP Distribuidora | Materia prima | MP | Paraguay 388 |
| Huevo Campo | Materia prima | HC | Gdor. Lagraña 388 |
| Montecarlo | Materia prima | MONTECARLO | Paraguay 388 |
| Albor | Materia prima | ALBOR | Paraguay 388 |
| Tome Cafe | Materia prima | TOME CAFE | Paraguay 388 |
| Nuevo Mayorista | Materia prima | NUEVO MAYORISTA | Paraguay 388 |
| Milkaut | Materia prima | MILKAUT | Paraguay 388 |
| Bolsaplast | Insumo | BOLSAPLAST | Gdor. Lagraña 388 |
| AL SA | Insumo | AL SA | Gdor. Lagraña 388 |
| Bolsar | Insumo | BOLSAR | Gdor. Lagraña 388 |
| Iberia | Insumo | IBERIA | Gdor. Lagraña 388 |
| Fabimp | Insumo | FABIMP | Gdor. Lagraña 388 |
| Corrugados Avellaneda | Insumo | CORRUGADOS | Gdor. Lagraña 388 |
| American Midwise | Insumo | AMERICAN MIDWISE | Gdor. Lagraña 388 |
| Poliinsumos | Insumo | POLIINSUMOS | Gdor. Lagraña 388 |
| **Caprice** | — sin categoría, sin sigla, sin local — | — | — |

**"Caprice"** (18º nombre): aparece en la función `selProv()` del módulo de Stock, agrupado junto a MP/Poli/Montecarlo como proveedor "genérico", pero no está en `config.proveedores` ni tiene `productos` ni sigla ni local asignado. **Se agrega a la lista para no perderlo, pendiente de confirmar con el cliente** si es un proveedor real o un resabio sin uso del legacy.

## 2. Productos por proveedor (`config.productos`, 16 de los 17)

Esta es la lista general de qué le compran a cada proveedor (se usa para categorización/mensajería en el legacy, no tiene unidad ni meta semanal — son nombres de producto tal como figuran en la operación real). Falta **Bolsaplast** en este diccionario (su detalle está en la sección 3).

| Proveedor | Productos |
|---|---|
| Global | Cajas Barra x4, Sardos, Cajas Pategrás, Féculas, Margarinas, Leche en Polvo, Bolsas Sal, Polvo de Hornear, Crema Pastelera Gelbrix, Pote de Membrillo Dewey |
| Huevo Campo | Cajones de Huevos B1 |
| AL SA | Productos de limpieza varios |
| Meso | Vigilantes, Medialunas, Tradicionales, Crema Pastelera, Dulce de Leche |
| MP Distribuidora | Frutilla (kg), Frutos Rojos (kg), Ananá (kg), Mango (kg) |
| Montecarlo | Salame Fox 201 (piezas), Jamón (piezas), Embutidos varios |
| Bolsar | Bolsas papel N°3, Bolsas papel N°6, Bobinas papel Ya! Chipacitos |
| Iberia | Cajitas felices |
| Fabimp | Bolsas camiseta chica 30×40, Bolsas camiseta grande 40×50, Bolsas 1/2 kg (clásico, salame, jamón, cheddar, queso azul, maíz, anís), Bolsas 2kg, Bolsas 5kg, Bolsas 10kg |
| Corrugados Avellaneda | Cajas para congelados |
| American Midwise | Guantes nitrilo negro talle L, talle XL |
| Albor | Maíz cremoso 25kg (bolsas) |
| Tome Cafe | Café 1kg (paquetes), Edulcorante en sobre (cajas), Azúcar en sobre (cajas) |
| Nuevo Mayorista | Jamón cocido trozer |
| Milkaut | Leche entera ×12 cajitas (cajas) |
| Poliinsumos | Vasos smoothie, Tapas |

## 3. Catálogo completo (Global y Bolsaplast) vs. resto de proveedores

**Decisión:** Global y Bolsaplast son los dos únicos proveedores con catálogo completo (nombre + unidad de compra + meta semanal, y para Global también consumo por masa) — lo que en Chipacitos sería `compras_items`: `nombre`, `unidad`, `meta_semanal`, `consumo_por_masa`. El resto de los proveedores (los otros 15 + Caprice) se tratan como una categoría distinta y más liviana: no tienen ese nivel de detalle en el legacy y no lo van a tener en el ERP tampoco. Para importarlos, `unidad`/`meta_semanal`/`consumo_por_masa` no deberían ser obligatorios — ni al cargar el proveedor ni al cargar sus insumos.

**Nota de implementación para cuando se diseñe el import:** hoy en Chipacitos, `compras_items.unidad` es `not null` en el esquema (migración de Fase 1). Habría que relajarla a nullable (o poner un default) para poder cargar insumos de estos proveedores "livianos" sin ese dato.

Los otros proveedores del módulo de Stock (MP, Poliinsumos, Montecarlo) usan además un formulario genérico de 2 ítems editables sin catálogo fijo — otra señal de que nunca tuvieron el mismo nivel de carga que Global/Bolsaplast.

### Global — Materias Primas (8 ítems)
| Insumo | Unidad de compra | Consumo por masa |
|---|---|---|
| Fécula de Mandioca | bolsas × 25kg | 30kg/masa |
| Queso Barra | cajas × 16.5kg | 1 caja/masa |
| Queso Sardo | sardos × 3kg | 4.5kg/masa |
| Margarina | cajas × 10kg | 3kg/masa |
| Leche en Polvo | bolsas × 20kg | 2kg/masa |
| Sal | bolsas × 20kg | 0.3kg/masa |
| Queso Pategrás | cajas × 9kg | (stock extra, sin consumo fijo) |
| Polvo de Hornear | potes × 4kg | 0.3kg/masa |

Global también tiene precios vigentes cargados por insumo (usados para "Costo por masa", fuera de alcance de esta fase) para: Fécula, Queso Barra, Queso Sardo, Queso Pategrás, Margarina, Leche en Polvo, Sal, y Pote de Membrillo Dewey.

### Bolsaplast (7 ítems)
| Insumo | Unidad | Meta semanal |
|---|---|---|
| Bolsa Consorcio 90×120 | Unid. | 5/sem |
| Bolsa Consorcio 60×90 | Unid. | 7/sem |
| Bobina Baja Densidad 20×40 | Unid. | según necesidad (sin meta fija) |
| Bobina Baja Densidad 45×60 | Unid. | 6/sem |
| Bobina Baja Densidad 50×70 | Unid. | 4/sem |
| Servilletas Intercalables Marrón | Cajas | 1.5/sem |
| Toallas Bobinas Papel Doble ×2 | Unid. | 4/sem |

### Huevo Campo (2 campos, no es un catálogo de insumos real)
"Cajones disponibles" y "Masas semana siguiente" — son campos de planificación (cajones en stock + proyección), no una lista de materia prima con unidad/meta. El insumo real ("Cajones de Huevos B1") está en la sección 2.

## 4. Frutas congeladas — categoría aparte con lógica de alerta propia

No cuelga de un proveedor específico en el HTML (aunque en la sección 2, MP Distribuidora es quien provee frutilla/frutos rojos/ananá/mango). Tiene su propia config de alerta:
- Sabores trackeados: Frutilla (meta 7kg), Frutos Rojos (meta 5kg), Ananá (meta 5kg), Mango (meta 5kg)
- Regla: si 2 o más sabores bajan del umbral (2kg), se dispara sugerencia de pedido.

## Estado de las decisiones

| Punto | Estado |
|---|---|
| "Caprice" es proveedor real o resabio | **Pendiente** — el usuario lo va a hablar con el cliente. Por ahora queda agregado a la lista maestra (sección 1) para no perderlo. |
| Bolsaplast sin `productos` propios | Resuelto — su catálogo de la sección 3 (7 ítems con unidad/meta) es el dato completo, no falta nada. |
| Categoría materia prima vs insumo | Resuelto — no se traslada como campo del modelo de datos en el ERP; queda solo como referencia de origen (ver Contexto). |
| Huevo Campo con poco detalle | Resuelto — es todo lo que hay, no existe otra fuente con más información. |
| Proveedores sin unidad/meta (todos salvo Global y Bolsaplast) | Resuelto — se tratan como categoría aparte y más liviana; unidad/meta/consumo por masa no van a ser obligatorios para ellos ni para sus insumos (ver sección 3, incluye nota de esquema a ajustar en Chipacitos). |
