# B2 — Compartir factura

Rama `bloque2/pedidos`, rebaseada sobre `qa` con A2a (`b11d729`). Spec: `docs/bloque2/plan-B2.md`.
Migración `20261005170000_compras_plantillas_tipo.sql`, **aplicada en dev** (`fafckqysyvtlslfnpzrh`) el 2026-10-05. Prod no se tocó.

Decisiones del usuario (§14), todas con la opción recomendada:

| # | Decisión |
|---|---|
| D1 | `next/og`; `html-to-image` queda como plan B |
| D2 | Sello + "COMPROBANTE INTERNO" + pie, sin marca de agua |
| D3 | WhatsApp de la administración configurable en Plantillas › Factura |
| D4 | Compartir no deja eventos ni guarda el mensaje |
| D5 | Sin observaciones ni "total según el papel" |

## Qué se hizo

- **Base:** `tipo` (`pedido` | `factura`) en `compras_plantillas_mensaje`, una default por tipo (`idx_plantilla_default_por_tipo`), seed "Factura estándar", RPC atómica `compras_marcar_plantilla_default` (exige admin y plantilla activa) y `compras_config` `factura.whatsapp_admin = ""`.
- **Lógica pura:**
  - `lib/compras/comprobanteFactura.ts`: datos, fechas, nombre del archivo, alto de la imagen.
  - `lib/compras/facturaMensaje.ts`: `renderPlantillaFactura`, variables, ejemplo y fallback.
  - `lib/compartir.ts`: WhatsApp, portapapeles, `share` y descarga. `linkWhatsApp` se mudó acá.
  - Chequeo en `lib/compras/_check_comprobante.ts`.
- **Servidor:**
  - `cargarComprobante`: con la sesión del usuario, sin service role.
  - Ruta `GET /api/compras/facturas/[id]/comprobante`: PNG con `next/og`, fuentes DM Sans y Syne en `assets/fonts` (OFL).
  - Server actions `facturas/compartir.ts` y `proveedores/plantillas/acciones.ts`.
- **UI:**
  - `components/ui/Pestanas.tsx` y `components/ui/CompartirMensaje.tsx`. `PedidoEnvio` usa `CompartirMensaje`.
  - `CompartirFacturaModal` con las pestañas Imagen y Mensaje. El botón **Compartir** aparece en el pie de una factura confirmada.
  - Plantillas: filtro Pedido / Factura (`?tipo=`), variables y vista previa por tipo, y la tarjeta del WhatsApp de la administración.
  - Pedidos lee solo las plantillas de tipo `pedido`.

## Desvíos del plan

1. **Alto del comprobante:** contar caracteres no alcanzaba. El plan cortaba en 34 caracteres, pero en la QA una descripción de 22 ya pasaba a dos renglones (la columna mide 344 px).
   - `lineaEsDoble` estima el ancho en em de DM Sans (`anchoEstimadoEm`, con un tope de 14,4 em).
   - La base subió de 900 a **1010** px: el sello va en el flujo, y el pie pasó a dos renglones fijos para que el largo de los nombres no lo desborde.
   - Se suman 48 px por cada alícuota con IVA después de la primera.
2. **El sello va en el flujo, no en `position: absolute`.** Absoluto pisaba números de factura largos. Sigue arriba a la derecha, rotado −6°, debajo de "COMPROBANTE INTERNO".
3. **La clave de `outputFileTracingIncludes` lleva los corchetes escapados:** `'/api/compras/facturas/\\[id\\]/comprobante'`. Es un glob de picomatch: sin escapar, `[id]` se lee como una clase de caracteres. El `nft.json` incluye además `OFL.txt`.
4. **La ruta tipa `params` a mano** (`{ params: Promise<{ id: string }> }`). `RouteContext` necesita los tipos generados por `next typegen`, y `tsc --noEmit` suelto no los tiene.
5. **`cargarComprobante` también devuelve 500** si falla una lectura. El plan listaba solo 401, 403, 404 y 409.
6. **`components/ui/Modal.tsx`** (fuera de la lista): el efecto del Escape dependía de `onClose`, que suele ser una arrow inline. Cada render del padre sacaba el modal de la pila y lo volvía a meter arriba: alcanzaba el toast "Imagen descargada". Resultado: el Escape cerraba la factura **y** el modal de compartir. Ahora `onClose` va en un ref. El bug es previo y afectaba a cualquier par de modales apilados.
7. **Plantillas usa `window.history.replaceState`**, no `router.replace`. `router.replace` volvía a pedir la página al servidor. Un clic durante ese refetch (por ejemplo, en la estrella) se perdía en la QA automatizada.
8. **`facturas/_check_modelo.ts`:** se sumó `tipoComprobante` al fixture de `FacturaVista` para que compile. Es una línea; A2b puede tocar el mismo archivo.
9. **Cantidades del mensaje con coma decimal** (`12,5 KG`). El del pedido usa punto.
10. **`database.types.ts`:** `tipo` y la RPC se sumaron a mano antes del push. Después, `npm run types` salió **idéntico**: no cambió nada más.
11. **Pie de la factura:** en la vista solo lectura, "Compartir" queda a la derecha de "Cerrar" en desktop y arriba de todo en celular, como pide el plan.

## Verificación

- **SQL** (lote revertido, con la migración completa): T1–T10 OK.
  - "Factura estándar" queda default y "Pedido estándar" sigue default.
  - La segunda default de factura da `unique_violation`; `tipo = 'otro'` da `check_violation`.
  - La RPC: con una plantilla inactiva da "Activá la plantilla…"; con un id inexistente, "La plantilla no existe"; como qa-squad, "No autorizado".
  - qa-squad lee 3 plantillas de factura y su `update` afecta 0 filas. `anon` no puede ejecutar la RPC.
  - La base quedó limpia.
- **Push a dev:** el dry-run mostró solo `170000`. Después del push, T1, T2 y T10 contra la base real dan bien.
- **Chequeos:** `_check_comprobante` 10/10, `_check_historial` 26/26, `facturas/_check_modelo` 63/63.
- **Compilación:** `tsc --noEmit` limpio y `eslint` limpio en todos los archivos tocados. `npm run build` OK.
- **`route.js.nft.json`:** lista las 4 TTF, `OFL.txt` y `chipacitos-logo.png`.
- **Ruta, local en :3006:**

  | Pedido | Resultado |
  |---|---|
  | Sin sesión | 401 |
  | qa-squad | 403 |
  | Factura anulada | 409 |
  | Id inexistente | 404 |
  | P-0016 (admin) | 200, PNG de 1080 × 1200, `Content-Disposition: inline; filename="Factura-0001-00000777-HUEVO-CAMPO.png"`, `Cache-Control: private, no-store` |
  | P-0027 (admin) | 200, 1080 × 1522 |

- **QA en el navegador** (Playwright headless, Chromium 1223, cuentas qa-admin y qa-squad):
  - **P-0016:** Compartir abre el modal.
    - Descargar baja `Factura-0001-00000777-HUEVO-CAMPO.png`, con IHDR de 1080 × 1200 = `altoComprobante`. Revisé la imagen: tiene el sello, "COMPROBANTE INTERNO", 0001-00000777, HUEVO CAMPO, P-0016, R-0016-02, la línea, IVA $ 3.360,00, total $ 19.360,00 y el pie completo.
    - Copiar imagen: el portapapeles tiene `image/png`.
  - **Celular** (375 × 812, con stubs):
    - con `canShare`, Compartir es el primario y `share` recibe 1 `File` `image/png` de nombre correcto;
    - sin `canShare`, quedan Descargar (primario) y Copiar imagen.
  - **P-0027:** tiene "FACTURADO A".
  - **`B2-QA-0001`** (P-0036, 12 líneas: una de 60 caracteres, una al 10,5 % y un flete al 0 %): la descripción ocupa 2 renglones con "…", aparecen las filas de IVA 10,5 y 21 % y ninguna del 0 %, y nada queda cortado (1080 × 1866).
  - **Mensaje:**
    - tiene `*FACTURA 0001-00000777*`, el detalle, Subtotal, `IVA 21 %: $ 3.360,00` y `*TOTAL: $ 19.360,00*`;
    - Copiar muestra "Copiado" (Windows convierte `\n` en `\r\n` en el portapapeles);
    - sin número, WhatsApp abre `api.whatsapp.com/send?text=…`;
    - con `5493510000000` guardado, el botón dice "Enviar a la administración", abre `wa.me/5493510000000` (redirige a `api.whatsapp.com/send/?phone=…`) y "Elegir otro contacto" abre sin número;
    - retocar el texto hace aparecer "Volver al texto de la plantilla", que lo restaura.
  - **Plantillas:**
    - `?tipo=factura` entra en Factura, con los contadores (1) y (1);
    - un número inválido da toast de error;
    - "Factura corta" se crea en Factura y no aparece en Pedido; las variables y la vista previa son las de factura, y no salen ni "Expandir" ni "Ver como";
    - marcarla default no toca "Pedido estándar";
    - en el modal aparece el select con las 2 plantillas; cambiar regenera el texto, y con el texto retocado pide confirmación ("Cambiar de plantilla");
    - desactivada, marcarla da toast "Activá la plantilla…".
  - **Pedidos (P-0021):** el select muestra solo "Pedido estándar". Copiar habilita "Marcar como enviado" (no lo marqué). Con un proveedor sin teléfono, WhatsApp abre sin número.
  - **Bordes:**
    - con `B2-QA-0001` anulada, Compartir desaparece y su URL da 409;
    - qa-squad es rebotado de Facturas a `/admin/gastos` y su URL da 403;
    - el Escape cierra solo el modal de compartir; la factura sigue abierta.
  - **Capturas** del modal (las dos pestañas) a 375 px y 1280 px, en oscuro y en claro: sin scroll horizontal.
- **Pendiente:** en QA (Vercel), después del merge, abrir el modal en una factura y ver que la imagen carga. Confirma que las fuentes se empaquetaron.

## Pasada de diseño (frontend-design / ux-copy / ui-review)

- El sello rojo inclinado es lo primero que se ve, así que nadie lee el total sin el descargo.
- Los números grandes (Syne 800) y la tabla de filas alternadas se leen en el celular aun reducidos al ancho del modal.
- El total tiene fondo crema y barra oro, a todo el ancho: un total de 8 cifras entra sin desbordar.
- Copy fijo sin cambios de sentido. Una sola etiqueta ajusta al número: "REMITO" o "REMITOS".
- Modal: los objetivos táctiles miden `min-h-11`. Con `share`, Compartir es el primario; si no, Descargar. La ayuda va en `text-xs text-muted` con ícono.
- Pendiente menor: si se toca Compartir antes de que llegue la action del mensaje, el `alt` de la imagen y el título del `share` salen sin el proveedor ("Factura 0001-00000777"), porque la imagen suele llegar primero. Se completan cuando llega.

## Datos que quedan en dev

- La factura **`B2-QA-0001`** en P-0036, **anulada** (motivo "Prueba de QA de B2"). Su gasto lo borró la anulación.
- "Factura corta" fue borrada. Quedan "Pedido estándar" y "Factura estándar", cada una default de su tipo.
- `factura.whatsapp_admin` vuelve a estar vacío (`""`).
- El mensaje de P-0021 no se regeneró: la prueba solo copió.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin`, cuando el coordinador mergee a `qa`.

**Circuito 1 — La imagen**
1. Compras › Facturas → abrí la factura de P-0016 (0001-00000777, HUEVO CAMPO). Abajo aparece **Compartir**. → Se abre un modal con las pestañas Imagen y Mensaje.
2. En Imagen ves el comprobante. → Arriba a la derecha está el sello rojo "NO VÁLIDO COMO FACTURA" y abajo el texto que aclara que no la emitió ARCA. El número, el proveedor, la línea, el IVA ($ 3.360,00) y el total ($ 19.360,00) coinciden con la factura.
3. **Descargar.** → Baja `Factura-0001-00000777-HUEVO-CAMPO.png`. Abrilo: se lee entero, sin cortes.
4. **Copiar imagen** y pegala en un chat de WhatsApp Web. → Se pega la imagen.
5. Desde el celular, en la misma factura, tocá **Compartir**. → Se abre el menú del teléfono. Elegí WhatsApp y un contacto: llega la imagen.
6. Abrí la de P-0027. → Tiene "FACTURADO A" con la razón social y el CUIT del local.

**Circuito 2 — El mensaje para la administración**
7. Pestaña Mensaje. → Tiene el N° de factura del proveedor, el proveedor, la fecha, el vencimiento, el pedido, el detalle, el IVA y el total.
8. Cambiá una palabra del texto. → Aparece "Volver al texto de la plantilla"; tocalo y el texto vuelve.
9. **Enviar por WhatsApp.** → WhatsApp se abre con el texto y te deja elegir el contacto.
10. Proveedores › Plantillas › **Factura**: cargá el WhatsApp de la administración y guardá. Volvé a la factura. → El botón dice **"Enviar a la administración"** y abre directo ese chat; "Elegir otro contacto" sigue abriendo sin número. Al terminar, borrá el número.

**Circuito 3 — Plantillas**
11. Proveedores › Plantillas: arriba se elige **Pedido** o **Factura**. En Factura está "Factura estándar". Creá otra con las variables de factura. → La vista previa la muestra con datos de ejemplo.
12. Marcala como predeterminada (estrella). → En Pedido, "Pedido estándar" sigue siendo la predeterminada. En el modal de la factura aparece ahora un selector de plantilla.
13. En Pedidos, al generar el mensaje de un pedido, la lista de plantillas **no** muestra las de factura.
14. Borrá la plantilla de prueba (o volvé la estrella a "Factura estándar").

**Circuito 4 — Lo que no se comparte**
15. Una factura anulada (por ejemplo, `B2-QA-0001` en P-0036) o un borrador **no** tiene el botón Compartir.
16. En un pedido, el envío al proveedor (Copiar / WhatsApp / Marcar como enviado) funciona igual que antes.
17. Con la factura y el modal de compartir abiertos, **Escape** cierra solo el modal de compartir.
