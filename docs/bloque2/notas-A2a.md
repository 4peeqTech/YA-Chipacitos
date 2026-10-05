# A2a — Insumos: arreglos de base (notas de cierre)

> Rama `bloque2/stock`, rebaseada sobre `origin/qa` @ `76f8467` (B1 adentro). Spec: [`plan-A2a.md`](plan-A2a.md). Decisiones: **D1–D4 van todas las recomendadas** (último precio solo admin; archivar avisa, no bloquea; quitar proveedor desactiva si tiene historia; §8 se hace en esta fase).

## Lo hecho

| Parte | Archivos |
|---|---|
| Migración base (§3) | `supabase/migrations/20261005150000_compras_insumos_base.sql`: historial, principal único (índice parcial), FK `RESTRICT` del ledger, RLS de solo lectura, RPCs `compras_guardar_insumo` / `compras_archivar_insumo` / `compras_eliminar_insumo`, `generar_solicitud_base()` sin archivados y `v_compras_insumos_resumen` |
| Permisos de conteos (§8) | `supabase/migrations/20261005160000_compras_permisos_conteos.sql`: `tiene_lectura_conteos()`, `tiene_acceso_compras()` sin `fabrica-conteos`, vistas y policies de lectura de Conteos |
| Server Actions (§4) | `app/admin/compras/insumos/acciones.ts` |
| Insumos (§5.1–5.2) | `insumos/page.tsx`, `InsumosClient.tsx` (reescrito), `InsumoModal.tsx` (nuevo) |
| Listas de conteo / Pedido base (§5.3) | `listas-conteo/page.tsx`, `ConteosClient.tsx`, `pedidos/base/page.tsx`, `PedidoBaseClient.tsx` (solo el chip) |
| Fábrica y Stock (§5.4) | `app/fabrica/stock/page.tsx`, `compras/stock/page.tsx`, `StockClient.tsx`, `historico/page.tsx`, `HistoricoInsumoClient.tsx` |
| Proveedores (§5.5) | `ProveedoresClient.tsx`: solo el label y su descripción |
| Front de §8 | `lib/modulos.tsx` (`MODULOS_COMPRAS`, `tieneAccesoCompras`), `api/fabrica/solicitudes/notificar/route.ts`, `admin/fabrica/conteos/page.tsx`, `ConteosFabricaClient.tsx`, `DiferenciasConteo.tsx` |
| Compartido | `components/ui/DataTable.tsx`: `filaClassName` opcional, `ocultarHasta: '2xl'` y el vacío en `<div>` (antes `<p>` envolvía al `EmptyState`, que es un `div`: HTML inválido) |
| Lint | `eslint.config.mjs`: `app/admin/compras/insumos/*.tsx` en la regla de hex |
| Escenarios SQL | `docs/bloque2/escenarios-A2a.sql` (S1–S16) y `escenarios-A2a-permisos.sql` (P1–P3) |

## Desvíos e interpretaciones

1. **`lib/database.types.ts`**: lo escribí a mano hasta el `db push` (el CLI genera contra dev) y después lo regeneré con `npm run types`.
2. **Helpers SQL extra:** `_compras_num_txt(numeric)` (`trim_scale`, para que el historial diga `16.5` y no `16.50`) y `_compras_par_tiene_historia(item, proveedor)` (E4). Los dos tienen `revoke` para `public`, `anon` y `authenticated`.
3. **Locks:** archivar y eliminar bloquean primero los conteos en borrador que tienen el ítem (`for update`) y después borran sus filas. Es el mismo orden que el cierre y el descarte de A1.
4. **Mensaje de eliminar:** cuenta pedidos, remitos, facturas, solicitudes y conteos **distintos**, no líneas. Por ejemplo: "tiene 26 movimientos de stock, 14 pedidos, 6 remitos, 4 facturas, 16 solicitudes y 9 conteos".
5. **Historial:**
   - Al quitar un par con historia se registran `proveedor.activo` (sí → no) y `proveedor.principal` (sí → no), si era principal.
   - En "Cambios", el "dejó de ser principal" no se muestra (sale de la mudanza de la estrella y metía ruido). Sí se muestra "Marcó a X como principal".
6. **Proveedor de una línea existente:** no se cambia desde el form. Se ve como texto: para cambiarlo, se quita y se agrega otro. Así cada línea es un par y la RPC decide si lo desactiva o lo borra.
7. **Título del tachito:** la página no sabe si **ese** par tiene historia (las facturas son solo de admin), así que el `title` de los pares existentes dice: "Quitar. Si tiene pedidos o facturas con este proveedor, se desactiva y queda en «Proveedores anteriores»." No se distingue por par.
8. **"Proveedores anteriores" y "Cambios"** usan `<details>` en lugar de `Collapsible`. `Collapsible` es una tarjeta de sección con ícono por nombre, y adentro del form quedaba pesado.
9. **Columnas en pantallas medianas:**
   - Cant./masa, Stock mín. y Redondeo pasaron de `xl` a `2xl`. A 1440px, con la barra lateral, la tabla se apretaba y partía los nombres.
   - Categoría y Listas de conteo siguen en `xl`.
   - Para eso sumé `2xl` a `DataTable`.
10. **"bajo mín."** no se muestra en filas archivadas.
11. **Nombre del autor en "Cambios":** la policy de `profiles` solo deja ver el propio (o todos si sos admin). Para un no-admin, un cambio de otra persona sale como "Alguien". **Pendiente:** si importa, se resuelve con una vista con el nombre resuelto (en la línea de `v_compras_pedido_eventos`).
12. **Archivar y reactivar cierran el form.** El toast y la fila gris confirman el cambio. Si falla, el form queda abierto.
13. **Confirmaciones:** usé `useConfirmar` / `useToast` de `ProveedorUI` (los globales), no `useConfirm` / `useToasts` locales.
14. **`generar_solicitud_base()`** quedó a cargo de A2a para este cambio (no tenía dueño en el plan maestro).

## Protocolo de diseño (§5.0)

- **No corrí `impeccable` (shape/harden) ni `emil-design-eng` como skills.** El shape ya estaba hecho en el §5 del plan (wireframes, columnas, breakpoints y textos), así que construí directo sobre eso. El "harden" lo apliqué a mano:
  - doble clic: botones deshabilitados con spinner y guardas `isPending`;
  - errores: toast con el mensaje de la RPC, y `refresh()` también cuando falla;
  - vacíos: dos `EmptyState`;
  - permisos: "Última factura" solo para admin, y `LinkEntidad` cae a texto sin módulo;
  - textos largos: `min-w-52` en Insumo y `max-w-40` en Redondeo;
  - números con `tabular-nums`.
- **Capturas (Playwright local, chromium 1223), revisadas a ojo contra `ui-ux-pro-max`:** Insumos y el form, en desktop 1440 y 375px, oscuro y claro. No hay scroll horizontal en ninguna. Los botones del form tienen ≥ 44px en mobile (`min-h-11`, estrella y tachito `h-11 w-11`).
- **Navegador integrado de Traycer:** no lo usé para la QA. La sesión no respondía a las capturas (timeout de 120 s), así que todo el recorrido corrió con Playwright local.

## Verificación

- **Lote revertido antes del push (migración + escenarios):** S1–S16 OK, P1–P3 OK. S12 aislado: un insumo que solo tiene un movimiento choca con `compras_stock_movimientos_item_id_fkey`.
- **`db push` a dev** (después de que B1 entró a `qa`, con el OK del coordinador): dry-run limpio y las dos migraciones aplicadas. En dev no hubo `raise notice` de normalización (sin principales dobles ni nombres repetidos, como decía el relevamiento).
- **Invariante del ledger:** 0 después del push y 0 al final de la QA.
- `npx tsc --noEmit` limpio, `eslint` limpio en los archivos tocados y `npm run build` OK. Cero hex en `insumos/*.tsx` y cero `as any` nuevos.

**QA en el navegador** (local 3005 contra dev, Playwright), recorrido §10.4:

| Paso | Resultado |
|---|---|
| 1 | Columnas nuevas, sin Precio. Coordinador: sin "Última factura". |
| 2 | Creé "QA A2a Insumo" con AL SA (★, $100) y ALBOR. "Cambios" muestra creado + 2 proveedores + precio. |
| 3 | Editar solo el stock mínimo da 1 línea "Stock mínimo: 0 → 6". Guardar sin tocar nada da el toast "No había cambios". |
| 4 | Conflicto (precio cambiado por SQL con el form abierto): el toast dice "cambió mientras editabas (ahora 120)" y el form queda abierto. |
| 5 | En Bolsa Consorcio 60x90 quité BOLSAPLAST (con pedidos): pasó a "Proveedores anteriores (1)". "Volver a usar" funcionó. La base quedó como al principio: BOLSAPLAST activo y principal, ALBOR borrado porque no tenía historia. |
| 6 | Archivé el insumo de prueba: confirm sin puntos (no aplica ninguno), toast y fila gris en "Archivados". |
| 7 | Polvo de Hornear: el confirm lista Global, el pedido base, 12 Pote y 5 pedidos abiertos. El toast dice "se sacó de 1 conteo en curso". Listas de conteo: "Archivado · no se cuenta". Stock: sigue, con el chip. Fábrica (375px, Global expandido): no lo ve. Reactivar: vuelve a Fábrica. |
| 8 | Eliminar aparece en el insumo de prueba y no en Polvo de Hornear. |
| 9 | En la fila de Queso Barra: Stock → `/admin/compras/stock?insumo=…`, P-0005 → el pedido, la fecha de la última factura → la factura. |
| 10 | Proveedores: "Sugerir cantidades al pedir" con su descripción. |

Sin errores de consola en admin, fábrica ni coordinador.

## Qué quedó en dev

- **"QA A2a Insumo":** archivado, sin historia (se puede eliminar). AL SA tiene `precio_ref` 120 (puesto por SQL en la prueba de conflicto).
- **Polvo de Hornear:** archivado y reactivado dos veces. Activo, con 4 filas `estado` en el historial. Sus filas del borrador de Global se borraron y se volvieron a sembrar al abrir Fábrica, sin cantidad cargada.
- **Bolsa Consorcio 60x90:** igual que antes (BOLSAPLAST principal), con historial de la prueba.
- 17 filas en `compras_items_historial`.

## Para otras fases

- **A2b:** `compras_confirmar_factura` debería registrar `proveedor.precio_ref` con `origen = 'factura'` (la columna ya está). "Cambios" ya lo muestra como "(por factura)".
- **F9:**
  - antes del `drop column compras_items.precio`, recrear `v_compras_items` sin `precio` y copiar los no nulos a `compras_items_historial` (`campo = 'precio_legacy'`, `origen = 'migracion'`);
  - granularidad por módulo de los RPCs de Compras: hoy cualquier `compras-*` llama a las RPCs de Insumos por POST.
- **B1 (no se tocó):** una solicitud abierta con una línea de un insumo archivado se convierte igual.
- **Release (§8.3):** antes de pasar a prod, correr en prod la consulta de quién tiene solo `fabrica-conteos`. Está en el encabezado de `20261005160000`.

## Manual (`/ayuda`), para cuando se haga la guía

- **compras-insumos:**
  - la fila abre el form (sin lápiz);
  - archivar / reactivar / eliminar en el pie del form: eliminar solo si no tiene historia; archivar no borra listas ni pedido base;
  - columnas Stock, Pedido abierto, Precio ref. y Última factura (solo admin);
  - "Proveedores anteriores" y "Volver a usar";
  - "Cambios";
  - ya no hay campo Precio.
- **proveedores:** el checkbox se llama "Sugerir cantidades al pedir".
- **fabrica-conteos:** con solo ese módulo, las diferencias se ven pero las aplica Compras.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, una vez mergeado a `qa`:

1. **Compras › Insumos.** → La tabla tiene Stock, Pedido abierto, Precio ref. y Última factura. Ya no está la columna Precio.
2. **Nuevo insumo.** → El selector de proveedor lista todos los proveedores activos, no solo algunos. Crear uno de prueba con dos proveedores y la estrella en uno.
3. **Tocar la fila del insumo** (no hay lápiz). → Se abre el form. Abajo, en "Cambios", figura que lo creaste.
4. **Cambiar solo el stock mínimo y guardar.** → Toast "Cambios guardados", y en "Cambios" aparece "Stock mínimo: 0 → N".
5. **Abrir un insumo que tenga facturas** (por ejemplo, Queso Barra), cambiar algo que no sea el precio y guardar. → El Precio ref. sigue siendo el de la última factura.
6. **En la fila de ese insumo.** → "Última factura" muestra el precio con su unidad y la fecha. La fecha lleva a la factura.
7. **Tocar el stock de un insumo.** → Abre su ficha en Stock. Si está por debajo del mínimo, dice "bajo mín." en ámbar.
8. **Un insumo con un pedido enviado y sin recibir.** → "Pedido abierto" muestra P-xxxx y cuánto falta. El código abre el pedido.
9. **En el form, quitar (tachito) un proveedor que ya tuvo pedidos y guardar.** Hay que agregar otro antes, porque el insumo necesita al menos uno. → Pasa a "Proveedores anteriores". "Volver a usar" lo trae de nuevo.
10. **Archivar el insumo de prueba.** → El aviso dice qué deja de pasar. La fila queda gris y sale de "Activos".
11. **Archivar un insumo que esté en la lista Global.** → El aviso dice que no se va a contar.
    - Con `qa-fabrica`, en Fábrica › Stock, abrir Global: ese insumo ya no está.
    - En Insumos › Listas de conteo sigue, con "Archivado · no se cuenta".
    - Reactivarlo → vuelve a aparecer en Fábrica.
12. **Eliminar.** → Solo el insumo de prueba (sin historia) tiene el botón Eliminar. Los que tienen movimientos, pedidos o facturas solo se pueden archivar.
13. **Proveedores › editar un proveedor.** → El checkbox se llama "Sugerir cantidades al pedir".
14. **Con `qa-coordinador@chipacitos.test`.** → En Insumos no aparece "Última factura" (las facturas son solo de admin). Lo demás, igual.
15. **Celular (375px) y tema claro.** → La tabla se lee, el form entra en pantalla y los botones se tocan sin zoom.
