# A2b — Unidades de medida (notas de cierre)

> Rama `bloque2/stock`, rebaseada sobre `origin/qa` @ `1c80707` (B2 adentro). Spec: [`plan-A2b.md`](plan-A2b.md). Decisiones: **D1–D5 van todas las recomendadas** (kg por regla con lista de revisión; los quesos por kg se configuran a mano; el peso variable solo avisa; no se recalculan facturas viejas; "Actualizar precios" también cambia el `cobra_por`).
> La migración `20261005180000` **ya está aplicada en dev** (`fafckqysyvtlslfnpzrh`). En prod no.

## Lo hecho

| Parte | Archivos |
|---|---|
| Migración (§3) | `supabase/migrations/20261005180000_compras_unidades_medida.sql`: `unidad_base` / `cobra_por_default` / `cobra_por` / `cantidad_base` / `precio_por`; `subtotal` e `iva` con `SET EXPRESSION` y control de totales; RLS de solo lectura en remitos y facturas; helpers (`compras_lineas_remito_snapshot`, `compras_diff_lineas_remito`, `_compras_cobra_por`); RPCs redefinidas (`guardar_insumo`, `guardar_remito`, `eliminar_remito`, `guardar_factura`, `confirmar_factura`, `anular_factura`); `compras_diferencias_calculadas` con kg; tres vistas con columnas nuevas al final; backfill de `remito_creado` |
| Escenarios SQL (§9.2) | `docs/bloque2/escenarios-A2b.sql` (S1–S19) |
| Tipos | `lib/database.types.ts` (regenerado tras el push) |
| Lógica pura (§5) | `lib/compras/unidades.ts` + `_check_unidades.ts` (nuevos), `totalesFactura.ts` (cantidad cobrada) |
| Insumos (§7.1, §7.2) | `insumos/InsumoModal.tsx` (bloque Unidades con ejemplo vivo; "Cobra por" por proveedor con el precio convertido; historial), `InsumosClient.tsx` (≈ kg, `/Caja` o `/kg`), `acciones.ts`, `page.tsx` |
| Stock (§7.2) | `stock/StockClient.tsx`, `StockFicha.tsx`, `page.tsx`: solo el ≈ kg |
| Pedido (§7.3) | `pedidos/PedidoEditor.tsx` (unidad fija en las líneas con insumo, ≈ kg), `acciones.ts` (E12: `guardarPedido` toma la unidad del insumo), `datos.ts`, `PedidoEnvio.tsx`, `lib/compras/pedidoMensaje.ts` ("2 CAJAS (~33 KG)") |
| Historial (§6) | `lib/compras/historialPedido.ts` + `_check_historial.ts`, `pedidos/PedidoDetalle.tsx` (eventos de remito con kg, fecha, N° y "Se descontó") |
| Remito (§7.4) | `remitos/RemitoForm.tsx` ("kg reales" + aviso del 10 %; toast "Sin cambios"), `modelo.ts`, `acciones.ts`, `datos.ts`, `_check_modelo.ts` |
| Factura (§7.5) | `facturas/FacturaForm.tsx` (cajas + Cobra por + Kg + precio por kg, avisos), `modelo.ts`, `acciones.ts`, `datos.ts`, `ConfirmarFacturaModal.tsx` ("pasa a cobrarse por kg"), `_check_modelo.ts` |
| Diferencias (§7.6) | `lib/compras/diferencias.ts` + `_check_diferencias.ts`, `facturas/DiferenciasPanel.tsx` |
| B2 (§7.7) | `lib/compras/comprobanteFactura.ts`, `cargarComprobante.ts`, `facturaMensaje.ts`, `ComprobanteImagen.tsx`, `_check_comprobante.ts` |

## Desvíos (aprobados por el coordinador)

1. **`v_compras_factura_diferencias` calcula los kg en la propia vista** y no llama a `compras_diferencias_calculadas`. El plan asumía que la vista podía llamar a la función revocada. En Postgres, el `EXECUTE` de una función se chequea contra **quien consulta**, no contra el dueño de la vista, así que `authenticated` recibía "permission denied" (salió en el S12). La regla es la misma: kg reales, o nominales si falta alguno. La función igual devuelve las columnas nuevas.
2. **13 insumos en kg, no 9.** Son 8 de Materia prima (sin los huevos), más "Prueba 1" (que ya tenía la unidad "kg") y los 4 "(kg)". El "9" del plan era un error de conteo: la regla es la del plan.
3. **"Actualizar precios" cuenta por insumo** (vale la última línea, como hace la RPC) y solo cuenta los insumos con un proveedor activo. Antes contaba líneas, aunque la RPC no las fuera a tocar.
4. **Los kg de una línea de factura solo viajan si la línea cobra por kg.** Si se pasa a "por Caja", los kg ocultos no se guardan.
5. **En la imagen del comprobante, los kg van en una segunda línea chica** dentro de la celda: "2 caja" y abajo "33,4 kg"; "$ 1.250,00" y abajo "/kg". Así no cambia el alto de la fila (`altoComprobante`).
6. **Los textos de error de la RPC de factura** usan la unidad base del insumo (kg o litros), como permitía la nota del §3.9.
7. **Arreglo extra:** la cabecera del remito (Pedido / N° / Llegó el) se salía 36 px a 375 px por el nombre largo del pedido. Le agregué `min-w-0` a los hijos de la grilla. No era de A2b, pero el archivo estaba en alcance.

## Verificación

- **Escenarios S1–S19** contra dev, pegados detrás de la migración en un `begin … rollback`. Todo dio lo esperado:
  - **S1:** 13 en kg, Huevos en unidades, los 14 pares con precio en `unidad`, 11 `remito_creado` de backfill y los 7 checks.
  - **S2:** 0 facturas con la cabecera distinta de sus líneas.
  - **S3:** el historial de Queso Barra, los errores de "metros" y de "falta la unidad base", y el conflicto de `cobra_por`.
  - **Remito, S4–S8:** +2 de stock (no 33,4); un cambio solo de kg no mueve stock y deja el diff con `antes.cantidad_base`; 2 → 3 cajas mueve +1; guardar igual da `cambios: false`.
  - **Factura, S9–S11:** subtotal 41.750 e IVA 8.767,50; el remito automático lleva los kg; el precio pasa a 1.250 por kg, con 2 filas de historial "factura".
  - **S12–S13:** diferencia de 1 caja con los kg reales de los dos lados; el ajuste mueve +1, no 17,2.
  - **S14 y S16:** `remito_eliminado` con el motivo y los kg.
  - **S15:** la factura de P-0027 muestra kg nominales.
  - **S17:** el `insert` y el `update` directos dan "permission denied".
  - **S18:** la vista de pendiente trae la unidad, el `cobra_por` y los kg.
  - **S19:** ledger en 0.
  - Después de cada corrida, dev quedó intacto.
- **Concurrencia (E15):** se reprodujo con dos sesiones de dev que simulan los bloqueos con SQL (no llaman a las RPC), las dos revertidas. Con `FOR UPDATE` en el insumo aparece `40P01` (deadlock). Con `NO KEY UPDATE`, las dos terminan.
- **`db push` a dev:** se hizo en orden: rebase, dry-run (solo `20261005180000`), push y `npm run types` (solo trajo cambios de A2b). Ledger en 0 antes y después de la QA.
- **Chequeos puros:**

  | Chequeo | Resultado |
  |---|---|
  | `_check_unidades` | 32 |
  | `_check_totales` | 42 |
  | `_check_historial` | 35 |
  | `_check_diferencias` | 24 |
  | `_check_comprobante` | 11/11 |
  | `_check_modelo` de remitos | OK |
  | `_check_modelo` de facturas | 80 |

- **`tsc --noEmit` limpio, `eslint` de los archivos tocados limpio y `npm run build` OK.** Sin colores hex nuevos y sin `as any`.
- **QA en el navegador** (local :3005 contra dev, `qa-admin`):
  1. **Insumos.**
     - La lista muestra "179 Caja ≈ 2.953,5 kg" y "$ 2.000 /Caja".
     - La ficha muestra el bloque Unidades con el ejemplo vivo ("1 Caja = 16,5 kg…").
     - Pasé el default y GLOBAL a kg. El precio se convirtió a 121,2121, con la nota "Convertido de $ 2.000,00 /Caja (÷ 16,5)".
     - "Cambios" muestra las 3 líneas. La 4.ª del plan (`unidad_base`) no aparece porque Queso Barra ya estaba en kg.
  2. **Pedido nuevo P-0037 a GLOBAL.** "Caja" y "Bolsa" aparecen fijas, y "≈ 33 kg" solo en Queso Barra. El mensaje dice `— 2 CAJAS (~33 KG) QUESO BARRA` y `— 3 BOLSAS FÉCULA DE MANDIOCA`. Quedó enviado.
  3. **Remito R-0037-01.**
     - "kg reales" aparece solo en Queso Barra, con el nominal 33 de placeholder.
     - Con 29 kg avisa "Pesó 12 % menos". Con 33,4 se guarda; el impacto es +2 Caja y +3 Bolsa.
     - Al editar solo los kg a 32,9: "Con estos cambios el stock no se mueve". Queda el `remito_editado` con `antes.cantidad_base = 33.4`.
  4. **Factura A2B-QA-0001.**
     - Prellenada por kg con los 32,9 kg del remito.
     - Con 33,4 kg a $ 1.250: subtotal $ 41.750, aviso "0,5 kg más que el remito" y "≈ $ 20.625 por Caja nominal".
     - Cambiar a Caja y volver a kg convierte el precio (20.625 ↔ 1.250).
     - Con "Actualizar precios", el modal avisa 1 precio. Al confirmar: `precio_ref` 1250 / `base`, con historial "factura" y 0 diferencias.
  5. **Diferencias (A2B-QA-0002, P-0019).** Remito de 1 Caja / 16,2 kg contra factura de 2 Caja / 33,4 kg. El panel muestra "Facturado 2 Caja (33,4 kg) · llegó 1 Caja (16,2 kg)".
  6. **Compartir A2B-QA-0001.**
     - La imagen PNG sale con "2 caja / 33,4 kg", "$ 1.250,00 /kg" e IVA 21 % sobre $ 49.100.
     - El mensaje dice `— 2 CAJA (33,4 KG) QUESO BARRA: $ 41.750,00`.
  7. **Anular A2B-QA-0003** (P-0018, confirmada con "ya llegó"). Se borró el remito automático y el stock volvió. Quedó `remito_eliminado` con el motivo "Se anuló la factura A2B-QA-0003: Datos mal cargados" y los 33,1 kg.
  8. **375 px y tema claro.** Factura, remito y ficha del insumo, sin scroll horizontal (el remito, después del arreglo del desvío 7). Guardar sin kg da "Cargá los kg de Queso Barra: se cobra por kg.".
  9. **Consola:** solo el aviso LCP del logo, que ya estaba antes.
- **Límites del navegador de pruebas (no son de A2b):**
  - Ese navegador no corre `requestAnimationFrame`. Eso traba el revelado del streaming de Next (`$RC`) y el `useEffect` del historial del pedido, que queda en "cargando" también en pedidos viejos como P-0005.
  - Lo resolví parcheando `requestAnimationFrame` en la página.
  - El historial lo verifiqué contra la base y con `agruparEventos` sobre los eventos reales de P-0037: "Llegó un remito" y "Editó el remito" parsean bien.
  - La imagen la bajé de la ruta con la sesión de qa-admin.

## Lista de revisión de dev (los `raise notice` de la migración)

El push no muestra los `notice`. Esta es la misma consulta corrida después del push.

**En kg (13)** — confirmar que la base sea kg:
Ananá (kg) → sin unidad = 1 kg · Fécula de Mandioca → 1 Bolsa = 25 kg · Frutilla (kg) → sin unidad = 1 kg · Frutos Rojos (kg) → sin unidad = 1 kg · Leche en Polvo → 1 Bolsa = 20 kg · Mango (kg) → sin unidad = 1 kg · Margarina → 1 Caja = 10 kg · Polvo de Hornear → 1 Pote = 4 kg · Prueba 1 → 1 kg = 1 kg · Queso Barra → 1 Caja = 16,5 kg · Queso Pategrás (archivado) → 1 Caja = 9 kg · Queso Sardo → 1 Sardo = 3 kg · Sal → 1 Bolsa = 20 kg.

**Sin unidad de compra (41)** — hay que cargársela:
Ananá (kg), Azúcar en Sobre (cajas), Bobinas Papel Ya! Chipacitos, Bolsas 1/2kg Anís, Bolsas 1/2kg Cheddar, Bolsas 1/2kg Clásico, Bolsas 1/2kg Jamón, Bolsas 1/2kg Maíz, Bolsas 1/2kg Queso Azul, Bolsas 1/2kg Salame, Bolsas 10kg, Bolsas 2kg, Bolsas 5kg, Bolsas Camiseta Chica 30x40, Bolsas Camiseta Grande 40x50, Bolsas Papel N°3, Bolsas Papel N°6, Café 1kg (paquetes), Cajas para Congelados, Cajitas Felices, Cajones de Huevos B1, Crema Pastelera, Dulce de Leche, Edulcorante en Sobre (cajas), Embutidos varios, Frutilla (kg), Frutos Rojos (kg), Guantes Nitrilo Negro Talle L, Guantes Nitrilo Negro Talle XL, Jamón (piezas), Jamón Cocido Trozer, Leche Entera x12 Cajitas (cajas), Maíz Cremoso 25kg (bolsas), Mango (kg), Medialunas, Productos de Limpieza Varios, Salame Fox 201 (piezas), Tapas, Tradicionales, Vasos Smoothie, Vigilantes.

**Contenido 1 con una unidad que no es la base (4):** Ananá (kg), Frutilla (kg), Frutos Rojos (kg), Mango (kg). Las 4 sin unidad: cargarles "kg".

**FACTURA EN OTRA UNIDAD:** 0 en dev.

Atención con los nombres que traen la unidad, como "Café 1kg (paquetes)", "Maíz Cremoso 25kg (bolsas)", "Bolsas 1/2kg …" y "Cajones de Huevos B1". Quedaron en unidades porque el nombre no termina en "(kg)". Revisar si alguno debería ir en kg con su contenido.

## Datos que quedan en dev

- **Queso Barra se cobra por kg:** el default y el par GLOBAL, a $ 1.250 /kg desde la factura. Queda así a propósito, para la prueba del usuario.
- **P-0037 (GLOBAL):** enviado. Tiene el remito R-0037-01 (2 Caja / 32,9 kg + 3 Bolsa) y la factura **A2B-QA-0001** confirmada (+ gasto pendiente de $ 59.411).
- **P-0019:** remito de 1 Caja / 16,2 kg y factura **A2B-QA-0002** confirmada, con 1 diferencia pendiente y su gasto.
- **P-0018:** factura **A2B-QA-0003** anulada. Su remito automático se borró y el gasto también.
- **Stock de Queso Barra:** 179 → 182 Caja (+2 de P-0037, +1 de P-0019).

## Para otras fases

- **B3:** la pestaña Insumos del proveedor puede mostrar el `cobra_por` del par y el precio con su sufijo (`etiquetaCobraPor`).
- **B4:** una nota de crédito es una `compras_facturas` con las mismas líneas (`cantidad_base`, `precio_por`). La devolución mueve stock en cajas. Necesita A2b mergeada.
- **A2c:** la ficha conectada puede usar `textoBaseItem` / `textoEquivalencia` para los kg. Las líneas de remito traen `cantidad_base`.
- **A3:** la receta en unidad base puede leer `compras_items.unidad_base`. `calculoSugerido` sigue con `cantidad_por_unidad` como contenido.
- **Release (§11.3):** antes de aplicar en prod, correr `select version()` (tiene que ser ≥ 17 por el `SET EXPRESSION`; si no, ir al plan B del §3.3) y la consulta "FACTURA EN OTRA UNIDAD" en solo lectura (D4). Después, pasarle al usuario la lista de revisión de prod.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, **una vez mergeado a `qa`**:

1. **Compras › Insumos.** Recorrer la lista de revisión de arriba. Cargarle la unidad de compra a los que no tienen y confirmar que la unidad base (kg / unidades) de cada uno sea la correcta.
2. **Abrir Queso Barra.** → El bloque "Unidades" dice "1 Caja = 16,5 kg" y cuánto stock hay en cajas y en kg. Ya viene cobrando por kg. Probar en otro insumo con contenido (Margarina, Caja de 10 kg): cambiar "Por defecto se cobra por" a kg y, en la fila del proveedor, "Cobra por" a kg → el precio de referencia se convierte a $/kg con la nota "Convertido de…". Guardar: en "Cambios" figuran los cambios. Si no corresponde, volverlo a "Caja".
3. **Insumos (lista).** → Queso Barra muestra el stock con "≈ … kg" y el precio de referencia "/kg". Un insumo sin conversión (Bolsa Consorcio) muestra "/Unid." y no tiene "≈".
4. **Pedidos › Crear pedido a GLOBAL con 2 de Queso Barra.** → La unidad "Caja" no se puede editar y debajo de la cantidad dice "≈ 33 kg". Generar el mensaje → dice "2 CAJAS (~33 KG) QUESO BARRA". Enviarlo.
5. **Remitos › Cargar el remito de ese pedido.** → Solo Queso Barra tiene "kg reales". Poner 29: avisa que pesó 12 % menos. Corregir a 33,4 y guardar → el stock sube 2 cajas (no 33).
6. **Editar el remito y cambiar solo los kg a 32,9.** → "Con estos cambios el stock no se mueve". En el detalle del pedido, el historial dice "Editó el remito · Queso Barra 2 Caja · 33,4 → 32,9 kg".
7. **Facturas › Cargar la factura de ese pedido.** → La línea de Queso Barra viene "por kg" con 32,9 kg. Cambiar a 33,4 → avisa "0,5 kg más que el remito". Con un precio de 1.250, el subtotal es 33,4 × 1.250 = $ 41.750.
8. **Marcar "Actualizar los precios de referencia" y confirmar.** → En Insumos › Queso Barra › Cambios: "Precio ref. … (por factura)". Si cambiaste "Cobra por" en la línea, el modal avisa "pasa a cobrarse por…".
9. **Diferencias.** Si la factura dice 2 cajas y llegaron 2: no hay diferencia, aunque los kg no coincidan exacto. En otro pedido con un remito de 1 caja y una factura de 2: la diferencia es de 1 Caja y muestra los kg de cada lado (ya hay una en A2B-QA-0002, de P-0019).
10. **Compartir la factura** (imagen y mensaje). → La línea dice "2 CAJA (33,4 KG)", la imagen muestra "33,4 kg" debajo de la cantidad y "/kg" debajo del precio, y el IVA da bien.
11. **Anular una factura confirmada con "ya llegó la mercadería"** (sin remitos antes). → El stock vuelve y el historial del pedido dice "Eliminó el remito · Motivo: Se anuló la factura …" con lo que se descontó.
12. **Una factura vieja** (P-0027). → Se ve igual que antes, con los mismos totales.
13. **Un insumo que no se pesa** (Bolsa Consorcio). → En pedido, remito y factura no aparece nada nuevo.
14. **Celular (375 px) y tema claro.** → El remito y la factura se leen sin scroll horizontal y los campos de kg se tocan bien.
