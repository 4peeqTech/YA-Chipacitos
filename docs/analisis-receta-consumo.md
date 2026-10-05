# A0 — Receta vs. consumo real (Bloque 2)

> Análisis previo a A3 ("Receta v1 + consumo en simulación"). No hay código de producto.
> Consultas: [`analisis-receta-consumo.sql`](analisis-receta-consumo.sql). Plan: `bloque2-stock-unidades-historial.md`, fase A0.
> Fecha: 2026-10-05.

## Estado: la tabla "receta vs. real" todavía no se puede llenar

| Fuente | ¿Sirve para el balance? | Por qué |
|---|---|---|
| **Prod** (`ahlpthzsjipdpcnjbfdk`) | **No autorizado** | Regla del usuario desde el 2026-10-05: no se toca prod, ni para leer. |
| **Dev** (`fafckqysyvtlslfnpzrh`) | No | Son datos de prueba de QA: conteos con 200 masas proyectadas, cargas de 50, 55 y 70 kg de fécula, un conteo de 18.000 huevos seguido de uno de 1.800. Sirvió para validar que las consultas corren y detectan los desvíos. |
| **Planilla legacy** (`docs/PRODUCCIÓN_ CONTROL DE STOCK - *.csv`) | Solo en parte | Tiene 3.038 cargas y 1.370 embolsados (mayo 2025 – agosto 2026), pero **no tiene conteos de stock ni compras**: no se puede cerrar ningún balance. Sí sirve para las masas, la distribución de cargas, los sabores y el rendimiento. |

Por lo tanto, este documento entrega:
1. El **método** y las **consultas listas** para correr el día que el usuario autorice prod. Se validaron en dev.
2. **Lo que sí dicen los datos legacy** sobre masas, cargas y sabores.
3. La **tabla por insumo** con la receta actual y el diagnóstico de si el dato de stock sirve. La columna "real" queda pendiente.
4. Los **valores iniciales** recomendados para A3 y las **preguntas** para Marcos y Ricardo.

## 1. Método

### Balance por insumo y período
Un período va de un conteo cerrado al siguiente conteo cerrado del **mismo insumo**. Global cubre fécula, quesos, margarina, leche, sal y polvo. Huevos tiene su propia lista y su propio día. Los conteos descartados quedan afuera.

```
inicio   = contado en el conteo i   × contenido por unidad (cantidad_por_unidad)
remitos  = Σ entrada_remito + salida_remito_anulado de la ventana × contenido
otros    = Σ ajustes manuales, de factura, apertura y reversión × contenido
fin      = contado en el conteo i+1 × contenido
real     = inicio + remitos + otros − fin                    (unidad base: kg o huevos)
teórico  = masas del período × cantidad_por_masa
dif      = real − teórico        dif % = dif / teórico
```

- **Ventana de stock:** por timestamp, del momento del conteo i al momento del conteo i+1. El momento es el último movimiento `conteo_fabrica` de ese conteo e insumo; si no hay, se usa `cerrado_en`.
- **Ventana de producción:** por fecha, `[fecha_i, fecha_fin)`. **Supone que se cuenta antes de producir ese día** (es una de las preguntas).
- **Pisado del conteo.** Hasta la migración `20260908140000`, el conteo grababa su ajuste como `ajuste_manual` sin `conteo_id`, igual que un ajuste de Compras. La consulta toma como pisado los `ajuste_manual` sin `conteo_id` del día del conteo de cierre, y los cuenta en la columna `ajustes_dia_conteo`. Si Compras hizo un ajuste real ese mismo día, queda mal clasificado. Ese período se revisa a mano.
- **Control cruzado (`conteo_dice`).** Como nada descuenta la producción, el delta con el que el conteo pisa el stock es justamente lo consumido y no registrado. Con el stock al día, `conteo_dice ≈ real`. Si no coinciden, el stock entre conteos se movió por algo que el balance no ve.
- **`conteos_intermedios` > 0** quiere decir que otro conteo, por ejemplo uno descartado, pisó el stock dentro de la ventana. Ese período no es confiable (Q8 los lista).

### Masas del período: tres criterios
| Criterio | Fórmula | Comentario |
|---|---|---|
| Filas | 1 fila de `fabrica_producciones` = 1 masa | Es lo que hace hoy el reporte de cumplimiento (`lib/fabrica/reportes.ts`). |
| **Fécula (R2)** | `Σ fecula_kg / 30` | El único dato que se carga de verdad. Es el que se recomienda. |
| Masa kg | `Σ masa_kg / 75` | En el sistema nuevo `masa_kg` viene precargado como fécula × 2,5 (`lib/fabrica/rendimiento.ts`). No es una medida independiente. |

### Consultas (`analisis-receta-consumo.sql`)
| # | Qué responde |
|---|---|
| Q0 | Receta vigente: base por masa y unidades de compra por masa. |
| Q1 | Conteos cerrados por lista, y si quedaron ítems sin contar. |
| Q2 | Masas por período Global con los 3 criterios y su diferencia. |
| Q3a / Q3b | Distribución de `fecula_kg` (10, 20, 30 y otros) y cargas por sabor y destino. |
| **Q4** | **Balance por insumo y período: la tabla "receta vs. real".** |
| **Q5** | **Resumen por insumo (real por masa, dif %, desvío) en los períodos confiables. De acá salen los valores.** |
| Q6 | Remitos sospechosos: kg cargados como cajas, decimales, valores 5 veces la mediana. |
| Q7 | Pedido o factura en una unidad distinta de la del insumo. |
| Q8 | Conteos descartados o sin cerrar que igual pisaron el stock. |

**Cómo correrlas** (requiere la autorización del usuario para prod):
```
supabase db query --linked --project-ref <REF> "<consulta>"
```
El CLI 2.116 exige `--linked` junto con `--project-ref`. **No hace `supabase link`**: el archivo `supabase/.temp/project-ref` no cambia. Se verificó.

## 2. Lo que dicen los datos legacy (planilla, 28-05-2025 → 01-08-2026)

Se normalizaron las fechas: los años de 2 dígitos y las 8 filas con "2023" al final de la planilla, que son agosto de 2026. Las 128 filas "SOBRANTES / DEVOLUCIÓN" (540 kg de masa reinsertada, ≈ 0,3 %) se excluyen de la producción.

### Distribución de `fecula_kg` (2.910 cargas)
| Fécula | Cargas | % | Masa promedio | Quiénes |
|---|---|---|---|---|
| 30 kg | 2.661 | 91,4 % | 73,9 kg | 2.534 clásicos y 127 saborizados |
| 20 kg | 62 | 2,1 % | 45,6 kg | 32 clásicos y 30 saborizados |
| 10 kg | 91 | 3,1 % | 33,2 kg | **87 son XTRA CHEESE** |
| otros | 96 | 3,3 % | — | 94 sin fécula (75 "saborizados locales" de 0,3 a 8 kg, 9 clásicos sin el dato, 9 filas vacías, 1 extra queso), uno de 5 kg y uno de 18 kg |

### Masas: los tres criterios
| | Filas | Fécula / 30 | Masa kg / 75 |
|---|---|---|---|
| Total | 2.910 | **2.733,4** | 2.710,3 |
| Diferencia contra fécula | **+6,5 %** | — | −0,8 % |
| Peor mes | +16,5 % (jun-2026) | — | −3,4 % (ago-2026, 7 cargas) |

Por mes, "filas" sobrecuenta entre 0 y 5 % en 2025, y entre 4 y 16,5 % en 2026: hay más cargas parciales y más saborizados. **Confirma R2:** el reporte de cumplimiento, que cuenta filas, infla las masas hasta un 16 %.

### Rendimiento: la masa de 30 kg ya no rinde 75 kg
Masa promedio de una carga clásica de 30 kg de fécula, por mes:

| 2025-05 → 2025-12 | 2026-01 | 2026-02 | 2026-03 | 2026-04 → 2026-08 |
|---|---|---|---|---|
| 75,0 – 75,8 | 74,7 | 74,0 | 73,4 | **73,0** |

Bajaron 2 kg por masa (−2,7 %) en el primer trimestre de 2026, y desde abril el valor queda clavado en 73. O cambió la receta, o se empezó a anotar un valor fijo. La app precarga 75 (`fabrica_rendimiento_masa` = 2,5).

### Sabores (las masas se miden por fécula / 30; el rendimiento usa solo las cargas con fécula)
| Sabor | Cargas | Masas | % masas | kg masa / kg fécula |
|---|---|---|---|---|
| Clásicos | 2.567 | 2.544,9 | 93,1 % | 2,46 |
| Salame | 73 | 53,0 | 1,9 % | 2,46 |
| Jamón | 55 | 41,0 | 1,5 % | 2,48 |
| **XTRA CHEESE** | 125 | 34,2 | 1,2 % | **3,18** |
| Maíz | 30 | 23,0 | 0,8 % | 2,46 |
| Anís | 20 | 16,0 | 0,6 % | 2,45 |
| Queso azul | 12 | 7,3 | 0,3 % | 2,47 |
| Cheddar | 8 | 3,0 | 0,1 % | 2,44 |
| (sin sabor) | 20 | 11,0 | 0,4 % | 2,50 |

- Los saborizados son **~6,5 % de las masas** (323 cargas, 249 con fécula). **XTRA CHEESE es el único con un agregado grande:** una carga de 10 kg de fécula da 33,1 kg de masa, contra los ~24,6 kg de una clásica. Son unos **8,4 kg extra cada 10 kg de fécula**, casi seguro de queso.
- Los demás sabores dan entre 2,44 y 2,48, igual que la clásica (2,46). Puede ser que el agregado no se pese en la masa, o que se anote el valor por defecto.
- **"Saborizados locales"** (75 filas, 215,6 kg): no llevan fécula. Se saborizan porciones de masa ya hecha. Su consumo base ya está en la carga clásica, y el agregado va **por kg de masa**, no por masa nueva.

### Volumen y destino
- Masas por semana, en 52 semanas: p25 **45,7**, mediana **53**, p75 **60**, máximo 73.
- Destino: congelado embolsado 1.622 masas (59 %), masa a locales 1.100 masas (40 %).

### Embolsado (1.370 registros, 112.232 kg)
| Presentación | Registros | kg | Bolsas equivalentes |
|---|---|---|---|
| 10 kg | 438 | 56.998 | ~5.700 |
| 1/2 kg | 552 | 44.253 | **~88.500** |
| 5 kg | 315 | 8.992 | ~1.800 |
| 2 kg | 63 | 1.986 | ~990 |

- Lo embolsado es el **93 %** de la masa con destino congelado (los meses completos dan entre 0,88 y 1,00). Hay un ~7 % de diferencia entre masa y embolsado: merma, o masa que se desvía.
- Aparece **PATEGRÁS como sabor embolsado (2.084 kg)**, pero no hay ninguna carga de producción "Pategrás", y el pategrás no está en la receta.
- Las bolsas existen como insumos (`Bolsas 1/2kg Clásico`, `Salame`, `Jamón`…) y su consumo se deduce directo de los kg por presentación. Por eso entrarían fácil en A3/A4 si se decide hacerlo ahora.

## 3. Tabla "receta vs. real" por insumo

La columna **real por masa** sale de Q5 cuando se autorice prod. Se calcula la **resolución del conteo** con una semana típica de 53 masas: un error de ±½ unidad contada, comparado con el consumo de la semana.

| Insumo | Receta (base / masa) | Unidad de compra | Unidades / masa | Consumo semana típica | Error de ±½ unidad | Real / masa | ¿Sirve el dato? |
|---|---|---|---|---|---|---|---|
| Fécula de mandioca | 30 kg | Bolsa 25 kg | 1,2 | 1.590 kg ≈ 64 bolsas | ±0,8 % | *pendiente prod* | **Sí.** Es el control del método: con R2, la fécula consumida es exactamente la cargada. Si no cierra a ±5 %, el problema es el balance (remitos, ventanas, pisados), no la receta. |
| Queso barra | 16,5 kg | Caja "16,5 kg" | 1,0 | 875 kg ≈ 53 cajas | ±0,9 % | *pendiente* | **Con reservas.** Cada caja pesa distinto y se factura en kg. Si un remito o "Ajustar stock" se cargó en kg sobre un stock en cajas, el período se rompe: verificar con Q6 y Q7 antes de leerlo. |
| Queso sardo | 4,5 kg | "Sardo" 3 kg | 1,5 | 239 kg ≈ 80 sardos | ±0,6 % | *pendiente* | **Con reservas.** El peso por horma es variable y el nombre de la unidad es ambiguo. |
| Margarina | 6 kg | Caja 10 kg | 0,6 | 318 kg ≈ 32 cajas | ±1,6 % | *pendiente* | **Sí.** |
| Huevos | 90 u | Cajón 360 u | 0,25 | 4.770 u ≈ 13 cajones | ±3,8 % | *pendiente* | **Sí,** pero se cuenta en otra lista y otro día que Global: la ventana es propia. ¿Cuentan maples sueltos? |
| Leche en polvo | 1,405 kg | Bolsa 20 kg | 0,07 | 74 kg ≈ 3,7 bolsas | **±13 %** | *pendiente* | **No por semana.** Solo agregando 4 semanas o más. Está marcada "a demanda". |
| Sal | 0,84 kg | Bolsa 20 kg | 0,042 | 45 kg ≈ 2,2 bolsas | **±22 %** | *pendiente* | **No por semana.** Solo agregada. Está marcada "a demanda". |
| Polvo de hornear | 0,3 kg | Pote 4 kg | 0,075 | 16 kg ≈ 4 potes | **±13 %** | *pendiente* | **No por semana.** Solo agregado. |
| Queso pategrás | — (no está en la receta) | Caja 9 kg | — | — | — | — | Fuera de la receta, archivado en dev. Pero hay 2 t de pategrás embolsado: ver preguntas. |
| Agregados (salame, jamón, maíz, cheddar, queso azul, anís, extra queso) | sin receta | varias | — | — | — | — | No se puede: no hay receta contra la cual comparar. |

**Caveats que invalidan un período** (marcarlos al leer Q4):
1. **El conteo pisa el stock.** Si alguien corrigió el conteo después de cerrarlo, o un conteo descartado pisó igual (Q8; en dev hay uno: Huevos del 24-09), el inicio real no es el contado.
2. **Unidad libre en remitos:** queso en cajas contra kg (Q6, Q7). Hasta A2b, el remito suma la cantidad tal cual se cargó.
3. **Pisado previo al 08-09 como `ajuste_manual`:** se infiere por fecha. Un ajuste real de Compras el mismo día se mezcla.
4. **Límite del día del conteo:** si se cuenta después de producir, hay que mover la producción de ese día al período anterior (cambiar `<` por `<=` en Q4).
5. **Historia corta:** el sistema nuevo carga producción desde agosto o septiembre de 2026. El ledger completo (`conteo_fabrica` con `conteo_id`) existe recién desde la migración del 08-09. Va a haber pocos períodos limpios: Q5 tiene que agregar todos.

### Validación técnica en dev
Q0 a Q8 corren sin error en dev. Q4 da desvíos de −100 % a +1.977 %, coherentes con datos de prueba: el conteo de 18.000 huevos a 1.800, o semanas sin producción con remitos. Esto confirma que el reporte detecta datos rotos. **No se interpreta ningún número de dev.**

## 4. Conclusiones

1. **Todavía no hay calibración con datos.** Prod no está autorizado, dev es de prueba y la planilla legacy no tiene stock. El método y las consultas están listos y validados. Calibrar es una corrida de Q4 y Q5 con la autorización, más la revisión de los caveats.
2. **R2 queda confirmado: masas = fécula / 30.** Contar filas sobrecuenta un 6,5 % en total y hasta un 16,5 % por mes en 2026. `masa_kg` no sirve como tercer criterio en el sistema nuevo, porque viene precargado.
3. **La receta base no explica todo:**
   - XTRA CHEESE agrega ~8,4 kg de masa cada 10 kg de fécula. Es el único agregado con peso visible en los datos.
   - Los "saborizados locales" salen de masa ya hecha, así que su agregado va por kg de masa.
   - Hay 2 t de pategrás embolsado sin receta.
   - Los saborizados son el 6,5 % de las masas: R1 (base + agregados) alcanza.
4. **La resolución del conteo semanal no alcanza para leche, sal ni polvo** (±13–22 % por semana). Se calibran agregando 4 semanas o más, o se dejan "a demanda" sin descuento automático. Fécula, quesos, margarina y huevos sí se pueden calibrar semana a semana (±1–4 %).
5. **Hay una señal de que la receta cambió en 2026:** la masa de 30 kg pasó de rendir 75 kg a 73 kg (−2,7 %) entre enero y abril. Antes de sembrar la receta v1 hay que confirmar con Marcos cuál es la vigente. La fécula es el control del método: si no cierra a ±5 %, primero se arregla el dato (remitos y pisados), no la receta.

## 5. Valores iniciales recomendados (seed de A3, en modo `simulacion`)

| Insumo | Valor inicial / masa | Fuente | Confianza | Cómo se calibra |
|---|---|---|---|---|
| Fécula | **30 kg** | Por definición (R2) | Alta | No se calibra: es el control del método. |
| Queso barra | **16,5 kg** | Config legacy | Media | Q5 con 4 períodos o más; se ajusta si \|dif\| > 5 %. |
| Queso sardo | **4,5 kg** | Config legacy | Media | Igual que el queso barra. |
| Margarina | **6 kg** | Config legacy | Media | Igual. |
| Huevos | **90 u** | Regla legacy | Media-alta | Igual, con las ventanas de la lista Huevos. |
| Leche en polvo | **1,405 kg** | Config legacy | Baja | Agregado mensual; se ajusta si \|dif\| > 10 %. |
| Sal | **0,84 kg** | Config legacy | Baja | Igual que la leche. |
| Polvo de hornear | **0,3 kg** | Config legacy | Baja | Igual que la leche. |
| Agregado XTRA CHEESE | **a definir** (los datos sugieren ~+25 kg de masa por masa equivalente de 30 kg de fécula) | Planilla | Baja | Respuesta de Marcos. |
| Otros agregados | **0 hasta que respondan** | — | — | Respuesta de Marcos. |

- **Umbrales sugeridos** para pasar de `simulacion` a `activo`, a validar con Marcos (R3): fécula ±5 %; quesos, margarina y huevos ±10 % sobre 4 períodos o más; leche, sal y polvo ±10 % sobre un mes o más.
- **`fabrica_rendimiento_masa`:** si Marcos confirma que hoy una masa rinde 73 kg, conviene pasar el precargado de 2,5 a 2,43. No afecta el consumo, que se calcula sobre la fécula, pero sí el reporte de rendimiento.

## 6. Preguntas para Marcos y Ricardo

**Del plan (se mantienen):**
1. ¿Qué lleva cada sabor con agregado, y cuánto por masa? Salame, jamón, maíz, anís, queso azul, cheddar, extra queso.
2. ¿La receta base es igual para todos los tamaños (chico y medio) y destinos (locales y congelado)?
3. Una devolución que se reinserta, ¿devuelve insumos o solo masa? En la planilla son 128 registros y 540 kg en 14 meses.
4. Leche, sal y pategrás: ¿se descuentan por receta o se siguen pidiendo a demanda?
5. Las bolsas por presentación al embolsar, ¿entran ahora o después? En la planilla son ~88.500 bolsas de 1/2 kg en 14 meses.

**Nuevas, salidas de los datos:**

6. **¿El conteo semanal se hace antes o después de producir ese día?** Define a qué semana va la producción del día del conteo.
7. **Desde enero de 2026, una masa de 30 kg de fécula rinde 73 kg y no 75. ¿Cambió la receta** (menos queso, menos líquido) **o cambió cómo se pesa?** ¿Cuál es la receta vigente hoy?
8. **Extra queso:** las cargas de 10 kg de fécula son casi todas extra queso, y rinden ~33 kg de masa en vez de ~25. ¿Cuánto queso extra lleva y de cuál (barra, sardo, otro)? ¿La carga de 10 kg es el lote estándar?
9. **Saborizados para locales:** son cargas sin fécula, de 0,3 a 8 kg. ¿Se hacen con masa clásica ya hecha, agregando el sabor? ¿Cuánto agregado por kg de masa?
10. **Pategrás:** aparece como sabor embolsado (~2 t) pero no como producción ni en la receta. ¿De qué masa sale y cuánto pategrás lleva?
11. ¿Cuánto pesa de verdad una caja de queso barra y un sardo? ¿Varían mucho de los 16,5 y 3 kg? Al contar, ¿anotan las cajas abiertas como fracción?
12. Huevos, leche, sal y polvo: ¿cuentan maples, bolsas y potes abiertos como fracción, o solo los enteros? Esto define si se pueden calibrar semana a semana.
13. Polvo de hornear: ¿el proveedor es Global o Montecarlo? En el legacy figura de las dos formas.
14. **¿Qué diferencia entre receta y conteo aceptan para dar la receta por buena** (5 %, 10 %)? ¿Quién la valida antes de pasar a consumo real?
15. **Para Ricardo:** el ~7 % de masa congelada que no aparece embolsada, ¿es merma esperable o hay que seguirla? Con producción, embolsado y receta conectados se puede reportar por semana.

## 7. Cuando se autorice prod: pasos
1. Correr Q8, Q6 y Q7 y anotar los períodos y los insumos con datos rotos.
2. Correr Q2 y verificar que fécula / 30 y filas difieran como en el legacy (+5 a +16 %).
3. Correr Q4. Descartar los períodos con `conteos_intermedios > 0` y revisar los que tengan `ajustes_dia_conteo > 0`. Comparar `real` contra `conteo_dice`.
4. Correr Q5 sobre los períodos limpios y llenar la columna "Real / masa" de la tabla de la sección 3.
5. Si la fécula no cierra a ±5 %, no tocar la receta: revisar las ventanas (pregunta 6) y los remitos.
