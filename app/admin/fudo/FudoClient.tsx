'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, Hash, Landmark, Loader2, RefreshCw, Search, Sigma } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import DateRangePicker from '@/components/ui/DateRangePicker'
import EstadoBadge from '@/components/ui/EstadoBadge'
import { SegmentedControl } from '@/components/ui/Chip'
import { SkeletonTabla } from '@/components/ui/Skeleton'
import { Field, controlClass } from '@/components/ui/Field'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { mensajeError } from '@/lib/errores'
import { ESTADOS } from '@/lib/estados'

type Tipo = 'expenses' | 'sales' | 'payments'
type Item = Record<string, unknown>
interface Fila { i: number; item: Item }

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'expenses', label: 'Gastos' },
  { value: 'sales', label: 'Ventas' },
  { value: 'payments', label: 'Movimientos de caja' },
]

const ETIQUETA_TIPO: Record<Tipo, string> = { expenses: 'gastos', sales: 'ventas', payments: 'movimientos de caja' }

function texto(v: unknown): string {
  return v == null || v === '' ? '—' : String(v)
}

function numero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function nombreDe(v: unknown): string {
  return v && typeof v === 'object' ? texto((v as Item).name) : '—'
}

function fechaHora(v: unknown): string {
  if (!v) return '—'
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? String(v) : formatearFechaHora(d.toISOString())
}

/** Lo que se pagó: la descripción, o el proveedor o la categoría si Fudo no la tiene. */
function tituloGasto(item: Item): string {
  const d = texto(item.description)
  if (d !== '—') return d
  const p = nombreDe(item.provider)
  return p !== '—' ? p : nombreDe(item.expenseCategory)
}

/** Proveedor y categoría, sin repetir lo que ya dice el título. */
function secundarioGasto(item: Item): string {
  const titulo = tituloGasto(item)
  return [nombreDe(item.provider), nombreDe(item.expenseCategory)].filter(v => v !== '—' && v !== titulo).join(' · ')
}

const TIPO_VENTA: Record<string, string> = {
  TAKEAWAY: 'Para llevar',
  DELIVERY: 'Delivery',
  'EAT-IN': 'En el local',
  TABLE: 'Mesa',
  COUNTER: 'Mostrador',
}

function medioDePago(item: Item): string {
  const pagos = item.payments
  if (Array.isArray(pagos) && pagos.length > 0) return nombreDe((pagos[0] as Item)?.paymentMethod)
  return nombreDe(item.paymentMethod)
}

function montoDe(item: Item, tipo: Tipo): number {
  if (tipo === 'sales') return numero(item.total)
  if (tipo === 'expenses') return numero(item.amount)
  return numero(item.amount)
}

type EstadoFudoValor = keyof typeof ESTADOS.fudo

function esEstadoFudo(v: string): v is EstadoFudoValor {
  return v in ESTADOS.fudo
}

/** El estado que manda Fudo, con los colores del registro único; uno que no conocemos se muestra tal cual. */
function EstadoFudo({ item, tipo }: { item: Item; tipo: Tipo }) {
  const valor = item.canceled ? 'cancelado' : tipo === 'expenses' ? String(item.status ?? '') : tipo === 'sales' ? String(item.saleState ?? '') : 'ok'
  if (esEstadoFudo(valor)) return <EstadoBadge dominio="fudo" estado={valor} />
  return <span className="inline-flex rounded-full bg-surface2 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">{texto(valor)}</span>
}

function columnasDe(tipo: Tipo): Columna<Fila>[] {
  const tachado = (f: Fila) => (f.item.canceled ? 'text-muted line-through' : 'text-text')
  const monto: Columna<Fila> = {
    key: 'monto',
    header: tipo === 'sales' ? 'Total' : 'Monto',
    alinear: 'right',
    render: f => <span className={`whitespace-nowrap font-semibold tabular-nums ${tachado(f)}`}>{formatearMonedaExacta(montoDe(f.item, tipo))}</span>,
    ordenar: f => montoDe(f.item, tipo),
  }
  const estado: Columna<Fila> = { key: 'estado', header: 'Estado', render: f => <EstadoFudo item={f.item} tipo={tipo} /> }
  const medio: Columna<Fila> = { key: 'medio', header: 'Forma de pago', render: f => <span className="text-muted">{medioDePago(f.item)}</span>, ocultarHasta: 'lg' }

  if (tipo === 'expenses') {
    return [
      {
        key: 'fecha',
        header: 'Fecha',
        render: f => {
          const d = String(f.item.date ?? '').slice(0, 10)
          return <span className="whitespace-nowrap tabular-nums">{d ? formatearFecha(d) : '—'}</span>
        },
        ordenar: f => String(f.item.date ?? ''),
      },
      {
        key: 'gasto',
        header: 'Gasto',
        render: f => (
          <span className="block min-w-0">
            <span className={`block font-medium ${tachado(f)}`}>{tituloGasto(f.item)}</span>
            {secundarioGasto(f.item) && <span className="block text-xs text-muted">{secundarioGasto(f.item)}</span>}
          </span>
        ),
      },
      monto, medio, estado,
    ]
  }
  if (tipo === 'sales') {
    return [
      { key: 'fecha', header: 'Fecha', render: f => <span className="whitespace-nowrap tabular-nums">{fechaHora(f.item.createdAt)}</span>, ordenar: f => String(f.item.createdAt ?? '') },
      { key: 'caja', header: 'Caja', render: f => <span>{nombreDe(f.item.cashRegister)}</span>, ocultarHasta: 'sm' },
      { key: 'tipo', header: 'Tipo', render: f => <span className="text-muted">{TIPO_VENTA[String(f.item.saleType ?? '')] ?? texto(f.item.saleType)}</span>, ocultarHasta: 'md' },
      monto, medio, estado,
    ]
  }
  return [
    { key: 'fecha', header: 'Fecha', render: f => <span className="whitespace-nowrap tabular-nums">{fechaHora(f.item.paidAt)}</span>, ordenar: f => String(f.item.paidAt ?? '') },
    { key: 'medio', header: 'Forma de pago', render: f => <span>{nombreDe(f.item.paymentMethod)}</span> },
    monto, estado,
  ]
}

interface Consulta { sucursal: string; tipo: Tipo; desde: string; hasta: string }

export default function FudoClient() {
  const [sucursales, setSucursales] = useState<string[] | null>(null)
  const [sucursal, setSucursal] = useState('')
  const [tipo, setTipo] = useState<Tipo>('expenses')
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -7))
  const [hasta, setHasta] = useState(hoyISO())
  const [items, setItems] = useState<Item[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultima, setUltima] = useState<Consulta | null>(null)

  useEffect(() => {
    fetch('/api/locales')
      .then(r => r.json())
      .then((data: Array<{ sucursal: string; activo: boolean }>) => {
        const activas = Array.isArray(data) ? data.filter(l => l.activo).map(l => l.sucursal) : []
        setSucursales(activas)
        if (activas.length > 0) setSucursal(s => s || activas[0])
      })
      .catch(() => setSucursales([]))
  }, [])

  async function consultar() {
    if (!sucursal) return
    const c: Consulta = { sucursal, tipo, desde, hasta }
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ ...c })
      const res = await fetch(`/api/fudo?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Fudo respondió con un error (${res.status}).`)
      setItems(Array.isArray(json.items) ? json.items : [])
      setUltima(c)
    } catch (e) {
      setError(mensajeError(e, 'No se pudieron traer los datos de Fudo.'))
    } finally {
      setCargando(false)
    }
  }

  const tipoMostrado = ultima?.tipo ?? tipo
  const filas: Fila[] = items.map((item, i) => ({ i, item }))
  const vigentes = items.filter(i => !i.canceled)
  const total = vigentes.reduce((s, i) => s + montoDe(i, tipoMostrado), 0)
  const cancelados = items.length - vigentes.length
  const desactualizada = ultima != null && (ultima.sucursal !== sucursal || ultima.tipo !== tipo || ultima.desde !== desde || ultima.hasta !== hasta)

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Landmark}
        titulo="Fudo / Caja"
        descripcion="Consultá en Fudo los gastos, las ventas y los movimientos de caja de cada sucursal."
      />

      <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        <SegmentedControl opciones={TIPOS} value={tipo} onChange={setTipo} />
        <div className="grid gap-3 sm:grid-cols-[14rem_auto_auto] sm:items-end sm:justify-start">
          <Field label="Sucursal">
            {sucursales == null ? (
              <p className="flex min-h-11 items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Cargando sucursales…</p>
            ) : sucursales.length === 0 ? (
              <p className="flex min-h-11 items-center text-sm text-muted">No hay sucursales conectadas a Fudo.</p>
            ) : (
              <select aria-label="Sucursal de Fudo" value={sucursal} onChange={e => setSucursal(e.target.value)} className={`${controlClass} min-h-11`}>
                {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field label="Período">
            <DateRangePicker desde={desde} hasta={hasta} limpiable={false} max={hoyISO()} onChange={(d, h) => { setDesde(d); setHasta(h) }} ariaLabel="Período de la consulta" />
          </Field>
          <button
            type="button"
            onClick={consultar}
            disabled={cargando || !sucursal}
            className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {cargando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Consultar
          </button>
        </div>
        {desactualizada && !cargando && (
          <p className="text-xs text-warning">Cambiaste la consulta: los resultados de abajo son de la anterior. Tocá Consultar para actualizarlos.</p>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
          <button type="button" onClick={consultar} className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface2">
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      )}

      {cargando && !ultima ? (
        <div aria-live="polite" className="space-y-2">
          <p className="text-sm text-muted">Consultando Fudo…</p>
          <SkeletonTabla filas={6} columnas={5} />
        </div>
      ) : !ultima ? (
        !error && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <EmptyState
              icono={Landmark}
              titulo="Elegí qué querés ver"
              descripcion="Elegí la sucursal, el tipo y el período, y tocá Consultar. Los datos vienen de Fudo en el momento."
            />
          </div>
        )
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${cargando ? 'opacity-60' : ''}`} aria-busy={cargando}>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard icon={<Hash size={18} />} label="Registros" value={String(items.length)} detalle={`${ETIQUETA_TIPO[ultima.tipo]} · ${ultima.sucursal}`} />
            <KpiCard icon={<Sigma size={18} />} label="Total" value={formatearMonedaExacta(total)} detalle={cancelados ? 'sin contar los cancelados' : undefined} />
            <KpiCard icon={<Ban size={18} />} label="Cancelados" value={String(cancelados)} tono={cancelados ? 'alerta' : 'neutro'} />
          </div>
          {items.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <EmptyState
                icono={Landmark}
                titulo={`No hay ${ETIQUETA_TIPO[ultima.tipo]} en el período`}
                descripcion={`Fudo no devolvió nada para ${ultima.sucursal} entre el ${formatearFecha(ultima.desde)} y el ${formatearFecha(ultima.hasta)}.`}
              />
            </div>
          ) : (
            <DataTable filas={filas} columnas={columnasDe(ultima.tipo)} filaKey={f => String(f.item.id ?? f.i)} />
          )}
        </div>
      )}
    </div>
  )
}
