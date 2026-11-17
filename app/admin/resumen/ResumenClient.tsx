'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BarChart3, ChevronDown, Receipt, RefreshCw, ShoppingBag, Store, Wallet } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { Skeleton } from '@/components/ui/Skeleton'
import { Puntos } from '@/components/ui/Cargando'
import { controlClass } from '@/components/ui/Field'
import { formatearMoneda } from '@/lib/formato'
import { calcularRangoPreset } from '@/lib/compras/rangoFechas'
import { mensajeError } from '@/lib/errores'
import { ESPERA_REINTENTO_MS, MAX_DIAS, PEDIR_ESPERA, validarPeriodo, type ResumenVentasLocal } from '@/lib/fudoVentas'

interface CatRow { categoria: string; total: number }
interface LocalData {
  local: string
  tieneFudo: boolean
  gastos: CatRow[]
  totalGastos: number
}

/** Las ventas de un local, que se piden a Fudo de a una. */
type Ventas =
  | { estado: 'sin_fudo' }
  | { estado: 'espera' }
  | { estado: 'listo'; r: ResumenVentasLocal }
  | { estado: 'error'; error: string }

const EN_PARALELO = 3
const num = (n: number) => n.toLocaleString('es-AR')

function Vendido({ v }: { v: Ventas | undefined }) {
  if (!v || v.estado === 'espera') return <Puntos />
  if (v.estado === 'listo') return <>{formatearMoneda(v.r.total)}</>
  return <>—</>
}

function TarjetaLocal({ d, ventas: v }: { d: LocalData; ventas: Ventas | undefined }) {
  const [abierta, setAbierta] = useState(true)
  const mayorGasto = d.gastos[0]?.total ?? 0
  const medios = v?.estado === 'listo' ? Object.entries(v.r.porMedio).sort((a, b) => b[1] - a[1]) : []
  const mayorMedio = medios[0]?.[1] ?? 0

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
            <span className="block text-sm font-semibold tabular-nums text-text"><Vendido v={v} /></span>
          </span>
          <span className="hidden sm:block">
            <span className="block text-2xs uppercase tracking-wider text-muted">Ventas</span>
            <span className="block text-sm font-semibold tabular-nums text-text">{v?.estado === 'listo' ? num(v.r.ventas) : '—'}</span>
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
              <ShoppingBag size={15} className="text-accent" /> Ventas
              <span className="font-normal text-muted">(Fudo)</span>
            </h3>
            {!v || v.estado === 'espera' ? (
              <p className="flex items-center gap-2 text-sm text-muted"><Puntos /> Trayendo de Fudo</p>
            ) : v.estado === 'sin_fudo' ? (
              <p className="text-sm text-muted">Este local no usa Fudo: sus ventas no están acá.</p>
            ) : v.estado === 'error' ? (
              <p className="text-sm text-warning">{v.error}</p>
            ) : v.r.ventas === 0 ? (
              <p className="text-sm text-muted">No hay ventas en Fudo para este local en el período.</p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  <span className="font-semibold tabular-nums text-text">{num(v.r.ventas)}</span> ventas · ticket promedio{' '}
                  <span className="font-semibold tabular-nums text-text">{formatearMoneda(v.r.ticket)}</span>
                </p>
                <ul className="space-y-2.5" aria-label="Cobrado por medio de pago">
                  {medios.map(([medio, monto]) => (
                    <li key={medio} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-text">{medio}</span>
                        <span className="whitespace-nowrap font-semibold tabular-nums text-text">{formatearMoneda(monto)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface2" aria-hidden>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${mayorMedio > 0 ? (monto / mayorMedio) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
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
  const [ventas, setVentas] = useState<Record<string, Ventas>>({})
  const consulta = useRef(0)
  const problemaVentas = validarPeriodo(desde, hasta)

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

  // Las ventas, de Fudo: de a pocos locales a la vez, después de los gastos.
  useEffect(() => {
    if (!data || problemaVentas) return
    const n = consulta.current
    const conFudo = data.filter(d => d.tieneFudo).map(d => d.local)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVentas(Object.fromEntries(data.map(d => [d.local, d.tieneFudo ? { estado: 'espera' } : { estado: 'sin_fudo' }])))
    const cola = [...conFudo]
    const poner = (l: string, v: Ventas) => { if (n === consulta.current) setVentas(prev => ({ ...prev, [l]: v })) }
    const trabajador = async () => {
      for (let l = cola.shift(); l; l = cola.shift()) {
        if (n !== consulta.current) return
        for (let intento = 1; intento <= 2; intento++) {
          try {
            const qs = new URLSearchParams({ local: l, desde, hasta, tipo: 'ventas', solo: 'totales' })
            const r = await fetch(`/api/fudo/ventas?${qs}`)
            const j = await r.json().catch(() => ({ error: 'Fudo no respondió.' }))
            // Si Fudo pide esperar, se reintenta una vez.
            if (!r.ok && j.error === PEDIR_ESPERA && intento === 1) {
              await new Promise(res => setTimeout(res, ESPERA_REINTENTO_MS))
              continue
            }
            poner(l, r.ok ? { estado: 'listo', r: j.resumen } : { estado: 'error', error: j.error ?? 'Fudo no respondió.' })
          } catch {
            poner(l, { estado: 'error', error: 'Se cortó la conexión con Fudo.' })
          }
          break
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(EN_PARALELO, conFudo.length) }, trabajador))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const filtrada = (data ?? []).filter(d => !local || d.local === local)
  const totalGastos = filtrada.reduce((s, d) => s + d.totalGastos, 0)
  const ventasFiltradas = filtrada.map(d => ventas[d.local])
  const totalMonto = ventasFiltradas.reduce((s, v) => s + (v?.estado === 'listo' ? v.r.total : 0), 0)
  const totalVentas = ventasFiltradas.reduce((s, v) => s + (v?.estado === 'listo' ? v.r.ventas : 0), 0)
  const trayendoVentas = !problemaVentas && ventasFiltradas.some(v => !v || v.estado === 'espera')

  return (
    <div className="space-y-6">
      <PageHeader
        icono={BarChart3}
        titulo="Resumen por local"
        descripcion="Cuánto se gastó y cuánto se vendió en cada local en el período. Las ventas salen de Fudo."
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
            <KpiCard icon={<ShoppingBag size={18} />} label="Vendido" value={problemaVentas ? '—' : formatearMoneda(totalMonto)}
              detalle={problemaVentas ? `hasta ${MAX_DIAS} días` : trayendoVentas ? 'trayendo de Fudo…' : 'según Fudo'} />
            <KpiCard icon={<Receipt size={18} />} label="Ventas" value={problemaVentas ? '—' : num(totalVentas)} detalle={trayendoVentas ? 'hasta ahora' : undefined} />
          </div>

          {problemaVentas && (
            <p className="text-sm text-muted">
              Las ventas se traen de Fudo para períodos de hasta {MAX_DIAS} días. Elegí uno más corto para verlas, o usá{' '}
              <Link href="/admin/integraciones/ventas" className="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4">Ventas Fudo</Link>.
            </p>
          )}

          {filtrada.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <EmptyState
                icono={BarChart3}
                titulo="No hay gastos ni ventas en el período"
                descripcion="Probá con otro período. Los gastos salen de Gastos y las ventas, de Fudo."
              />
            </div>
          ) : (
            filtrada.map(d => <TarjetaLocal key={d.local} d={d} ventas={problemaVentas ? { estado: 'error', error: `Elegí un período de hasta ${MAX_DIAS} días para ver las ventas.` } : ventas[d.local]} />)
          )}
        </div>
      )}
    </div>
  )
}
