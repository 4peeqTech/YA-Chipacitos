# Compras Fase 3 (Remitos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remito (delivery-note) registration to Ya!Chipacitos' Compras module — recepción de mercadería contra un `compras_pedido` existente, con auto-match de líneas por texto, cantidad recibida por ítem calculada por agregación, actualización automática de `compras_stock_actual`, y un listado global de remitos — sin tocar costeo por masa (fase futura separada) ni bloquear el cierre de pedidos.

**Architecture:** Two new Postgres tables (`compras_remitos`, `compras_remito_items`), with a unique constraint on `(pedido_id, numero)` to support duplicate detection. A pure-function text-matching helper (`lib/compras/matchRemito.ts`) suggests which `compras_pedido_item` a typed remito line corresponds to, kept separate so it's independently testable like `pedidoMensaje.ts` was in Fase 2. A new bespoke component `RemitosPedido.tsx`, rendered inside the existing pedido editor in `PedidosClient.tsx`, owns registering/editing/deleting remitos and the stock-increment side effect — self-contained so it doesn't bloat `PedidosClient.tsx`'s existing item-editing logic. A second new screen (`/admin/compras/remitos` + `RemitosClient.tsx`) is a read-only, filterable, sortable global listing, following the same server-page + client-component split as every other Compras screen.

**Tech Stack:** Next.js 16 (App Router, `'use client'` components), React 19, Supabase (Postgres + RLS + `@supabase/ssr`), Tailwind v4. No test runner is configured in this repo — verification is `npx tsc --noEmit`, `npm run lint`, manual browser verification against `npm run dev`, and ad-hoc `npx tsx` sanity checks for pure functions, same convention as Fase 1/2.

## Global Constraints

- Branch: all work happens on `dev`. Never touch `main` (holds the production database).
- Access: only `admin` and `squad` roles use `/admin/compras/*`. RLS on both new tables must allow `admin` AND `squad` (`(select rol from profiles where id = auth.uid()) in ('admin','squad')`), same pattern as `compras_pedidos`/`compras_pedido_items` from Fase 2.
- CRUD pattern: bespoke client components with direct `supabase.from(...).insert/update/delete`, exactly like `PedidosClient.tsx`/`StockClient.tsx`. Do NOT use or extend `components/ui/TablaMaestra.tsx`.
- Cantidad recibida per `compras_pedido_item` is NEVER persisted as a counter column — always computed by summing `compras_remito_items.cantidad` grouped by `pedido_item_id`. This is what makes edit/delete safe without a "revert a counter" bug class.
- Costeo por masa (precio/kg de quesos, lotes de producción) is explicitly OUT of scope — `compras_remito_items.precio` is stored but never read for any calculation in this phase.
- Cerrar un pedido stays 100% manual and independent — do NOT add any check that blocks `cerrarPedido()` based on recepción incompleta.
- A remito belongs to exactly one `compras_pedido` (`pedido_id` on `compras_remitos`, not on `compras_remito_items`). Do not build any UI to split one remito across multiple pedidos.
- Spec reference: `docs/superpowers/specs/2026-08-03-compras-fase3-remitos.md`.

---

### Task 1: Migración SQL — `compras_remitos`, `compras_remito_items`

**Files:**
- Create: `supabase/migrations/20260803180000_compras_fase3_remitos.sql`

**Interfaces:**
- Produces: table `compras_remitos(id uuid, pedido_id uuid, numero text, fecha date, creado_por uuid|null, created_at timestamptz)` with `unique(pedido_id, numero)`; table `compras_remito_items(id uuid, remito_id uuid, pedido_item_id uuid|null, item_id uuid|null, descripcion text, cantidad numeric, precio numeric|null)`. All later tasks read/write these.

- [ ] **Step 1: Confirm the latest applied migration timestamp**

Run: `ls supabase/migrations | tail -3`
Expected: `20260803150000_compras_fase2_pedidos_proveedores.sql` is the most recent. If a newer migration exists that isn't reflected here, rename this task's file to a timestamp after it instead of `20260803180000`.

- [ ] **Step 2: Write the migration file**

```sql
-- Fase 3 de Compras: remitos (recepción de mercadería)

create table if not exists compras_remitos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references compras_pedidos(id) on delete cascade,
  numero       text not null,
  fecha        date not null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz default now()
);

create index if not exists idx_compras_remitos_pedido_id on compras_remitos(pedido_id);
create unique index if not exists uq_compras_remitos_pedido_numero on compras_remitos(pedido_id, numero);

alter table compras_remitos enable row level security;

create policy "admin y squad manejan compras_remitos" on compras_remitos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_remito_items (
  id             uuid primary key default gen_random_uuid(),
  remito_id      uuid not null references compras_remitos(id) on delete cascade,
  pedido_item_id uuid references compras_pedido_items(id) on delete set null,
  item_id        uuid references compras_items(id),
  descripcion    text not null,
  cantidad       numeric not null default 0,
  precio         numeric
);

create index if not exists idx_compras_remito_items_remito_id on compras_remito_items(remito_id);
create index if not exists idx_compras_remito_items_pedido_item_id on compras_remito_items(pedido_item_id);

alter table compras_remito_items enable row level security;

create policy "admin y squad manejan compras_remito_items" on compras_remito_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Run: `supabase db push`
Expected: output lists `20260803180000_compras_fase3_remitos.sql` as applied, no errors. If the CLI isn't linked in this shell, apply the same SQL via the Supabase Studio SQL editor for the `dev`-linked project instead, then confirm with:

```sql
select table_name from information_schema.tables where table_name in ('compras_remitos','compras_remito_items');
```

Expected: both tables listed.

- [ ] **Step 4: Verify RLS policies and the unique constraint exist**

Run (SQL editor or `psql`):
```sql
select tablename, policyname from pg_policies where tablename in ('compras_remitos','compras_remito_items');
select indexname from pg_indexes where tablename = 'compras_remitos' and indexname = 'uq_compras_remitos_pedido_numero';
```
Expected: one policy row per table, and the unique index listed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803180000_compras_fase3_remitos.sql
git commit -m "db: agregar compras_remitos y compras_remito_items (Compras Fase 3)"
```

---

### Task 2: Entrada "Remitos" en `lib/modulos.ts`

**Files:**
- Modify: `lib/modulos.ts:38-40` (insert new entry after `compras-pedidos`, before the `tareas` line)

**Interfaces:**
- Consumes: `Modulo` interface at `lib/modulos.ts:1-7` — no changes to its shape.
- Produces: one new `Modulo` entry with `key: 'compras-remitos'`, `section: 'Compras'`. Task 5's page must live at the exact `href` used here.

- [ ] **Step 1: Add the new module entry**

In `lib/modulos.ts`, right after the `compras-pedidos` line and before the `tareas` line:

```ts
  { key: 'compras-remitos', label: 'Remitos', icon: '📥', href: '/admin/compras/remitos', section: 'Compras' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `admin`, open the sidebar. Expected: the "Compras" section now shows "Insumos", "Stock", "Pedidos", and "Remitos" (the last one 404s until Task 5 lands — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add lib/modulos.ts
git commit -m "feat: agregar Remitos a la sección Compras en modulos.ts"
```

---

### Task 3: Helper de auto-match por texto

**Files:**
- Create: `lib/compras/matchRemito.ts`

**Interfaces:**
- Consumes: nothing from other tasks — pure function, no Supabase calls, no React.
- Produces: `sugerirPedidoItem(descripcionRemito: string, items: ItemPedidoMatch[]): string | null`, imported by Task 4's `RemitosPedido.tsx`. `ItemPedidoMatch = { id: string; descripcion: string }`.

- [ ] **Step 1: Write `lib/compras/matchRemito.ts`**

```ts
export interface ItemPedidoMatch {
  id: string
  descripcion: string
}

// Palabras de 4+ letras — descarta artículos, unidades cortas ("x4", "de")
// y demás ruido que no ayuda a distinguir un insumo de otro.
function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(palabra => palabra.length >= 4)
}

// Contención en cualquier sentido — cubre singular/plural ("caja"/"cajas")
// sin necesidad de un stemmer.
function coincide(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}

// Sugiere el ítem del pedido cuya descripción comparte más palabras
// significativas con la línea de remito tipeada. Devuelve null si ningún
// ítem comparte al menos una palabra (deja la línea "sin corresponder").
export function sugerirPedidoItem(descripcionRemito: string, items: ItemPedidoMatch[]): string | null {
  const palabrasRemito = normalizar(descripcionRemito)
  if (!palabrasRemito.length) return null

  let mejorId: string | null = null
  let mejorScore = 0

  for (const item of items) {
    const palabrasItem = normalizar(item.descripcion)
    let score = 0
    for (const palabra of palabrasRemito) {
      if (palabrasItem.some(p => coincide(palabra, p))) score++
    }
    if (score > mejorScore) {
      mejorScore = score
      mejorId = item.id
    }
  }

  return mejorScore > 0 ? mejorId : null
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this file has no consumers yet, so it just needs to compile standalone).

- [ ] **Step 3: Manual sanity check**

Run:
```bash
npx tsx -e "
import { sugerirPedidoItem } from './lib/compras/matchRemito.ts'
const items = [
  { id: 'a', descripcion: 'CAJAS BARRA X4' },
  { id: 'b', descripcion: 'SARDOS' },
  { id: 'c', descripcion: 'BOLSAS FÉCULA DE MANDIOCA' },
]
console.log(sugerirPedidoItem('CAJA BARRA TYBO X4', items))
console.log(sugerirPedidoItem('FECULA MANDIOCA BOLSA 25KG', items))
console.log(sugerirPedidoItem('ALGO QUE NO EXISTE', items))
"
```
Expected: prints `a`, `c`, `null` (in that order — matches "caja"/"barra" against the first item, "fecula"/"mandioca"/"bolsa" against the third, and finds no shared word for the last, unrelated line). If `npx tsx` isn't available, install it ad-hoc with `npm exec --yes tsx@latest -- -e "..."` — do not skip this check, it's the only verification this pure logic gets before Task 4 wires it into the UI.

- [ ] **Step 4: Commit**

```bash
git add lib/compras/matchRemito.ts
git commit -m "feat: helper de auto-match por texto para remitos"
```

---

### Task 4: Registro y listado de remitos dentro del pedido

**Files:**
- Create: `app/admin/compras/pedidos/RemitosPedido.tsx`
- Modify: `app/admin/compras/pedidos/page.tsx`
- Modify: `app/admin/compras/pedidos/PedidosClient.tsx`

**Interfaces:**
- Consumes: `compras_remitos`/`compras_remito_items` (Task 1), `sugerirPedidoItem` (Task 3), the existing `compras_pedido_items`/`compras_stock_actual` shapes from Fase 1/2.
- Produces: `RemitosPedido`'s props `{ pedido: { id: string; compras_pedido_items: {id: string; item_id: string|null; descripcion: string}[]; compras_remitos: Remito[] }; usuarioId: string; onRemitosChange: (remitos: Remito[]) => void }` and its exported `Remito`/`RemitoItem` interfaces — Task 6's QA relies on this UI existing and working; no other task consumes it downstream.

- [ ] **Step 1: Extend the initial query in `page.tsx`**

In `app/admin/compras/pedidos/page.tsx`, change the `compras_pedidos` select to also embed remitos and their items:

```tsx
    supabase
      .from('compras_pedidos')
      .select('*, proveedores(id, nombre, local, contacto_telefono, maneja_stock), compras_pedido_items(*), compras_remitos(*, compras_remito_items(*))')
      .order('created_at', { ascending: false }),
```

(This replaces the existing `.select(...)` line for that query — everything else in the file stays the same.)

- [ ] **Step 2: Write `RemitosPedido.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sugerirPedidoItem } from '@/lib/compras/matchRemito'

export interface RemitoItem {
  id: string
  remito_id: string
  pedido_item_id: string | null
  item_id: string | null
  descripcion: string
  cantidad: number
  precio: number | null
}

export interface Remito {
  id: string
  pedido_id: string
  numero: string
  fecha: string
  created_at: string
  compras_remito_items: RemitoItem[]
}

interface PedidoItemPD {
  id: string
  item_id: string | null
  descripcion: string
  cantidad: number
}

interface PedidoPD {
  id: string
  compras_pedido_items: PedidoItemPD[]
  compras_remitos: Remito[]
}

interface LineaEditor {
  descripcion: string
  cantidad: number
  precio: number | null
  pedidoItemId: string | null
  matchManual: boolean
}

function lineaVacia(): LineaEditor {
  return { descripcion: '', cantidad: 0, precio: null, pedidoItemId: null, matchManual: false }
}

export default function RemitosPedido({
  pedido,
  usuarioId,
  onRemitosChange,
}: {
  pedido: PedidoPD
  usuarioId: string
  onRemitosChange: (remitos: Remito[]) => void
}) {
  const supabase = createClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [remitoEditandoId, setRemitoEditandoId] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [lineas, setLineas] = useState<LineaEditor[]>([lineaVacia()])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const recibidoPorItem: Record<string, number> = {}
  for (const remito of pedido.compras_remitos) {
    for (const item of remito.compras_remito_items) {
      if (item.pedido_item_id) {
        recibidoPorItem[item.pedido_item_id] = (recibidoPorItem[item.pedido_item_id] ?? 0) + item.cantidad
      }
    }
  }

  function abrirForm() {
    setRemitoEditandoId(null)
    setNumero('')
    setFecha('')
    setLineas([lineaVacia()])
    setError('')
    setMostrarForm(true)
  }

  function abrirEdicion(remito: Remito) {
    setRemitoEditandoId(remito.id)
    setNumero(remito.numero)
    setFecha(remito.fecha)
    setLineas(
      remito.compras_remito_items.map(i => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio: i.precio,
        pedidoItemId: i.pedido_item_id,
        matchManual: true,
      }))
    )
    setError('')
    setMostrarForm(true)
  }

  function cerrarForm() {
    setMostrarForm(false)
    setRemitoEditandoId(null)
  }

  function agregarLinea() {
    setLineas(prev => [...prev, lineaVacia()])
  }

  function quitarLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  function actualizarDescripcion(idx: number, descripcion: string) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (l.matchManual) return { ...l, descripcion }
      const sugerido = sugerirPedidoItem(descripcion, pedido.compras_pedido_items)
      return { ...l, descripcion, pedidoItemId: sugerido }
    }))
  }

  function actualizarMatch(idx: number, pedidoItemId: string) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, pedidoItemId: pedidoItemId || null, matchManual: true } : l))
  }

  function actualizarCampo(idx: number, cambios: Partial<Pick<LineaEditor, 'cantidad' | 'precio'>>) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...cambios } : l))
  }

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

  async function revertirYBorrar(remitoId: string) {
    const remito = pedido.compras_remitos.find(r => r.id === remitoId)
    if (!remito) return
    for (const item of remito.compras_remito_items) {
      if (item.item_id) await sumarStock(item.item_id, -item.cantidad)
    }
    await supabase.from('compras_remitos').delete().eq('id', remitoId)
  }

  async function guardarRemito() {
    if (!numero.trim() || !fecha) { setError('Completá número y fecha'); return }
    const filas = lineas.filter(l => l.descripcion.trim() && l.cantidad > 0)
    if (!filas.length) { setError('Agregá al menos un ítem con cantidad'); return }

    let remitoAReemplazar = remitoEditandoId
    if (!remitoAReemplazar) {
      const existente = pedido.compras_remitos.find(r => r.numero === numero.trim())
      if (existente) {
        if (!confirm(`Ya existe el remito ${numero} en este pedido. ¿Sobrescribirlo?`)) return
        remitoAReemplazar = existente.id
      }
    }

    setError('')
    startTransition(async () => {
      if (remitoAReemplazar) await revertirYBorrar(remitoAReemplazar)

      const { data: remito, error: errRemito } = await supabase
        .from('compras_remitos')
        .insert([{ pedido_id: pedido.id, numero: numero.trim(), fecha, creado_por: usuarioId }])
        .select()
        .single()
      if (errRemito) { setError(errRemito.message); return }

      const filasInsert = filas.map(l => ({
        remito_id: remito.id,
        pedido_item_id: l.pedidoItemId,
        item_id: pedido.compras_pedido_items.find(pi => pi.id === l.pedidoItemId)?.item_id ?? null,
        descripcion: l.descripcion.trim(),
        cantidad: l.cantidad,
        precio: l.precio,
      }))

      const { data: itemsGuardados, error: errItems } = await supabase
        .from('compras_remito_items')
        .insert(filasInsert)
        .select()
      if (errItems) { setError(errItems.message); return }

      for (const item of itemsGuardados) {
        if (item.item_id) await sumarStock(item.item_id, item.cantidad)
      }

      const remitoCompleto: Remito = { ...remito, compras_remito_items: itemsGuardados }
      onRemitosChange([...pedido.compras_remitos.filter(r => r.id !== remitoAReemplazar), remitoCompleto])
      cerrarForm()
    })
  }

  async function borrarRemito(remito: Remito) {
    if (!confirm(`¿Borrar el remito ${remito.numero}?`)) return
    startTransition(async () => {
      await revertirYBorrar(remito.id)
      onRemitosChange(pedido.compras_remitos.filter(r => r.id !== remito.id))
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wider">Remitos</h3>
        {!mostrarForm && (
          <button onClick={abrirForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
            + Registrar remito
          </button>
        )}
      </div>

      {pedido.compras_pedido_items.length > 0 && (
        <div className="space-y-1">
          {pedido.compras_pedido_items.map(item => (
            <div key={item.id} className="flex items-center justify-between text-xs text-[#888]">
              <span>{item.descripcion}</span>
              <span>{recibidoPorItem[item.id] ?? 0} / {item.cantidad}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {mostrarForm && (
        <div className="border border-[#2a2a2a] rounded-lg p-3 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>N° Remito</label>
              <input type="text" className={inputClass} value={numero} onChange={e => setNumero(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Fecha</label>
              <input type="date" className={inputClass} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {lineas.map((linea, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Descripción (como figura en el remito)"
                  value={linea.descripcion}
                  onChange={e => actualizarDescripcion(idx, e.target.value)}
                />
                <select
                  className={`${inputClass} w-48`}
                  value={linea.pedidoItemId ?? ''}
                  onChange={e => actualizarMatch(idx, e.target.value)}
                >
                  <option value="">Sin corresponder</option>
                  {pedido.compras_pedido_items.map(item => (
                    <option key={item.id} value={item.id}>{item.descripcion}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  placeholder="Cant."
                  value={linea.cantidad || ''}
                  onChange={e => actualizarCampo(idx, { cantidad: Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  placeholder="Precio"
                  value={linea.precio ?? ''}
                  onChange={e => actualizarCampo(idx, { precio: e.target.value ? Number(e.target.value) : null })}
                />
                <button onClick={() => quitarLinea(idx)} className="text-[#888] hover:text-red-400 text-lg px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={agregarLinea} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              + Agregar línea
            </button>
            <button onClick={guardarRemito} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              Guardar remito
            </button>
            <button onClick={cerrarForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pedido.compras_remitos.length > 0 && (
        <div className="space-y-1">
          {pedido.compras_remitos.map(remito => (
            <div key={remito.id} className="flex items-center justify-between text-xs text-[#888] border-t border-[#2a2a2a] pt-2">
              <span>N° {remito.numero} — {new Date(remito.fecha + 'T12:00:00').toLocaleDateString('es-AR')} ({remito.compras_remito_items.length} línea/s)</span>
              <div className="flex gap-2">
                <button onClick={() => abrirEdicion(remito)} className="hover:text-[#e8c547] transition-colors">Editar</button>
                <button onClick={() => borrarRemito(remito)} className="hover:text-red-400 transition-colors">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Note: `guardarRemito()` treats "edit" and "overwrite a duplicate número" the same way — both resolve to a `remitoAReemplazar` id, whose stock effect gets reverted (`revertirYBorrar`) before the new row is inserted fresh. This avoids a separate "update in place" code path and the bugs that come from keeping two mutation strategies in sync.

- [ ] **Step 3: Wire `RemitosPedido` into `PedidosClient.tsx`**

In `PedidosClient.tsx`:

1. Add the import:
```ts
import RemitosPedido, { type Remito } from './RemitosPedido'
```

2. Add `compras_remitos: Remito[]` to the `Pedido` interface (after `compras_pedido_items`):
```ts
interface Pedido {
  id: string
  proveedor_id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  mensaje: string | null
  created_at: string
  enviado_en: string | null
  cerrado_en: string | null
  proveedores: Proveedor
  compras_pedido_items: PedidoItem[]
  compras_remitos: Remito[]
}
```

3. In `crearPedido()`, initialize the new field when constructing `nuevoPedido`:
```ts
const nuevoPedido: Pedido = { ...pedido, proveedores: proveedor, compras_pedido_items: [], compras_remitos: [] }
```

4. Add a handler function near `cerrarPedido`:
```ts
function actualizarRemitos(pedidoId: string, remitos: Remito[]) {
  setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, compras_remitos: remitos } : p))
  setPedidoEditando(prev => prev && prev.id === pedidoId ? { ...prev, compras_remitos: remitos } : prev)
}
```

5. Render it inside the `pedidoEditando` block, right after the `{pedidoEditando.mensaje && (...)}` block and before the closing `</div>` of that section:
```tsx
{pedidoEditando.estado !== 'borrador' && (
  <RemitosPedido
    pedido={pedidoEditando}
    usuarioId={usuarioId}
    onRemitosChange={remitos => actualizarRemitos(pedidoEditando.id, remitos)}
  />
)}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual verification — registrar, auto-match y stock**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/pedidos`.
1. Open (or create and send) a pedido to a provider that has at least 2 items with `item_id` set from the catalog (e.g. Global's Fase 1 setup). Confirm the "Remitos" section appears below the message box only once the pedido is `enviado` or `cerrado` (not while `borrador`).
2. Note the current stock of one of those items in `/admin/compras/stock`.
3. Click "Registrar remito", enter a número and fecha. Type a description that's a near-match of one pedido item's descripción (e.g. if the item is "CAJAS BARRA X4", type "CAJA BARRA TYBO X4"). Confirm the dropdown auto-selects that item. Enter a cantidad, click "Guardar remito".
4. Confirm the remito appears in the "Remitos" list, the "recibido X/Y" line for that item updates to reflect the new quantity, and `/admin/compras/stock` now shows the item's stock increased by exactly that cantidad.
5. Add a second line with a description that matches nothing in the pedido (e.g. "COSA RARA"), cantidad 1, save a second remito. Confirm it saves as "Sin corresponder" (dropdown shows that option) and does NOT affect stock or any "recibido" counter.

- [ ] **Step 6: Manual verification — duplicados, editar, borrar**

1. Register a second remito reusing the same número as an existing one on the same pedido. Confirm the confirm() dialog appears; confirming it replaces the old remito (check stock reflects only the new quantities, not double-counted).
2. Click "Editar" on a remito, change its cantidad, save. Confirm stock reflects only the new (edited) quantity — not the old plus the new.
3. Click "Borrar" on a remito that had contributed to stock. Confirm the "recibido" counter for its items drops back down and `/admin/compras/stock` decreases by the same amount that had been added.
4. Confirm `cerrarPedido` still works normally on a pedido that has remitos registered, and that a pedido with NO remitos at all can still be closed (recepción incompleta must never block closing).

- [ ] **Step 7: Commit**

```bash
git add app/admin/compras/pedidos
git commit -m "feat: registro de remitos dentro del pedido, con auto-match y stock automático"
```

---

### Task 5: Pantalla global — `/admin/compras/remitos`

**Files:**
- Create: `app/admin/compras/remitos/page.tsx`
- Create: `app/admin/compras/remitos/RemitosClient.tsx`

**Interfaces:**
- Consumes: `compras_remitos`/`compras_remito_items` (Task 1), joined to `compras_pedidos`/`proveedores` for display only — read-only screen, no mutations.
- Produces: no downstream consumers within Fase 3 — last screen of this phase.

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosClient from './RemitosClient'

export const metadata = { title: 'Remitos | YA! Chipacitos' }

export default async function RemitosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: remitos } = await supabase
    .from('compras_remitos')
    .select('*, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(*)')
    .order('fecha', { ascending: false })

  return <RemitosClient remitosIniciales={remitos ?? []} />
}
```

- [ ] **Step 2: Write `RemitosClient.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'

interface RemitoItemRow {
  id: string
  descripcion: string
  cantidad: number
  precio: number | null
}

interface RemitoRow {
  id: string
  pedido_id: string
  numero: string
  fecha: string
  created_at: string
  compras_pedidos: { proveedor_id: string; proveedores: { nombre: string } | null } | null
  compras_remito_items: RemitoItemRow[]
}

type Columna = 'proveedor' | 'numero' | 'fecha' | 'lineas'

export default function RemitosClient({ remitosIniciales }: { remitosIniciales: RemitoRow[] }) {
  const [filtro, setFiltro] = useState('')
  const [sortCampo, setSortCampo] = useState<Columna>('fecha')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  function ordenarPor(campo: Columna) {
    if (campo === sortCampo) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortCampo(campo); setSortDir(1) }
  }

  const filtrados = useMemo(() => {
    const texto = filtro.trim().toLowerCase()
    const porTexto = texto
      ? remitosIniciales.filter(r =>
          r.numero.toLowerCase().includes(texto) ||
          (r.compras_pedidos?.proveedores?.nombre ?? '').toLowerCase().includes(texto)
        )
      : remitosIniciales

    return [...porTexto].sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortCampo === 'proveedor') {
        va = a.compras_pedidos?.proveedores?.nombre ?? ''
        vb = b.compras_pedidos?.proveedores?.nombre ?? ''
      } else if (sortCampo === 'numero') {
        va = a.numero
        vb = b.numero
      } else if (sortCampo === 'lineas') {
        va = a.compras_remito_items.length
        vb = b.compras_remito_items.length
      } else {
        va = a.fecha
        vb = b.fecha
      }
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [remitosIniciales, filtro, sortCampo, sortDir])

  function flecha(campo: Columna) {
    return campo === sortCampo ? (sortDir === 1 ? ' ▲' : ' ▼') : ''
  }

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider cursor-pointer select-none"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Remitos</h1>
        <p className="text-[#888] text-sm mt-0.5">Listado de todos los remitos registrados, de todos los proveedores.</p>
      </div>

      <input
        type="text"
        placeholder="Filtrar por N° de remito o proveedor..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
      />

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay remitos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className={thClass} onClick={() => ordenarPor('proveedor')}>Proveedor{flecha('proveedor')}</th>
                  <th className={thClass} onClick={() => ordenarPor('numero')}>N° Remito{flecha('numero')}</th>
                  <th className={thClass} onClick={() => ordenarPor('fecha')}>Fecha{flecha('fecha')}</th>
                  <th className={thClass} onClick={() => ordenarPor('lineas')}>Líneas{flecha('lineas')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(r => (
                  <tr key={r.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{r.compras_pedidos?.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-[#888]">{r.numero}</td>
                    <td className="px-4 py-3 text-[#888]">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#888]">{r.compras_remito_items.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/remitos`. Confirm all remitos registered during Task 4's verification appear, with the correct proveedor name. Click each column header and confirm sort order (and the ▲/▼ arrow) toggles correctly. Type a proveedor name or remito número in the filter box and confirm the list narrows to matches.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/remitos
git commit -m "feat: pantalla global de remitos en /admin/compras/remitos"
```

---

### Task 6: QA manual end-to-end (admin + squad)

**Files:** none (verification only).

- [ ] **Step 1: Verify admin access**

Log in as an `admin` user. Confirm `/admin/compras/pedidos` (Remitos section) and `/admin/compras/remitos` both load and every flow from Task 4/5's manual verification steps still works.

- [ ] **Step 2: Grant a `squad` user access and verify**

In `/admin/roles` or `/admin/usuarios` (wherever `profiles.modulos_permitidos` is edited today), add `compras-remitos` to a test `squad` user (in addition to `compras-pedidos`, needed to reach the pedido whose remitos are being registered). Log in as that user, confirm both screens load and the full registrar → editar → borrar cycle works, and that stock updates are visible on `/admin/compras/stock`.

- [ ] **Step 3: Verify a `squad` user WITHOUT the module is blocked**

Using a `squad` (or custom-role) user that does NOT have `compras-remitos` in `modulos_permitidos`, confirm the sidebar doesn't show "Remitos" under Compras, and that navigating directly to `/admin/compras/remitos` by URL is blocked or redirected per the existing `app/admin/layout.tsx` guard.

- [ ] **Step 4: Verify RLS directly**

Via Supabase Studio (or `psql`), confirm a role NOT in `('admin','squad')` cannot select/insert into `compras_remitos`/`compras_remito_items` — cross-check the policies' `using` clause against the migration file from Task 1.

- [ ] **Step 5: Verify cierre de pedido is unaffected**

Confirm a pedido with partially-received items (some `recibido < pedido`) can still be closed without any warning or block, and confirm closing it does not delete or alter its remitos.

- [ ] **Step 6: Record results**

No commit needed for this task — if all checks pass, the phase is ready to hand off for review per `superpowers:requesting-code-review`. If any check fails, stop and report which one before proceeding.

---

## Self-Review Notes

- Spec coverage: migración (Task 1), navegación (Task 2), auto-match por texto (Task 3), registro/edición/borrado de remitos con stock automático dentro del pedido (Task 4), listado global filtrable/ordenable (Task 5), verificación admin/squad + RLS + no-bloqueo de cierre (Task 6) — all covered. Costeo por masa and OCR de factura are explicitly out of scope per the spec and are not referenced by any task.
- Placeholder scan: no TBD/"handle edge cases"/"similar to Task N" phrasing — every step shows complete code or an exact command with expected output.
- Type consistency check: `Remito`/`RemitoItem` (exported from `RemitosPedido.tsx` in Task 4) are imported by name (`type Remito`) into `PedidosClient.tsx`'s `Pedido` interface — same shape used in both places. `RemitosClient.tsx` (Task 5) defines its own local `RemitoRow`/`RemitoItemRow` types rather than importing Task 4's, since it queries a different (wider, cross-pedido) shape from `page.tsx` — this is intentional, not a drift, since the two screens read different Supabase queries.
- `sugerirPedidoItem`'s signature (`descripcionRemito: string, items: ItemPedidoMatch[]`) is used identically in Task 3's own test script and in Task 4's `actualizarDescripcion`, called with `pedido.compras_pedido_items` — which satisfies `ItemPedidoMatch` structurally (`{id, descripcion}` is a subset of `PedidoItemPD`).
- `sumarStock`/`revertirYBorrar` in `RemitosPedido.tsx` do a read-then-write against `compras_stock_actual` (same pattern as `StockClient.tsx`'s `guardarCantidad`) rather than an atomic SQL increment — acceptable given this is a low-concurrency internal tool (same assumption already made throughout Fase 1/2), but worth flagging if remito registration ever becomes a multi-user-simultaneous workflow.
- No "reabrir remito cerrado tras cerrar pedido" restriction was added — registering, editing, or deleting a remito against a `cerrado` pedido remains possible (mirrors the legacy, and matches the decision that cierre is independent of recepción).
