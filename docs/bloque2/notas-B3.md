# Notas de B3 — Proveedor y reportes conectados

Rama `bloque2/pedidos`, rebaseada sobre `qa` @ `0c3cc87` (merge de A2b). Plan: `docs/bloque2/plan-B3.md`.
Migración `20261005190000_proveedores_archivar.sql` **aplicada en dev** (`fafckqysyvtlslfnpzrh`) el 2026-10-06. Prod no se tocó.

## Qué se hizo

- **Proveedores**
  - Se archiva en vez de borrarse.
  - El ABM pasa a RPC con Server Actions (`app/admin/proveedores/acciones.ts`). `proveedores` queda de solo lectura por RLS.
  - Solo se puede borrar un proveedor sin historia: la RPC cuenta las referencias, y las 3 FK nuevas en `RESTRICT` son el respaldo.
  - No se puede archivar con pedidos abiertos. Archivar avisa si es principal de insumos, si está en el pedido base o si tiene líneas en solicitudes abiertas.
  - Un archivado no entra a un pedido nuevo, a una conversión de solicitud ni a una reapertura.
- **Ficha** (`ProveedorFicha.tsx` + `FichaPaneles.tsx`)
  - Pestañas Pedidos · Remitos y facturas · Cuenta (admin) · Insumos.
  - `?proveedor=` y `?pestana=` abren la ficha; cerrarla limpia los dos.
  - Lista con la fila clickeable y las columnas Insumos y Pedidos abiertos.
- **`proveedores.local` → `local_facturacion_id`**: 17/17 en dev (8 Paraguay 388, 9 Gdor. Lagraña 388). La columna `local` se borró.
- **Reportes**
  - Historial y KPI con el estado visible.
  - "Gasto por proveedor" con Pagado / Pendiente / Sin gasto, con la misma función (`resumirPagos`) que la Cuenta.
  - "Sugerido vs. recibido" cruza por `solicitud_item_id` y compara contra lo que llegó en los remitos.
  - El aviso de "sin factura" abre Pedidos › Por facturar (`?estado=por_facturar`).
  - **Pedido del coordinador:** el período se filtra en la base (`?desde=&hasta=`), ya no se trae todo para filtrar en el navegador.
- **Selectores** de Gastos, Solicitudes y Pedido base: muestran el valor actual como "Nombre (archivado)".

## Desvíos (aprobados por el coordinador)

- `proveedores_guardar(p_id uuid default null, p_datos jsonb default '{}')`: el alta omite `p_id`, como `compras_guardar_insumo`.
- Helper extra `_proveedores_referencias(uuid)` (revocado). Lo usan `impacto` y `eliminar`.
- Las 3 FK se reemplazan buscando la constraint por tabla y columna, no por nombre fijo.
- `PedidosClient` tiene, además del filtro, un import (`useSearchParams`) y el helper `filtroDeParam`. No hizo falta Suspense: el componente ya usaba `useSearchParams` vía `useQuitarParams`.
- Archivos nuevos chicos:
  - el dominio `proveedores` en `lib/estados.ts`;
  - `components/compras/PagoFactura.tsx`, compartido por la Cuenta y Reportes;
  - `aEstadoRecepcion` / `aEstadoFacturacion` en `estadoPedido.ts`, para no tocar `modelo.ts` (A2b).
- **Reportes con filtro en servidor** (pedido del coordinador, fuera del plan original):
  - "Recibidos sin facturar" sale de una consulta aparte (todas las fechas, solo los candidatos).
  - Lo facturado de los pedidos del Historial sale de sus facturas aunque sean de otro período, en tandas de 100 ids.
  - "Sugerido vs. recibido" sigue sin período, como antes. Si crece, va a F9.
- Fix durante la QA: la ficha se quedaba en "Cargando..." en dev por el doble montaje de StrictMode (`1fdad4b`).

## Verificación

- `tsc`, `eslint` de lo tocado y `npm run build` limpios.
- `_check_reportes` 30/30, `_check_estado` 43/43, `_check_historial` 26/26.
- **Escenarios** (`docs/bloque2/escenarios-B3.sql`, migración + lote, revertido; corrido el 2026-10-06):

| # | Resultado |
|---|---|
| S1 | 17 con local de facturación; `local` no existe; las 3 FK en `r`; solo queda `proveedores_lectura_compras_fabrica` |
| S2 | crea activo, `cambios: true` |
| S3 | "Ya existe un proveedor llamado "QA B3 Prov"." |
| S4 | 1.º `cambios: true`, 2.º `cambios: false` (ver nota de `updated_at`) |
| S5 | "Campo no permitido: estado" / "…: local" |
| S6 | 13/13 casos coinciden con `pedidoAbierto` |
| S7 | GLOBAL: 13 abiertos, principal de 7, `puede_eliminar: false` |
| S8 | "GLOBAL tiene 13 pedidos abiertos: P-0005, … y 8 más…"; sigue activo |
| S9 | archivar `cambio: true`; doble clic `cambio: false`; reactivar y volver a archivar OK |
| S10 | "El proveedor QA B3 Prov está archivado: reactivalo en Proveedores para pedirle." |
| S11 | el cambio de proveedor a un archivado falla con el mismo mensaje; editar líneas OK |
| S12 | "…para reabrir el pedido." |
| S13 | "Hay líneas para QA B3 Prov (archivado)…"; 0 pedidos nuevos; la solicitud sigue abierta |
| S14 | "No se puede eliminar GLOBAL porque tiene 17 pedidos, 1 pedido eliminado, 7 facturas, 3 gastos, 8 insumos asociados, 16 solicitudes, 8 líneas del pedido base y 3 cambios en el historial de insumos…" |
| S15 | `puede_eliminar` true y se borra |
| S16 | `foreign_key_violation` en gastos, pares e historial |
| S17 | `qa-squad`: las 4 RPC dan "No autorizado"; update directo 0 filas; la vista da 61 filas, todas sin último precio |
| S18 | `anon` sin execute en las 4 RPC ni en los 3 helpers; `authenticated` tampoco en los helpers |
| S19 | último precio, `precio_por` y fecha por par; Queso Barra `base` → `/kg` |

- **Nota S4:** dentro del lote, `updated_at` no se movió en la 1.ª edición porque `now()` es fijo en una transacción y el alta fue en la misma. No es un bug: fuera del lote, cada guardado es su transacción.
- **S20** (concurrencia con dos sesiones): **no se corrió**. El diseño es `FOR SHARE` contra `FOR NO KEY UPDATE`, como el arreglo de A2a.
- **Dry-run:** solo `20261005190000`. **Push** OK.
- **Después del push, sobre la base real:** 17 con local de facturación, sin columna `local`, 3 FK RESTRICT, 1 política, 0 nombres repetidos.
- **`raise notice`:** el CLI no los muestra. Antes del push, los 17 proveedores con `local` matcheaban (0 "LOCAL SIN MATCH") y había 0 repetidos.

### QA en el navegador (local :3006 contra dev, `qa-admin`)

- **OK:**
  - lista con Insumos y Abiertos (GLOBAL 13);
  - ficha de GLOBAL, las 4 pestañas: estado nuevo, links, anuladas tachadas, "Sin gasto", Queso Barra en `/kg`;
  - Cuenta en "Todo": Facturado 1.162.255,82 = Pagado 0 + Pendiente 109.928,50 + Sin gasto 1.052.327,32;
  - `?pestana=cuenta` abre en Cuenta y cerrar limpia los dos params;
  - archivar GLOBAL → "No se puede archivar todavía" con los 13 P-xxxx;
  - alta "QA B3 Prov" → toast y se abre su ficha;
  - editar sin cambios → "No había cambios";
  - nombre repetido → error en el form;
  - archivar / reactivar / eliminar con sus toasts;
  - archivar FABIMP: el aviso nombra los insumos (+7). Se reactivó al final;
  - Reportes: KPI "1 por recibir · 1 por facturar"; Gasto con Pagado / Pendiente; Historial con 7 estados y "Último remito"; Sugerido vs. recibido con "en camino";
  - Mes actual igual que antes del filtro en servidor; Mes anterior navega con `?desde=&hasta=`;
  - `/admin/compras/pedidos?estado=por_facturar` abre en "Por facturar (3)", el mismo número del aviso;
  - `qa-squad`: `/admin/proveedores` lo manda a Gastos (soloAdmin).
- **Sin verificar en el navegador:**
  - cambiar a "Activos" a mano y que se limpie `?estado=`;
  - el selector "(archivado)" de Gastos: los dos proveedores con gasto en dev tienen pedidos abiertos y no se pueden archivar;
  - 375 px y tema claro: el navegador de Traycer no deja cambiar el viewport ("cannot be represented exactly at the current page zoom").
- **Hallazgo ambiental:** en el navegador de Traycer, las rutas `compras/pedidos/*` no hidratan (tampoco Remitos ni Solicitudes, que B3 no toca). Proveedores y Reportes sí. No hay errores en el server ni en el overlay de Next. Habría que mirarlo en un Chrome común.
- **`qa-squad` no entra a Reportes** (lo manda a Gastos): su `modulos_permitidos` no incluye Reportes. Es preexistente.

## `compras_pedidos.estado` después de B3 (§7)

- **App:** `rg` sin lectores. Lo que aparece es el estado visible, `historialPedido.ts` (el estado de las líneas) y `cerrado_en` de `fabrica_conteos`.
- **SQL (dev):**
  - ninguna vista depende de `compras_pedidos.estado` ni de `cerrado_en` (`pg_depend` vacío);
  - ninguna política la lee;
  - quedan solo **escrituras**: `compras_guardar_pedido`, `convertir_solicitud_a_pedidos` y `compras_recalcular_estado_pedido`, y **`compras_cerrar_pedido_manual`** (`cerrado_en = now()`), que no estaba en la lista del plan.

**Para F9:**
1. Sacar `estado` y `cerrado_en` de esas 4 funciones. `compras_guardar_pedido` y `convertir_solicitud_a_pedidos` hay que tomarlas de `20261005190000`.
2. `drop index idx_compras_pedidos_estado`, el `check` de `estado` y las columnas `compras_pedidos.estado` y `cerrado_en`.
3. Regenerar tipos.
4. Revisar si "Sugerido vs. recibido" necesita período o límite: hoy trae todas las líneas de solicitud.

## Datos de dev que quedan

- 17 `local_facturacion_id` cargados por la migración: es el dato real.
- "QA B3 Prov" se creó y se borró desde la UI.
- FABIMP quedó **activo**: se archivó y se reactivó.
- No queda nada más del lote: se revierte.

## Para otras fases

- **A2c:** "Por insumo" en un archivo nuevo (`lib/compras/reportePorInsumo.ts`) y una pestaña más en `ReportesClient`. Reportes ahora recibe el período por props: lo nuevo tiene que filtrar en el servidor igual (`rangoDeParams` / `diaSiguiente` en `rangoFechas.ts`).
- **B4:** las NC restan en la Cuenta y en Gasto por proveedor (ya contemplado por el signo).
- **B5:** el KPI de deuda puede salir de `resumirPagos`.
- **Manual `/ayuda`:** ficha del proveedor, archivar vs. eliminar y Cuenta. Va con la guía, al final.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** con `qa-admin@chipacitos.test`, una vez mergeado a `qa`:

1. **Proveedores.**
   - La lista tiene las columnas Insumos y Pedidos abiertos.
   - Tocar la fila abre la ficha (no hay lápiz).
2. **Abrir GLOBAL.** Arriba, "Factura a: Paraguay 388" y las pestañas.
   - **Pedidos:** el estado coincide con Compras › Pedidos. Están "Abiertos" y "Todos". El P-xxxx abre el pedido.
   - **Remitos y facturas:** cada código abre su remito o su factura. Las anuladas aparecen tachadas.
   - **Cuenta:** Facturado, Pagado y Pendiente del período, y el pendiente de todas las fechas. En "Todo" aparece "Sin gasto". Pagado + Pendiente + Sin gasto = Facturado. El estado de pago lleva al gasto.
   - **Insumos:** precio de referencia y último precio con su unidad (Queso Barra en /kg). La fecha abre la factura.
3. **Nuevo proveedor "Prueba B3".** Se abre su ficha. Crear otro "prueba b3" avisa que ya existe.
4. **Editar "Prueba B3" sin tocar nada.** Aparece el toast "No había cambios".
5. **Archivar GLOBAL.** No deja: muestra sus pedidos abiertos con links.
6. **Archivar "Prueba B3".**
   - Explica qué deja de pasar y queda en "Archivados".
   - En Compras › Pedidos › Crear pedido, ya no aparece.
   - Reactivarlo lo vuelve a la lista.
7. **Eliminar "Prueba B3".** Se borra. En GLOBAL no está el botón Eliminar.
8. **Archivar un proveedor que sea principal de algún insumo y no tenga pedidos abiertos** (por ejemplo, FABIMP).
   - El aviso nombra esos insumos.
   - En Solicitudes, convertir una solicitud con una línea para él avisa que está archivado y no crea nada.
   - Reactivarlo al terminar.
9. **Compras › Reportes.**
   - KPI "Pedidos del período": "N por recibir · M por facturar".
   - **Historial:** el gráfico tiene los 7 estados; la tabla, el badge nuevo y "Último remito"; el proveedor abre su ficha.
   - **Gasto por proveedor:** Pagado + Pendiente (+ Sin gasto) = Total. El nombre abre la Cuenta del proveedor.
   - El aviso amarillo "N pedidos ya recibieron mercadería…" abre Pedidos en **Por facturar** con esos N.
   - **Sugerido vs. recibido:** columnas Sugerido, Pedido y Recibido, y "en camino" en lo que todavía no llegó.
   - Elegir "Mes anterior": la URL cambia (`?desde=…&hasta=…`) y los números son los de ese mes.
10. **Pedidos con el link del aviso.** Cambiar a "Activos" y recargar con F5: queda en Activos.
11. **Con `qa-squad`.** Proveedores no abre (lo manda a Gastos).
12. **Celular (375 px) y tema claro.** La ficha y sus pestañas se leen sin scroll horizontal y los botones se tocan sin zoom.
