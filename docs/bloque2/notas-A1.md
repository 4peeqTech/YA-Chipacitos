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

## Qué cambiaría en el manual (`/ayuda`, no se toca por fase)

- `fabrica-conteos`: la pestaña Diferencias, qué es Aplicar, Ignorar y Revertir, qué significa "Superada" y por qué Aplicar todas saltea algunas, y el aviso "Desde el cierre el stock se movió".
- `fabrica`: el conteo arranca vacío ("Sin contar") y lo contado no cambia el stock; se puede cerrar con ítems sin contar.
- `compras-stock`: el conteo ya no pisa el stock, el banner de diferencias y que el ajuste por conteo se revierte desde el conteo.
- `compras-solicitudes`: no se puede descartar una solicitud con diferencias aplicadas sin revertirlas antes, y el link "Ver el conteo".

## Lista de pruebas para el usuario

Va cuando el coordinador mergee a `qa`, en **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev). Vale la lista de [`plan-A1.md` §11](plan-A1.md#11-lista-de-pruebas-para-el-usuario) (pasos 1–17), con estas precisiones:
- **Paso 4:** con `qa-fabrica`, el detalle del historial sigue sin mostrar líneas (es un problema de RLS anterior a A1). El "Sin contar" se ve entrando con una cuenta que tenga Compras.
- **Paso 13:** el chip "Solicitud de compra" abre la lista de Solicitudes; hasta que entre B0 no abre el modal solo. Dentro del modal de la solicitud, "Ver el conteo" vuelve al conteo.
- **Paso 3:** como Global ya está cerrado hoy en dev, usá Bolsaplast o Huevos para cerrar un conteo nuevo, o revisá el Global 05/10 que ya tiene 4 diferencias pendientes.
