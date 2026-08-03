# Compras Fase 2 (Pedidos a proveedores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native "Pedidos a proveedores" screen to Ya!Chipacitos' Compras module — armar un pedido con autosugerencia de cantidades, generar y enviar un mensaje de WhatsApp, y llevar el ciclo borrador → enviado → cerrado — replacing the second slice of the legacy HTML/Google Sheets tool, without touching remitos/recepción (Fase 3) or reportes (Fase 4).

**Architecture:** Two new Postgres tables (`compras_pedidos`, `compras_pedido_items`) plus a `local` column on the existing `proveedores` table (used only to pick which of two hardcoded sucursales' invoicing data appears in the generated message). One new admin screen (`/admin/compras/pedidos`) built as the same bespoke server-page + client-component pair already used by `app/admin/proveedores/` and `app/admin/compras/insumos|stock/`. A small pure-function helper module (`lib/compras/pedidoMensaje.ts`) builds the WhatsApp message text and link, kept separate from the client component so it doesn't turn into an unreadable string-concatenation block inside JSX. One small addition to `ProveedoresClient.tsx` to make `local` settable, mirroring how Fase 1 added `maneja_stock` to that same file.

**Tech Stack:** Next.js 16 (App Router, `'use client'` components), React 19, Supabase (Postgres + RLS + `@supabase/ssr`), Tailwind v4. No test runner is configured in this repo (`package.json` has no jest/vitest) — verification for each task is `npx tsc --noEmit`, `npm run lint`, and manual browser verification against a running `npm run dev` server, same convention as the Fase 1 plan.

## Global Constraints

- Branch: all work happens on `dev`. Never touch `main` (holds the production database).
- Access: only `admin` and `squad` roles use `/admin/compras/*`. RLS on the two new tables must allow `admin` AND `squad` (`(select rol from profiles where id = auth.uid()) in ('admin','squad')`), same pattern as `compras_items`/`compras_stock_actual` from Fase 1 — do NOT copy the `proveedores` RLS policy verbatim (it only allows `admin`, a known out-of-scope gap).
- CRUD pattern: bespoke client components with direct `supabase.from(...).insert/update/delete`, exactly like `ProveedoresClient.tsx`/`InsumosClient.tsx`/`StockClient.tsx`. Do NOT use or extend `components/ui/TablaMaestra.tsx`.
- Soft delete convention does NOT apply to `compras_pedidos.estado` — that column models a lifecycle (`borrador`/`enviado`/`cerrado`), not archive/active. Still a `text` + `check` column, not an enum type or boolean.
- Autosugerencia: `cantidad = max(0, meta_semanal - stock_actual)`, only for items with `cantidad > 0`. No per-provider special formulas (no cajones-de-huevos-style rules).
- Closing a pedido (`estado = 'cerrado'`) must NEVER write to `compras_stock_actual`. That table is only touched from `/admin/compras/stock`.
- No message-sending integration beyond a WhatsApp deep link (`wa.me` or `api.whatsapp.com/send`) opened in a new tab — no server-side WhatsApp API calls.
- The two real locales and their invoicing data (`suc`, `cuit`, `direccion`) are hardcoded constants copied verbatim from the legacy app's `config.locales` — do not invent new ones or make this a database table.
- Spec reference: `docs/superpowers/specs/2026-08-03-compras-fase2-pedidos-proveedores.md`.

---

### Task 1: Migración SQL — `local` en proveedores, `compras_pedidos`, `compras_pedido_items`

**Files:**
- Create: `supabase/migrations/20260803150000_compras_fase2_pedidos_proveedores.sql`

**Interfaces:**
- Produces: column `proveedores.local text|null`; table `compras_pedidos(id uuid, proveedor_id uuid, estado 'borrador'|'enviado'|'cerrado', mensaje text|null, creado_por uuid|null, created_at timestamptz, enviado_en timestamptz|null, cerrado_en timestamptz|null)`; table `compras_pedido_items(id uuid, pedido_id uuid, item_id uuid|null, descripcion text, unidad text|null, cantidad numeric, orden integer)`. All later tasks read/write these.

- [ ] **Step 1: Write the migration file**

```sql
-- Fase 2 de Compras: pedidos a proveedores

alter table proveedores
  add column if not exists local text;

create table if not exists compras_pedidos (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id),
  estado        text not null default 'borrador' check (estado in ('borrador', 'enviado', 'cerrado')),
  mensaje       text,
  creado_por    uuid references profiles(id),
  created_at    timestamptz default now(),
  enviado_en    timestamptz,
  cerrado_en    timestamptz
);

create index if not exists idx_compras_pedidos_proveedor_id on compras_pedidos(proveedor_id);
create index if not exists idx_compras_pedidos_estado on compras_pedidos(estado);

alter table compras_pedidos enable row level security;

create policy "admin y squad manejan compras_pedidos" on compras_pedidos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_pedido_items (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references compras_pedidos(id) on delete cascade,
  item_id       uuid references compras_items(id),
  descripcion   text not null,
  unidad        text,
  cantidad      numeric not null default 0,
  orden         integer not null default 0
);

create index if not exists idx_compras_pedido_items_pedido_id on compras_pedido_items(pedido_id);

alter table compras_pedido_items enable row level security;

create policy "admin y squad manejan compras_pedido_items" on compras_pedido_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Run: `supabase db push`
Expected: output lists `20260803150000_compras_fase2_pedidos_proveedores.sql` as applied, no errors. If the CLI isn't linked in this shell, apply the same SQL via the Supabase Studio SQL editor for the `dev`-linked project instead, then confirm with:

```sql
select table_name from information_schema.tables where table_name in ('compras_pedidos','compras_pedido_items');
select column_name from information_schema.columns where table_name = 'proveedores' and column_name = 'local';
```

Expected: both tables listed, `local` column present.

- [ ] **Step 3: Verify RLS policies exist**

Run (SQL editor or `psql`):
```sql
select tablename, policyname from pg_policies where tablename in ('compras_pedidos','compras_pedido_items');
```
Expected: one row per table, matching the policy names from Step 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803150000_compras_fase2_pedidos_proveedores.sql
git commit -m "db: agregar local a proveedores, compras_pedidos y compras_pedido_items (Compras Fase 2)"
```

---

### Task 2: Campo `local` en el form de Proveedores

**Files:**
- Modify: `app/admin/proveedores/ProveedoresClient.tsx`

**Interfaces:**
- Consumes: existing `Proveedor` interface, `form` state, `guardar()`/`abrirEditar()` flow — no signature changes, only a new field threaded through the same objects already in place.
- Produces: `proveedores.local: string | null` now editable from the UI, using the fixed values `'paraguay'` and `'lagrana'`. Task 4's message helper and Task 5's screen key off these exact string values — they must match.

- [ ] **Step 1: Extend the `Proveedor` interface and `emptyForm`**

In `ProveedoresClient.tsx`, add `local: string | null` to the interface (after `maneja_stock`):

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
  local: string | null
}
```

And in `emptyForm()`, add `local: null` alongside the other defaults.

- [ ] **Step 2: Add the local selector to the form JSX**

Right after the `maneja_stock` checkbox block (currently `ProveedoresClient.tsx:215-226`), add:

```tsx
<div>
  <label className={labelClass}>Local (facturación/entrega)</label>
  <select className={inputClass} value={form.local ?? ''} onChange={e => setForm(f => ({...f, local: e.target.value || null}))}>
    <option value="">Sin asignar</option>
    <option value="paraguay">Paraguay 388</option>
    <option value="lagrana">Gdor. Lagraña 388</option>
  </select>
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, go to `/admin/proveedores`, edit "GLOBAL" and set Local to "Paraguay 388", edit "HUEVOS DE CAMPO" and set it to "Gdor. Lagraña 388" (mirrors the real legacy assignment). Reload and confirm both selections persisted.

- [ ] **Step 5: Commit**

```bash
git add app/admin/proveedores/ProveedoresClient.tsx
git commit -m "feat: agregar selector de local al form de Proveedores"
```

---

### Task 3: Entrada "Pedidos" en `lib/modulos.ts`

**Files:**
- Modify: `lib/modulos.ts:38-39` (insert new entry after `compras-stock`, before the `tareas` line)

**Interfaces:**
- Consumes: `Modulo` interface at `lib/modulos.ts:1-7` — no changes to its shape.
- Produces: one new `Modulo` entry with `key: 'compras-pedidos'`, `section: 'Compras'`. Task 5's page must live at the exact `href` used here.

- [ ] **Step 1: Add the new module entry**

In `lib/modulos.ts`, right after the `compras-stock` line and before the `tareas` line:

```ts
  { key: 'compras-pedidos', label: 'Pedidos', icon: '📋', href: '/admin/compras/pedidos', section: 'Compras' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `admin`, open the sidebar. Expected: the "Compras" section now shows "Insumos", "Stock", and "Pedidos" (the last one 404s until Task 5 lands — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add lib/modulos.ts
git commit -m "feat: agregar Pedidos a la sección Compras en modulos.ts"
```

---

### Task 4: Helper de mensaje y link de WhatsApp

**Files:**
- Create: `lib/compras/pedidoMensaje.ts`

**Interfaces:**
- Consumes: nothing from other tasks — pure functions, no Supabase calls, no React.
- Produces: `construirMensajePedido(proveedorNombre: string, local: string | null, items: ItemMensaje[]): string` and `linkWhatsApp(telefono: string | null, mensaje: string): string`, both imported by Task 5's `PedidosClient.tsx`. `ItemMensaje = { descripcion: string; unidad: string | null; cantidad: number }`.

- [ ] **Step 1: Write `lib/compras/pedidoMensaje.ts`**

```ts
export interface ItemMensaje {
  descripcion: string
  unidad: string | null
  cantidad: number
}

interface DatosLocal {
  suc: string
  cuit: string
  direccion: string
}

// Datos reales de facturación/entrega — copiados de la config del HTML legacy
// (Ya!ModuloCompra). Solo existen estos dos locales hoy.
export const LOCALES: Record<string, DatosLocal> = {
  paraguay: { suc: 'SUC. PARAGUAY', cuit: '33-71770212-9', direccion: 'PARAGUAY 388' },
  lagrana: { suc: 'SUC. GDOR. LAGRAÑA', cuit: '33-71770212-9', direccion: 'GDOR. LAGRAÑA 388' },
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function formatearCantidad(cantidad: number): string {
  return cantidad % 1 === 0 ? String(Math.floor(cantidad)) : String(cantidad)
}

function formatearLineaItem(item: ItemMensaje): string {
  const unidad = item.unidad ? ` ${item.unidad}` : ''
  return `   — ${formatearCantidad(item.cantidad)}${unidad} ${item.descripcion}`.toUpperCase()
}

export function construirMensajePedido(proveedorNombre: string, local: string | null, items: ItemMensaje[]): string {
  const hoy = new Date()
  const fecha = `${hoy.getDate()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dia = DIAS_SEMANA[hoy.getDay()]

  const cuerpo = items.map(formatearLineaItem).join('\n')
  const datosLocal = local ? LOCALES[local] : undefined

  const entrega = datosLocal ? `\n\n📍 *Entrega:* ${datosLocal.direccion}` : ''
  const facturacion = datosLocal
    ? `\n\n· · · · · · · · · · ·\n🏷 *Datos de facturación*\n${datosLocal.suc}\nYA ! CHIPACITOS\nCUIT: ${datosLocal.cuit}`
    : ''

  return `🧾 *PEDIDO ${proveedorNombre.toUpperCase()}* — ${dia} ${fecha}${entrega}\n\n*Detalle del pedido:*\n${cuerpo}${facturacion}`
}

export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const texto = encodeURIComponent(mensaje)
  const numero = telefono ? telefono.replace(/[^\d]/g, '') : ''
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this file has no consumers yet, so it just needs to compile standalone).

- [ ] **Step 3: Manual sanity check**

Since there's no test runner, verify the pure function directly with `node` via a throwaway REPL-style check (does not touch the repo):

Run:
```bash
npx tsx -e "
import { construirMensajePedido, linkWhatsApp } from './lib/compras/pedidoMensaje.ts'
console.log(construirMensajePedido('Global', 'paraguay', [{ descripcion: 'Bolsas fécula', unidad: 'bolsa', cantidad: 3 }]))
console.log(linkWhatsApp('+54 9 379 000-0000', 'hola'))
"
```
Expected: prints a message starting with `🧾 *PEDIDO GLOBAL*`, containing `— 3 BOLSA BOLSAS FÉCULA`, ending with the `CUIT: 33-71770212-9` line; second line prints `https://wa.me/5493790000000?text=hola`. If `npx tsx` isn't available, install it ad-hoc with `npm exec --yes tsx@latest -- -e "..."` or temporarily paste the two functions into a `.mjs` scratch file and run with `node` — either way, do not skip this check, it's the only verification this pure logic gets before Task 5 wires it into the UI.

- [ ] **Step 4: Commit**

```bash
git add lib/compras/pedidoMensaje.ts
git commit -m "feat: helper de mensaje de pedido y link de WhatsApp"
```

---

### Task 5: Pantalla de pedidos — `/admin/compras/pedidos`

**Files:**
- Create: `app/admin/compras/pedidos/page.tsx`
- Create: `app/admin/compras/pedidos/PedidosClient.tsx`

**Interfaces:**
- Consumes: `compras_pedidos`/`compras_pedido_items`/`proveedores.local` (Task 1), `proveedores` form (Task 2, for `local`/`maneja_stock`/`contacto_telefono` data), `construirMensajePedido`/`linkWhatsApp` (Task 4), `compras_items`/`compras_stock_actual` (Fase 1) for the autosuggest calculation.
- Produces: no downstream consumers within Fase 2 — last screen of this phase.

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosClient from './PedidosClient'

export const metadata = { title: 'Pedidos | YA! Chipacitos' }

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: proveedores },
    { data: itemsCatalogo },
    { data: stock },
    { data: pedidos },
  ] = await Promise.all([
    supabase
      .from('proveedores')
      .select('id, nombre, local, contacto_telefono, maneja_stock')
      .eq('estado', 'activo')
      .order('nombre'),
    supabase.from('compras_items').select('*').eq('estado', 'activo').order('orden'),
    supabase.from('compras_stock_actual').select('*'),
    supabase
      .from('compras_pedidos')
      .select('*, proveedores(id, nombre, local, contacto_telefono, maneja_stock), compras_pedido_items(*)')
      .order('created_at', { ascending: false }),
  ])

  return (
    <PedidosClient
      proveedores={proveedores ?? []}
      itemsCatalogo={itemsCatalogo ?? []}
      stockInicial={stock ?? []}
      pedidosIniciales={pedidos ?? []}
      usuarioId={user.id}
    />
  )
}
```

- [ ] **Step 2: Write `PedidosClient.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { construirMensajePedido, linkWhatsApp } from '@/lib/compras/pedidoMensaje'

interface Proveedor {
  id: string
  nombre: string
  local: string | null
  contacto_telefono: string | null
  maneja_stock: boolean
}

interface CompraItem {
  id: string
  proveedor_id: string
  nombre: string
  unidad: string
  meta_semanal: number
}

interface StockActual {
  item_id: string
  cantidad: number
}

interface PedidoItem {
  id: string
  pedido_id: string
  item_id: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  orden: number
}

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
}

type FiltroPedidos = 'activos' | 'todos'

// Fila local del editor de ítems: id/pedido_id quedan sin definir hasta guardar.
type ItemEditor = Pick<PedidoItem, 'item_id' | 'descripcion' | 'unidad' | 'cantidad'>

export default function PedidosClient({
  proveedores,
  itemsCatalogo,
  stockInicial,
  pedidosIniciales,
  usuarioId,
}: {
  proveedores: Proveedor[]
  itemsCatalogo: CompraItem[]
  stockInicial: StockActual[]
  pedidosIniciales: Pedido[]
  usuarioId: string
}) {
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciales)
  const [filtro, setFiltro] = useState<FiltroPedidos>('activos')
  const [proveedorNuevo, setProveedorNuevo] = useState('')
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [itemsEditor, setItemsEditor] = useState<ItemEditor[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const stockPorItem = Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad]))

  const pedidosFiltrados = pedidos.filter(p =>
    filtro === 'todos' ? true : p.estado === 'borrador' || p.estado === 'enviado'
  )

  function abrirEditor(pedido: Pedido) {
    setPedidoEditando(pedido)
    setItemsEditor(
      [...pedido.compras_pedido_items]
        .sort((a, b) => a.orden - b.orden)
        .map(i => ({ item_id: i.item_id, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad }))
    )
    setError('')
  }

  function cerrarEditor() {
    setPedidoEditando(null)
    setItemsEditor([])
  }

  async function crearPedido() {
    if (!proveedorNuevo) { setError('Elegí un proveedor'); return }
    const proveedor = proveedores.find(p => p.id === proveedorNuevo)
    if (!proveedor) return
    setError('')

    startTransition(async () => {
      const { data: pedido, error: errPedido } = await supabase
        .from('compras_pedidos')
        .insert([{ proveedor_id: proveedor.id, estado: 'borrador', creado_por: usuarioId }])
        .select()
        .single()
      if (errPedido) { setError(errPedido.message); return }

      let itemsSugeridos: ItemEditor[] = []
      if (proveedor.maneja_stock) {
        itemsSugeridos = itemsCatalogo
          .filter(i => i.proveedor_id === proveedor.id)
          .map(i => ({
            item_id: i.id,
            descripcion: i.nombre,
            unidad: i.unidad,
            cantidad: Math.max(0, i.meta_semanal - (stockPorItem[i.id] ?? 0)),
          }))
          .filter(i => i.cantidad > 0)
      }

      const nuevoPedido: Pedido = { ...pedido, proveedores: proveedor, compras_pedido_items: [] }
      setPedidos(prev => [nuevoPedido, ...prev])
      setProveedorNuevo('')
      abrirEditor(nuevoPedido)
      setItemsEditor(itemsSugeridos)
    })
  }

  function agregarItemLibre() {
    setItemsEditor(prev => [...prev, { item_id: null, descripcion: '', unidad: '', cantidad: 0 }])
  }

  function actualizarItemEditor(index: number, cambios: Partial<ItemEditor>) {
    setItemsEditor(prev => prev.map((it, i) => i === index ? { ...it, ...cambios } : it))
  }

  function quitarItemEditor(index: number) {
    setItemsEditor(prev => prev.filter((_, i) => i !== index))
  }

  async function guardarItems(): Promise<PedidoItem[] | null> {
    if (!pedidoEditando) return null
    setError('')

    const filas = itemsEditor
      .filter(i => i.descripcion.trim() && i.cantidad > 0)
      .map((i, idx) => ({
        pedido_id: pedidoEditando.id,
        item_id: i.item_id,
        descripcion: i.descripcion.trim(),
        unidad: i.unidad?.trim() || null,
        cantidad: i.cantidad,
        orden: idx,
      }))

    const { error: errDelete } = await supabase.from('compras_pedido_items').delete().eq('pedido_id', pedidoEditando.id)
    if (errDelete) { setError(errDelete.message); return null }

    let itemsGuardados: PedidoItem[] = []
    if (filas.length) {
      const { data, error: errInsert } = await supabase.from('compras_pedido_items').insert(filas).select()
      if (errInsert) { setError(errInsert.message); return null }
      itemsGuardados = data
    }

    setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, compras_pedido_items: itemsGuardados } : p))
    setPedidoEditando(prev => prev ? { ...prev, compras_pedido_items: itemsGuardados } : prev)
    return itemsGuardados
  }

  async function generarMensaje() {
    if (!pedidoEditando) return
    setError('')

    startTransition(async () => {
      const itemsGuardados = await guardarItems()
      if (!itemsGuardados) return
      if (!itemsGuardados.length) { setError('Agregá al menos un ítem antes de generar el mensaje'); return }

      const mensaje = construirMensajePedido(pedidoEditando.proveedores.nombre, pedidoEditando.proveedores.local, itemsGuardados)

      const { data, error: errUpdate } = await supabase
        .from('compras_pedidos')
        .update({ mensaje })
        .eq('id', pedidoEditando.id)
        .select()
        .single()
      if (errUpdate) { setError(errUpdate.message); return }

      setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, mensaje: data.mensaje } : p))
      setPedidoEditando(prev => prev ? { ...prev, mensaje: data.mensaje } : prev)
    })
  }

  async function enviarWhatsApp() {
    if (!pedidoEditando?.mensaje) return
    const url = linkWhatsApp(pedidoEditando.proveedores.contacto_telefono, pedidoEditando.mensaje)
    window.open(url, '_blank')

    const { data, error: err } = await supabase
      .from('compras_pedidos')
      .update({ estado: 'enviado', enviado_en: new Date().toISOString() })
      .eq('id', pedidoEditando.id)
      .select()
      .single()
    if (err) { setError(err.message); return }

    setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, ...data } : p))
    setPedidoEditando(prev => prev ? { ...prev, ...data } : prev)
  }

  async function cerrarPedido(pedido: Pedido) {
    if (!confirm(`¿Cerrar el pedido a ${pedido.proveedores.nombre}?`)) return
    const { data, error: err } = await supabase
      .from('compras_pedidos')
      .update({ estado: 'cerrado', cerrado_en: new Date().toISOString() })
      .eq('id', pedido.id)
      .select()
      .single()
    if (err) { setError(err.message); return }

    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, ...data } : p))
    if (pedidoEditando?.id === pedido.id) setPedidoEditando(prev => prev ? { ...prev, ...data } : prev)
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  const estadoBadgeClass: Record<Pedido['estado'], string> = {
    borrador: 'bg-[#2a2a2a] text-[#ccc]',
    enviado: 'bg-yellow-900/50 text-yellow-300',
    cerrado: 'bg-green-900/50 text-green-300',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Pedidos a proveedores</h1>
        <p className="text-[#888] text-sm mt-0.5">Armá un pedido, generá el mensaje y envialo por WhatsApp.</p>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className={labelClass}>Nuevo pedido a</label>
          <select className={inputClass} value={proveedorNuevo} onChange={e => setProveedorNuevo(e.target.value)}>
            <option value="">Seleccionar proveedor...</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button onClick={crearPedido} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          + Crear pedido
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {pedidoEditando && (
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#f0f0f0]">Pedido a {pedidoEditando.proveedores.nombre}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadgeClass[pedidoEditando.estado]}`}>{pedidoEditando.estado}</span>
          </div>

          <div className="space-y-2">
            {itemsEditor.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  value={item.cantidad}
                  onChange={e => actualizarItemEditor(idx, { cantidad: Number(e.target.value) })}
                />
                <input
                  type="text"
                  className={`${inputClass} w-24`}
                  placeholder="Unidad"
                  value={item.unidad ?? ''}
                  onChange={e => actualizarItemEditor(idx, { unidad: e.target.value })}
                />
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Descripción"
                  value={item.descripcion}
                  onChange={e => actualizarItemEditor(idx, { descripcion: e.target.value })}
                />
                <button onClick={() => quitarItemEditor(idx)} className="text-[#888] hover:text-red-400 text-lg px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={agregarItemLibre} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              + Agregar ítem
            </button>
            <button onClick={() => guardarItems()} disabled={isPending} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Guardar ítems
            </button>
            <button onClick={generarMensaje} disabled={isPending || pedidoEditando.estado === 'cerrado'} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Generar mensaje
            </button>
            <button onClick={cerrarEditor} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Cerrar edición
            </button>
          </div>

          {pedidoEditando.mensaje && (
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
              <pre className="text-[#e0e0e0] text-sm whitespace-pre-wrap font-sans">{pedidoEditando.mensaje}</pre>
              <div className="flex gap-3">
                <button
                  onClick={() => navigator.clipboard.writeText(pedidoEditando.mensaje ?? '')}
                  className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  Copiar mensaje
                </button>
                <button
                  onClick={enviarWhatsApp}
                  disabled={pedidoEditando.estado === 'cerrado'}
                  className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  Enviar por WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {(['activos', 'todos'] as FiltroPedidos[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${filtro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {pedidosFiltrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay pedidos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Ítems</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {pedidosFiltrados.map(p => (
                  <tr key={p.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{p.proveedores.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadgeClass[p.estado]}`}>{p.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-[#888]">{new Date(p.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#888]">{p.compras_pedido_items.length}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => abrirEditor(p)} className="text-xs text-[#888] hover:text-[#e8c547] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Editar
                        </button>
                        {p.estado !== 'cerrado' && (
                          <button onClick={() => cerrarPedido(p)} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                            Cerrar
                          </button>
                        )}
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

Note: `guardarItems()` deletes and re-inserts all rows for the pedido rather than diffing — simplest correct approach given a pedido has at most a handful of items and no concurrent multi-user editing of the same pedido is expected. `generarMensaje()` calls `guardarItems()` first so the saved message always reflects what's actually persisted, never stale in-editor state.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification — autosugerencia y ciclo completo**

Run: `npm run dev`, log in as `admin`, go to `/admin/compras/pedidos`.
1. Pick "GLOBAL" (or whichever provider has `maneja_stock = true` and a `local` set from Task 2) in "Nuevo pedido a", click "Crear pedido". Confirm the editor opens with items pre-filled matching `meta_semanal - stock_actual` from the insumos/stock you set up in Fase 1's verification.
2. Edit a quantity, add a free item via "+ Agregar ítem", click "Guardar ítems". Reload the page, re-open the pedido via "Editar", confirm the edits persisted.
3. Click "Generar mensaje". Confirm the preview box shows the formatted text with the provider name, today's date, item lines, and (if `local` is set) the facturación footer with the real CUIT.
4. Click "Enviar por WhatsApp". Confirm a new tab opens to `wa.me/...` (if the provider has `contacto_telefono`) or `api.whatsapp.com/send` (if not), and the pedido's badge flips to "enviado".
5. From the list, click "Cerrar" on that pedido, confirm the dialog, confirm it disappears from the "Activos" filter but still shows under "Todos" with badge "cerrado".
6. Go to `/admin/compras/stock` and confirm the quantities there are unchanged by the above — closing/sending a pedido must not touch stock.

- [ ] **Step 5: Manual verification — proveedor sin stock**

Create a pedido for a provider with `maneja_stock = false`. Confirm the editor opens with zero items and "+ Agregar ítem" is the only way to add lines.

- [ ] **Step 6: Commit**

```bash
git add app/admin/compras/pedidos
git commit -m "feat: pantalla de pedidos a proveedores en /admin/compras/pedidos"
```

---

### Task 6: QA manual end-to-end (admin + squad)

**Files:** none (verification only).

- [ ] **Step 1: Verify admin access**

Log in as an `admin` user. Confirm `/admin/compras/pedidos` loads and every flow from Task 5's manual verification steps still works.

- [ ] **Step 2: Grant a `squad` user access and verify**

In `/admin/roles` or `/admin/usuarios` (wherever `profiles.modulos_permitidos` is edited today), add `compras-pedidos` to a test `squad` user. Log in as that user, confirm the screen loads and the full create → edit → generar mensaje → enviar → cerrar cycle works.

- [ ] **Step 3: Verify a `squad` user WITHOUT the module is blocked**

Using a `squad` (or custom-role) user that does NOT have `compras-pedidos` in `modulos_permitidos`, confirm the sidebar doesn't show "Pedidos" under Compras, and that navigating directly to `/admin/compras/pedidos` by URL is blocked or redirected per the existing `app/admin/layout.tsx` guard.

- [ ] **Step 4: Verify RLS directly**

Via Supabase Studio (or `psql`), confirm a role NOT in `('admin','squad')` cannot select/insert into `compras_pedidos`/`compras_pedido_items` — cross-check the policies' `using` clause against the migration file from Task 1.

- [ ] **Step 5: Record results**

No commit needed for this task — if all checks pass, the phase is ready to hand off for review per `superpowers:requesting-code-review`. If any check fails, stop and report which one before proceeding.

---

## Self-Review Notes

- Spec coverage: migración (Task 1), campo `local` en Proveedores (Task 2, needed because the spec's migration adds the column but doesn't say where it becomes editable — same completion-of-intent reasoning Fase 1 used for `maneja_stock`), navegación (Task 3), helper de mensaje/WhatsApp (Task 4), pantalla completa con autosugerencia/edición/envío/cierre (Task 5), verificación admin/squad + RLS (Task 6) — all covered.
- Corrected during planning: the spec's mention of reusing "the global remitos Activos/Todos view" refers to a screen that only exists in the legacy HTML app, not in Chipacitos (which has no remitos screen yet — that's Fase 3). The actual precedent used here is the `activo`/`archivado`/`todos` filter button pattern already in `InsumosClient.tsx`/`ProveedoresClient.tsx`. The spec file was corrected to match (commit `09d1a04`).
- No pagination was added to the pedidos list, matching the actual scale of `InsumosClient`/`ProveedoresClient` (fetch-all, no pagination) rather than the spec's earlier (inaccurate) reference to a paginated remitos view.
- Type consistency check: `ItemEditor` (Task 5) matches the fields `construirMensajePedido`'s `ItemMensaje` (Task 4) needs (`descripcion`, `unidad`, `cantidad`) — `guardarItems()` returns full `PedidoItem` rows (superset of `ItemMensaje`), which is what's actually passed to `construirMensajePedido`, so the shapes line up.
- No "reabrir pedido cerrado" action was added — out of scope per this session's decisions (only borrador → enviado → cerrado was confirmed; reopening was a legacy feature not carried over). If needed later, it's a small additive change (flip `estado` back, clear `cerrado_en`), not a redesign.
