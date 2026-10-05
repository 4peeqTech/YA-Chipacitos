# B1 — Historial real de pedidos + solicitud ↔ pedido

Rama `bloque2/pedidos`, rebaseada sobre `qa` con A1 (`dbc8eb2`). Spec: `docs/bloque2/plan-B1.md`.
Migración `20261005140000_compras_pedido_eventos.sql`, **aplicada en dev** (`fafckqysyvtlslfnpzrh`) el 2026-10-05. Prod no se tocó.

## Qué se hizo

- **Base (migración)**
  - Tabla `compras_pedido_eventos`. RLS de solo lectura. La escribe únicamente `compras_registrar_evento_pedido`, que `authenticated` no puede ejecutar. Cero triggers.
  - Helpers `compras_lineas_pedido_snapshot` y `compras_diff_lineas`. El diff es por id de línea y el orden no cuenta.
  - `compras_guardar_pedido`:
    - registra `creado`, `items_editados` y `proveedor_cambiado`;
    - si no hubo cambios, no registra nada, no borra el mensaje y devuelve `cambios: false`;
    - en una edición ignora el local.
  - `compras_marcar_pedido_enviado(p_pedido_id, p_reenvio default false)`:
    - registra `enviado`, o `reenviado` con `p_reenvio = true`, con el texto del mensaje;
    - el doble clic no duplica: en el reenvío, el mismo usuario con el mismo mensaje en menos de 60 s no genera otro evento.
  - Cerrar y reabrir dejan un evento cada vez. Las columnas `cerrado_manual_*`, `cierre_motivo` y `reabierto_*` se siguen escribiendo.
  - RPC nueva `compras_guardar_mensaje_pedido`: reemplaza el `update` directo de `guardarMensaje`.
    - Registra `local_cambiado` y `mensaje` (generado/regenerado).
    - Bloquea el cambio de local si el pedido está facturado.
  - `convertir_solicitud_a_pedidos`:
    - el pedido nace con el local del proveedor;
    - cada línea guarda su `solicitud_item_id`;
    - registra `creado` con la solicitud y las líneas;
    - suma `set search_path`.
  - Vista `v_compras_pedido_eventos` recreada.
    - Columnas `id`, `persona_id` y `detalle jsonb`; ya no tiene `remito_id`.
    - El remito sale de `compras_remitos` hasta que A2b escriba `remito_creado`.
    - Factura, factura anulada y diferencia siguen saliendo de sus tablas, solo para admin.
  - **D1:** `compras_pedidos` y `compras_pedido_items` quedan de solo lectura por RLS (`*_lectura`, `for select`).
  - Columnas nuevas: `compras_pedidos.actualizado_en/por` y `compras_pedido_items.solicitud_item_id`.
  - Backfill.
- **Lógica pura:** `lib/compras/historialPedido.ts`.
  - Lee el `detalle` con zod. Si viene mal formado, muestra solo la etiqueta.
  - Arma los textos ("Queso 40 → 45 kg", "agregó Sal 2 Bolsa"), el orden con desempate y el agrupado por persona cada 5 minutos, con `combinarDiffs`.
  - `leerEventoDiferencia` sale de `diferencias.ts` y pasa a `leerDiferencia` en el archivo nuevo.
- **Pantalla**
  - `PedidoDetalle`, sección Historial:
    - entradas agrupadas, cantidad en el título, un ícono por tipo y rango de horas;
    - links a insumo, solicitud, proveedor, remito y factura con `LinkEntidad`;
    - "Ver el mensaje" en enviado/reenviado y "Ver N cambios más" cuando hay más de 5 líneas.
  - `PedidoEnvio`:
    - en un pedido ya enviado, "Marcar como reenviado" (se habilita después de copiar o abrir WhatsApp) + "Cerrar sin reenviar";
    - "Facturar a" se deshabilita si el pedido está facturado;
    - si la RPC rechaza el local, el select vuelve al valor del pedido.
  - `PedidoEditor` / `PedidosClient`: guardar sin cambios muestra el toast "Sin cambios" y no manda a reenviar.
  - `acciones.ts`:
    - `guardarMensaje` pasa a RPC;
    - nueva `marcarPedidoReenviado`;
    - `guardarPedido` devuelve `cambios`.

## Desvíos

- **`convertir_solicitud_a_pedidos`:** se sumó `revoke execute … from public, anon` + `grant … to authenticated`. Hasta ahora anon podía ejecutarla, aunque el cuerpo exige acceso. §3.8 lo pedía si faltaba. Aprobado por el coordinador.
- **`ParteDiff`:** además de `nombre` y `texto` lleva `previo` y `resto`, para poder linkear el insumo en el medio del texto (por ejemplo, "quitó **Salame** 90").
- **"Editó ítems: …":** no se pasa a minúscula la primera letra del insumo. El ejemplo y el caso 4 del plan dicen "Editó ítems: Queso 40 → 45 kg", y "agregó"/"quitó" ya van en minúscula.
- **Grupo mixto ("Editó el pedido"):** cada sub-evento va con su etiqueta en negrita chica y su detalle abajo. Las líneas del diff van con viñeta.
- **QA en navegador del paso 8 (convertir una solicitud):** no se hizo en pantalla. En dev ningún proveedor tiene local cargado y convertir una de las 5 solicitudes abiertas de dev cambiaba datos ajenos. Quedó cubierto por el escenario S12 en lote revertido: 2 pedidos con el local de su proveedor, todas las líneas con `solicitud_item_id` y `creado` de origen solicitud.
- **Pasada de skills de diseño:** fue una revisión visual propia de las capturas (desktop y 375px, oscuro y claro) contra los tokens y patrones de la app, no la skill `ui-review`.
- **Herramienta de QA:** el navegador de Traycer no daba layout en la pestaña aislada (todo "no layout box"). La QA se hizo con un script de Playwright (`playwright-core` global + Chromium 1223) contra el dev server en el 3006.
- **Dev server:** desde Git Bash `/admin/*` da 404 (como avisa el plan). Se levantó con `powershell.exe -Command "npm run dev -- -p 3006"`.

## Verificación

- **Escenarios SQL S1–S16** (migración + escenarios en un lote revertido con `raise`, contra dev, antes del push): todos dan lo esperado. Después, `to_regclass('compras_pedido_eventos')` dio null: dev quedó limpio.
- **Push a dev** con OK del coordinador (`db push --linked --project-ref`, con dry-run antes). S1 real:
  - backfill `creado 24 · enviado 18 · cerrado 4 · reabierto 2` (48 filas);
  - 0 pedidos sin `actualizado_en`;
  - 80/80 líneas de solicitud con `solicitud_item_id` (0 sin match);
  - políticas `compras_pedidos_lectura`, `compras_pedido_items_lectura` y `compras_pedido_eventos_lectura`.
- `npm run types` regenerado: solo trae cambios de B1.
- **Chequeos puros:** `npx tsx lib/compras/_check_historial.ts` (24 casos OK) y `npx tsx lib/compras/_check_diferencias.ts` (19 casos OK).
- `npx tsc --noEmit`, `eslint` de los archivos tocados (0 problemas) y `npm run build` OK.
- **Navegador** (local :3006 contra dev, `qa-admin` y `qa-squad`):
  1. Alta de P-0036 (MONTECARLO, 2 ítems) → "Pedido creado · con 2 ítems".
  2. Edición (Jamón 40→45, quitar Salame, línea libre Sal 2 Bolsa) → "Editó ítems" con las 3 líneas y los insumos linkeados.
  3. Jamón 45→50 enseguida → una sola entrada "40 → 50".
  4. Guardar sin tocar → toast "Sin cambios" y ningún evento.
  5. Local + generar + enviar → una entrada "Editó el pedido" (ítems + "Asignó el local de facturación · Paraguay 388" + "Generó el mensaje") y "Enviado al proveedor" con "Ver el mensaje".
  6. Reenviar:
     - "Marcar como reenviado" deshabilitado hasta copiar;
     - doble clic → un solo `reenviado` (confirmado en la base);
     - toast "P-0036 reenviado".
  7. Cerrar → reabrir → cerrar → reabrir → 4 entradas con su motivo; la última dice "Volvió a Enviado".
  8. Cubierto por S12 (ver desvíos).
  9. P-0027 facturado: el menú "Más acciones" no aparece (no hay "Reenviar mensaje").
  10. Pedidos viejos (P-0027, P-0007): eventos del backfill en orden. "Creado desde una solicitud · Pedido base", remito con link, "Cerrado a mano · Motivo", "Reabierto".
  11. `qa-squad` (no admin, con Compras) en P-0027: no ve "Factura confirmada"; admin sí.
  12. Link del insumo en el historial → `/admin/compras/stock?insumo=…`.
  - Capturas a 375px y 1280px, en oscuro y en claro: sin scroll horizontal.

## Datos de prueba que quedan en dev

- **P-0036** (MONTECARLO): creado por `qa-admin` con 11 eventos (alta, 2 ediciones, local, mensaje, enviado, reenviado, 2 cierres y 2 reaperturas). Queda en estado Enviado. Se puede cerrar a mano o dejar para la prueba del usuario.
- Los escenarios SQL no dejaron nada (lote revertido).

## Para A2b

- Los remitos escriben `remito_creado` / `remito_editado` / `remito_eliminado` con `compras_registrar_evento_pedido` y el `detalle` del contrato de §3.1. Cuando exista `remito_creado` para un remito, la vista deja de inventarlo desde `compras_remitos`. La vista no hace falta redefinirla.
- El render ya está: "Llegó un remito", "Editó el remito" (con el diff) y "Eliminó el remito" (código sin link + motivo).

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev) **después de mergear B1 a `qa`**, con `qa-admin`.
**Hasta ese merge, en QA no se puede guardar el mensaje ni el local:** la base ya tiene la RLS de solo lectura y el `guardarMensaje` viejo hace un `update` directo.

**Circuito 1 — Editar queda registrado**
1. Compras › Pedidos › Crear pedido, un proveedor y 2 ítems. Guardar. → En el detalle, Historial: "Pedido creado · con 2 ítems", con tu nombre y la hora.
2. Más acciones › Editar ítems: cambiar la cantidad de uno, agregar otro y quitar el tercero. Guardar. → "Editó ítems" con tres líneas (por ejemplo, "Queso 40 → 45 kg", "agregó Sal 2 Bolsa", "quitó Huevos 90 unidades"). El nombre del insumo es un link a su stock.
3. Volver a editar la misma cantidad enseguida (45 → 50). → Sigue habiendo **una sola** entrada, que ahora dice "40 → 50".
4. Abrir el editor y guardar sin tocar nada. → Toast "Sin cambios" y el historial no suma nada.

**Circuito 2 — Envío y reenvío**
5. Enviar: elegir "Facturar a", generar el mensaje, copiarlo y "Marcar como enviado". → "Editó el pedido" con "Asignó el local de facturación" y "Generó el mensaje", y después "Enviado al proveedor". "Ver el mensaje" muestra lo que se mandó.
6. Más acciones › Reenviar mensaje → copiar → "Marcar como reenviado". → Toast "P-xxxx reenviado" y en el historial "Reenviado al proveedor". "Cerrar sin reenviar" sale sin registrar nada.
7. Reenviar de nuevo tocando el botón dos veces rápido. → Aparece un solo reenvío.

**Circuito 3 — Cerrar y reabrir, todas las veces**
8. Cerrar a mano con un motivo, reabrir, cerrar con otro motivo y reabrir. → Cuatro entradas, cada una con su motivo; la última reapertura dice a qué estado volvió.

**Circuito 4 — Solicitud → pedido**
9. Antes, cargarle un local de facturación a un proveedor que tenga ítems en una solicitud abierta. Después, en Solicitudes, convertir esa solicitud. → El pedido nuevo ya tiene ese local en "Facturar a" y su historial dice "Creado desde una solicitud" con un link que lleva a la solicitud.

**Circuito 5 — Facturado**
10. En un pedido facturado: no aparece "Reenviar mensaje" y no se puede cambiar el local de facturación.

**Circuito 6 — Lo viejo y los permisos**
11. Abrir un pedido viejo (de antes de esta versión). → Ve "Pedido creado", "Enviado" y, si tuvo, "Cerrado a mano"/"Reabierto", en orden.
12. Con una cuenta sin rol admin y con Compras (`qa-squad`): el historial no muestra la factura ni las diferencias.
13. En el celular (375px): el historial se lee sin cortar, y "Ver el mensaje" y "Ver N cambios más" se tocan bien.
