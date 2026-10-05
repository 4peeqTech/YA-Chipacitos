# B0 — Navegación entre entidades

Rama `bloque2/pedidos` (sale de `qa`). Solo pantalla: sin migraciones ni SQL.

## Qué se hizo

- **`lib/compras/rutas.ts`**
  - `rutaDe({ tipo, id })` para pedido, remito, factura, gasto, insumo, solicitud, conteo y proveedor. Las 8 rutas se confirmaron en el código.
  - `rutaCargarDePedido('remito' | 'factura', pedidoId)` para "cargar remito/factura de este pedido" (`?pedido=`).
- **`components/ui/LinkEntidad.tsx`**
  - Variantes `codigo` (mono, tabular-nums), `texto` y `chip`, con el subrayado accent de la app y tokens semánticos.
  - `codigo` y `texto` heredan el color, así cada pantalla conserva su `text-text`/`text-muted`.
  - Hace `stopPropagation` en el clic y en el teclado, y acepta `onNavegar`.
- **`components/ui/useParamDeepLink.ts`**
  - `useQuitarParams(...nombres)`: al cerrar el modal saca el param con `router.replace` (sin scroll ni recarga).
  - `useAlCambiarParam(valor, fn)`: si llega un param nuevo sin desmontar la página, abre el modal que corresponde.
- **Links nuevos o reemplazados**
  - **P-xxxx:**
    - lista y modal de Remitos;
    - lista y modal de Facturas;
    - gasto (`GastoForm`);
    - ficha del proveedor;
    - reporte de gasto por proveedor;
    - reporte de historial de pedidos;
    - solicitud convertida.
  - **Remito:** historial del pedido y su sección "Remitos"; reporte de historial (fila expandida).
  - **Factura:**
    - de la factura a **su** gasto (`?gasto=<id>`, antes iba a "Gastos pendientes");
    - el chip "Factura N°" de la lista de Gastos;
    - el gasto vuelve a su factura;
    - reporte de gasto por proveedor.
  - **Insumo → Stock (`?insumo=`):**
    - líneas del pedido;
    - `DiferenciasPanel` (listas a resolver, ignoradas y resueltas);
    - reporte de movimiento de stock;
    - Insumos;
    - ficha del proveedor.
  - **Solicitud:** el origen del pedido (Complementario/Pedido base) lleva a su solicitud.
- **Params nuevos que lee su página**
  - `?solicitud=` en Solicitudes;
  - `?proveedor=` en Proveedores (abre la ficha);
  - `?insumo=` en Stock › Histórico (entra con el insumo elegido).
- **Solicitud convertida:** lista los pedidos que generó, con link (`compras_pedidos.solicitud_id`).
- **Push:** el de solicitud nueva lleva a `?solicitud=<id>`.
- **Limpieza del param al cerrar:** Pedidos, Remitos, Facturas, Gastos, Stock, Solicitudes y Proveedores. En el Histórico, el param se saca cuando se elige otro insumo a mano.

## Desvíos y decisiones

- **`onNavegar` existe, pero ninguna pantalla lo necesitó.** Todos los saltos van a otra página, y esa página desmonta el modal de origen. Si el destino es la misma página, `useAlCambiarParam` abre el modal nuevo. No se puede cerrar con `cerrarYa` antes de navegar: el `router.replace` de la limpieza le gana al `push` del link. Por eso Solicitudes, al generar pedidos, cierra sin limpiar la URL.
- **v_gastos no expone el `pedido_id` de la factura.** Para no tocar SQL, `gastos/page.tsx` consulta `compras_facturas(id, pedido_id)` y `armarGastos` recibe ese mapa (parámetro opcional).
- **`GastoForm`:** antes era un solo `<Link>` a la factura con el P-xxxx adentro. Ahora son dos links hermanos (no se pueden anidar `<a>`).
- **Ficha de Proveedores:** la carga de insumos y pedidos pasó a un efecto sobre el id de la ficha, con guarda para respuestas viejas. Así el deep link y el clic usan el mismo camino. El resto de la pantalla no cambió (sigue con su estilo viejo: no se rediseñó).
- **Lo que quedó afuera a propósito:**
  - **`StockFicha.tsx`:** su link a remito sigue armado a mano, porque lo reescribe A1.
  - **Conteos:** ni `?conteo=`, ni `ConteoDesplegable`, ni `admin/fabrica/conteos`.
  - **`CabeceraRemito` y `CabeceraFactura`:** son encabezados de diálogos de confirmación, sin links.
  - **`?dia=` de `SelectorDia`:** no es una entidad.
- **Costo de limpiar con `router.replace`:** es una navegación suave a la misma ruta, así que la página vuelve a pedir sus datos al servidor. Por eso el param desaparece de la URL ~1–2 s después de cerrar, mientras el modal se cierra al instante.

## Verificación

- `npx tsc --noEmit`: limpio.
- `npm run build`: sin errores.
- `eslint` sobre todos los archivos de la rama: 0 errores. Hay 3 warnings que ya estaban en `InsumosClient.tsx:188`.
- QA en el navegador contra dev (`fafckqysyvtlslfnpzrh`), `localhost:3006`, con `qa-admin@chipacitos.test`. 14 saltos OK:
  1. Remitos (lista) → P-0031: abre el pedido y no el remito de la fila.
  2. Pedido P-0031 → "Complementario" → su solicitud.
  3. Solicitud convertida → "Pedidos que generó" → P-0031.
  4. Cerrar el pedido abierto por link: se va `?pedido=` y recargar no lo reabre.
  5. Pedido → insumo de una línea → ficha de Stock.
  6. Historial del pedido → R-0031-02 → modal del remito.
  7. Factura P-0016 → "Gasto pendiente de pago" → **su** gasto.
  8. Gasto → N° de factura → vuelve a la factura.
  9. Facturas (lista) → P-0016 en la fila → pedido, sin abrir la factura.
  10. `?proveedor=` → ficha con links a insumos y pedidos → P-0016.
  11. Cerrar la ficha del proveedor limpia el param y recargar no la reabre.
  12. Insumos → nombre → ficha de Stock.
  13. `/admin/compras/stock/historico?insumo=` entra con el insumo elegido.
  14. Reportes › Historial → P-0029 en una fila expandible → pedido. Además, en el gasto, el link al pedido P-0016 lleva al pedido.
  
  Remito por deep link: al cerrar y recargar no se reabre.
- **No probado en el navegador:**
  - **Chip "Factura N°" de Gastos:** no hay gastos de factura en octubre (el filtro arranca en el mes actual). El código es el mismo `LinkEntidad` que en los otros saltos.
  - **Push con `?solicitud=`:** no se generó ninguna solicitud nueva.

## Lista de pruebas para el usuario

En `https://qa.yachipacitos.com.ar`, con `qa-admin@chipacitos.test` (contraseña en `docs/qa-credenciales-dev.md`), cuando la rama esté en `qa`:

1. **Compras › Remitos.** Tocá el código P-xxxx de una fila. Tiene que abrir el pedido en Pedidos, no el remito.
2. **En ese pedido:**
   - Tocá "Complementario" (o "Pedido base") arriba. Tiene que abrir la solicitud que lo generó.
   - Más abajo dice "Pedidos que generó". Tocá el P-xxxx y tenés que volver al pedido.
3. **En el pedido:**
   - Tocá el nombre de un insumo de la tabla de ítems. Tiene que abrir su ficha en Stock.
   - En el Historial, tocá el código R-xxxx-xx de "Llegó un remito". Tiene que abrir ese remito.
4. **Compras › Facturas.**
   - Abrí una factura confirmada que tenga gasto (por ejemplo, la de P-0016).
   - Tocá "Gasto pendiente de pago…". Tiene que abrir **ese** gasto en Gastos, no la lista de pendientes.
   - En el gasto, tocá el N° de factura. Tenés que volver a la factura.
   - En el gasto, tocá el P-xxxx. Tiene que abrir el pedido.
5. **Gastos.** Elegí un período con gastos de facturas (septiembre) y tocá el chip "Factura N°" de una fila. Tiene que abrir la factura, no el gasto.
6. **Proveedores.**
   - Abrí la ficha de un proveedor de insumos. Los insumos y los últimos pedidos son links.
   - Copiá la URL con `?proveedor=`, cerrá la ficha y pegala en otra pestaña. Se tiene que abrir la misma ficha.
7. **Compras › Insumos.** Tocá el nombre de un insumo. Tiene que abrir su ficha en Stock.
8. **Compras › Stock › Histórico.** Entrá a `/admin/compras/stock/historico?insumo=<id>` (el id de la URL del paso 7). Tiene que entrar con ese insumo elegido.
9. **Reportes.** En "Historial de pedidos y remitos", tocá el P-xxxx de una fila. Tiene que ir al pedido, sin expandir la fila. La fila expandida tiene el remito como link. En "Movimiento de stock", el nombre del insumo lleva a Stock.
10. **Cierre y recarga.** Desde cualquiera de estos saltos, cerrá el modal y recargá la página (F5). El modal **no** tiene que volver a abrirse y la URL ya no tiene `?pedido=`, `?remito=`, etc.
11. **Push de Fábrica.** Cuando Fábrica cierre un conteo y llegue el aviso "Nueva solicitud de Fábrica", tocalo. Tiene que abrir esa solicitud, no la lista.
