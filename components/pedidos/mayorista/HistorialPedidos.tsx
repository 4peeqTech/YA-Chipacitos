'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, History, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { EstadoPedido, Pedido } from '@/lib/types'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonTabla } from '@/components/ui/Skeleton'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import EstadoPedidoBadge from '@/components/pedidos/compartido/EstadoPedidoBadge'
import AvisoVersionAnterior, { MarcaVersionAnterior } from '@/components/pedidos/compartido/AvisoVersionAnterior'
import { ORDEN_ESTADOS, etiquetaEstado } from '@/lib/pedidos/estados'
import { fechaCorta } from './utiles'

// Recibidos y cancelados, paginados en la base con range(). Con `todosLosEstados`
// (reporte del admin) trae también los que están en curso y suma el filtro de estado.

const POR_PAGINA = 20

interface Props {
  destino: 'fabrica'
  sucursales: string[]
  inicioVersion: string | null
  /** Sube cuando cambia algo afuera (un pedido se cerró) para volver a leer la página. */
  version: number
  onAbrir: (pedido: Pedido) => void
  todosLosEstados?: boolean
}

// Fin del día en Argentina (UTC-3): el filtro "hasta" incluye ese día entero.
function finDelDia(fecha: string) {
  return `${fecha}T23:59:59.999-03:00`
}

export default function HistorialPedidos({ destino, sucursales, inicioVersion, version, onAbrir, todosLosEstados = false }: Props) {
  const [supabase] = useState(() => createClient())
  const [pagina, setPagina] = useState(0)
  const [sucursal, setSucursal] = useState('todas')
  const [estado, setEstado] = useState<EstadoPedido | 'todos'>('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filas, setFilas] = useState<Pedido[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    let q = supabase
      .from('pedidos')
      .select('*, pedido_items(*), pedido_mensajes(*)', { count: 'exact' })
      .eq('destino', destino)
      .in('estado', estado !== 'todos' ? [estado] : todosLosEstados ? ORDEN_ESTADOS : ['recibido', 'cancelado'])
    if (sucursal !== 'todas') q = q.eq('local_nombre', sucursal)
    if (desde) q = q.gte('created_at', `${desde}T00:00:00-03:00`)
    if (hasta) q = q.lte('created_at', finDelDia(hasta))
    q.order('created_at', { ascending: false })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
      .then(({ data, count, error: err }) => {
        if (!vigente) return
        if (err) {
          setError('No se pudo cargar el historial. Revisá la conexión y probá de nuevo.')
          setFilas([])
          return
        }
        setError(null)
        setFilas((data ?? []) as Pedido[])
        setTotal(count ?? 0)
      })
    return () => { vigente = false }
  }, [supabase, destino, sucursal, estado, todosLosEstados, desde, hasta, pagina, version])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const hayFiltros = sucursal !== 'todas' || estado !== 'todos' || !!desde || !!hasta

  function cambiarFiltro(f: () => void) {
    f()
    setPagina(0)
    setFilas(null)
  }

  return (
    <div className="space-y-4">
      <AvisoVersionAnterior fecha={inicioVersion} />

      <div className="flex flex-wrap items-center gap-2">
        <select value={sucursal} onChange={e => cambiarFiltro(() => setSucursal(e.target.value))} aria-label="Sucursal"
          className="w-full sm:w-auto bg-surface2 border border-border text-text rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent">
          <option value="todas">Todas las sucursales</option>
          {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {todosLosEstados && (
          <select value={estado} onChange={e => cambiarFiltro(() => setEstado(e.target.value as EstadoPedido | 'todos'))} aria-label="Estado"
            className="w-full sm:w-auto bg-surface2 border border-border text-text rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent">
            <option value="todos">Todos los estados</option>
            {ORDEN_ESTADOS.map(e => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
          </select>
        )}
        <DateRangeInputs desde={desde} hasta={hasta} className="min-w-0 [&_input]:min-w-0 [&_input]:flex-1"
          onChangeDesde={v => cambiarFiltro(() => setDesde(v))} onChangeHasta={v => cambiarFiltro(() => setHasta(v))} />
        <ClearFiltersButton visible={hayFiltros}
          onClick={() => cambiarFiltro(() => { setSucursal('todas'); setEstado('todos'); setDesde(''); setHasta('') })} />
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-brand-red"><TriangleAlert size={16} /> {error}</p>
      )}

      {filas === null ? <SkeletonTabla filas={6} columnas={4} /> : filas.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState icono={History}
            titulo={hayFiltros ? 'No hay pedidos con esos filtros' : todosLosEstados ? 'Todavía no hay pedidos' : 'Todavía no hay pedidos cerrados'}
            descripcion={hayFiltros ? 'Probá con otra sucursal, otro estado u otras fechas.' : todosLosEstados ? 'Acá van a aparecer los pedidos de los locales al mayorista.' : 'Acá van a aparecer los recibidos y los cancelados.'} />
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface divide-y divide-border overflow-hidden">
          {filas.map(p => {
            const productos = (p.pedido_items ?? []).length
            return (
              <button key={p.id} type="button" onClick={() => onAbrir(p)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none">
                <span className="w-16 shrink-0 text-sm font-semibold text-text tabular-nums">#{p.numero}</span>
                <span className="min-w-[8rem] flex-1 truncate text-sm text-text">{p.local_nombre}</span>
                <span className="text-xs text-muted">{fechaCorta(p.created_at)}</span>
                <span className="text-xs text-muted">{productos} prod.</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <EstadoPedidoBadge estado={p.estado} />
                  {p.recepcion_con_diferencias && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
                      <TriangleAlert size={11} aria-hidden /> Con diferencias
                    </span>
                  )}
                  <MarcaVersionAnterior pedido={p} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {total > POR_PAGINA && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{total} pedidos · página {pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <button type="button" disabled={pagina === 0 || filas === null} onClick={() => { setPagina(p => p - 1); setFilas(null) }}
              aria-label="Página anterior"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:text-text disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <button type="button" disabled={pagina >= paginas - 1 || filas === null} onClick={() => { setPagina(p => p + 1); setFilas(null) }}
              aria-label="Página siguiente"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:text-text disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
