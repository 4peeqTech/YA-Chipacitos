'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconCash, IconDownload, IconReceipt, IconSearch, IconShoppingBag, IconTicket } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import KpiCard from '@/components/ui/KpiCard'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { SegmentedControl } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { Field, controlClass } from '@/components/ui/Field'
import { formatearMoneda } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import {
  ESPERA_REINTENTO_MS, MAX_DIAS, PEDIR_ESPERA, csvCaja, csvVentas, mediosOrdenados, nombreCsv, resumirCaja, resumirVentas, validarPeriodo,
  type MovimientoFudo, type VentaFudo,
} from '@/lib/fudoVentas'

type Pestana = 'ventas' | 'caja'

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'caja', label: 'Caja (cobros y pagos)' },
]

/** Cuántos locales se piden a la vez: más satura a Fudo, menos tarda de más. */
const EN_PARALELO = 3
/** Medios de pago con columna propia; el resto va en "Otros". */
const MEDIOS_VISIBLES = 4

type EstadoLocal =
  | { estado: 'espera' }
  | { estado: 'trayendo'; nota?: string }
  | { estado: 'listo'; ventas?: VentaFudo[]; movimientos?: MovimientoFudo[]; completo: boolean }
  | { estado: 'error'; error: string }

interface Consulta {
  pestana: Pestana
  desde: string
  hasta: string
  locales: string[]
  por: Record<string, EstadoLocal>
}

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'
const num = (n: number) => n.toLocaleString('es-AR')

function primeroDelMes(hoy: string): string {
  return `${hoy.slice(0, 8)}01`
}

function descargar(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Celda({ e }: { e: EstadoLocal }) {
  if (e.estado === 'espera') return <span className="text-muted">En espera</span>
  if (e.estado === 'trayendo') return <span className="inline-flex items-center gap-2 text-muted"><Puntos /> {e.nota ?? 'Trayendo de Fudo'}</span>
  if (e.estado === 'error') {
    return (
      <span className="text-warning">
        {e.error}{/claves/.test(e.error) && <> <Link href="/admin/integraciones/fudo" className="font-semibold underline underline-offset-4">Conexión Fudo</Link></>}
      </span>
    )
  }
  return null
}

const th = 'whitespace-nowrap px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted'
const td = 'whitespace-nowrap px-3 py-2.5 tabular-nums'

export default function VentasFudoClient({ locales, error }: { locales: string[]; error: boolean }) {
  const hoy = hoyISO()
  const [pestana, setPestana] = useState<Pestana>('ventas')
  const [desde, setDesde] = useState(primeroDelMes(hoy))
  const [hasta, setHasta] = useState(hoy)
  const [local, setLocal] = useState('')
  const [consultas, setConsultas] = useState<Partial<Record<Pestana, Consulta>>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const corrida = useRef(0)

  const consulta = consultas[pestana]
  const trayendo = consulta ? Object.values(consulta.por).some(e => e.estado === 'espera' || e.estado === 'trayendo') : false
  const filtrosCambiaron = consulta != null && (consulta.desde !== desde || consulta.hasta !== hasta || consulta.locales.join() !== (local ? [local] : locales).join())

  function actualizar(p: Pestana, l: string, e: EstadoLocal, id: number) {
    if (corrida.current !== id) return
    setConsultas(c => {
      const actual = c[p]
      if (!actual) return c
      return { ...c, [p]: { ...actual, por: { ...actual.por, [l]: e } } }
    })
  }

  async function consultar() {
    const problema = validarPeriodo(desde, hasta)
    if (problema) { setAviso(problema); return }
    setAviso(null)
    const elegidos = local ? [local] : locales
    const p = pestana
    const id = ++corrida.current
    setConsultas(c => ({ ...c, [p]: { pestana: p, desde, hasta, locales: elegidos, por: Object.fromEntries(elegidos.map(l => [l, { estado: 'espera' }])) } }))

    const cola = [...elegidos]
    const trabajador = async () => {
      for (let l = cola.shift(); l; l = cola.shift()) {
        actualizar(p, l, { estado: 'trayendo' }, id)
        // Si Fudo pide esperar (pasa cuando se consulta mucho seguido), se reintenta una vez.
        for (let intento = 1; intento <= 2; intento++) {
          try {
            const qs = new URLSearchParams({ local: l, desde, hasta, tipo: p })
            const res = await fetch(`/api/fudo/ventas?${qs}`)
            const j = await res.json().catch(() => ({ error: 'Fudo no respondió.' }))
            if (res.ok) {
              actualizar(p, l, { estado: 'listo', ventas: j.ventas, movimientos: j.movimientos, completo: j.completo !== false }, id)
              break
            }
            if (j.error === PEDIR_ESPERA && intento === 1) {
              actualizar(p, l, { estado: 'trayendo', nota: 'Fudo pidió esperar: reintento en unos segundos' }, id)
              await new Promise(r => setTimeout(r, ESPERA_REINTENTO_MS))
              continue
            }
            actualizar(p, l, { estado: 'error', error: j.error ?? 'Fudo no respondió.' }, id)
            break
          } catch {
            actualizar(p, l, { estado: 'error', error: 'Se cortó la conexión. Probá de nuevo.' }, id)
            break
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(EN_PARALELO, elegidos.length) }, trabajador))
  }

  const listos = useMemo(() => {
    if (!consulta) return []
    return consulta.locales.flatMap(l => {
      const e = consulta.por[l]
      return e?.estado === 'listo' ? [{ local: l, ...e }] : []
    })
  }, [consulta])

  const resumenVentas = useMemo(() => listos.map(l => resumirVentas(l.local, l.ventas ?? [])), [listos])
  const resumenCaja = useMemo(() => listos.map(l => resumirCaja(l.local, l.movimientos ?? [])), [listos])
  const terminados = consulta ? Object.values(consulta.por).filter(e => e.estado === 'listo' || e.estado === 'error').length : 0
  const total = consulta?.locales.length ?? 0
  const ahora = consulta ? consulta.locales.filter(l => consulta.por[l]?.estado === 'trayendo') : []
  const incompletos = listos.filter(l => !l.completo).map(l => l.local)

  const totVentas = resumenVentas.reduce((s, r) => s + r.ventas, 0)
  const totMonto = resumenVentas.reduce((s, r) => s + r.total, 0)
  const medios = mediosOrdenados(consulta?.pestana === 'caja'
    ? resumenCaja.map(r => Object.fromEntries(Object.entries(r.porMedio).map(([m, v]) => [m, v.cobros + v.pagos])))
    : resumenVentas.map(r => r.porMedio))
  const visibles = medios.slice(0, MEDIOS_VISIBLES)
  const otros = medios.slice(MEDIOS_VISIBLES)
  const cobros = resumenCaja.reduce((s, r) => s + r.cobros, 0)
  const pagos = resumenCaja.reduce((s, r) => s + r.pagos, 0)
  const hayDatos = consulta?.pestana === 'caja' ? listos.some(l => (l.movimientos ?? []).length > 0) : totVentas > 0

  function bajarCsv() {
    if (!consulta) return
    const unLocal = consulta.locales.length === 1 ? consulta.locales[0] : undefined
    const nombre = nombreCsv(consulta.pestana, consulta.desde, consulta.hasta, unLocal)
    descargar(consulta.pestana === 'caja'
      ? csvCaja(listos.flatMap(l => l.movimientos ?? []))
      : csvVentas(listos.flatMap(l => l.ventas ?? [])), nombre)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconReceipt}
        titulo="Ventas Fudo"
        descripcion={`Las ventas y la caja de cada local en el período, sacadas de Fudo. Hasta ${MAX_DIAS} días por consulta.`}
        acciones={
          <>
            <AyudaLink seccion="admin" ancla="ventas-fudo" />
            <button type="button" onClick={bajarCsv} disabled={!consulta || trayendo || !hayDatos} className={botonPrimario}>
              <IconDownload size={16} aria-hidden /> Descargar CSV
            </button>
          </>
        }
      />

      <SegmentedControl opciones={PESTANAS} value={pestana} onChange={setPestana} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Período">
          <DateRangePicker desde={desde} hasta={hasta} max={hoy} limpiable={false}
            onChange={(d, h) => { setDesde(d); setHasta(h) }} ariaLabel="Período de las ventas" className={`${controlClass} min-h-11`} />
        </Field>
        <Field label="Locales">
          <select aria-label="Locales" value={local} onChange={e => setLocal(e.target.value)} className={`${controlClass} min-h-11 w-full sm:w-56`}>
            <option value="">Todos ({locales.length})</option>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <button type="button" onClick={consultar} disabled={trayendo || locales.length === 0} className={botonSecundario}>
          {trayendo ? <><Puntos /> Consultando</> : <><IconSearch size={16} aria-hidden /> Consultar</>}
        </button>
      </div>

      {(aviso || error) && (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {aviso ?? 'No pudimos traer los locales. Recargá la página.'}
        </p>
      )}

      {!consulta ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted">
          Elegí el período y tocá <b className="text-text">Consultar</b>.{' '}
          {pestana === 'ventas'
            ? 'Trae las ventas cerradas de cada local, con lo cobrado por medio de pago.'
            : 'Trae lo que entró (cobros de ventas) y lo que salió (pagos de gastos) por cada medio de pago.'}
        </p>
      ) : (
        <div className="space-y-4">
          {trayendo && (
            <div className="space-y-2 rounded-2xl bg-info-bg px-4 py-3 text-sm text-text" aria-live="polite">
              <p className="flex flex-wrap items-center gap-2">
                <Puntos /> Trayendo de Fudo: {terminados} de {total} {total === 1 ? 'local' : 'locales'}.
                {ahora.length > 0 && <span className="text-muted">Ahora: {ahora.join(', ')}</span>}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? Math.max(4, (terminados / total) * 100) : 0}%` }} />
              </div>
            </div>
          )}
          {filtrosCambiaron && !trayendo && (
            <p className="text-sm text-muted">Cambiaste el período o los locales: tocá <b className="text-text">Consultar</b> para traerlos.</p>
          )}
          {incompletos.length > 0 && (
            <p className="text-sm text-warning">Fudo devolvió demasiados registros para {incompletos.join(', ')}: los totales pueden estar incompletos. Consultá un período más corto.</p>
          )}

          {consulta.pestana === 'ventas' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard icon={<IconShoppingBag size={18} aria-hidden />} label="Ventas" value={num(totVentas)} detalle={trayendo ? 'hasta ahora' : 'cerradas en el período'} />
                <KpiCard icon={<IconCash size={18} aria-hidden />} label="Total vendido" value={formatearMoneda(totMonto)} detalle={trayendo ? 'hasta ahora' : undefined} />
                <KpiCard icon={<IconTicket size={18} aria-hidden />} label="Ticket promedio" value={totVentas ? formatearMoneda(totMonto / totVentas) : '—'} />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface2/60">
                    <tr>
                      <th className={th}>Local</th><th className={`${th} text-right`}>Ventas</th><th className={`${th} text-right`}>Total</th>
                      <th className={`${th} text-right`}>Ticket prom.</th>
                      {visibles.map(m => <th key={m} className={`${th} text-right`}>{m}</th>)}
                      {otros.length > 0 && <th className={`${th} text-right`} title={otros.join(', ')}>Otros</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {consulta.locales.map(l => {
                      const e = consulta.por[l]
                      const r = resumenVentas.find(x => x.local === l)
                      return (
                        <tr key={l}>
                          <td className={`${td} font-medium text-text`}>{l}</td>
                          {e?.estado === 'listo' && r ? (
                            <>
                              <td className={`${td} text-right`}>{num(r.ventas)}</td>
                              <td className={`${td} text-right font-semibold text-text`}>{formatearMoneda(r.total)}</td>
                              <td className={`${td} text-right text-muted`}>{r.ventas ? formatearMoneda(r.ticket) : '—'}</td>
                              {visibles.map(m => <td key={m} className={`${td} text-right text-muted`}>{r.porMedio[m] ? formatearMoneda(r.porMedio[m]) : '—'}</td>)}
                              {otros.length > 0 && <td className={`${td} text-right text-muted`}>{formatearMoneda(otros.reduce((s, m) => s + (r.porMedio[m] ?? 0), 0))}</td>}
                            </>
                          ) : (
                            <td className={td} colSpan={3 + visibles.length + (otros.length ? 1 : 0)}><Celda e={e ?? { estado: 'espera' }} /></td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard icon={<IconCash size={18} aria-hidden />} label="Entró (cobros de ventas)" value={formatearMoneda(cobros)} detalle={trayendo ? 'hasta ahora' : undefined} />
                <KpiCard icon={<IconReceipt size={18} aria-hidden />} label="Salió (pagos de gastos)" value={formatearMoneda(pagos)} detalle={trayendo ? 'hasta ahora' : undefined} />
                <KpiCard icon={<IconTicket size={18} aria-hidden />} label="Diferencia" value={formatearMoneda(cobros - pagos)} />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface2/60">
                    <tr>
                      <th className={th}>Local</th><th className={`${th} text-right`}>Entró</th><th className={`${th} text-right`}>Salió</th>
                      <th className={`${th} text-right`}>Diferencia</th>
                      {visibles.map(m => <th key={m} className={`${th} text-right`}>{m}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {consulta.locales.map(l => {
                      const e = consulta.por[l]
                      const r = resumenCaja.find(x => x.local === l)
                      return (
                        <tr key={l}>
                          <td className={`${td} font-medium text-text`}>{l}</td>
                          {e?.estado === 'listo' && r ? (
                            <>
                              <td className={`${td} text-right font-semibold text-text`}>{formatearMoneda(r.cobros)}</td>
                              <td className={`${td} text-right`}>{formatearMoneda(r.pagos)}</td>
                              <td className={`${td} text-right text-muted`}>{formatearMoneda(r.cobros - r.pagos)}</td>
                              {visibles.map(m => {
                                const v = r.porMedio[m]
                                return (
                                  <td key={m} className={`${td} text-right text-muted`}>
                                    {v ? <>{formatearMoneda(v.cobros)}{v.pagos ? <span className="block text-2xs">− {formatearMoneda(v.pagos)}</span> : null}</> : '—'}
                                  </td>
                                )
                              })}
                            </>
                          ) : (
                            <td className={td} colSpan={3 + visibles.length}><Celda e={e ?? { estado: 'espera' }} /></td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Por medio de pago, arriba lo que entró y abajo (con −) lo que salió. El CSV trae cada movimiento.</p>
            </>
          )}
          <p className="text-xs text-muted">
            {consulta.pestana === 'ventas'
              ? 'El CSV tiene una fila por venta: local, fecha y hora (de Argentina), caja, tipo, total y lo cobrado con cada medio de pago.'
              : 'El CSV tiene una fila por movimiento: local, fecha y hora, si es un cobro de venta o un pago de gasto, medio de pago y monto.'}
          </p>
        </div>
      )}
    </div>
  )
}
