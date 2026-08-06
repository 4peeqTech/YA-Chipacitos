# Análisis: materiales de Stock y Motor de Cálculo en Ya!ModuloCompra (legacy)

Extraído de `index.html` (repo `Ya!ModuloCompra`) — pestañas **Stock** (`tab-stock`) y **Motor de Cálculo** (`tab-calculo`). Complementa a [`analisis-proveedores-insumos-legacy.md`](analisis-proveedores-insumos-legacy.md) (que cubre el universo completo de los 17+1 proveedores); este documento se enfoca en los 3 proveedores con materia prima "dura" — Bolsaplast, Global y Huevos (Huevo Campo) — y en la lógica de cálculo de pedidos que corre sobre ellos, pendiente de migrar (ver "costeo por masa" en la fase separada mencionada en el análisis previo).

## 1. Materiales de Stock por proveedor

### 🛍 Bolsaplast — consumo semanal fijo (7 ítems)

| Item | ID (legacy) | Unidad | Meta semanal real (`config.consumoSemanal.bolsaplast`) |
|---|---|---|---|
| Bolsa Consorcio 90×120 | `bp_c90120` | Unid. | 5/sem |
| Bolsa Consorcio 60×90 | `bp_c6090` | Unid. | 7/sem |
| Bobina Baja Densidad 20×40 | `bp_bd2040` | Unid. | `null` — según necesidad, sin meta fija |
| Bobina Baja Densidad 45×60 | `bp_bd4560` | Unid. | 3/sem |
| Bobina Baja Densidad 50×70 | `bp_bd5070` | Unid. | 2/sem |
| Servilletas Intercalables Marrón | `bp_serv` | Cajas | 1.5/sem |
| Toallas Bobinas Papel Doble ×2 | `bp_toallas` | Unid. | 2/sem |

⚠️ **Inconsistencia detectada:** el texto de ayuda en el HTML de `bp_bd4560` dice "meta: 6/sem" y el de `bp_toallas` dice "meta: 4/sem", pero los valores que efectivamente usa el cálculo (`config.consumoSemanal.bolsaplast`, `index.html:1798-1806`) son 3 y 2 respectivamente. El HTML quedó desactualizado respecto al config real — al migrar, usar los valores del config, no los textos visibles en pantalla.

### 🧀 Global — materias primas (8 ítems, carga en unidades de compra)

| Item | ID (legacy) | Unidad de compra | Kg por unidad | Kg por masa (`config.ingredientesGlobal`, receta base 30kg fécula) |
|---|---|---|---|---|
| Fécula de Mandioca | `gl_fecula` | Bolsa | 25 kg | 30 kg |
| Queso Barra | `gl_barra` | Caja | 16.5 kg | 16.5 kg (= 1 caja/masa) |
| Queso Sardo | `gl_sardo` | Sardo | 3 kg | 4.5 kg |
| Margarina | `gl_margarina` | Caja | 10 kg | 6 kg |
| Leche en Polvo | `gl_leche` | Bolsa | 20 kg | 1.405 kg |
| Sal | `gl_sal` | Bolsa | 20 kg | 0.84 kg |
| Queso Pategrás | `gl_pategras` | Caja | 9 kg | 0 (no entra en receta — "stock extra") |
| Polvo de Hornear | `gl_polvo` | Pote | 4 kg | 0.3 kg |

⚠️ **Misma inconsistencia HTML-vs-config:** los textos de ayuda muestran "3kg/masa" (Margarina), "2kg/masa" (Leche), "0.3kg/masa" (Sal) — ninguno coincide con `config.ingredientesGlobal` (`index.html:1812-1821`), que es la fuente real que usa `calcularComplementario()`. Al migrar, tomar el config como verdad, no el texto plano del HTML.

### 🥚 Huevos — Huevo Campo (no es catálogo de insumos, son 2 campos de planificación)

| Campo | ID (legacy) | Detalle |
|---|---|---|
| Cajones disponibles | `hv_cajones` | 1 cajón = 12 maples × 30 huevos = 360 huevos |
| Masas semana siguiente | `hv_masas` | Proyección usada para calcular consumo |

Regla fija: **90 huevos por masa** → 1 cajón alcanza para 4 masas.

## 2. Motor de Cálculo — las 5 calculadoras

### 2.1 Bolsaplast (`calcularBolsaplast()`, `index.html:2085`)

Por cada uno de los 7 ítems:

```
faltante = max(0, meta_semanal − stock_actual)
```

Si `meta_semanal` es `null` (caso `bp_bd2040`), no hay cálculo de faltante: solo muestra ✅ si hay stock cargado (`> 0`), o `?` si no.

### 2.2 Pedido Complementario Global — martes (`calcularComplementario()`, `index.html:2128`)

Alcance: solo 4 ítems (fécula, barra, sardo, margarina) de los 8 de Global.

```
kgNecesarios  = kgPorMasa × masasProyectadas
kgFaltantes   = max(0, kgNecesarios − stockUnidades × kgPorUnidad)
fracción      = kgFaltantes / kgPorUnidad
unidadesPedir = fracción < 0.5 (parte decimal) ? floor(fracción) : ceil(fracción)
```

Regla de negocio explícita en el propio código: **si falta menos de media unidad, no se pide** (se redondea hacia abajo). Si falta media unidad o más, se redondea hacia arriba.

### 2.3 Pedido Base Global — semanal (`generarPedidoBase()`, `index.html:2172`)

No calcula nada contra stock actual. Son 8 campos editables con valores por defecto fijos que arman el pedido directamente:

| Ítem | Valor por defecto |
|---|---|
| Queso Barra | 40 cajas |
| Sardos | 60 unidades |
| Fécula de Mandioca | 50 bolsas |
| Margarina | 30 cajas |
| Pategrás | 1 caja |
| Leche en Polvo | 4 bolsas |
| Sal | 2 bolsas |
| Polvo de Hornear | 2 potes |

El usuario puede modificar cualquier valor antes de generar el pedido; solo se incluyen en el mensaje los ítems con cantidad `> 0`.

### 2.4 Huevos (`calcularHuevos()`, vía `CalculadoraPedidos.calcularHuevos`, `index.html:1854`)

```
HUEVOS_POR_MASA  = 90
HUEVOS_POR_CAJON = 360   // 12 maples × 30 unidades

huevosNecesarios  = masasSemanaSiguiente × 90
cajonesNecesarios = ceil(huevosNecesarios / 360)
cajonesFaltantes  = max(0, cajonesNecesarios − cajonesEnStock)
```

### 2.5 Polvo de Hornear (`calcularPolvo()`, `index.html:2227`)

```
kgNecesarios    = 0.3 × masas
kgDisponibles   = stockPotes × 4
kgFaltantes     = max(0, kgNecesarios − kgDisponibles)
potesNecesarios = kgNecesarios / 4
potesPedir      = ceil(kgFaltantes / 4)
```

⚠️ **Inconsistencia de proveedor:** la card de esta calculadora dice explícitamente "proveedor: Montecarlo", pero en `config.productos` el Polvo de Hornear está listado bajo **Global**, y en la pestaña Stock (`gl_polvo`) también se carga como parte del stock de Global. Aclarar con el cliente cuál es el proveedor real antes de decidir si esta calculadora se generaliza junto con las de Global o queda aparte.

## 3. Código muerto detectado

`CalculadoraPedidos.calcularGlobal` (`index.html:1841`) referencia `config.recetaPorMasa`, una propiedad que **no existe** en el objeto `config` (solo existe `config.ingredientesGlobal`, con nombres de campo distintos). Esta función no está conectada a ningún botón de la UI — nunca se ejecuta. La lógica real de Global corre enteramente por `calcularComplementario()` (sección 2.2) y `generarPedidoBase()` (sección 2.3). No migrar `calcularGlobal` tal cual — es una versión abandonada, no la fuente de verdad.

## 4. Consideraciones para migrar a Chipacitos

- Las reglas de redondeo (Complementario: floor/ceil según si la fracción falante es <0.5 o ≥0.5; Huevos y Polvo: siempre `ceil`) no están capturadas hoy en `compras_items`/`compras_stock_actual` de Chipacitos — son lógica de negocio específica por proveedor, no un cálculo genérico de "meta − stock".
- El "Pedido Base Global" no depende de stock: es una plantilla de cantidades fijas editables, distinta al resto de las calculadoras que sí comparan contra stock actual.
- Si se decide generalizar esta lógica (fase de "costeo por masa" o una futura fase de motor de cálculo nativo), conviene resolver primero las inconsistencias de la sección 1 y 2.5 con el cliente, para no migrar valores desactualizados del HTML en lugar de los reales del `config`.
