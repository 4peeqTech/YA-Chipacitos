'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BarChart3, ChevronDown, Package, RefreshCw, ShoppingBag, Store, Wallet } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { Skeleton } from '@/components/ui/Skeleton'
import { controlClass } from '@/components/ui/Field'
import { formatearMoneda } from '@/lib/formato'
import { calcularRangoPreset } from '@/lib/compras/rangoFechas'
import { mensajeError } from '@/lib/errores'

interface CatRow { categoria: string; total: number }
interface VentaRow { producto: string; cantidad: number; importe: number }
interface LocalData {
  local: string
  gastos: CatRow[]
  ventas: VentaRow[]
  totalGastos: number
  totalVendido: number
  totalMontoVendido: number
}

const PRODUCTOS_VISIBLES = 8

function unidades(n: number): string {
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} u`
}

function TarjetaLocal({ d }: { d: LocalData }) {
  const [abierta, setAbierta] = useState(true)
  const [todosProductos, setTodosProductos] = useState(false)
  const mayorGasto = d.gastos[0]?.total ?? 0
  const productos = todosProductos ? d.ventas : d.ventas.slice(0, PRODUCTOS_VISIBLES)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface2"
      >
        <span className="flex items-center gap-2 font-bold text-text">
          <Store size={16} className="text-accent-fg" /> {d.local}
        </span>
        <span className="flex items-center gap-5 text-right">
          <span>
            <span className="block text-2xs uppercase tracking-wider text-muted">Gastos</span>
            <span className="block text-sm font-semibold tabular-nums text-text">{formatearMoneda(d.totalGastos)}</span>
          </span>
          <span>
            <span className="block text-2xs uppercase tracking-wider text-muted">Vendido</span>
            <span className="block text-sm font-semibold tabular-nums text-text">{d.totalMontoVendido > 0 ? formatearMoneda(d.totalMontoVendido) : '—'}</span>
          </span>
          <span className="hidden sm:block">
            <span className="block text-2xs uppercase tracking-wider text-muted">Unidades</span>
            <span className="block text-sm font-semibold tabular-nums text-text">{unidades(d.totalVendido)}</span>
          </span>
          <ChevronDown size={16} className={`shrink-0 text-muted transition-transform duration-200 ${abierta ? '' : '-rotate-90'}`} />
        </span>
      </button>

      {abierta && (
        <div className="grid divide-y divide-border border-t border-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Wallet size={15} className="text-accent" /> Gastos por categoría
            </h3>
            {d.gastos.length === 0 ? (
              <p className="text-sm text-muted">No hay gastos cargados para este local en el período.</p>
            ) : (
              <ul className="space-y-2.5">
                {d.gastos.map(g => {
                  const pct = d.totalGastos > 0 ? Math.round((g.total / d.totalGastos) * 100) : 0
                  return (
                    <li key={g.categoria} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-text">{g.categoria}</span>
                        <span className="whitespace-nowrap tabular-nums">
                          <span className="font-semibold text-text">{formatearMoneda(g.total)}</span>
                          <span className="ml-2 inline-block w-9 text-right text-xs text-muted">{pct} %</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface2" aria-hidden>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${mayorGasto > 0 ? (g.total / mayorGasto) * 100 : 0}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <ShoppingBag size={15} className="text-accent" /> Ventas por producto
              <span className="font-normal text-muted">(Posberry)</span>
            </h3>
            {d.ventas.length === 0 ? (
              <p className="text-sm text-muted">No hay ventas registradas para este local en el período.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-2xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="pb-2 text-left font-semibold">Producto</th>
                      <th className="pb-2 text-right font-semibold">Cantidad</th>
                      <th className="pb-2 text-right font-semibold">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {productos.map(v => (
                      <tr key={v.producto}>
                        <td className="py-1.5 pr-3 text-text">{v.producto}</td>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-text">{v.cantidad.toLocaleString('es-AR')}</td>
                        <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-muted">{v.importe > 0 ? formatearMoneda(v.importe) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.ventas.length > PRODUCTOS_VISIBLES && (
                  <button
                    type="button"
                    onClick={() => setTodosProductos(t => !t)}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
                  >
                    {todosProductos ? 'Ver menos' : `Ver los ${d.ventas.length} productos`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default function ResumenClient() {
  const mesActual = useMemo(() => calcularRangoPreset('mes_actual', new Date()), [])
  const [desde, setDesde] = useState(mesActual.desde)
  const [hasta, setHasta] = useState(mesActual.hasta)
  const [local, setLocal] = useState('')
  const [data, setData] = useState<LocalData[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const consulta = useRef(0)

  // Se consulta solo al cambiar el período: no hay botón que apretar.
  useEffect(() => {
    const n = ++consulta.current
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true)
    setError(null)
    fetch(`/api/resumen?${params}`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json?.error ?? 'No se pudo cargar el resumen.')
        if (n === consulta.current) setData(json as LocalData[])
      })
      .catch((e: unknown) => { if (n === consulta.current) setError(mensajeError(e, 'No se pudo cargar el resumen.')) })
      .finally(() => { if (n === consulta.current) setCargando(false) })
  }, [desde, hasta, intento])

  const filtrada = (data ?? []).filter(d => !local || d.local === local)
  const totalGastos = filtrada.reduce((s, d) => s + d.totalGastos, 0)
  const totalMonto = filtrada.reduce((s, d) => s + d.totalMontoVendido, 0)
  const totalUnidades = filtrada.reduce((s, d) => s + d.totalVendido, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        icono={BarChart3}
        titulo="Resumen por local"
        descripcion="Cuánto se gastó y cuánto se vendió en cada local en el período."
      />

      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          desde={desde}
          hasta={hasta}
          limpiable={false}
          onChange={(d, h) => { setDesde(d); setHasta(h) }}
          ariaLabel="Período del resumen"
        />
        <select
          aria-label="Filtrar por local"
          value={local}
          onChange={e => setLocal(e.target.value)}
          disabled={!data?.length}
          className={`${controlClass} min-h-11 w-full sm:w-52`}
        >
          <option value="">Todos los locales</option>
          {(data ?? []).map(d => <option key={d.local} value={d.local}>{d.local}</option>)}
        </select>
      </div>

      {error ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
          <button type="button" onClick={() => setIntento(i => i + 1)} className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface2">
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : cargando && !data ? (
        <div className="space-y-4" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-18.5 w-full rounded-2xl" />)}
          </div>
          {[0, 1].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${cargando ? 'opacity-60' : ''}`} aria-busy={cargando}>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard icon={<Wallet size={18} />} label="Gastos del período" value={formatearMoneda(totalGastos)} />
            <KpiCard icon={<ShoppingBag size={18} />} label="Vendido" value={formatearMoneda(totalMonto)} detalle="según Posberry" />
            <KpiCard icon={<Package size={18} />} label="Unidades vendidas" value={unidades(totalUnidades)} />
          </div>

          {filtrada.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <EmptyState
                icono={BarChart3}
                titulo="No hay gastos ni ventas en el período"
                descripcion="Probá con otro período. Los gastos salen de Gastos y las ventas, de Posberry."
              />
            </div>
          ) : (
            filtrada.map(d => <TarjetaLocal key={d.local} d={d} />)
          )}
        </div>
      )}
    </div>
  )
}
