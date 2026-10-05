# A1 — El conteo controla, no pisa · notas de ejecución

Rama `bloque2/stock`. Especificación: [`plan-A1.md`](plan-A1.md). Decisiones del usuario: van las recomendadas.
- **D1:** conteo a ciegas, también en Bolsaplast y Huevos.
- **D2:** se puede cerrar con ítems sin contar, con aviso.
- **D6:** no se descarta una solicitud con diferencias aplicadas.

## Lo hecho

| Paso | Commit | Qué |
|---|---|---|
| Migración + RPCs | `1bebf4f` | `supabase/migrations/20261005120000_fabrica_conteo_controla.sql` (aplicada en **dev**) + `lib/database.types.ts` regenerado (solo agregados) |
| UI | `0d97297` y siguiente | Fábrica › Stock, Admin › Fábrica › Conteos, Compras › Stock (banner y ficha), Histórico, Solicitudes (link) |

**Archivos tocados:**
- `app/fabrica/stock/{page,StockClient,ConteoDesplegable,HistorialGlobal}.tsx`
- `app/admin/fabrica/conteos/{page,ConteosFabricaClient}.tsx`, más `acciones.ts` y `DiferenciasConteo.tsx` (nuevos)
- `app/admin/compras/stock/{page,StockClient,StockFicha}.tsx` y `historico/HistoricoInsumoClient.tsx`
- `app/admin/compras/pedidos/solicitudes/SolicitudesClient.tsx`
- `lib/compras/movimientos.ts` (`TIPOS_REVERTIBLES = ['ajuste_manual']`)
- `eslint.config.mjs` (`app/admin/fabrica/conteos/*.tsx` entra en la regla de hex, ya limpio)

## Desvíos y decisiones locales

1. **Guarda de "revertir" en `compras_resolver_diferencias_conteo`** (aprobado por el coordinador). Quedó `diferencia_estado is null or not in ('aplicada','ignorada')`. Con el `not in` del plan, un `null` no levantaba la excepción, y revertir un ítem que coincide o que no se contó lo habría pasado a `pendiente`. Además se resetea `v_superado := null` en cada vuelta del loop (defensivo).
2. **Solicitudes:** cada fila de la lista es un `<button>`, y meter un `<a>` adentro es HTML inválido. Por eso el link "Ver el conteo" va **solo en el modal** de la solicitud, junto a las masas proyectadas. Es un cambio mínimo: B0 también toca este archivo.
3. **Link conteo → solicitud:** apunta a `/admin/compras/pedidos/solicitudes?solicitud=<id>` con `TODO(B0)`. **Hasta que entre B0, ese param no abre el modal**: cae en la lista de solicitudes.
4. **Links con `TODO(B0)` en vez de `LinkEntidad`**, como prevé el plan (§5.5):
   - insumo → `/admin/compras/stock?insumo=`;
   - conteo → `/admin/fabrica/conteos?conteo=`;
   - solicitud.

   Para limpiar `?conteo=` al cerrar se usa `router.replace` inline (`TODO(B0): useQuitarParams`). Si el param cambia sin desmontar, se aplica el patrón de "estado derivado de props" (`TODO(B0): useAlCambiarParam`).
5. **Pestañas del modal:** el `Tabs` del sistema navega por `href`, así que se usó `SegmentedControl`.
6. **"Superada por X"** abre el otro conteo en el mismo modal (callback), en lugar de un link: así se evita la carrera entre cerrar el modal y navegar al mismo route.
7. **"Aplicar todas las pendientes (N)":** N cuenta las aplicables, es decir, las pendientes que no están superadas. Las superadas se informan en el confirm.
8. **Lista de conteos — "Revisado" vs "Sin diferencias":** la vista solo trae las pendientes. `page.tsx` lee aparte qué conteos tienen alguna diferencia aplicada o ignorada.
9. **Ficha de Stock:** el `HelpTooltip` del porqué va en `acciones` del `PageHeader`, porque `descripcion` es un string.
10. **Protocolo de diseño:** no corrí `impeccable`, `emil-design-eng` ni `ui-ux-pro-max` como skills, por la prioridad de cerrar rápido (dev ya tiene la RLS nueva y QA usa esa base). Se siguió el sistema vigente (`PageHeader`/`DataTable`/`EmptyState`/`Modal`/`useConfirmar`/`useToast`, lucide, tokens, ≥44px, `useTransition` y spinner), y las capturas se revisaron a mano. Se corrigió un detalle: los pills partían en dos líneas.

## Hallazgos fuera de alcance (no tocados)

- **El historial de Fábrica no muestra líneas a `qa-fabrica`:** `HistorialGlobal` lee `compras_solicitudes`/`compras_solicitud_items`, cuya RLS es solo `tiene_acceso_compras()`. Fábrica siempre ve "Este conteo no generó ninguna línea sugerida". Viene de antes de A1. El "Sin contar" nuevo del detalle solo lo ve quien tenga acceso a Compras.
- **Estado viejo en `ConteoDesplegable` tras cerrar:** después de `router.refresh()`, el desplegable conserva su `useState` inicial (el `key` es `def.id`) hasta recargar. También viene de antes.
- **Escrituras directas desde el navegador** de `fabrica_conteos.masas_proyectadas` y el `update` libre de `fabrica_conteos`: quedan para F9 (como dice el plan).
- La rama de auto-curación de `compras_mover_stock` sigue viva. Convertirla en `raise` queda para A4.

## Verificación

- **Escenarios SQL S1–S12** (§9.2), con la migración y los escenarios en una transacción revertida sobre dev: **todos OK**.
  - S1: guardar no crea movimientos ni cambia el stock.
  - S2: el teórico se sella. Los no contados quedan con `cantidad = max(teórico, 0)` y `diferencia null`, y la solicitud toma esas cantidades.
  - S3: `ajuste_conteo` con `conteo_id` y motivo "Conteo Global 02/10: nota". El stock queda en teórico − 5 + 3.
  - S4: la reversión tiene `anula_movimiento_id`, y revertir de nuevo da error.
  - S5: ignorar no crea movimiento, y revertir lo deja pendiente.
  - S6: el descarte se bloquea; después de revertir se puede descartar, y aplicar sobre un descartado da error.
  - S7: `movido_desde_cierre = 3`.
  - S8: aparece "Superada", aplicar la vieja da error y "Aplicar todas" devuelve `omitidas_superadas = 1`.
  - S9: teórico −2, dif +5, el stock queda en 3.
  - S10: mensaje D9.
  - S11: como Fábrica, guardar sobre un cerrado da error, insertar un movimiento choca con la RLS, `update` de stock o de ítem afecta 0 filas, resolver da "No autorizado" y la vista devuelve 0 filas.
  - S12: mensaje D7; sin movimientos, el conteo se borra.
- **Invariante del ledger:** 1 fila antes (Leche en Polvo) → **0 después del push**, 0 al final de los escenarios y **0 después de toda la QA**.
- `npx tsc --noEmit` y `npx eslint` de los archivos tocados: sin errores. `npm run build`: OK. Cero `as any` nuevos.
- **QA en el navegador** (local :3005 contra dev, Playwright):
  1. `qa-fabrica`: Global vacío con "8 sin contar". Cargué 6 de 8 y al recargar persisten (quedan "2 sin contar"). El modal de cierre dice "no cambia el stock" y lista Leche en Polvo y Queso Pategrás, sin números del sistema. En la base, el stock no se movió.
  2. `qa-admin`, Stock: el banner dice "Hay 4 diferencias de conteo sin aplicar" con el chip "Global 05/10 · 4". El chip abre el conteo en "Diferencias con el stock", con Queso Barra −39 / −22 % en ámbar y Sal +30 % en ámbar.
  3. Aplicar: el confirm dice "pasa de 179 a 140 (−39 Caja)", sale el toast y la fila queda "Aplicada por Admin QA, 5/10". Ignorar y Revertir (aplicada e ignorada) funcionan. Revertir tiene confirm con números.
  4. Ficha de Sal: hay un movimiento "Ajuste por conteo" con el chip "Conteo", que vuelve al conteo, y en lugar de Revertir dice "Se revierte desde el conteo".
  5. El chip "Solicitud de compra" lleva a Solicitudes, y el modal de la solicitud tiene "Ver el conteo", que vuelve.
  6. Descartar con una aplicada: toast "Este conteo tiene diferencias aplicadas… Revertilas en Fábrica › Conteos…".
  7. "Aplicar todas (4)": el confirm muestra las 3 más grandes, sale el toast "4 diferencias aplicadas" y la lista queda "Revisado".
  8. Al cerrar el modal se limpia `?conteo=` (en dev tarda unos segundos por el re-render del server) y al recargar no se reabre. Con un id inexistente sale el toast "No encontramos ese conteo".
  9. Capturas a 375px y en desktop, en tema oscuro y claro, del conteo. Además: Fábrica a 375 y Stock en desktop.

## Datos que quedan en dev

- **Conteo Global `b42473c9-e106-4d2f-9857-97204b92c1b8`**: cerrado el 05/10 (ventana 06/10 → 09/10) por `qa-fabrica`, con la solicitud `bbf857ad-…` **abierta**.
  - 4 diferencias **pendientes**: Queso Barra −39, Fécula −6, Sal +3, Polvo −1.
  - Margarina y Sardo coinciden; Leche en Polvo y Pategrás quedaron sin contar.
- El conteo tiene 12 movimientos de QA (`ajuste_conteo`/`reversion`) que se netean en 0: el stock quedó igual que antes (Queso Barra 179, Fécula 96, Sal 10, Polvo 12).
- 1 movimiento `conteo_fabrica` de la conciliación (D12): Leche en Polvo −8, "Diferencia del conteo de fábrica sin registrar (antes de A1)".
- Hay un borrador nuevo de Global (creado al recargar `/fabrica/stock`), más los borradores de Bolsaplast y Huevos, todos vacíos ("sin contar").
- **Ojo:** como Global ya está cerrado el 05/10, para un cierre real hoy usá Bolsaplast o Huevos, o descartá esa solicitud (no tiene aplicadas).

## Vuelta 1 de corrección (revisión `review-a1-conteo-controla`)

La rama está rebaseada sobre `origin/qa` @ `f247bc8` (B0 incluido), sin conflictos.

**SQL:** migración nueva, `20261005130000_fabrica_conteo_controla_fixes.sql`. `20261005120000` no se tocó porque ya estaba aplicada. Ya está aplicada en dev.

1. **`descartar_solicitud`** hace `perform … from fabrica_conteos … for update` antes del `exists` de aplicadas. Es el mismo lock que el RPC de resolver: un "aplicar" en vuelo termina antes (y el `exists` lo ve) o espera al descarte (y lo rechaza por descartado).
2. **RLS de `fabrica_conteos`:**
   - `fabrica_conteos_modificacion` pasa a `using`/`with check (tiene_acceso_fabrica() and estado = 'borrador')`;
   - además, `fabrica_conteos_alta` exige `estado = 'borrador'` (antes Fábrica podía crear un conteo ya "cerrado");
   - el navegador solo hace `update` de borradores (retarget de la ventana y masas) e `insert` sin estado (default `borrador`);
   - `fabrica_conteo_items` ya no tiene policy de `update` desde `120000`, así que no queda otro agujero del mismo tipo.
   - En `cerrar_conteo_fabrica`, el sellado marca `pendiente` solo `where diferencia_estado is null`. De paso: un re-cierre ya choca con `compras_solicitudes_conteo_unique`, otra defensa más.
3. **"Hubo movimientos mientras se contaba"** (decisión: avisar, no bloquear). La vista `v_fabrica_conteo_diferencias` suma `movido_mientras_contaba`: la suma de movimientos del insumo con `created_at` en `(contado_en, cerrado_en]`. Se muestra en tres lugares:
   - en la fila, "Se movió +N mientras se contaba: revisá antes de aplicar";
   - en el confirm de Aplicar, con la explicación completa;
   - en el confirm de "Aplicar todas", con la lista de insumos afectados.
4. `v_compras_conteos_historial` suma `diferencias_resueltas` (un `count`). `admin/fabrica/conteos/page.tsx` ya no lee las filas resueltas.

**Front:**
- **Flush antes de cerrar.** `ConteoDesplegable` lleva la cuenta de los guardados programados y en vuelo:
  - "Cerrar control" queda deshabilitado ("Guardando lo contado…") mientras haya alguno, y lo mismo "Cerrar y pedir";
  - `confirmarCierre` corre los pendientes y espera los que están en vuelo antes del RPC;
  - si alguno falló, no cierra ("Hay cantidades que no se guardaron").
- **`key={def.conteo.id}`** en `StockClient`: al cerrar, el borrador nuevo monta con su propio estado.
- **B0:** `LinkEntidad` en los chips del banner de Stock, en el chip "Conteo" de la ficha, en "Ver el conteo" de Solicitudes, en el chip "Solicitud de compra" del conteo y en el link del insumo. `useQuitarParams('conteo')` y `useAlCambiarParam` reemplazan al `router.replace` inline. Ya no quedan `TODO(B0)`. El chip de la solicitud ahora **abre el modal** de la solicitud (`?solicitud=` de B0).
- **Desvío menor:** el modal del conteo pasa de `xl` a `2xl`. Con 6 columnas y dos botones, la tabla tenía 65px de scroll horizontal en `xl`; en `2xl` entra entera. Además, la columna Insumo tiene `min-w-48`.

**Verificación de la vuelta 1:**
- **Escenarios SQL** (las dos migraciones más los escenarios, en una transacción revertida sobre dev), todos OK:
  - F1: descartar con una aplicada da error, y el cuerpo tiene el `for update`.
  - F2 (como Fábrica):
    - `update` de un cerrado a borrador o a descartado afecta 0 filas;
    - `update` de masas en un borrador afecta 1 fila;
    - pasar un borrador a cerrado y dar de alta un conteo "cerrado" chocan con la RLS.
  - F2b: un re-cierre forzado (como postgres) deja la aplicada como `aplicada` y con su movimiento.
  - F3: contó 10, entró un remito de +4 antes del cierre: teórico 11, dif −1, `movido_mientras_contaba = 4` y `movido_desde_cierre = 0`. Los demás ítems dan 0.
  - F4: `diferencias_resueltas = 1`.
  - Invariante en 0.
- Push a dev: invariante **0**.
- `tsc`, eslint de los archivos tocados y `npm run build`: limpios.
- **QA en el navegador:**
  - **Fábrica** (Bolsaplast, 375px):
    - cargué 2 ítems y en dev metí un ajuste de +2 en Bolsa Consorcio 60x90;
    - cargué el tercero y en el acto el botón dijo "Guardando lo contado…" y quedó deshabilitado;
    - al cerrar, los 3 contados entraron al cierre;
    - sin recargar, Global y Bolsaplast muestran sus borradores nuevos y limpios.
  - **Admin:**
    - el banner muestra "6 diferencias" y el chip de Bolsaplast abre el conteo;
    - la fila de 60x90 tiene el aviso "Se movió +2 mientras se contaba", y los confirms de Aplicar y "Aplicar todas" lo mencionan;
    - el chip "Solicitud de compra" abre el modal de la solicitud, y "Ver el conteo" vuelve;
    - el link del insumo abre su ficha y el chip "Conteo" de la ficha abre el conteo.
  - Capturas a 375px y en desktop.

**Datos de dev que agrega esta vuelta:**
- **Conteo Bolsaplast `a9c57c8e-…`**: cerrado el 05/10, con la solicitud `b9cd4a73-…` abierta. Tiene 2 pendientes: 60x90 −3 (con el aviso +2) y 90x120 −1.
- En Bolsa Consorcio 60x90 hay dos `ajuste_manual` de QA, +2 y −2 ("QA A1…"). El stock sigue en 7. Por el −2 posterior al cierre, esa fila además muestra "Desde el cierre el stock se movió −2".

**Pregunta del Revisor sobre `fabrica-conteos` → `tiene_acceso_compras()`:** **fue por accidente.**
- `20260914120000_fabrica_seccion_admin.sql` sumó `fabrica-conteos` a `tiene_acceso_compras()` para que los roles que veían "Conteos de fábrica" en Compras › Stock siguieran pasando el gate de lectura de `v_compras_conteos_historial` cuando la pantalla se mudó a la sección Fábrica.
- El efecto colateral es que esos roles pasan **todos** los RPCs de Compras: desde A1, resolver diferencias, pero también ajustar stock, remitos, etc.
- No lo cambié. Si se quiere que solo lean, haría falta una función de lectura aparte para la vista. Queda para que lo decida el usuario.

## Qué cambiaría en el manual (`/ayuda`, no se toca por fase)

- `fabrica-conteos`: la pestaña Diferencias, qué es Aplicar, Ignorar y Revertir, qué significa "Superada" y por qué Aplicar todas saltea algunas, y el aviso "Desde el cierre el stock se movió".
- `fabrica`: el conteo arranca vacío ("Sin contar") y lo contado no cambia el stock; se puede cerrar con ítems sin contar.
- `compras-stock`: el conteo ya no pisa el stock, el banner de diferencias y que el ajuste por conteo se revierte desde el conteo.
- `compras-solicitudes`: no se puede descartar una solicitud con diferencias aplicadas sin revertirlas antes, y el link "Ver el conteo".

## Lista de pruebas para el usuario

Va cuando el coordinador mergee a `qa`, en **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev). Vale la lista de [`plan-A1.md` §11](plan-A1.md#11-lista-de-pruebas-para-el-usuario) (pasos 1–17), con estas precisiones:
- **Paso 4:** con `qa-fabrica`, el detalle del historial sigue sin mostrar líneas (es un problema de RLS anterior a A1). El "Sin contar" se ve entrando con una cuenta que tenga Compras.
- **Paso 13:** el chip "Solicitud de compra" abre el modal de la solicitud (B0 ya entró). Dentro del modal, "Ver el conteo" vuelve al conteo.
- **Paso nuevo (vuelta 1):** en el conteo de Bolsaplast del 05/10, la fila de Bolsa Consorcio 60x90 dice "Se movió +2 mientras se contaba", y los confirms de Aplicar y "Aplicar todas" lo mencionan.
- **Paso nuevo (vuelta 1):** con `qa-fabrica`, cargar un número y tocar enseguida "Cerrar control". → El botón dice "Guardando lo contado…" hasta que termina el guardado, y lo cargado entra al cierre.
- **Paso 3:** como Global ya está cerrado hoy en dev, usá Bolsaplast o Huevos para cerrar un conteo nuevo, o revisá el Global 05/10 que ya tiene 4 diferencias pendientes.
