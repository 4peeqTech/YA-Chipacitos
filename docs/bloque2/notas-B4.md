# B4 — Devoluciones al proveedor + nota de crédito: notas de la ejecución

Rama `bloque2/pedidos` (sale de `qa` @ `c59eb64`). Spec: `docs/bloque2/plan-B4.md`. Decisiones D1–D7: las recomendadas de §13.

## Qué quedó

- **SQL:**
  - `supabase/migrations/20261006150000_compras_devoluciones.sql`: todo §3.
  - `supabase/migrations/20261006153000_compras_devoluciones_ajustes.sql`: los 3 arreglos del code-review (ver Desvíos).
  - Las dos están aplicadas **solo en dev**.
- **Escenarios:**
  - `docs/bloque2/escenarios-B4.sql`: S1–S22.
  - `docs/bloque2/escenarios-B4-ajustes.sql`: AJ1–AJ3.
- **Lógica pura:**
  - `lib/compras/devoluciones.ts` (nuevo);
  - `codigos.ts` (`codigoDevolucion`), `estadoPedido.ts`, `reportes.ts` (`a_favor`), `historialPedido.ts`, `diferencias.ts`, `rutas.ts` (`devolucion`);
  - `lib/errores.ts`.
- **Acciones y UI:** `app/admin/compras/pedidos/devoluciones/`:
  - `acciones.ts`, `datos.ts`, `useContextoDevolucion.ts`;
  - `DevolucionModal.tsx`, `NotaCreditoModal.tsx`, `AnularModal.tsx`, `AnularDesdeFactura.tsx`, `DevolucionesSeccion.tsx`.
- **Integración:**
  - Pedidos: `PedidoDetalle`, `PedidosClient`, `page`, `datos`, `modelo` y `MenuSecundario.tsx` (extraído del detalle).
  - Facturas: `FacturaForm`, `FacturasClient`, `NotaCreditoVista.tsx` (nuevo), `DiferenciasPanel`, `modelo`.
  - Motivos: `app/admin/proveedores/motivos-devolucion/`, `app/api/compras-devolucion-motivos/route.ts` y `layout.tsx`.
  - Plata: `components/compras/PagoFactura.tsx`, `FichaPaneles.tsx`, `proveedores/datos.ts`, `reportes/page.tsx` y `GastoPorProveedor.tsx`.
  - Además: `app/globals.css` (`.paso-entrada`, `.resaltable`) y `eslint.config.mjs`.

## Verificación

- **Escenarios SQL** (lote `begin … rollback`):
  - S1–S22: todos `ok`.
  - AJ1–AJ3: `ok`.
  - Invariante del ledger: **0**, dentro del lote y en dev después de cada push y de la QA.
  - `to_regclass` limpio en la corrida antes del push.
- **S23 (concurrencia):** se corrió después del push. Antes no se puede: el DDL de la migración toma locks exclusivos y la segunda sesión espera por ellos, no por el pedido.
  - Dos sesiones sobre P-0037, las dos revertidas: devolución contra devolución, y devolución contra `compras_guardar_remito`.
  - La segunda esperó 5,2 s el `for update` del pedido y siguió sin deadlock.
  - Que "la segunda ve el máximo nuevo" lo cubre S15b en secuencia: la primera devolución no se puede commitear en dev.
- **Checks puros:**

  | Check | Casos |
  |---|---|
  | `_check_devoluciones` | 58 |
  | `_check_estado` | 53 |
  | `_check_reportes` | 42 |
  | `_check_historial` | 44 |
  | `_check_diferencias` | 33 |
  | `facturas/_check_modelo` | 83 |
  | `remitos/_check_modelo` | OK |
  | El resto de `lib/compras/_check_*` | sin cambios, OK |

- **Tipos, lint y build:** `tsc --noEmit` limpio, `eslint` de lo tocado en 0 y `npm run build` OK.
- **`npm run types`:**
  - Después de `150000` trajo solo lo de B4: 3 tablas, columnas, RPC, helpers y vistas. Los `-` son un reordenamiento de relaciones de `compras_facturas`.
  - Después de `153000`: sin cambios.

### QA en el navegador

Playwright + Chromium 1223 contra `next dev` :3006, con dev. Las capturas están en el scratchpad de la sesión.

1. **Motivos:** los 6, cada uno con su chip.
2. **D1 en P-0079** (sin factura): Mal estado, 1 Caja con 16,4 kg, repone.
   - El pie y el confirm dicen "Resta 1 Caja… (queda en 185)" y "vuelve a Parcialmente recibido: espera la reposición".
   - Aparece el toast "D-0079-01 registrada".
   - La sección muestra la tarjeta; Ítems dice "2 · devuelto 1".
   - Qué sigue pasa a "Cargar remito" y el historial dice "Devolvió mercadería al proveedor".
3. **D2 desde la factura B4-QA-0101 de P-0080:** no repone, con NC 0001-B4QA0201.
   - El pie dice "baja de $ 59.411,00 a $ 34.606,00" y el toast lo repite.
   - En Facturas, la NC sale con el chip, "corrige B4-QA-0101 (D-0080-01)" y "−$ 24.805,00".
   - La vista de la NC linkea la factura y la devolución, y dice "Se descontaron $ 24.805,00 del gasto".
4. **D3:** Fécula 1, sin NC.
   - Qué sigue pasa a "Falta la nota de crédito (D-0080-02)".
   - La diferencia dice "Esperando la nota de crédito de D-0080-02" y ofrece el botón.
   - Se carga la NC 0001-B4QA0202 y el gasto baja a $ 31.641,50.
   - Qué sigue vuelve a Facturado.
5. **D4:** se anula D-0080-01, que tiene NC.
   - El modal dice "Vuelve a sumar 1 Caja… (queda en 185)", "sigue Facturado" y "el gasto vuelve a $ 56.446,50".
   - El gasto en la base queda en 56.446,50, pendiente.
6. **Precio mal facturado** sobre Queso Barra por kg, a $ 1.200: NC 0001-B4QA0203 por $ 2.020,70; el gasto queda en $ 54.425,80.
   - Antes, "Anular factura" ya avisa: "Esta factura tiene notas de crédito (N° 0001-B4QA0202 (D-0080-02))…".
7. **Deep link** `?pedido=…&devolucion=…`: la tarjeta aparece resaltada (`data-resaltado=true`). Al cerrar, la URL queda en `/admin/compras/pedidos`.
8. **qa-squad:**
   - Ve la sección sin montos.
   - No ve "Facturado y no entregado" ni el paso de la NC.
   - Registra "Producto equivocado" sin NC: D-0079-02 y D-0079-03. Son dos porque la primera corrida del script se cortó después de registrar.
9. **375 px**, oscuro y claro:
   - El modal ocupa la pantalla y el pie es sticky, con el botón visible y de 44 px.
   - No hay scroll horizontal en el modal ni en la sección.
   - Con las capturas se ajustó el pie (commit `5c668a0`).

### Datos que quedaron en dev

- **P-0079**, GLOBAL, sin factura:
  - D-0079-01: Queso Barra 1 Caja / 16,4 kg, repone.
  - D-0079-02 y D-0079-03: Fécula 1 Bolsa cada una, Producto equivocado, no repone, cargadas por qa-squad.
  - El pedido está Parcialmente recibido: espera la reposición de 1 Caja.
- **P-0080**, GLOBAL, factura B4-QA-0101:
  - D-0080-01 está anulada, y con ella su NC 0001-B4QA0201.
  - D-0080-02: Fécula 1, con NC 0001-B4QA0202.
  - D-0080-03: precio de Queso Barra, con NC 0001-B4QA0203.
  - El gasto queda Pendiente de pago en $ 54.425,80.
- Los escenarios SQL no dejan nada.

## Desvíos y decisiones de ejecución

1. **Segunda migración, `20261006153000`, aplicada en dev con el mismo OK.** El `code-review` (medium, al cierre) encontró 3 bugs reales en `150000`, que ya estaba aplicada:
   - **a.** Una devolución registrada **antes** de la factura quedaba "esperando NC" aunque la factura viniera neta (D1). `espera_nota_credito` ahora pide una de dos: que la devolución esté registrada contra la factura, o una diferencia > 0 abierta de ese insumo.
   - **b.** "Precio mal facturado" se podía acreditar dos veces sobre la misma línea. Ahora la RPC permite una sola corrección activa por línea, y el modal no ofrece una línea ya corregida.
   - **c.** Una devolución nueva le sacaba la diferencia a otra que seguía esperando su NC. `_compras_marcar_esperando_nc` ahora trabaja por pedido: la diferencia queda con la devolución más vieja que espera. `compras_anular_devolucion` también la llama.
2. **E13 al confirmar una factura posterior a la devolución (caso borde 8):** `compras_confirmar_factura` no se redefinió (§1.2), así que la diferencia +2 nace "pendiente" y no "Reclamo / esperando NC".
   - Con 1a, la devolución igual queda "Falta la nota de crédito".
   - Cuando se carga la NC, la diferencia se cierra.
   - Cualquier otra operación de devolución del pedido la marca.
3. **E14 (guarda R3)** no se aplica a "Precio mal facturado": no cambia cantidades, así que no puede chocar con un ajuste de stock.
4. **Anular una devolución sin mercadería** ("Facturado y no entregado" o "Precio") es solo para admin. La spec decía "Compras si no tiene NC"; se tomó D6: lo que corrige la factura es de admin.
5. **NC en el historial y en `v_compras_facturas`:** el link NC → devolución sale del código `D-…` que la RPC escribe en `observaciones`. Al anular la NC, `nota_credito_id` se limpia, y sin esto la NC anulada perdía su devolución.
6. **Toast con acción "Registrar devolución" después de un Reclamo:** el toast de la app no tiene acciones. El toast lo explica y la fila de la diferencia muestra el botón (`accionDevolucion`).
7. **Datos del modal a demanda:** `useContextoDevolucion` trae remitos, factura, gasto, motivos y stock al abrir, como el historial. Así el modal se abre igual desde el pedido, la factura o una diferencia. `page.tsx` solo carga `v_compras_devoluciones`, en tandas de 100.
8. **Prellenado de la factura con devolución previa:** la cantidad es llegó − devuelto, pero los kg no se prellenan si hubo devolución en esa línea. Habría que restar kg reales contra nominales.
9. **`remitos/modelo.ts` no se tocó:** no prellena con `pendiente`. Solo se le sumaron los campos nuevos de la vista al check.
10. **Dev server:** ya había un `next dev -p 3006` de este mismo worktree corriendo y se usó ese.
11. **Faltó lo de Gastos:** ninguna pantalla de Gastos muestra "pagado con nota de crédito" como forma distinta. Se ve en la forma de pago y en las observaciones del gasto.

## Mini-spec de diseño (`impeccable` shape, Operate)

- **Quién y dónde:** Marcos en la computadora y Compras en el celular, en la fábrica. Es la pantalla con más plata y stock en juego, así que manda el principio 2: el impacto antes de confirmar.
- **Estructura:** un solo modal con pasos numerados que aparecen a medida que se elige: Motivo → Qué se devuelve → ¿Repone? → Nota de crédito. Los motivos van en radio cards agrupadas ("Sale del stock" / "Corrige la factura"), con ícono por efecto.
- **Foco visual:** el **pie sticky con el impacto en vivo** (stock, estado, gasto), con el botón primario siempre visible. En 375 px, Cancelar y Registrar van lado a lado.
- **Ítems:** en filas apiladas, no en tabla, para que entren en 375 px.
  - Cada fila muestra "Llegó / ya devuelto / stock / máx." en `tabular-nums` e inputs alineados a la derecha.
  - Los kg aparecen solo en lo que se cobra por kg, con "necesarios para la NC" en ámbar.
- **Movimiento** (`emil-design-eng`):
  - Los pasos entran con opacidad y 6 px (200 ms, ease-out fuerte, `@starting-style`).
  - El anillo del deep link entra en 150 ms y se va en 600 ms.
  - `prefers-reduced-motion` deja solo la opacidad.
- **Sección Devoluciones:**
  - Una tarjeta por devolución, con chips de motivo, efecto y repone.
  - El bloque de NC es solo para admin.
  - El menú compacto `…` lleva "Cargar NC", "Anular NC" y "Anular devolución" (en rojo).
  - Las anuladas van al final, atenuadas y con el código tachado; con más de 2, se pliegan.
- **Anular:** chips de motivo rápido, el impacto en un bloque y el bloqueo conocido de antemano (gasto pagado después del descuento), con link al gasto.

**Pendiente de diseño (harden):** `TablaMaestra` todavía usa clases con hex propias. Es compartida y no se tocó en B4.

## Para el coordinador

- **Dueños:** los de §14, más `_compras_marcar_esperando_nc` (por pedido) y la regla de `espera_nota_credito`, ambas de `153000`.
- **Release:** hay que aplicar `150000` **y** `153000`, en ese orden. Antes, en prod, contar las NC (0 esperado) y los tipos de `compras_pedido_eventos`.
- **Para A4:**
  - `devolucion_id` en `v_compras_stock_movimientos` y el chip en `PanelMovimientos`.
  - La alternativa de D2, si se elige.
  - Si se quiere E13 al confirmar una factura posterior, redefinir `compras_confirmar_factura` o `compras_recalcular_diferencias_factura` para que llamen a `_compras_marcar_esperando_nc`.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar**, una vez mergeado B4 a `qa`. Entrás con `qa-admin@chipacitos.test`, salvo donde se indica otra cuenta.

1. **Proveedores › Motivos de devolución.**
   - Hay 6: 4 "Sale del stock", "Facturado y no entregado" y "Precio mal facturado".
   - Creá uno, cambiale "Qué pasa" y desactivalo.
   - Intentá borrar "Mercadería en mal estado": ya se usó, así que tiene que decir "desactivalo".
2. **Mercadería mal, el proveedor repone.** Ya está en **P-0079**, o podés hacer uno nuevo.
   - Pedido a GLOBAL con 2 Queso Barra y 3 Fécula, enviado, con remito de 33 kg.
   - Registrar devolución › Mercadería en mal estado › 1 Caja, 16,4 kg › "Sí, repone".
   - El confirm dice cuánto resta del stock y que el pedido vuelve a "Parcialmente recibido".
   - Aparecen la sección Devoluciones y el historial.
   - Cargá un remito de 1 Caja: el pedido pasa a Recibido.
3. **Con factura y nota de crédito.**
   - En la factura de un pedido: Registrar devolución › Mal estado › 1 Caja, 16,4 kg › No repone › "Ya llegó la nota de crédito".
   - El total da 16,4 × $/kg + IVA, y el pie dice "El gasto pendiente baja de $ X a $ Y".
   - Revisá Gastos › Pendientes.
   - La NC aparece en Facturas con "−" y el chip; abrila.
   - Ya hecho en **P-0080**: NC 0001-B4QA0202.
4. **La NC llega después.**
   - Hacé otra devolución sin NC: "Qué sigue" dice "Falta la nota de crédito" y la diferencia dice "Esperando la nota de crédito de D-…".
   - Cargá la NC: la diferencia desaparece y el gasto baja.
5. **Desde una diferencia.** P-0019 tiene una.
   - Resolver › Reclamo al proveedor.
   - En la fila aparece "Registrar devolución", que viene prellenado: "Facturado y no entregado", 1 Caja, con NC.
   - Registrá: la diferencia se cierra.
6. **Precio mal facturado.** En P-0080 ya hay una corrección (D-0080-03).
   - Probá registrar otra sobre la misma línea: ya no se ofrece.
   - En otra factura con Queso Barra por kg: precio correcto $ 50 menos. La NC dice "Diferencia de precio · Queso Barra…" y el stock no se mueve.
7. **Anular.**
   - Anulá una devolución con NC: el modal dice cuánto vuelve al stock y a cuánto vuelve el gasto. Después todo queda como antes, y el historial dice "Anuló una devolución".
   - Anulá solo una NC: la devolución queda "Falta la nota de crédito".
8. **Gasto ya pagado.** Pagá en Gastos el gasto de una factura y después cargale una NC.
   - Aparece el aviso "quedan a favor".
   - En Proveedores › GLOBAL › Cuenta aparece la tarjeta "A favor".
   - En Reportes › Gasto por proveedor aparece la columna "A favor".
9. **Devuelto.** En un pedido recibido completo y sin facturar, devolvé todo sin reposición: badge "Devuelto" y pestaña Devueltos.
10. **Lo que no se puede** (cada caso dice qué hacer):
    - devolver más de lo que llegó;
    - bajar el remito por debajo de lo devuelto;
    - anular una factura con NC: P-0080 avisa antes;
    - "Repone" en un pedido cerrado a mano;
    - una NC más grande que lo que queda de la factura.
11. **Con `qa-squad`:**
    - ve las devoluciones sin montos;
    - registra "Mercadería en mal estado" sin NC;
    - no ve "Corrige la factura" ni "Cargar nota de crédito".
12. **La plata cuadra.** En Reportes › Gasto por proveedor y en Proveedores › Cuenta: Pagado + Pendiente + Sin gasto + A favor = Facturado.
13. **Celular (375 px) y tema claro:**
    - el modal de devolución ocupa la pantalla y el botón queda abajo, siempre visible;
    - no hay scroll horizontal;
    - los kg se tocan bien.

**Manual `/ayuda`:** cambian las secciones Pedidos (Devoluciones y "Qué sigue"), Facturas (notas de crédito), Proveedores (Motivos y "A favor" en Cuenta) y Reportes. Se arma en la entrega final.
