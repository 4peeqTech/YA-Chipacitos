'use client'

import { useMemo, useState } from 'react'
import { CircleCheck, PackageCheck, PackageSearch, PackageX, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/lib/types'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { estiloCategoria, ordenCategoria } from '@/lib/pedidos/categorias'

// Catálogo del mayorista (R1/R6): marca qué productos tienen stock.
// productos.activo = hay stock; false = sin stock por ahora (los locales lo
// ven en gris). Depósito sigue con CatalogoClient.

type Filtro = 'todos' | 'con' | 'sin'

const SIN_CATEGORIA = 'Sin categoría'

// Se oculta la genérica "Unidad" y la que ya dice el nombre ("MASA CLÁSICO Kg.").
function unidadVisible(p: Producto) {
  const u = p.unidad?.trim()
  if (!u || u.toLowerCase() === 'unidad') return null
  return p.nombre.toLowerCase().includes(u.toLowerCase().replace(/\.$/, '')) ? null : u
}

export default function CatalogoMayorista({ productosIniciales }: { productosIniciales: Producto[] }) {
  const [supabase] = useState(() => createClient())
  const [productos, setProductos] = useState(productosIniciales)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<Set<string>>(new Set())
  const toast = useToasts()

  const conStock = productos.filter(p => p.activo).length
  const sinStock = productos.length - conStock

  const categorias = useMemo(
    () => [...new Set(productos.map(p => p.categoria || SIN_CATEGORIA))]
      .sort((a, b) => ordenCategoria(a) - ordenCategoria(b) || a.localeCompare(b, 'es')),
    [productos],
  )

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const visibles = productos.filter(p =>
      (filtro === 'todos' || (filtro === 'con' ? p.activo : !p.activo)) &&
      (!categoria || (p.categoria || SIN_CATEGORIA) === categoria) &&
      (!q || p.nombre.toLowerCase().includes(q) || (p.codigo != null && String(p.codigo).includes(q))),
    )
    return categorias
      .map(c => ({
        categoria: c,
        productos: visibles
          .filter(p => (p.categoria || SIN_CATEGORIA) === c)
          .sort((a, b) => (a.codigo ?? Infinity) - (b.codigo ?? Infinity) || a.nombre.localeCompare(b.nombre, 'es')),
      }))
      .filter(g => g.productos.length > 0)
  }, [productos, filtro, categoria, busqueda, categorias])

  async function cambiarStock(p: Producto) {
    if (guardando.has(p.id)) return
    const nuevo = !p.activo
    setGuardando(prev => new Set(prev).add(p.id))
    setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: nuevo } : x))
    let ok = false
    try {
      const { data, error } = await supabase.from('productos').update({ activo: nuevo }).eq('id', p.id).select('id').maybeSingle()
      ok = !error && !!data
    } catch {
      ok = false
    }
    if (ok) {
      toast.success(nuevo
        ? `${p.nombre}: hay stock de nuevo.`
        : `${p.nombre}: sin stock. Los locales lo ven como "Sin stock por ahora".`)
    } else {
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: p.activo } : x))
      toast.error(`No se pudo cambiar el stock de ${p.nombre.replace(/\.$/, '')}. Revisá la conexión y probá de nuevo.`)
    }
    setGuardando(prev => { const s = new Set(prev); s.delete(p.id); return s })
  }

  const SEGMENTOS: { key: Filtro; label: string; n: number }[] = [
    { key: 'todos', label: 'Todos', n: productos.length },
    { key: 'con', label: 'Con stock', n: conStock },
    { key: 'sin', label: 'Sin stock', n: sinStock },
  ]
  const hayFiltros = filtro !== 'todos' || !!categoria || !!busqueda.trim()

  return (
    // Ancho acotado: en 1440 el botón queda cerca del nombre.
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 lg:px-8 lg:py-6">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-['Syne'] text-xl font-bold text-text">Catálogo</h1>
        {sinStock > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning">
            <TriangleAlert size={14} aria-hidden />
            {sinStock} producto{sinStock === 1 ? '' : 's'} sin stock
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-bg px-3 py-1 text-xs font-semibold text-success">
            <CircleCheck size={14} aria-hidden />
            Todo con stock
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Stock" className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface p-1">
          {SEGMENTOS.map(s => {
            const activo = filtro === s.key
            return (
              <button key={s.key} type="button" role="radio" aria-checked={activo} onClick={() => setFiltro(s.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                  activo ? 'bg-accent text-black' : 'text-muted hover:bg-surface2 hover:text-text'
                }`}>
                {s.label}
                <span className={`rounded-full px-1.5 text-2xs font-bold ${activo ? 'bg-black/15' : 'bg-surface2'}`}>{s.n}</span>
              </button>
            )
          })}
        </div>
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o código…" className="min-w-[12rem] flex-1" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categoría">
          {categorias.map(c => {
            const activa = categoria === c
            const Icono = estiloCategoria(c === SIN_CATEGORIA ? null : c).icono
            return (
              <button key={c} type="button" aria-pressed={activa} onClick={() => setCategoria(activa ? null : c)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activa ? 'border-accent bg-accent text-black' : 'border-border bg-surface2 text-muted hover:text-text'
                }`}>
                <Icono size={13} aria-hidden />
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState icono={PackageSearch}
            titulo={hayFiltros ? 'No hay productos con esos filtros' : 'No hay productos en el catálogo'}
            descripcion={hayFiltros ? 'Probá con otra búsqueda o sacá los filtros.' : undefined}
            accion={hayFiltros ? (
              <button type="button" onClick={() => { setFiltro('todos'); setCategoria(null); setBusqueda('') }}
                className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">
                Ver todos
              </button>
            ) : undefined} />
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(g => {
            const estilo = estiloCategoria(g.categoria === SIN_CATEGORIA ? null : g.categoria)
            const Icono = estilo.icono
            return (
              <section key={g.categoria} aria-label={g.categoria} className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${estilo.clase}`}><Icono size={14} aria-hidden /></span>
                  {g.categoria}
                  <span className="font-normal normal-case tracking-normal text-faint">· {g.productos.length}</span>
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                  {g.productos.map(p => {
                    const ocupado = guardando.has(p.id)
                    const unidad = unidadVisible(p)
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                        <div className={`flex min-w-0 flex-1 items-center gap-3 ${p.activo ? '' : 'opacity-50'}`}>
                          <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex ${estilo.clase}`}>
                            <Icono size={16} aria-hidden />
                          </span>
                          {p.codigo != null && (
                            <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-accent">#{p.codigo}</span>
                          )}
                          <span className="min-w-0">
                            <span className={`block text-sm leading-snug break-words sm:truncate ${p.activo ? 'text-text' : 'text-muted'}`}>{p.nombre}</span>
                            {unidad && <span className="block text-2xs text-faint">{unidad}</span>}
                          </span>
                        </div>
                        <button type="button" onClick={() => cambiarStock(p)} disabled={ocupado}
                          aria-label={p.activo ? `${p.nombre}: hay stock. Marcar sin stock` : `${p.nombre}: sin stock. Marcar que hay stock`}
                          title={p.activo ? 'Marcar sin stock' : 'Marcar que hay stock'}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 sm:px-3 ${
                            p.activo
                              ? 'border-success/30 bg-green-bg text-success hover:border-success/60'
                              : 'border-border bg-surface2 text-muted hover:text-text'
                          }`}>
                          {p.activo ? <PackageCheck size={15} aria-hidden /> : <PackageX size={15} aria-hidden />}
                          {p.activo ? 'Hay stock' : 'Sin stock'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
