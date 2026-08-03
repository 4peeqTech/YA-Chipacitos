# Compras Fase 1 (Stock + Proveedores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native Compras module (catálogo de insumos + carga de stock actual) to Ya!Chipacitos, replacing the first slice of the legacy HTML/Google Sheets tool, without touching Pedidos/Remitos/Reportes (later phases).

**Architecture:** Two new Postgres tables (`compras_items`, `compras_stock_actual`) plus a `maneja_stock` flag on the existing `proveedores` table. Two new admin screens (`/admin/compras/insumos`, `/admin/compras/stock`) built as bespoke server-page + client-component pairs — the exact pattern already used by `app/admin/proveedores/` (server component does the initial Supabase fetch, client component owns all CRUD via direct `supabase.from(...)` calls, no intermediate API routes). One small addition to the existing `ProveedoresClient.tsx` form to make the new `maneja_stock` flag settable from the UI.

**Tech Stack:** Next.js 16 (App Router, `'use client'` components), React 19, Supabase (Postgres + RLS + `@supabase/ssr`), Tailwind v4. No test runner is configured in this repo (`package.json` has no jest/vitest) — verification for each task is `npx tsc --noEmit`, `npm run lint`, and manual browser verification against a running `npm run dev` server, per this session's testing convention for UI work.

## Global Constraints

- Branch: all work happens on `dev`. Never touch `main` (holds the production database).
- Access: only `admin` and `squad` roles use `/admin/compras/*`. RLS on the two new tables must allow `admin` AND `squad` (`profiles.rol in ('admin','squad')`) — do NOT copy the `proveedores` RLS policy verbatim, it only allows `admin` (a known, separate, out-of-scope gap).
- No history: `compras_stock_actual` stores only the current quantity per item (upsert), never a log.
- Soft delete convention: use `estado text check (estado in ('activo','archivado'))`, matching `proveedores` — not a boolean `activo` column.
- CRUD pattern: bespoke client components with direct `supabase.from(...).insert/update/delete`, exactly like `app/admin/proveedores/ProveedoresClient.tsx`. Do NOT use or extend `components/ui/TablaMaestra.tsx` — it only supports `{id, nombre, activo}` via a REST API route and cannot carry the extra columns these entities need.
- Alert rule: an insumo is "bajo" only when `cantidad < meta_semanal`. `consumo_por_masa` is informational only — no alert logic keys off it in Fase 1.
- `Proveedores` stays under `section: 'Parámetros'` in `lib/modulos.ts` — it does NOT move under the new `Compras` section.
- Spec reference: `docs/superpowers/specs/2026-08-03-compras-fase1-stock-proveedores.md`.

---

### Task 1: Migración SQL — `maneja_stock`, `compras_items`, `compras_stock_actual`

**Files:**
- Create: `supabase/migrations/20260803120000_compras_fase1_stock_proveedores.sql`

**Interfaces:**
- Produces: table `compras_items(id uuid, proveedor_id uuid, nombre text, unidad text, meta_semanal numeric, consumo_por_masa numeric|null, orden integer, estado 'activo'|'archivado', created_at timestamptz)`, table `compras_stock_actual(item_id uuid PK/FK, cantidad numeric, actualizado_en timestamptz, actualizado_por uuid|null)`, and column `proveedores.maneja_stock boolean`. All later tasks read/write these.

- [ ] **Step 1: Write the migration file**

```sql
-- Fase 1 de Compras: maneja_stock en proveedores + catálogo de insumos + stock actual

alter table proveedores
  add column if not exists maneja_stock boolean not null default false;

create table if not exists compras_items (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references proveedores(id),
  nombre            text not null,
  unidad            text not null,
  meta_semanal      numeric not null default 0,
  consumo_por_masa  numeric,
  orden             integer not null default 0,
  estado            text not null default 'activo' check (estado in ('activo', 'archivado')),
  created_at        timestamptz default now()
);

create index if not exists idx_compras_items_proveedor_id on compras_items(proveedor_id);

alter table compras_items enable row level security;

create policy "admin y squad manejan compras_items" on compras_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_stock_actual (
  item_id         uuid primary key references compras_items(id) on delete cascade,
  cantidad        numeric not null default 0,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references profiles(id)
);

alter table compras_stock_actual enable row level security;

create policy "admin y squad manejan compras_stock_actual" on compras_stock_actual
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Run: `supabase db push`
Expected: output lists `20260803120000_compras_fase1_stock_proveedores.sql` as applied, no errors. If the CLI isn't linked in this shell, apply the same SQL via the Supabase Studio SQL editor for the `dev`-linked project instead, then confirm with:

```sql
select table_name from information_schema.tables where table_name in ('compras_items','compras_stock_actual');
select column_name from information_schema.columns where table_name = 'proveedores' and column_name = 'maneja_stock';
```

Expected: both tables listed, `maneja_stock` column present.

- [ ] **Step 3: Verify RLS policies exist**

Run (SQL editor or `psql`):
```sql
select tablename, policyname from pg_policies where tablename in ('compras_items','compras_stock_actual');
```
Expected: one row per table, matching the policy names from Step 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803120000_compras_fase1_stock_proveedores.sql
git commit -m "db: agregar maneja_stock, compras_items y compras_stock_actual (Compras Fase 1)"
```

---

### Task 2: Sección "Compras" en `lib/modulos.ts`

**Files:**
- Modify: `lib/modulos.ts:36-37` (insert new entries after the `formas_pago` line, before the closing `]` of `MODULOS`)

**Interfaces:**
- Consumes: `Modulo` interface already defined at `lib/modulos.ts:1-7` — no changes to its shape.
- Produces: two new `Modulo` entries with `key: 'compras-insumos'` and `key: 'compras-stock'`, `section: 'Compras'`. Task 4 and Task 5 pages must live at the exact `href` values used here.

- [ ] **Step 1: Add the new module entries**

In `lib/modulos.ts`, right after the `formas_pago` line (currently line 36) and before the `tareas` line:

```ts
  { key: 'compras-insumos', label: 'Insumos', icon: '🧺', href: '/admin/compras/insumos', section: 'Compras' },
  { key: 'compras-stock',   label: 'Stock',   icon: '📦', href: '/admin/compras/stock',   section: 'Compras' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `admin`, open the sidebar. Expected: a new "Compras" section appears with "Insumos" and "Stock" items (both will 404 until Task 4/5 land — that's expected at this point).

- [ ] **Step 4: Commit**

```bash
git add lib/modulos.ts
git commit -m "feat: agregar sección Compras (Insumos, Stock) a modulos.ts"
```

---

### Task 3: `maneja_stock` en el form de Proveedores

**Files:**
- Modify: `app/admin/proveedores/ProveedoresClient.tsx:6-20` (interface `Proveedor`), `:24-37` (`emptyForm`), `:186-212` (form JSX), `:246-272` (table row, optional badge)

**Interfaces:**
- Consumes: existing `Proveedor` interface and `guardar()`/`abrirEditar()` flow — no signature changes, only a new field threaded through the same `form` state object already in place.
- Produces: `proveedores.maneja_stock: boolean` now editable from the UI. Task 4's insumo proveedor-picker filters on this column, so it must be settable before Task 4 can be tested end-to-end with real data.

- [ ] **Step 1: Extend the `Proveedor` interface and `emptyForm`**

In `ProveedoresClient.tsx`, add `maneja_stock: boolean` to the interface (after `estado`):

```ts
interface Proveedor {
  id: string
  nombre: string
  categoria: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  direccion: string | null
  tiempo_entrega: string | null
  periodicidad_compra: string | null
  financiacion: string | null
  condiciones_pago: string | null
  notas: string | null
  estado: 'activo' | 'archivado'
  maneja_stock: boolean
}
```

And in `emptyForm()`, add `maneja_stock: false` alongside the other defaults.

- [ ] **Step 2: Add the checkbox to the form JSX**

Right after the "Notas" block (currently `ProveedoresClient.tsx:208-211`), add:

```tsx
<div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
  <input
    type="checkbox"
    id="maneja_stock"
    checked={form.maneja_stock ?? false}
    onChange={e => setForm(f => ({ ...f, maneja_stock: e.target.checked }))}
    className="w-4 h-4 accent-[#e8c547]"
  />
  <label htmlFor="maneja_stock" className="text-sm text-[#f0f0f0]">
    Maneja stock (aparece como proveedor de insumos en Compras)
  </label>
</div>
```

- [ ] **Step 3: Update `page.tsx`'s fetch to include the new column implicitly**

`app/admin/proveedores/page.tsx:12-15` already uses `select('*')`, so `maneja_stock` is already returned — no change needed here. Confirm by reading the file that it still says `select('*')`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, go to `/admin/proveedores`, edit "GLOBAL" and "HUEVOS DE CAMPO" (the two real insumo suppliers per the spec), check "Maneja stock", save. Reload the page and confirm the checkbox stays checked (i.e. it persisted).

- [ ] **Step 6: Commit**

```bash
git add app/admin/proveedores/ProveedoresClient.tsx
git commit -m "feat: agregar checkbox maneja_stock al form de Proveedores"
```

---

### Task 4: Catálogo de insumos — `/admin/compras/insumos`

**Files:**
- Create: `app/admin/compras/insumos/page.tsx`
- Create: `app/admin/compras/insumos/InsumosClient.tsx`

**Interfaces:**
- Consumes: `compras_items` and `proveedores` tables from Task 1/3; the `@/lib/supabase/server` and `@/lib/supabase/client` helpers already used by `app/admin/proveedores/*`.
- Produces: `CompraItem { id, proveedor_id, nombre, unidad, meta_semanal, consumo_por_masa, orden, estado }` and `ProveedorOption { id, nombre }` — Task 5's Stock screen reads `compras_items` with this same shape (minus proveedor join, which Stock doesn't need).

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsumosClient from './InsumosClient'

export const metadata = { title: 'Insumos | YA! Chipacitos' }

export default async function InsumosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: proveedores }] = await Promise.all([
    supabase.from('compras_items').select('*').order('orden'),
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('maneja_stock', true)
      .eq('estado', 'activo')
      .order('nombre'),
  ])

  return <InsumosClient itemsIniciales={items ?? []} proveedores={proveedores ?? []} />
}
```

- [ ] **Step 2: Write `InsumosClient.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ProveedorOption {
  id: string
  nombre: string
}

interface CompraItem {
  id: string
  proveedor_id: string
  nombre: string
  unidad: string
  meta_semanal: number
  consumo_por_masa: number | null
  orden: number
  estado: 'activo' | 'archivado'
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const emptyForm = (): Partial<CompraItem> => ({
  proveedor_id: '',
  nombre: '',
  unidad: '',
  meta_semanal: 0,
  consumo_por_masa: null,
  orden: 0,
  estado: 'activo',
})

export default function InsumosClient({
  itemsIniciales,
  proveedores,
}: {
  itemsIniciales: CompraItem[]
  proveedores: ProveedorOption[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<CompraItem[]>(itemsIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<CompraItem | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<CompraItem>>(emptyForm())
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'

  const filtrados = items.filter(i => {
    const matchEstado = filtro === 'todos' || i.estado === filtro
    const matchBusqueda = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchBusqueda
  })

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
    setError('')
  }

  function abrirEditar(i: CompraItem) {
    setForm({ ...i })
    setEditando(i)
    setCreando(false)
    setError('')
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
    setError('')
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError('El nombre es requerido'); return }
    if (!form.proveedor_id) { setError('El proveedor es requerido'); return }
    if (!form.unidad?.trim()) { setError('La unidad es requerida'); return }
    setError('')

    startTransition(async () => {
      if (creando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .insert([{ ...form, estado: 'activo' }])
          .select()
          .single()
        if (err) { setError(err.message); return }
        setItems(prev => [...prev, data].sort((a, b) => a.orden - b.orden))
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .update({ ...form })
          .eq('id', editando.id)
          .select()
          .single()
        if (err) { setError(err.message); return }
        setItems(prev => prev.map(i => i.id === editando.id ? data : i).sort((a, b) => a.orden - b.orden))
      }
      cerrarForm()
    })
  }

  async function archivar(i: CompraItem) {
    const nuevoEstado = i.estado === 'activo' ? 'archivado' : 'activo'
    const { data, error: err } = await supabase
      .from('compras_items')
      .update({ estado: nuevoEstado })
      .eq('id', i.id)
      .select()
      .single()
    if (err) { setError(err.message); return }
    setItems(prev => prev.map(x => x.id === i.id ? data : x))
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Insumos</h1>
          <p className="text-[#888] text-sm mt-0.5">{items.filter(i => i.estado === 'activo').length} activos · {items.filter(i => i.estado === 'archivado').length} archivados</p>
        </div>
        <button onClick={abrirCrear} className="bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          + Nuevo insumo
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar insumo..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#e8c547] w-64"
        />
        {(['activo', 'archivado', 'todos'] as FiltroEstado[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${filtro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {(creando || editando) && (
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#f0f0f0]">{creando ? 'Nuevo insumo' : `Editar — ${editando?.nombre}`}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Proveedor *</label>
              <select className={inputClass} value={form.proveedor_id ?? ''} onChange={e => setForm(f => ({...f, proveedor_id: e.target.value}))}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Unidad *</label>
              <input className={inputClass} placeholder="Ej: kg, unidad, docena" value={form.unidad ?? ''} onChange={e => setForm(f => ({...f, unidad: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Meta semanal</label>
              <input type="number" step="0.01" className={inputClass} value={form.meta_semanal ?? 0} onChange={e => setForm(f => ({...f, meta_semanal: Number(e.target.value)}))} />
            </div>
            <div>
              <label className={labelClass}>Consumo por masa</label>
              <input type="number" step="0.01" className={inputClass} value={form.consumo_por_masa ?? ''} onChange={e => setForm(f => ({...f, consumo_por_masa: e.target.value === '' ? null : Number(e.target.value)}))} />
            </div>
            <div>
              <label className={labelClass}>Orden</label>
              <input type="number" className={inputClass} value={form.orden ?? 0} onChange={e => setForm(f => ({...f, orden: Number(e.target.value)}))} />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button onClick={guardar} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cerrarForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay insumos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Meta semanal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(i => (
                  <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{i.nombre}</td>
                    <td className="px-4 py-3 text-[#888]">{nombreProveedor(i.proveedor_id)}</td>
                    <td className="px-4 py-3 text-[#888]">{i.unidad}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.meta_semanal}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${i.estado === 'activo' ? 'bg-green-900/50 text-green-300' : 'bg-[#2a2a2a] text-[#666]'}`}>
                        {i.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => abrirEditar(i)} className="text-xs text-[#888] hover:text-[#e8c547] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Editar
                        </button>
                        <button onClick={() => archivar(i)} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          {i.estado === 'activo' ? 'Archivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
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

Note: no hard `eliminar()` here (unlike Proveedores) — insumos only archive/reactivate, since `compras_stock_actual` has an `on delete cascade` FK to it and a hard delete would silently wipe stock data. If a real delete is needed later, add it as its own reviewed step, not implicitly.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/insumos`. Create an insumo pointing at "GLOBAL" (or "HUEVOS DE CAMPO", whichever you flagged `maneja_stock` in Task 3) with `unidad: kg`, `meta_semanal: 10`. Confirm it appears in the list, edit it, archive it, confirm the "archivado" filter shows it and "activo" doesn't.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/insumos
git commit -m "feat: catálogo de insumos en /admin/compras/insumos"
```

---

### Task 5: Carga de stock actual — `/admin/compras/stock`

**Files:**
- Create: `app/admin/compras/stock/page.tsx`
- Create: `app/admin/compras/stock/StockClient.tsx`

**Interfaces:**
- Consumes: `compras_items` (Task 1/4 shape, filtered to `estado = 'activo'`), `compras_stock_actual` (Task 1 shape), current user id from the server-side `supabase.auth.getUser()` call.
- Produces: no downstream consumers within Fase 1 — this is the last screen of this phase.

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from './StockClient'

export const metadata = { title: 'Stock | YA! Chipacitos' }

export default async function StockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: stock }] = await Promise.all([
    supabase.from('compras_items').select('*').eq('estado', 'activo').order('orden'),
    supabase.from('compras_stock_actual').select('*'),
  ])

  return <StockClient itemsIniciales={items ?? []} stockInicial={stock ?? []} usuarioId={user.id} />
}
```

- [ ] **Step 2: Write `StockClient.tsx`**

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CompraItem {
  id: string
  nombre: string
  unidad: string
  meta_semanal: number
  consumo_por_masa: number | null
  orden: number
}

interface StockActual {
  item_id: string
  cantidad: number
  actualizado_en: string
  actualizado_por: string | null
}

export default function StockClient({
  itemsIniciales,
  stockInicial,
  usuarioId,
}: {
  itemsIniciales: CompraItem[]
  stockInicial: StockActual[]
  usuarioId: string
}) {
  const supabase = createClient()
  const [stockPorItem, setStockPorItem] = useState<Record<string, StockActual>>(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s]))
  )
  const [cantidadesForm, setCantidadesForm] = useState<Record<string, string>>(
    () => Object.fromEntries(itemsIniciales.map(i => [i.id, String(stockInicial.find(s => s.item_id === i.id)?.cantidad ?? 0)]))
  )
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const items = useMemo(() => [...itemsIniciales].sort((a, b) => a.orden - b.orden), [itemsIniciales])

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

  const inputClass = "w-28 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Stock</h1>
        <p className="text-[#888] text-sm mt-0.5">Cargá la cantidad actual de cada insumo. Se marca en rojo cuando está por debajo de la meta semanal.</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay insumos activos. Cargalos primero en Insumos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Meta semanal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Consumo por masa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Cantidad actual</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {items.map(i => {
                  const cantidadGuardada = stockPorItem[i.id]?.cantidad ?? 0
                  const bajo = cantidadGuardada < i.meta_semanal
                  return (
                    <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-3 text-[#f0f0f0] font-medium">{i.nombre}</td>
                      <td className="px-4 py-3 text-[#888]">{i.unidad}</td>
                      <td className="px-4 py-3 text-[#888]">{i.meta_semanal}</td>
                      <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.consumo_por_masa ?? '—'}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          className={inputClass}
                          value={cantidadesForm[i.id] ?? ''}
                          onChange={e => setCantidadesForm(f => ({ ...f, [i.id]: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bajo ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                          {bajo ? 'Bajo' : 'OK'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => guardarCantidad(i.id)}
                          disabled={guardandoId === i.id}
                          className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-xs py-1.5 px-4 rounded-lg transition-all"
                        >
                          {guardandoId === i.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

Note: `bajo` is computed from `stockPorItem` (the last **saved** value), not the live `cantidadesForm` input — so the alert badge only updates after "Guardar", never while you're mid-edit in the input box. This is deliberate: it avoids flashing a false alert while someone is still typing a multi-digit number.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, go to `/admin/compras/stock`. Confirm the insumo created in Task 4 appears. Enter a quantity below its `meta_semanal`, save, confirm the badge shows "Bajo" (red). Enter a quantity at or above `meta_semanal`, save, confirm it flips to "OK" (green). Reload the page and confirm the saved quantity persists.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/stock
git commit -m "feat: carga de stock actual en /admin/compras/stock"
```

---

### Task 6: QA manual end-to-end (admin + squad)

**Files:** none (verification only).

- [ ] **Step 1: Verify admin access**

Log in as an `admin` user. Confirm `/admin/compras/insumos` and `/admin/compras/stock` both load and function per Tasks 4/5's manual verification steps.

- [ ] **Step 2: Grant a `squad` user access and verify**

In `/admin/roles` or `/admin/usuarios` (wherever `profiles.modulos_permitidos` is edited today), add `compras-insumos` and `compras-stock` to a test `squad` user. Log in as that user, confirm both screens load and CRUD/upsert works.

- [ ] **Step 3: Verify a `squad` user WITHOUT the module is blocked**

Using a `squad` (or custom-role) user that does NOT have `compras-insumos`/`compras-stock` in `modulos_permitidos`, confirm the sidebar doesn't show the Compras section, and that navigating directly to `/admin/compras/insumos` by URL is blocked or redirected (per the existing `app/admin/layout.tsx` guard — if it isn't blocked, that's a gap in the existing layout guard, not something to silently patch here; flag it back to the user before changing shared layout logic).

- [ ] **Step 4: Verify RLS directly (not just UI-level gating)**

As a sanity check that access control isn't purely front-end, confirm via Supabase Studio (or `psql`) that a role NOT in `('admin','squad')` cannot select/insert into `compras_items`/`compras_stock_actual` — e.g. re-run the query from Task 1 Step 3 and cross-check the policy's `using` clause matches what's in the migration file.

- [ ] **Step 5: Record results**

No commit needed for this task — if all checks pass, the phase is ready to hand off for review per `superpowers:requesting-code-review`. If any check fails, stop and report which one before proceeding.

---

## Self-Review Notes

- Spec coverage: migración (Task 1), navegación (Task 2), `maneja_stock` en UI (Task 3, added because the spec's migration adds the column but the original spec text didn't explicitly say where it becomes editable — without this the column would be dead weight, so it's included here as a necessary completion of the spec's own intent), catálogo de insumos (Task 4), stock + alerta (Task 5), verificación admin/squad + RLS (Task 6, covers the spec's "Checklist de cobertura" section) — all covered.
- No hard delete was added for `compras_items` (only archive) because of the `on delete cascade` from `compras_stock_actual` — flagged explicitly in Task 4 rather than silently omitted.
- Two open items from the spec (`proveedores` RLS gap; exact latest-migration filename) were resolved during planning: the latest migration in the repo is `20260717150000_notificaciones.sql`, so `20260803120000_...` sorts after it correctly. The `proveedores` RLS gap is confirmed still out of scope — Task 6 Step 3 explicitly says to flag it back rather than fix it inline if discovered to be broader than expected.
