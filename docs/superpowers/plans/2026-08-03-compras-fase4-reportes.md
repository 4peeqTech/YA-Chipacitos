# Compras Fase 4 (Reportes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Reportes screen to Ya!Chipacitos' Compras module with three reports — gasto por proveedor, historial de pedidos y remitos, y movimiento de stock por insumo — all filterable by a shared date-range preset, without adding a charting dependency or touching costeo por masa (still a separate future phase).

**Architecture:** One new Postgres table (`compras_stock_movimientos`) that starts logging stock deltas from this phase onward (no retroactive backfill — the two existing write paths for `compras_stock_actual` get a movimiento insert added, not replaced). Two pure-function library files (`lib/compras/rangoFechas.ts`, `lib/compras/reportes.ts`) hold all date-range and aggregation logic, independently testable with `npx tsx`, mirroring the `matchRemito.ts`/`pedidoMensaje.ts` convention from Fases 2/3. A new screen (`/admin/compras/reportes`) follows the same server-page + client-component split as every other Compras screen: `page.tsx` fetches everything with joins, `ReportesClient.tsx` owns the shared date-range filter and tab switching, and each report lives in its own presentation-only component (`GastoPorProveedor.tsx`, `HistorialPedidos.tsx`, `MovimientoStock.tsx`) that calls the pure aggregation functions.

**Tech Stack:** Next.js 16 (App Router, `'use client'` components), React 19, Supabase (Postgres + RLS + `@supabase/ssr`), Tailwind v4. No test runner is configured in this repo — verification is `npx tsc --noEmit`, `npm run lint`, manual browser verification against `npm run dev`, and ad-hoc `npx tsx <archivo>.ts` sanity checks for pure functions (always a real file, never `npx tsx -e "..."` — with relative imports, `-e` silently prints nothing in this Windows/Git Bash environment and exits 0, giving false confidence).

## Global Constraints

- Branch: all work happens on `dev`. Never touch `main` (holds the production database, ref `ahlpthzsjipdpcnjbfdk`). Note: `fafckqysyvtlslfnpzrh` ("YA! mayorista") is the dev/test project, not prod — see the 2026-09-01 incident in `ARQUITECTURA.md` §9/S7.
- Access: only `admin` and `squad` roles use `/admin/compras/*`. RLS on the new table must allow `admin` AND `squad`, same pattern as every other `compras_*` table.
- CRUD/read pattern: bespoke server-fetch + client-component, exactly like every other Compras screen. Do NOT use or extend `components/ui/TablaMaestra.tsx`. No API routes.
- No charting library. Reports are tables + totals only — this was an explicit decision to stay consistent with the rest of the module (no chart dependency exists today).
- `compras_stock_movimientos` starts EMPTY. Do not attempt to backfill or reconstruct historical movements — there is no reliable source for them. The stock report's empty state must say data starts from this phase's deploy date, not read as broken.
- Stock-write instrumentation uses "Opción A": extend the two existing functions that already own writes to `compras_stock_actual` (`sumarStock` in `RemitosPedido.tsx`, `guardarCantidad` in `StockClient.tsx`) by adding a `compras_stock_movimientos` insert next to the existing upsert. Do NOT refactor these into a Postgres RPC/atomic function in this phase — that was explicitly deferred to avoid touching already-shipped, only-partially-QA'd Fase 3 code.
- Costeo por masa remains OUT of scope. `compras_remito_items.precio` is read here only to compute gasto totals for these reports — never for any cost-per-kg/per-masa calculation.
- Spec reference: `docs/superpowers/specs/2026-08-03-compras-fase4-reportes-design.md`.

---

### Task 1: Migración SQL — `compras_stock_movimientos`

**Files:**
- Create: `supabase/migrations/20260803210000_compras_fase4_stock_movimientos.sql`

**Interfaces:**
- Produces: table `compras_stock_movimientos(id uuid, item_id uuid, delta numeric, tipo text, remito_id uuid|null, creado_por uuid|null, created_at timestamptz)`. Tasks 5 and 6 insert into it; Task 9's report reads from it.

- [ ] **Step 1: Confirm the latest applied migration timestamp**

Run: `ls supabase/migrations | tail -3`
Expected: `20260803180000_compras_fase3_remitos.sql` is the most recent. If a newer migration exists that isn't reflected here, rename this task's file to a timestamp after it instead of `20260803210000`.

- [ ] **Step 2: Write the migration file**

```sql
-- Fase 4 de Compras: reportes — tabla de movimientos de stock
-- Arranca vacía: no hay reconstrucción retroactiva de movimientos previos
-- a esta fase (compras_stock_actual nunca guardó historial).

create table if not exists compras_stock_movimientos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references compras_items(id) on delete cascade,
  delta        numeric not null,
  tipo         text not null check (tipo in ('entrada_remito', 'ajuste_manual')),
  remito_id    uuid references compras_remitos(id) on delete set null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_compras_stock_movimientos_item_id on compras_stock_movimientos(item_id);

alter table compras_stock_movimientos enable row level security;

create policy "admin y squad manejan compras_stock_movimientos" on compras_stock_movimientos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Run: `supabase db push`
Expected: output lists `20260803210000_compras_fase4_stock_movimientos.sql` as applied, no errors. If the CLI isn't linked in this shell, apply the same SQL via the Supabase Studio SQL editor for the `dev`-linked project instead, then confirm with:

```bash
npx supabase db query --linked "select table_name from information_schema.tables where table_name = 'compras_stock_movimientos'"
```

Expected: the table listed.

- [ ] **Step 4: Verify RLS policy exists**

Run:
```bash
npx supabase db query --linked "select tablename, policyname from pg_policies where tablename = 'compras_stock_movimientos'"
```
Expected: one policy row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803210000_compras_fase4_stock_movimientos.sql
git commit -m "db: agregar compras_stock_movimientos (Compras Fase 4)"
```

---

### Task 2: Entrada "Reportes" en `lib/modulos.ts`

**Files:**
- Modify: `lib/modulos.ts:41` (insert new entry after `compras-remitos`, before the `tareas` line)

**Interfaces:**
- Consumes: `Modulo` interface at `lib/modulos.ts:1-7` — no changes to its shape.
- Produces: one new `Modulo` entry with `key: 'compras-reportes'`, `section: 'Compras'`. Task 7's page must live at the exact `href` used here.

- [ ] **Step 1: Add the new module entry**

In `lib/modulos.ts`, right after the `compras-remitos` line and before the `tareas` line:

```ts
  { key: 'compras-reportes', label: 'Reportes', icon: '📊', href: '/admin/compras/reportes', section: 'Compras' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `admin`, open the sidebar. Expected: the "Compras" section now shows "Insumos", "Stock", "Pedidos", "Remitos", and "Reportes" (the last one 404s until Task 7 lands — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add lib/modulos.ts
git commit -m "feat: agregar Reportes a la sección Compras en modulos.ts"
```

---

### Task 3: Helper puro — rango de fechas

**Files:**
- Create: `lib/compras/rangoFechas.ts`

**Interfaces:**
- Consumes: nothing from other tasks — pure function, no Supabase calls, no React.
- Produces: `type PresetRango = 'mes_actual' | 'mes_anterior'`, `interface RangoFechas { desde: string; hasta: string }`, `calcularRangoPreset(preset: PresetRango, ahora: Date): RangoFechas`, `fechaEnRango(fecha: string, rango: RangoFechas): boolean`. Imported by Task 7's `ReportesClient.tsx`.

- [ ] **Step 1: Write `lib/compras/rangoFechas.ts`**

```ts
export type PresetRango = 'mes_actual' | 'mes_anterior'

export interface RangoFechas {
  desde: string // 'YYYY-MM-DD', inclusive
  hasta: string // 'YYYY-MM-DD', inclusive
}

// Usa los componentes locales del Date (no toISOString) para no
// arrastrar un corrimiento de huso horario al convertir a UTC.
function formatearFecha(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Calcula el rango de un preset relativo a `ahora`. Recibe `ahora` como
// parámetro (en vez de usar `new Date()` internamente) para que sea
// determinístico y testeable con npx tsx.
export function calcularRangoPreset(preset: PresetRango, ahora: Date): RangoFechas {
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth() // 0-11
  const mesObjetivo = preset === 'mes_actual' ? mes : mes - 1

  const desde = new Date(anio, mesObjetivo, 1)
  const hasta = new Date(anio, mesObjetivo + 1, 0) // día 0 del mes siguiente = último día del mes objetivo

  return { desde: formatearFecha(desde), hasta: formatearFecha(hasta) }
}

// Compara fechas como texto 'YYYY-MM-DD' — comparación lexicográfica
// válida para ese formato, evita reconstruir un Date por cada fila.
// `fecha` puede venir como 'YYYY-MM-DD' (columna date) o como timestamp
// ISO completo (columna timestamptz) — en ambos casos los primeros 10
// caracteres son el día.
export function fechaEnRango(fecha: string, rango: RangoFechas): boolean {
  const dia = fecha.slice(0, 10)
  return dia >= rango.desde && dia <= rango.hasta
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual sanity check**

Create a temporary file `lib/compras/_check_rangoFechas.ts`:

```ts
import { calcularRangoPreset, fechaEnRango } from './rangoFechas'

const agosto = new Date(2026, 7, 15) // 15 de agosto de 2026
console.log(calcularRangoPreset('mes_actual', agosto))
console.log(calcularRangoPreset('mes_anterior', agosto))

const enero = new Date(2026, 0, 10) // 10 de enero de 2026 — cruza año hacia atrás
console.log(calcularRangoPreset('mes_anterior', enero))

const rangoAgosto = calcularRangoPreset('mes_actual', agosto)
console.log(fechaEnRango('2026-08-01', rangoAgosto))
console.log(fechaEnRango('2026-08-31T23:00:00.000Z', rangoAgosto))
console.log(fechaEnRango('2026-09-01', rangoAgosto))
console.log(fechaEnRango('2026-07-31', rangoAgosto))
```

Run: `npx tsx lib/compras/_check_rangoFechas.ts`
Expected output (in order):
```
{ desde: '2026-08-01', hasta: '2026-08-31' }
{ desde: '2026-07-01', hasta: '2026-07-31' }
{ desde: '2025-12-01', hasta: '2025-12-31' }
true
true
false
false
```

Then delete the temporary file:
```bash
rm lib/compras/_check_rangoFechas.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/compras/rangoFechas.ts
git commit -m "feat: helper puro de rango de fechas para reportes"
```

---

### Task 4: Helper puro — agregaciones de reportes

**Files:**
- Create: `lib/compras/reportes.ts`

**Interfaces:**
- Consumes: nothing from other tasks — pure functions, no Supabase calls, no React. Types mirror the exact shape of the Supabase `select()` strings used in Task 7/8/9's `page.tsx`.
- Produces: types `LineaRemitoReporte`, `RemitoReporte`, `GastoProveedor`, `DetalleLineaGasto`, `PedidoReporte`, `HistorialPedido`, `RemitoResumen`, `MovimientoReporte`, `MovimientoInsumo`, `MovimientoDetalle`, and functions `calcularGastoPorProveedor(remitos: RemitoReporte[]): GastoProveedor[]`, `calcularHistorialPedidos(pedidos: PedidoReporte[]): HistorialPedido[]`, `calcularMovimientoPorInsumo(movimientos: MovimientoReporte[], stockActualPorItem: Record<string, number>): MovimientoInsumo[]`. Imported by Task 7/8/9's report components.

- [ ] **Step 1: Write `lib/compras/reportes.ts`**

```ts
export interface LineaRemitoReporte {
  descripcion: string
  cantidad: number
  precio: number | null
}

export interface RemitoReporte {
  id: string
  numero: string
  fecha: string
  compras_pedidos: { proveedor_id: string; proveedores: { nombre: string } | null } | null
  compras_remito_items: LineaRemitoReporte[]
}

export interface DetalleLineaGasto {
  remitoId: string
  remitoNumero: string
  descripcion: string
  cantidad: number
  precio: number
  subtotal: number
}

export interface GastoProveedor {
  proveedorId: string
  proveedorNombre: string
  remitosCount: number
  lineasConPrecio: number
  lineasSinPrecio: number
  gastoTotal: number
  detalle: DetalleLineaGasto[]
}

// Agrupa remitos por proveedor y suma cantidad × precio de sus líneas.
// Líneas sin precio (precio es opcional al registrar el remito) se
// cuentan en `lineasSinPrecio` pero no entran en `gastoTotal` — evita
// que el total se lea como exacto cuando en realidad es parcial.
export function calcularGastoPorProveedor(remitos: RemitoReporte[]): GastoProveedor[] {
  const porProveedor = new Map<string, GastoProveedor>()

  for (const remito of remitos) {
    const proveedorId = remito.compras_pedidos?.proveedor_id
    if (!proveedorId) continue
    const proveedorNombre = remito.compras_pedidos?.proveedores?.nombre ?? '—'

    let grupo = porProveedor.get(proveedorId)
    if (!grupo) {
      grupo = { proveedorId, proveedorNombre, remitosCount: 0, lineasConPrecio: 0, lineasSinPrecio: 0, gastoTotal: 0, detalle: [] }
      porProveedor.set(proveedorId, grupo)
    }
    grupo.remitosCount++

    for (const linea of remito.compras_remito_items) {
      if (linea.precio == null) {
        grupo.lineasSinPrecio++
        continue
      }
      const subtotal = linea.cantidad * linea.precio
      grupo.lineasConPrecio++
      grupo.gastoTotal += subtotal
      grupo.detalle.push({
        remitoId: remito.id,
        remitoNumero: remito.numero,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precio: linea.precio,
        subtotal,
      })
    }
  }

  return [...porProveedor.values()].sort((a, b) => b.gastoTotal - a.gastoTotal)
}

export interface PedidoReporte {
  id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  created_at: string
  enviado_en: string | null
  cerrado_en: string | null
  proveedores: { nombre: string } | null
  compras_remitos: { id: string; numero: string; fecha: string; compras_remito_items: LineaRemitoReporte[] }[]
}

export interface RemitoResumen {
  remitoId: string
  numero: string
  fecha: string
  lineasCount: number
  gastoTotal: number
}

export interface HistorialPedido {
  pedidoId: string
  proveedorNombre: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  createdAt: string
  enviadoEn: string | null
  cerradoEn: string | null
  remitosCount: number
  gastoTotal: number
  remitos: RemitoResumen[]
}

// Mismo cálculo que calcularGastoPorProveedor (cantidad × precio,
// ignorando líneas sin precio), a nivel de un solo remito.
function calcularGastoRemito(items: LineaRemitoReporte[]): number {
  return items.reduce((total, linea) => total + (linea.precio != null ? linea.cantidad * linea.precio : 0), 0)
}

export function calcularHistorialPedidos(pedidos: PedidoReporte[]): HistorialPedido[] {
  return pedidos.map(pedido => {
    const remitos = pedido.compras_remitos.map(remito => ({
      remitoId: remito.id,
      numero: remito.numero,
      fecha: remito.fecha,
      lineasCount: remito.compras_remito_items.length,
      gastoTotal: calcularGastoRemito(remito.compras_remito_items),
    }))

    return {
      pedidoId: pedido.id,
      proveedorNombre: pedido.proveedores?.nombre ?? '—',
      estado: pedido.estado,
      createdAt: pedido.created_at,
      enviadoEn: pedido.enviado_en,
      cerradoEn: pedido.cerrado_en,
      remitosCount: remitos.length,
      gastoTotal: remitos.reduce((total, r) => total + r.gastoTotal, 0),
      remitos,
    }
  })
}

export interface MovimientoReporte {
  id: string
  item_id: string
  delta: number
  tipo: 'entrada_remito' | 'ajuste_manual'
  remito_id: string | null
  created_at: string
  compras_items: { nombre: string; proveedores: { nombre: string } | null } | null
}

export interface MovimientoDetalle {
  movimientoId: string
  fecha: string
  tipo: 'entrada_remito' | 'ajuste_manual'
  delta: number
  remitoId: string | null
}

export interface MovimientoInsumo {
  itemId: string
  itemNombre: string
  proveedorNombre: string
  entradas: number
  ajustes: number
  balance: number
  stockActual: number
  movimientos: MovimientoDetalle[]
}

// Agrupa movimientos por insumo. Insumos sin ningún movimiento en la
// lista recibida no aparecen — el caller filtra `movimientos` por rango
// de fecha antes de llamar a esta función, así que "sin movimientos en
// la lista" ya significa "sin movimientos en el período elegido".
export function calcularMovimientoPorInsumo(
  movimientos: MovimientoReporte[],
  stockActualPorItem: Record<string, number>
): MovimientoInsumo[] {
  const porItem = new Map<string, MovimientoInsumo>()

  for (const mov of movimientos) {
    let grupo = porItem.get(mov.item_id)
    if (!grupo) {
      grupo = {
        itemId: mov.item_id,
        itemNombre: mov.compras_items?.nombre ?? '—',
        proveedorNombre: mov.compras_items?.proveedores?.nombre ?? '—',
        entradas: 0,
        ajustes: 0,
        balance: 0,
        stockActual: stockActualPorItem[mov.item_id] ?? 0,
        movimientos: [],
      }
      porItem.set(mov.item_id, grupo)
    }

    if (mov.tipo === 'entrada_remito') grupo.entradas += mov.delta
    else grupo.ajustes += mov.delta
    grupo.balance += mov.delta

    grupo.movimientos.push({
      movimientoId: mov.id,
      fecha: mov.created_at,
      tipo: mov.tipo,
      delta: mov.delta,
      remitoId: mov.remito_id,
    })
  }

  return [...porItem.values()].sort((a, b) => a.itemNombre.localeCompare(b.itemNombre))
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual sanity check**

Create a temporary file `lib/compras/_check_reportes.ts`:

```ts
import { calcularGastoPorProveedor, calcularHistorialPedidos, calcularMovimientoPorInsumo } from './reportes'

const remitos = [
  {
    id: 'r1', numero: '001', fecha: '2026-08-05',
    compras_pedidos: { proveedor_id: 'global', proveedores: { nombre: 'Global' } },
    compras_remito_items: [
      { descripcion: 'Sardo', cantidad: 10, precio: 500 },
      { descripcion: 'Muzzarella', cantidad: 5, precio: null },
    ],
  },
  {
    id: 'r2', numero: '002', fecha: '2026-08-10',
    compras_pedidos: { proveedor_id: 'global', proveedores: { nombre: 'Global' } },
    compras_remito_items: [{ descripcion: 'Sardo', cantidad: 4, precio: 500 }],
  },
]

console.log(JSON.stringify(calcularGastoPorProveedor(remitos), null, 2))
// Esperado: un grupo "Global", gastoTotal 7000 (10*500 + 4*500), lineasConPrecio 2, lineasSinPrecio 1

const pedidos = [
  {
    id: 'p1', estado: 'cerrado' as const, created_at: '2026-08-01', enviado_en: '2026-08-02', cerrado_en: '2026-08-12',
    proveedores: { nombre: 'Global' },
    compras_remitos: remitos.map(r => ({ id: r.id, numero: r.numero, fecha: r.fecha, compras_remito_items: r.compras_remito_items })),
  },
]

console.log(JSON.stringify(calcularHistorialPedidos(pedidos), null, 2))
// Esperado: un pedido con remitosCount 2, gastoTotal 7000

const movimientos = [
  { id: 'm1', item_id: 'sardo', delta: 10, tipo: 'entrada_remito' as const, remito_id: 'r1', created_at: '2026-08-05', compras_items: { nombre: 'Sardo', proveedores: { nombre: 'Global' } } },
  { id: 'm2', item_id: 'sardo', delta: -2, tipo: 'ajuste_manual' as const, remito_id: null, created_at: '2026-08-06', compras_items: { nombre: 'Sardo', proveedores: { nombre: 'Global' } } },
]

console.log(JSON.stringify(calcularMovimientoPorInsumo(movimientos, { sardo: 8 }), null, 2))
// Esperado: un insumo "Sardo", entradas 10, ajustes -2, balance 8, stockActual 8
```

Run: `npx tsx lib/compras/_check_reportes.ts`
Expected: the three JSON outputs match the values noted in the comments (gasto total 7000 for Global; historial pedido with remitosCount 2 and gastoTotal 7000; Sardo with entradas 10, ajustes -2, balance 8, stockActual 8).

Then delete the temporary file:
```bash
rm lib/compras/_check_reportes.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/compras/reportes.ts
git commit -m "feat: helpers puros de agregación para reportes de compras"
```

---

### Task 5: Instrumentar entradas de stock por remito

**Files:**
- Modify: `app/admin/compras/pedidos/RemitosPedido.tsx`

**Interfaces:**
- Consumes: `compras_stock_movimientos` table (Task 1).
- Produces: every stock change caused by registering/editing/deleting a remito now has a matching row in `compras_stock_movimientos` with `tipo='entrada_remito'`. Task 9's report reads these.

- [ ] **Step 1: Add a `remitoId` parameter to `sumarStock` and log the movimiento**

In `app/admin/compras/pedidos/RemitosPedido.tsx`, replace the `sumarStock` function:

```ts
  async function sumarStock(itemId: string, delta: number) {
    const { data: actual } = await supabase
      .from('compras_stock_actual')
      .select('cantidad')
      .eq('item_id', itemId)
      .maybeSingle()

    const nuevaCantidad = (actual?.cantidad ?? 0) + delta
    await supabase.from('compras_stock_actual').upsert(
      { item_id: itemId, cantidad: nuevaCantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
      { onConflict: 'item_id' }
    )
  }
```

with:

```ts
  async function sumarStock(itemId: string, delta: number, remitoId: string) {
    const { data: actual } = await supabase
      .from('compras_stock_actual')
      .select('cantidad')
      .eq('item_id', itemId)
      .maybeSingle()

    const nuevaCantidad = (actual?.cantidad ?? 0) + delta
    await supabase.from('compras_stock_actual').upsert(
      { item_id: itemId, cantidad: nuevaCantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
      { onConflict: 'item_id' }
    )
    await supabase.from('compras_stock_movimientos').insert(
      { item_id: itemId, delta, tipo: 'entrada_remito', remito_id: remitoId, creado_por: usuarioId }
    )
  }
```

- [ ] **Step 2: Update both call sites to pass the `remitoId`**

In `revertirYBorrar`, change:
```ts
      if (item.item_id) await sumarStock(item.item_id, -item.cantidad)
```
to:
```ts
      if (item.item_id) await sumarStock(item.item_id, -item.cantidad, remitoId)
```

In `guardarRemito`, change:
```ts
      for (const item of itemsGuardados) {
        if (item.item_id) await sumarStock(item.item_id, item.cantidad)
      }
```
to:
```ts
      for (const item of itemsGuardados) {
        if (item.item_id) await sumarStock(item.item_id, item.cantidad, remito.id)
      }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/pedidos`. Register a remito with at least one matched line (as in Fase 3's flow). Then check via:
```bash
npx supabase db query --linked "select item_id, delta, tipo, remito_id from compras_stock_movimientos order by created_at desc limit 5"
```
Expected: a row with `tipo='entrada_remito'`, the `delta` matching the cantidad you entered, and `remito_id` matching the new remito's id. Edit that remito's cantidad and save again — expected: two more rows (a negative-delta reversion, then a new positive-delta entry), and the net sum of all three rows for that item equals the final cantidad. Delete the remito — expected: one more negative-delta row that brings the net sum back to 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/pedidos/RemitosPedido.tsx
git commit -m "feat: registrar movimientos de stock al recibir remitos"
```

---

### Task 6: Instrumentar ajustes manuales de stock

**Files:**
- Modify: `app/admin/compras/stock/StockClient.tsx`

**Interfaces:**
- Consumes: `compras_stock_movimientos` table (Task 1).
- Produces: every manual stock edit on `/admin/compras/stock` now has a matching row in `compras_stock_movimientos` with `tipo='ajuste_manual'` (only when the value actually changed). Task 9's report reads these.

- [ ] **Step 1: Compute the delta and log the movimiento in `guardarCantidad`**

In `app/admin/compras/stock/StockClient.tsx`, replace `guardarCantidad`:

```ts
  async function guardarCantidad(itemId: string) {
    const cantidad = Number(cantidadesForm[itemId])
    if (Number.isNaN(cantidad) || cantidad < 0) { setError('Cantidad inválida'); return }
    setError('')
    setGuardandoId(itemId)

    startTransition(async () => {
      const { data, error: err } = await supabase
        .from('compras_stock_actual')
        .upsert(
          { item_id: itemId, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
          { onConflict: 'item_id' }
        )
        .select()
        .single()

      setGuardandoId(null)
      if (err) { setError(err.message); return }
      setStockPorItem(prev => ({ ...prev, [itemId]: data }))
    })
  }
```

with:

```ts
  async function guardarCantidad(itemId: string) {
    const cantidad = Number(cantidadesForm[itemId])
    if (Number.isNaN(cantidad) || cantidad < 0) { setError('Cantidad inválida'); return }
    setError('')
    setGuardandoId(itemId)

    const cantidadAnterior = stockPorItem[itemId]?.cantidad ?? 0
    const delta = cantidad - cantidadAnterior

    startTransition(async () => {
      const { data, error: err } = await supabase
        .from('compras_stock_actual')
        .upsert(
          { item_id: itemId, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
          { onConflict: 'item_id' }
        )
        .select()
        .single()

      setGuardandoId(null)
      if (err) { setError(err.message); return }
      setStockPorItem(prev => ({ ...prev, [itemId]: data }))

      if (delta !== 0) {
        await supabase.from('compras_stock_movimientos').insert(
          { item_id: itemId, delta, tipo: 'ajuste_manual', creado_por: usuarioId }
        )
      }
    })
  }
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/stock`. Change an item's cantidad and save. Check:
```bash
npx supabase db query --linked "select item_id, delta, tipo from compras_stock_movimientos where tipo = 'ajuste_manual' order by created_at desc limit 3"
```
Expected: a new row with `tipo='ajuste_manual'` and `delta` equal to the difference you just entered. Save the exact same value again (no change) — expected: no new row is inserted (delta would be 0).

- [ ] **Step 4: Commit**

```bash
git add app/admin/compras/stock/StockClient.tsx
git commit -m "feat: registrar ajustes manuales de stock como movimiento"
```

---

### Task 7: Pantalla de Reportes — shell + Gasto por proveedor

**Files:**
- Create: `app/admin/compras/reportes/page.tsx`
- Create: `app/admin/compras/reportes/ReportesClient.tsx`
- Create: `app/admin/compras/reportes/GastoPorProveedor.tsx`

**Interfaces:**
- Consumes: `RemitoReporte`, `PedidoReporte`, `MovimientoReporte`, `calcularGastoPorProveedor` (Task 4); `RangoFechas`, `PresetRango`, `calcularRangoPreset`, `fechaEnRango` (Task 3).
- Produces: `ReportesClient` renders three tabs; this task wires up the "Gasto por proveedor" tab and the shared date filter shell. `HistorialPedidos`/`MovimientoStock` (Tasks 8/9) plug into the same shell — `ReportesClient` imports them by the exact names used here, so Tasks 8/9 must export components matching those names and prop shapes.

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportesClient from './ReportesClient'

export const metadata = { title: 'Reportes | YA! Chipacitos' }

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: remitos },
    { data: pedidos },
    { data: movimientos },
    { data: stock },
  ] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('id, numero, fecha, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(descripcion, cantidad, precio)')
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select('id, estado, created_at, enviado_en, cerrado_en, proveedores(nombre), compras_remitos(id, numero, fecha, compras_remito_items(descripcion, cantidad, precio))')
      .order('created_at', { ascending: false }),
    supabase
      .from('compras_stock_movimientos')
      .select('id, item_id, delta, tipo, remito_id, created_at, compras_items(nombre, proveedores(nombre))')
      .order('created_at', { ascending: false }),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
  ])

  return (
    <ReportesClient
      remitosIniciales={remitos ?? []}
      pedidosIniciales={pedidos ?? []}
      movimientosIniciales={movimientos ?? []}
      stockInicial={stock ?? []}
    />
  )
}
```

- [ ] **Step 2: Write `ReportesClient.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import type { RemitoReporte, PedidoReporte, MovimientoReporte } from '@/lib/compras/reportes'
import GastoPorProveedor from './GastoPorProveedor'
import HistorialPedidos from './HistorialPedidos'
import MovimientoStock from './MovimientoStock'

type Tab = 'gasto' | 'historial' | 'stock'
type PresetUI = PresetRango | 'personalizado'

interface StockActualRow {
  item_id: string
  cantidad: number
}

export default function ReportesClient({
  remitosIniciales,
  pedidosIniciales,
  movimientosIniciales,
  stockInicial,
}: {
  remitosIniciales: RemitoReporte[]
  pedidosIniciales: PedidoReporte[]
  movimientosIniciales: MovimientoReporte[]
  stockInicial: StockActualRow[]
}) {
  const [tab, setTab] = useState<Tab>('gasto')
  const [preset, setPreset] = useState<PresetUI>('mes_actual')
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))

  const rango: RangoFechas = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return calcularRangoPreset(preset, new Date())
  }, [preset, rangoPersonalizado])

  const remitosFiltrados = useMemo(
    () => remitosIniciales.filter(r => fechaEnRango(r.fecha, rango)),
    [remitosIniciales, rango]
  )
  const pedidosFiltrados = useMemo(
    () => pedidosIniciales.filter(p => fechaEnRango(p.created_at, rango)),
    [pedidosIniciales, rango]
  )
  const movimientosFiltrados = useMemo(
    () => movimientosIniciales.filter(m => fechaEnRango(m.created_at, rango)),
    [movimientosIniciales, rango]
  )
  const stockActualPorItem = useMemo(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad])),
    [stockInicial]
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gasto', label: 'Gasto por proveedor' },
    { key: 'historial', label: 'Historial de pedidos y remitos' },
    { key: 'stock', label: 'Movimiento de stock' },
  ]

  const presets: { key: PresetUI; label: string }[] = [
    { key: 'mes_actual', label: 'Mes actual' },
    { key: 'mes_anterior', label: 'Mes anterior' },
    { key: 'personalizado', label: 'Personalizado' },
  ]

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Reportes</h1>
        <p className="text-[#888] text-sm mt-0.5">Gasto, historial de pedidos/remitos y movimiento de stock del período elegido.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.key ? 'bg-[#2a2a2a] text-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {p.label}
          </button>
        ))}

        {preset === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={inputClass}
              value={rangoPersonalizado.desde}
              onChange={e => setRangoPersonalizado(prev => ({ ...prev, desde: e.target.value }))}
            />
            <span className="text-[#888] text-xs">al</span>
            <input
              type="date"
              className={inputClass}
              value={rangoPersonalizado.hasta}
              onChange={e => setRangoPersonalizado(prev => ({ ...prev, hasta: e.target.value }))}
            />
          </div>
        )}

        <span className="text-xs text-[#888]">Período: {rango.desde} al {rango.hasta}</span>
      </div>

      {tab === 'gasto' && <GastoPorProveedor remitos={remitosFiltrados} />}
      {tab === 'historial' && <HistorialPedidos pedidos={pedidosFiltrados} />}
      {tab === 'stock' && <MovimientoStock movimientos={movimientosFiltrados} stockActualPorItem={stockActualPorItem} />}
    </div>
  )
}
```

- [ ] **Step 3: Write `GastoPorProveedor.tsx`**

```tsx
'use client'

import { Fragment, useState } from 'react'
import { calcularGastoPorProveedor, type RemitoReporte } from '@/lib/compras/reportes'

function money(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GastoPorProveedor({ remitos }: { remitos: RemitoReporte[] }) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularGastoPorProveedor(remitos)
  const totalGeneral = filas.reduce((total, f) => total + f.gastoTotal, 0)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        No hay remitos con líneas en el período elegido.
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Remitos</th>
              <th className={thClass}>Líneas con precio</th>
              <th className={thClass}>Líneas sin precio</th>
              <th className={thClass}>Gasto total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(f => (
              <Fragment key={f.proveedorId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === f.proveedorId ? null : f.proveedorId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === f.proveedorId ? '▼ ' : '▶ '}{f.proveedorNombre}
                  </td>
                  <td className="px-4 py-3 text-[#888]">{f.remitosCount}</td>
                  <td className="px-4 py-3 text-[#888]">{f.lineasConPrecio}</td>
                  <td className="px-4 py-3 text-[#888]">{f.lineasSinPrecio}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">${money(f.gastoTotal)}</td>
                </tr>
                {expandidoId === f.proveedorId && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 bg-[#0a0a0a]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#888]">
                            <th className="text-left py-1 pr-3">Remito</th>
                            <th className="text-left py-1 pr-3">Descripción</th>
                            <th className="text-left py-1 pr-3">Cantidad</th>
                            <th className="text-left py-1 pr-3">Precio</th>
                            <th className="text-left py-1">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.detalle.map((d, idx) => (
                            <tr key={idx} className="text-[#ccc]">
                              <td className="py-1 pr-3">{d.remitoNumero}</td>
                              <td className="py-1 pr-3">{d.descripcion}</td>
                              <td className="py-1 pr-3">{d.cantidad}</td>
                              <td className="py-1 pr-3">${money(d.precio)}</td>
                              <td className="py-1">${money(d.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t border-[#2a2a2a]">
            <tr>
              <td className="px-4 py-3 text-[#e8c547] font-semibold" colSpan={4}>Total del período</td>
              <td className="px-4 py-3 text-[#e8c547] font-semibold">${money(totalGeneral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY about missing modules `./HistorialPedidos` and `./MovimientoStock` (Tasks 8/9 haven't created them yet). No other errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/reportes/page.tsx app/admin/compras/reportes/ReportesClient.tsx app/admin/compras/reportes/GastoPorProveedor.tsx
git commit -m "feat: pantalla de reportes — shell y gasto por proveedor"
```

---

### Task 8: Reporte de Historial de pedidos y remitos

**Files:**
- Create: `app/admin/compras/reportes/HistorialPedidos.tsx`

**Interfaces:**
- Consumes: `calcularHistorialPedidos`, `PedidoReporte` (Task 4). Must export a default component accepting `{ pedidos: PedidoReporte[] }`, matching how `ReportesClient.tsx` (Task 7) already imports and renders it.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `HistorialPedidos.tsx`**

```tsx
'use client'

import { Fragment, useState } from 'react'
import { calcularHistorialPedidos, type PedidoReporte } from '@/lib/compras/reportes'

function money(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ESTADO_BADGE: Record<PedidoReporte['estado'], string> = {
  borrador: 'bg-[#2a2a2a] text-[#ccc]',
  enviado: 'bg-yellow-900/50 text-yellow-300',
  cerrado: 'bg-green-900/50 text-green-300',
}

export default function HistorialPedidos({ pedidos }: { pedidos: PedidoReporte[] }) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularHistorialPedidos(pedidos)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        No hay pedidos en el período elegido.
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}>Creado</th>
              <th className={thClass}>Enviado</th>
              <th className={thClass}>Cerrado</th>
              <th className={thClass}>Remitos</th>
              <th className={thClass}>Gasto total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(p => (
              <Fragment key={p.pedidoId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === p.pedidoId ? null : p.pedidoId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === p.pedidoId ? '▼ ' : '▶ '}{p.proveedorNombre}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado]}`}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-[#888]">{new Date(p.createdAt).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3 text-[#888]">{p.enviadoEn ? new Date(p.enviadoEn).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-[#888]">{p.cerradoEn ? new Date(p.cerradoEn).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-[#888]">{p.remitosCount}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">${money(p.gastoTotal)}</td>
                </tr>
                {expandidoId === p.pedidoId && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 bg-[#0a0a0a]">
                      {p.remitos.length === 0 ? (
                        <p className="text-xs text-[#888]">Sin remitos registrados.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#888]">
                              <th className="text-left py-1 pr-3">N° Remito</th>
                              <th className="text-left py-1 pr-3">Fecha</th>
                              <th className="text-left py-1 pr-3">Líneas</th>
                              <th className="text-left py-1">Gasto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.remitos.map(r => (
                              <tr key={r.remitoId} className="text-[#ccc]">
                                <td className="py-1 pr-3">{r.numero}</td>
                                <td className="py-1 pr-3">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                                <td className="py-1 pr-3">{r.lineasCount}</td>
                                <td className="py-1">${money(r.gastoTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY about the still-missing `./MovimientoStock` module (Task 9). No other errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/compras/reportes/HistorialPedidos.tsx
git commit -m "feat: reporte de historial de pedidos y remitos"
```

---

### Task 9: Reporte de Movimiento de stock por insumo

**Files:**
- Create: `app/admin/compras/reportes/MovimientoStock.tsx`

**Interfaces:**
- Consumes: `calcularMovimientoPorInsumo`, `MovimientoReporte` (Task 4). Must export a default component accepting `{ movimientos: MovimientoReporte[]; stockActualPorItem: Record<string, number> }`, matching how `ReportesClient.tsx` (Task 7) already imports and renders it.
- Produces: nothing consumed by later tasks — last component of this phase.

- [ ] **Step 1: Write `MovimientoStock.tsx`**

```tsx
'use client'

import { Fragment, useState } from 'react'
import { calcularMovimientoPorInsumo, type MovimientoReporte } from '@/lib/compras/reportes'

const TIPO_LABEL: Record<'entrada_remito' | 'ajuste_manual', string> = {
  entrada_remito: 'Entrada (remito)',
  ajuste_manual: 'Ajuste manual',
}

export default function MovimientoStock({
  movimientos,
  stockActualPorItem,
}: {
  movimientos: MovimientoReporte[]
  stockActualPorItem: Record<string, number>
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularMovimientoPorInsumo(movimientos, stockActualPorItem)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        Sin movimientos de stock en el período elegido. Los movimientos se registran desde el despliegue de esta fase — no hay historial anterior.
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Entradas (remito)</th>
              <th className={thClass}>Ajustes manuales</th>
              <th className={thClass}>Balance del período</th>
              <th className={thClass}>Stock actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(f => (
              <Fragment key={f.itemId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === f.itemId ? null : f.itemId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === f.itemId ? '▼ ' : '▶ '}{f.itemNombre}
                  </td>
                  <td className="px-4 py-3 text-[#888]">{f.proveedorNombre}</td>
                  <td className="px-4 py-3 text-[#888]">{f.entradas}</td>
                  <td className="px-4 py-3 text-[#888]">{f.ajustes}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">{f.balance}</td>
                  <td className="px-4 py-3 text-[#888]">{f.stockActual}</td>
                </tr>
                {expandidoId === f.itemId && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-[#0a0a0a]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#888]">
                            <th className="text-left py-1 pr-3">Fecha</th>
                            <th className="text-left py-1 pr-3">Tipo</th>
                            <th className="text-left py-1">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.movimientos.map(m => (
                            <tr key={m.movimientoId} className="text-[#ccc]">
                              <td className="py-1 pr-3">{new Date(m.fecha).toLocaleString('es-AR')}</td>
                              <td className="py-1 pr-3">{TIPO_LABEL[m.tipo]}</td>
                              <td className="py-1">{m.delta}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors anywhere in `app/admin/compras/reportes/` — this is the last missing piece Task 7's shell was importing.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/reportes`. Confirm all three tabs render. Switch to "Personalizado" and confirm the two date inputs appear and change what rows show. Expand a row in each of the three tables and confirm the detail sub-table renders.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/reportes/MovimientoStock.tsx
git commit -m "feat: reporte de movimiento de stock por insumo"
```

---

### Task 10: QA manual end-to-end

**Files:** none (verification only).

- [ ] **Step 1: Gasto por proveedor — línea con precio y sin precio**

En `/admin/compras/pedidos`, registrá un remito con una línea con precio cargado y otra sin precio. En `/admin/compras/reportes` (tab "Gasto por proveedor", rango que cubra la fecha del remito), confirmá: el proveedor aparece, "Líneas con precio"/"Líneas sin precio" reflejan lo cargado, el gasto total solo suma la línea con precio, y al expandir la fila se ve el detalle correcto.

- [ ] **Step 2: Historial de pedidos y remitos**

En el mismo rango, tab "Historial de pedidos y remitos": confirmá que el pedido usado en el Paso 1 aparece con el gasto total correcto, y que al expandirlo se ve el remito con su gasto individual.

- [ ] **Step 3: Movimiento de stock — entrada por remito**

Tab "Movimiento de stock": confirmá que el insumo recibido en el Paso 1 aparece con "Entradas (remito)" igual a la cantidad recibida, y que al expandir se ve el movimiento individual con el remito de origen.

- [ ] **Step 4: Movimiento de stock — ajuste manual**

En `/admin/compras/stock`, cambiá manualmente la cantidad de un insumo. Volvé al reporte (mismo rango, hoy incluido): confirmá que aparece con "Ajustes manuales" igual al delta correcto (positivo o negativo según corresponda) y "Stock actual" igual al valor vigente.

- [ ] **Step 5: Rango "Mes anterior" y "Personalizado"**

Cambiá a "Mes anterior": confirmá que las tres tablas se actualizan sin errores (pueden aparecer vacías si no hay datos en ese rango — confirmá que el mensaje de "sin datos" se ve, no un error). Cambiá a "Personalizado", elegí un rango que incluya las fechas de los Pasos 1-4, y confirmá que los mismos datos vuelven a aparecer.

- [ ] **Step 6: Acceso — admin y squad**

Con un usuario `squad` que tenga `compras-reportes` en `modulos_permitidos`, confirmá que ve "Reportes" en el sidebar y que la pantalla carga igual que para `admin`. Con un usuario `squad` SIN ese módulo, confirmá que no aparece en el sidebar y que navegar directamente a `/admin/compras/reportes` queda bloqueado por el guard existente de `app/admin/layout.tsx`.

- [ ] **Step 7: RLS de `compras_stock_movimientos`**

```bash
npx supabase db query --linked "select tablename, policyname, cmd from pg_policies where tablename = 'compras_stock_movimientos'"
```
Confirmá que la policy existe y usa la misma condición (`admin`,`squad`) que el resto de las tablas de Compras.

- [ ] **Step 8: Record results**

No commit needed for this task. Confirmá explícitamente cada uno de los 7 puntos anteriores antes de dar la fase por cerrada — a diferencia del QA de Fase 3, que quedó parcial. Si algún punto falla, parar y reportarlo antes de seguir.

---

## Self-Review Notes

- **Spec coverage:** migración y RLS de `compras_stock_movimientos` (Task 1), navegación (Task 2), helpers puros de rango de fechas y agregación (Tasks 3-4), instrumentación de ambos flujos de escritura de stock — Opción A (Tasks 5-6), pantalla con shell + 3 reportes + filtro de rango compartido con preset "Personalizado" (Tasks 7-9), QA de acceso admin/squad + RLS (Task 10) — todo cubierto. Costeo por masa no aparece en ninguna tarea, consistente con estar fuera de alcance.
- **Placeholder scan:** ningún "TBD"/"agregar manejo de errores"/"similar a Task N" — cada paso de código muestra el archivo completo a crear o el diff exacto a aplicar.
- **Type consistency check:** `RemitoReporte`/`PedidoReporte`/`MovimientoReporte` (Task 4) se usan con el mismo nombre y forma en `ReportesClient.tsx` (Task 7) y en los tres componentes de reporte (Tasks 7-9) — las strings de `select()` en `page.tsx` coinciden campo por campo con esas interfaces. `sumarStock(itemId, delta, remitoId)` (Task 5) tiene la misma firma en su definición y en ambos call sites (`revertirYBorrar`, `guardarRemito`). `GastoPorProveedor`/`HistorialPedidos`/`MovimientoStock` se importan en `ReportesClient.tsx` (Task 7) con los mismos nombres de archivo y props (`{ remitos }`, `{ pedidos }`, `{ movimientos, stockActualPorItem }`) que sus respectivas definiciones (Tasks 7-9).
- El orden Task 7 → 8 → 9 deja `ReportesClient.tsx` importando módulos que todavía no existen entre tareas — se marcó explícitamente en los pasos de typecheck de cada tarea qué errores son "esperados en este punto" para que no se confundan con una regresión real.
- `fechaEnRango` compara los primeros 10 caracteres de la fecha recibida; para columnas `timestamptz` (movimientos, pedidos) eso es el día en UTC, no en huso horario local — para una feature de reportes interna esto es una simplificación aceptada (no es un sistema de conciliación contable), no se agregó lógica de zona horaria.
