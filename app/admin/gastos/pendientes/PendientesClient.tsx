'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconBuildingStore, IconCircleCheck, IconClock, IconRefresh, IconWallet,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import DateRangePicker from '@/components/ui/DateRangePicker'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { SegmentedControl } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { controlClass } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { usePuedeEntrar } from '@/components/ui/AccesoModulos'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import {
  armarGastos, atraso, paramsDePendientes, pendienteDeGasto,
  type FiltrosPendientes, type GastoFila, type PendienteVista,
} from '@/lib/gastos/modelo'
import { masPendientes, registrarPagoGasto } from '../acciones'
import PagoModal, { type DatosPago } from '../PagoModal'
import { useActualizarFudo } from '../useActualizarFudo'
import type { EstadoFudo } from '../GastosClient'
import { rutaDe } from '@/lib/compras/rutas'

interface GrupoServidor {
  local: string
  cantidad: number
  total: number
  vencidos: number
  filas: GastoFila[]
}

// Secundario: con decenas de filas, un botón amarillo por fila tapaba todo lo demás.
const botonPago = 'presionable min-h-11 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:border-accent hover:bg-surface2 disabled:opacity-50'
const botonMas = 'flex min-h-11 w-full items-center justify-center gap-2 border-t border-border text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-60'

const TANDA_MAS = 60

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Un gasto pendiente: qué es, de cuándo, si está atrasado, cuánto falta y el botón de pagar. */
function FilaPendiente({ p, hoy, pendiente, onPagar }: { p: PendienteVista; hoy: string; pendiente: boolean; onPagar: (p: PendienteVista) => void }) {
  // Gastos es otro módulo: sin él, el título queda como texto.
  const puedeEntrar = usePuedeEntrar()
  const atrasado = atraso(p, hoy)
  const g = p.gasto
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text">
          {puedeEntrar(rutaDe({ tipo: 'gasto', id: p.id })) ? (
            <Link href={rutaDe({ tipo: 'gasto', id: p.id })} className="-my-3 inline-block py-3 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4">
              {p.titulo}
            </Link>
          ) : p.titulo}
          {g?.fudo && <span className="ml-2 rounded-md border border-border px-1.5 align-middle text-2xs font-semibold text-muted">Fudo</span>}
        </p>
        <p className="text-xs text-muted">
          <span className="tabular-nums">{p.fecha ? formatearFecha(p.fecha) : 'Sin fecha'}</span>
          {atrasado && <span className="font-semibold text-warning"> · {atrasado}</span>}
          {p.detalle && <> · {p.detalle}</>}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className="whitespace-nowrap text-base font-semibold tabular-nums text-text">{formatearMonedaExacta(p.monto)}</p>
        {g && g.pagado > 0 && <p className="whitespace-nowrap text-2xs text-muted">falta, de <span className="tabular-nums">{formatearMonedaExacta(g.monto)}</span></p>}
        {g?.recurrente?.aConfirmar && <p className="whitespace-nowrap text-2xs font-semibold text-warning">monto a confirmar</p>}
      </div>
      <button type="button" onClick={() => onPagar(p)} disabled={pendiente} className={`${botonPago} w-full sm:w-auto`}>
        <IconWallet size={15} aria-hidden /> Registrar pago
      </button>
    </li>
  )
}

/** Un local: la primera tanda viene del servidor y "Ver más" pide la siguiente. */
function GrupoLocal({ grupo, filtros, hoy, pendiente, onPagar }: {
  grupo: GrupoServidor
  filtros: FiltrosPendientes
  hoy: string
  pendiente: boolean
  onPagar: (p: PendienteVista) => void
}) {
  const toast = useToast()
  const [extra, setExtra] = useState<GastoFila[]>([])
  const [cargando, setCargando] = useState(false)
  // Uno por uno: armarGastos ordena por fecha y acá manda el orden de la base.
  const items = useMemo(
    () => [...grupo.filas, ...extra].flatMap(f => armarGastos([f])).map(pendienteDeGasto),
    [grupo.filas, extra],
  )
  const resto = grupo.cantidad - items.length

  async function verMas() {
    setCargando(true)
    const r = await masPendientes({ ...filtros, local: grupo.local, offset: items.length, cuantos: TANDA_MAS })
    setCargando(false)
    if (!r.ok) { toast.error(r.error); return }
    setExtra(prev => [...prev, ...r.data])
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label={`Pendientes de ${grupo.local}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border bg-surface2 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <IconBuildingStore size={15} className="text-accent-fg" aria-hidden /> {grupo.local}
        </h2>
        <p className="text-sm text-muted">
          {plural(grupo.cantidad, 'gasto', 'gastos')}
          {grupo.vencidos > 0 && <span className="font-semibold text-warning"> · {plural(grupo.vencidos, 'vencido', 'vencidos')}</span>}
          {' · '}<span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(grupo.total)}</span>
        </p>
      </header>
      <ul className="divide-y divide-border">
        {items.map(p => <FilaPendiente key={p.clave} p={p} hoy={hoy} pendiente={pendiente} onPagar={onPagar} />)}
      </ul>
      {resto > 0 && (
        <button type="button" onClick={verMas} disabled={cargando} className={botonMas}>
          {cargando ? <><Puntos /> Trayendo</> : <>Ver {Math.min(resto, TANDA_MAS)} más de {grupo.local} <span className="text-muted">(quedan {resto})</span></>}
        </button>
      )}
    </section>
  )
}

export default function PendientesClient({
  grupos,
  totales,
  filtros,
  hoy,
  error,
  cajas,
  formasPago,
  locales,
  fudo,
}: {
  /** Ya filtrados por la base: un renglón por local con su primera tanda. */
  grupos: GrupoServidor[]
  /** Todo lo que se debe, sin filtros (los números de arriba). */
  totales: { cantidad: number; total: number; vencidos: number }
  filtros: FiltrosPendientes
  hoy: string
  error: boolean
  cajas: string[]
  formasPago: string[]
  locales: string[]
  fudo: EstadoFudo
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [navegando, startNav] = useTransition()
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [pagando, setPagando] = useState<PendienteVista | null>(null)
  const { actualizando, actualizar } = useActualizarFudo(fudo.activo, toast)

  function ir(cambios: Partial<FiltrosPendientes>) {
    const qs = paramsDePendientes({ ...filtros, ...cambios })
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // La búsqueda va a la URL cuando se deja de escribir.
  useEffect(() => {
    if (busqueda.trim() === filtros.q) return
    const t = setTimeout(() => ir({ q: busqueda }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const hayFiltros = !!filtros.local || !!filtros.q || !!filtros.desde || !!filtros.hasta
  const cantidad = grupos.reduce((s, g) => s + g.cantidad, 0)
  const totalFiltrado = grupos.reduce((s, g) => s + g.total, 0)
  const sinConexion = fudo.activo ? fudo.locales.filter(l => l.ultimoError) : []
  function limpiar() { setBusqueda(''); ir({ local: '', q: '', desde: '', hasta: '' }) }

  async function pagar(datos: DatosPago): Promise<boolean> {
    const p = pagando
    if (!p) return false
    return await new Promise(resolve => startTransition(async () => {
      const r = await registrarPagoGasto({ id: p.id, ...datos })
      if (!r.ok) { toast.error(r.error); resolve(false); return }
      toast.success(`Pago registrado · ${p.titulo} · ${formatearMonedaExacta(datos.monto ?? p.monto)}`)
      setPagando(null)
      resolve(true)
    }))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconClock}
        titulo="Pendientes de pago"
        descripcion="Lo que falta pagar en cada local, más viejo primero."
        acciones={<AyudaLink seccion="admin" ancla="gastos" />}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<IconWallet size={18} aria-hidden />}
          label="Pendiente de pago"
          value={formatearMonedaExacta(totales.total)}
          detalle={totales.cantidad === 0 ? 'Todo al día' : plural(totales.cantidad, 'gasto sin pagar', 'gastos sin pagar')}
          tono={totales.cantidad > 0 ? 'peligro' : 'exito'}
        />
        <KpiCard
          icon={<IconAlertTriangle size={18} aria-hidden />}
          label="Vencidos"
          value={String(totales.vencidos)}
          detalle={totales.vencidos ? 'con la fecha de vencimiento pasada' : 'ninguno vencido'}
          tono={totales.vencidos ? 'alerta' : 'neutro'}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar por local"
            value={filtros.local}
            onChange={e => ir({ local: e.target.value })}
            className={`${controlClass} min-h-11 w-full sm:w-52`}
          >
            <option value="">Todos los locales</option>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
            {filtros.local && !locales.includes(filtros.local) && <option value={filtros.local}>{filtros.local}</option>}
          </select>
          <DateRangePicker desde={filtros.desde} hasta={filtros.hasta} onChange={(desde, hasta) => ir({ desde, hasta })} ariaLabel="Fecha de los gastos" placeholder="Cualquier fecha" />
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar descripción o proveedor" className="w-full sm:w-72" />
          <SegmentedControl
            opciones={[{ value: 'viejos', label: 'Más viejos primero' }, { value: 'nuevos', label: 'Más nuevos primero' }]}
            value={filtros.orden}
            onChange={orden => ir({ orden })}
          />
          <ClearFiltersButton visible={hayFiltros} onClick={limpiar} />
          {navegando && <span className="inline-flex items-center gap-2 text-sm text-muted" aria-live="polite"><Puntos /> Buscando</span>}
        </div>
        {fudo.activo && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {sinConexion.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-warning" title={sinConexion.map(l => `${l.local}: ${l.ultimoError}`).join('\n')}>
                <IconAlertTriangle size={15} aria-hidden /> No se pudo actualizar con Fudo: {sinConexion.map(l => l.local.replace(/^YA! /, '')).join(', ')}. Sus gastos pueden no estar al día.
              </span>
            )}
            <button type="button" onClick={() => actualizar(false)} disabled={actualizando}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl px-2 font-semibold text-text hover:bg-surface2 disabled:opacity-60">
              {actualizando ? <><Puntos /> Actualizando con Fudo</> : <><IconRefresh size={15} aria-hidden /> Actualizar con Fudo</>}
            </button>
          </div>
        )}
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No pudimos cargar los pendientes. Recargá la página; si sigue pasando, avisanos.
        </p>
      ) : grupos.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {hayFiltros ? (
            <EmptyState icono={IconWallet} titulo="Ningún pendiente coincide con los filtros" accion={<ClearFiltersButton visible onClick={limpiar} />} />
          ) : (
            <EmptyState icono={IconCircleCheck} titulo="Todo al día" descripcion="No hay gastos pendientes de pago." />
          )}
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${navegando ? 'opacity-60' : ''}`}>
          {hayFiltros && (
            <p className="text-sm text-muted">
              {plural(cantidad, 'gasto', 'gastos')} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(totalFiltrado)}</span>
            </p>
          )}
          {grupos.map(g => (
            // La clave cambia si cambian sus totales (un pago): vuelve a la primera tanda, ya al día.
            <GrupoLocal key={`${g.local}-${g.cantidad}-${g.total}-${filtros.orden}-${filtros.q}-${filtros.desde}-${filtros.hasta}`}
              grupo={g} filtros={filtros} hoy={hoy} pendiente={isPending} onPagar={setPagando} />
          ))}
        </div>
      )}

      {pagando && pagando.gasto && (
        <PagoModal
          key={pagando.clave}
          gasto={{
            clave: pagando.id,
            titulo: pagando.titulo,
            detalle: pagando.detalle,
            local: pagando.local,
            fecha: pagando.fecha,
            monto: pagando.monto,
            montoTotal: pagando.gasto.monto,
            deFudo: pagando.gasto.fudo != null,
          }}
          formaPagoInicial={pagando.formaPago}
          cajas={cajas}
          formasPago={formasPago}
          pendiente={isPending}
          onConfirmar={pagar}
          onCerrar={() => setPagando(null)}
        />
      )}
    </div>
  )
}
