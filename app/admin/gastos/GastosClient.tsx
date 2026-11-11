'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconBuildingStore, IconCalendarStats, IconChevronLeft, IconChevronRight, IconClock, IconCoin,
  IconPlus, IconReceipt, IconRefresh, IconRepeat, IconWallet,
} from '@tabler/icons-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import Modal from '@/components/ui/Modal'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SearchInput from '@/components/ui/SearchInput'
import DateRangePicker from '@/components/ui/DateRangePicker'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { ChipGroup } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import {
  POR_PAGINA, armarGastos, hayFiltros, mesDe, paramsDeFiltros,
  type FiltroEstadoGasto, type FiltrosLista, type GastoFila, type GastoVista, type OrigenGasto, type ResumenGastos,
} from '@/lib/gastos/modelo'
import type { CuentaPlan } from '@/lib/gastos/plan'
import { useActualizarFudo } from './useActualizarFudo'
import GastoForm from './GastoForm'

const FILTROS: { value: FiltroEstadoGasto; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendientes', label: 'Pendientes de pago' },
  { value: 'pagados', label: 'Pagados' },
]

const botonPagina = 'presionable min-h-11 inline-flex items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-40'

type Abierto = { id: string } | 'nuevo' | null

export interface EstadoFudo {
  /** GASTOS_FUDO_SYNC=on en este entorno. */
  activo: boolean
  locales: { local: string; ultimoOk: string | null; ultimoError: string | null }[]
}

const ORIGENES: { value: OrigenGasto | ''; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'manual', label: 'Cargados acá' },
  { value: 'factura', label: 'De facturas' },
  { value: 'fudo', label: 'De los locales (Fudo)' },
  { value: 'recurrente', label: 'Que se repiten' },
]

/** "hace 5 min", "hace 2 h", "hace 3 días". */
function hace(iso: string, ahora: number): string {
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

/** Cuándo se trajeron los gastos de Fudo, qué sucursal no respondió, y el botón para actualizar. */
function LineaFudo({ fudo, actualizando, onActualizar }: { fudo: EstadoFudo; actualizando: boolean; onActualizar: () => void }) {
  const [ahora] = useState(() => Date.now())
  if (!fudo.activo || fudo.locales.length === 0) return null
  const oks = fudo.locales.map(l => l.ultimoOk).filter((v): v is string => !!v).sort()
  const masViejo = oks[0]
  const conError = fudo.locales.filter(l => l.ultimoError)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span className="inline-flex items-center gap-1.5">
        <IconBuildingStore size={15} aria-hidden />
        {masViejo ? <>Gastos de los locales (Fudo) actualizados {hace(masViejo, ahora)}</> : 'Los gastos de los locales (Fudo) todavía no se trajeron'}
      </span>
      {conError.length > 0 && (
        <span className="text-warning" title={conError.map(l => `${l.local}: ${l.ultimoError}`).join('\n')}>
          · no se pudo actualizar: {conError.map(l => l.local.replace(/^YA! /, '')).join(', ')}
        </span>
      )}
      <button type="button" onClick={onActualizar} disabled={actualizando}
        className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl px-2 font-semibold text-text hover:bg-surface2 disabled:opacity-60">
        {actualizando ? <><Puntos /> Actualizando</> : <><IconRefresh size={15} aria-hidden /> Actualizar</>}
      </button>
    </div>
  )
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Opciones del filtro por cuenta: los rubros de gasto del plan, lo que no es gasto y lo sin clasificar. */
function opcionesCuenta(cuentas: CuentaPlan[]): { value: string; label: string }[] {
  const rubros = new Map<string, string>()
  for (const c of cuentas) {
    if (c.usoGastos !== 'gasto') continue
    const rubro = c.codigo.split('.').slice(0, 2).join('.')
    if (!rubros.has(rubro)) rubros.set(rubro, c.rubroGasto ?? rubro)
  }
  return [
    { value: '', label: 'Todas las cuentas' },
    ...[...rubros].map(([value, label]) => ({ value, label })),
    { value: 'otros', label: 'No son gasto (retiros, bienes de uso…)' },
    { value: 'sin', label: 'Sin clasificar' },
  ]
}

/** Debajo del estado: cuándo se pagó, cuánto falta o que venció. */
function DetalleEstado({ g }: { g: GastoVista }) {
  if (g.estado === 'Pagado' && g.fechaPago) {
    return <span className="whitespace-nowrap text-2xs text-muted">el {formatearFecha(g.fechaPago)}</span>
  }
  if (g.estado === 'Parcial') {
    return <span className="whitespace-nowrap text-2xs text-muted">falta <span className="tabular-nums">{formatearMonedaExacta(g.saldo)}</span></span>
  }
  if (g.vencido && g.fechaVencimiento) {
    return <span className="whitespace-nowrap text-2xs font-semibold text-warning">venció el {formatearFecha(g.fechaVencimiento)}</span>
  }
  return null
}

export default function GastosClient({
  gastos: filas,
  gastoSuelto,
  cantidad,
  resumen,
  filtros,
  hoy,
  error,
  proveedores,
  cajas,
  formasPago,
  localesCarga,
  pedidoDeFactura,
  gastoInicial,
  fudo,
  cuentas,
}: {
  /** Las cuentas del plan que se eligen en Gastos. */
  cuentas: CuentaPlan[]
  /** Estado de la sincronización con Fudo (solo lectura de Fudo). */
  fudo: EstadoFudo
  /** La página actual, ya filtrada y ordenada por la base. */
  gastos: GastoFila[]
  /** El que pidió ?gasto= cuando no está en la página. */
  gastoSuelto: GastoFila | null
  /** Total de gastos con estos filtros (todas las páginas). */
  cantidad: number
  resumen: ResumenGastos
  filtros: FiltrosLista
  hoy: string
  error: boolean
  proveedores: { id: string; nombre: string; estado: string }[]
  cajas: string[]
  formasPago: string[]
  /** Los locales activos para cargar un gasto (locales_config). */
  localesCarga: string[]
  pedidoDeFactura: Record<string, string>
  gastoInicial?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const confirmar = useConfirmar()
  const [navegando, startNav] = useTransition()
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [abierto, setAbierto] = useState<Abierto>(gastoInicial ? { id: gastoInicial } : null)
  const [conCambios, setConCambios] = useState(false)
  const quitarParam = useQuitarParams('gasto')
  useAlCambiarParam(gastoInicial, id => abrir({ id }))
  const toast = useToast()
  const { actualizando, actualizar } = useActualizarFudo(fudo.activo, toast)

  // Todo sale de las props: los filtros cambian la URL y las acciones llaman a
  // refresh(); en los dos casos el servidor vuelve a armar la página.
  const gastos = useMemo(() => armarGastos(filas, pedidoDeFactura), [filas, pedidoDeFactura])
  const filtroCuenta = useMemo(() => opcionesCuenta(cuentas), [cuentas])
  const suelto = useMemo(() => (gastoSuelto ? armarGastos([gastoSuelto], pedidoDeFactura)[0] ?? null : null), [gastoSuelto, pedidoDeFactura])

  function ir(cambios: Partial<FiltrosLista>) {
    const qs = paramsDeFiltros({ ...filtros, pagina: 1, ...cambios }, hoy)
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // La búsqueda va a la URL cuando se deja de escribir.
  useEffect(() => {
    if (busqueda.trim() === filtros.q) return
    const t = setTimeout(() => ir({ q: busqueda }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const mes = mesDe(hoy)
  const esMesActual = filtros.desde === mes.desde && filtros.hasta === mes.hasta
  const conFiltros = hayFiltros(filtros, hoy)
  function limpiar() {
    setBusqueda('')
    ir({ desde: mes.desde, hasta: mes.hasta, estado: 'todos', local: '', q: '', origen: '', cuenta: '' })
  }

  const paginas = Math.max(1, Math.ceil(cantidad / POR_PAGINA))
  const primero = cantidad === 0 ? 0 : (filtros.pagina - 1) * POR_PAGINA + 1
  const ultimo = Math.min(filtros.pagina * POR_PAGINA, cantidad)
  function irAPagina(pagina: number) {
    const qs = paramsDeFiltros({ ...filtros, pagina }, hoy)
    startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  function abrir(a: Abierto) { setAbierto(a); setConCambios(false) }
  function cerrarYa() { quitarParam(); setAbierto(null); setConCambios(false) }
  function cerrar() {
    if (!conCambios) { cerrarYa(); return }
    confirmar({
      titulo: 'Descartar cambios',
      mensaje: 'Tenés cambios sin guardar en el gasto. ¿Descartarlos?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir editando',
      peligroso: true,
      onConfirmar: cerrarYa,
    })
  }

  const gastoAbierto = abierto && abierto !== 'nuevo'
    ? gastos.find(g => g.id === abierto.id) ?? (suelto?.id === abierto.id ? suelto : null)
    : null
  const modalAbierto = abierto === 'nuevo' || gastoAbierto != null

  const columnas: Columna<GastoVista>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: g => <span className="whitespace-nowrap tabular-nums">{g.fecha ? formatearFecha(g.fecha) : '—'}</span>,
      ocultarHasta: 'sm',
    },
    {
      key: 'concepto',
      header: 'Concepto',
      render: g => (
        <span className="block min-w-0">
          <span className="block break-words font-medium text-text">
            {g.titulo}
            {g.fudo?.revisar && (
              <IconAlertTriangle size={14} className="ml-1 inline text-warning" aria-label="Revisar: cambió en Fudo después de pagarlo acá" />
            )}
          </span>
          <span className="block text-xs text-muted">
            {g.fudo && !g.cuenta ? <span className="font-semibold text-warning">Sin clasificar</span> : (g.fudo ? g.cuentaNombre : g.subtitulo)}
            {g.usoGastos === 'otro_pago' && <> · no es gasto</>}
            {g.fudo && g.subtitulo.includes(' · ') && <> · {g.subtitulo.split(' · ').slice(1).join(' · ')}</>}
            <span className="sm:hidden"> · {g.local} · <span className="tabular-nums">{g.fecha ? formatearFecha(g.fecha) : ''}</span></span>
          </span>
          {g.factura && (
            <LinkEntidad entidad={{ tipo: 'factura', id: g.factura.id }} variante="chip" className="mt-1 max-w-full" title="Ver la factura">
              <IconReceipt size={11} aria-hidden /> Factura <span className="truncate font-mono tabular-nums">{g.factura.numero}</span>
            </LinkEntidad>
          )}
        </span>
      ),
    },
    {
      key: 'local',
      header: 'Local',
      render: g => (
        <span className="inline-flex flex-col items-start gap-0.5">
          <span className="whitespace-nowrap">{g.local}</span>
          {g.fudo && <span className="rounded-md border border-border px-1.5 text-2xs font-semibold text-muted">Fudo</span>}
        </span>
      ),
      ocultarHasta: 'sm',
    },
    { key: 'forma', header: 'Forma de pago', render: g => <span className="text-muted">{g.ultimoPagoForma ?? g.formaPago}</span>, ocultarHasta: 'lg' },
    {
      key: 'monto',
      header: 'Monto',
      alinear: 'right',
      render: g => (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="whitespace-nowrap font-semibold tabular-nums text-text">{formatearMonedaExacta(g.monto)}</span>
          {g.recurrente?.aConfirmar && <span className="whitespace-nowrap text-2xs font-semibold text-warning">monto a confirmar</span>}
          {/* En el celular el estado va debajo del monto. */}
          <span className="md:hidden"><EstadoBadge dominio="gastos" estado={g.estado} /></span>
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: g => (
        <span className="inline-flex flex-col items-start gap-0.5">
          <EstadoBadge dominio="gastos" estado={g.estado} />
          <DetalleEstado g={g} />
        </span>
      ),
      ocultarHasta: 'md',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconWallet}
        titulo="Gastos"
        descripcion="Lo que se gasta en cada local. Cargalo, pagalo y seguilo desde acá."
        acciones={
          <>
            <AyudaLink seccion="admin" ancla="gastos" />
            <Link
              href="/admin/gastos/recurrentes"
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2"
            >
              <IconRepeat size={16} aria-hidden /> Que se repiten
            </Link>
            <button
              type="button"
              onClick={() => abrir('nuevo')}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <IconPlus size={16} aria-hidden /> Nuevo gasto
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<IconClock size={18} aria-hidden />}
          label="Pendiente de pago"
          value={formatearMonedaExacta(resumen.pendiente)}
          detalle={resumen.pendientesCount === 0 ? 'Todo al día' : `${plural(resumen.pendientesCount, 'gasto', 'gastos')}, de cualquier fecha`}
          tono={resumen.pendientesCount > 0 ? 'peligro' : 'exito'}
        />
        <KpiCard
          icon={<IconCoin size={18} aria-hidden />}
          label="Pagado en el período"
          value={formatearMonedaExacta(resumen.pagadoPeriodo)}
          detalle="por fecha de pago"
        />
        <KpiCard
          icon={<IconCalendarStats size={18} aria-hidden />}
          label="Gastado en el período"
          value={formatearMonedaExacta(resumen.totalPeriodo)}
          detalle={resumen.otrosCount > 0
            ? `${plural(resumen.gastosPeriodo, 'gasto', 'gastos')} · aparte, ${formatearMonedaExacta(resumen.otrosPeriodo)} que no son gasto`
            : `${plural(resumen.gastosPeriodo, 'gasto', 'gastos')}, por fecha del gasto`}
        />
      </div>

      {resumen.sinClasificarCount > 0 && filtros.cuenta !== 'sin' && (
        <button
          type="button"
          onClick={() => ir({ cuenta: 'sin' })}
          className="presionable flex min-h-11 w-full items-center gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-2 text-left text-sm font-medium text-warning"
        >
          <IconAlertTriangle size={16} className="shrink-0" aria-hidden />
          {plural(resumen.sinClasificarCount, 'gasto de Fudo', 'gastos de Fudo')} de este período sin cuenta. Tocá para verlos y clasificarlos.
        </button>
      )}

      <div className="space-y-3">
        <ChipGroup opciones={FILTROS} value={filtros.estado === 'anulados' ? 'todos' : filtros.estado} onChange={estado => ir({ estado })} />
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={(desde, hasta) => ir({ desde, hasta })}
            ariaLabel="Período de los gastos"
          />
          <select
            aria-label="Filtrar por local"
            value={filtros.local}
            onChange={e => ir({ local: e.target.value })}
            className={`${controlClass} min-h-11 w-full sm:w-52`}
          >
            <option value="">Todos los locales</option>
            {localesCarga.map(l => <option key={l} value={l}>{l}</option>)}
            {filtros.local && !localesCarga.includes(filtros.local) && <option value={filtros.local}>{filtros.local}</option>}
          </select>
          <select
            aria-label="Filtrar por origen"
            value={filtros.origen}
            onChange={e => ir({ origen: e.target.value as OrigenGasto | '' })}
            className={`${controlClass} min-h-11 w-full sm:w-52`}
          >
            {ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            aria-label="Filtrar por cuenta"
            value={filtros.cuenta}
            onChange={e => ir({ cuenta: e.target.value })}
            className={`${controlClass} min-h-11 w-full sm:w-60`}
          >
            {filtroCuenta.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            {filtros.cuenta && !filtroCuenta.some(o => o.value === filtros.cuenta) && <option value={filtros.cuenta}>{filtros.cuenta}</option>}
          </select>
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar proveedor, factura o pedido" className="w-full sm:w-72" />
          <ClearFiltersButton visible={conFiltros} onClick={limpiar} />
          {navegando && <span className="inline-flex items-center gap-2 text-sm text-muted" aria-live="polite"><Puntos /> Buscando</span>}
        </div>
        <LineaFudo fudo={fudo} actualizando={actualizando} onActualizar={() => actualizar(false)} />
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No pudimos cargar los gastos. Recargá la página; si sigue pasando, avisanos.
        </p>
      ) : gastos.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {conFiltros ? (
            <EmptyState
              icono={IconWallet}
              titulo="No hay gastos con estos filtros"
              descripcion="Probá con otro período o limpiá los filtros."
              accion={<ClearFiltersButton visible onClick={limpiar} />}
            />
          ) : (
            <EmptyState
              icono={IconWallet}
              titulo={esMesActual ? 'Este mes todavía no hay gastos' : 'Todavía no hay gastos'}
              descripcion="Cargá uno con Nuevo gasto. Los de las facturas de proveedores aparecen solos cuando se confirman."
            />
          )}
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${navegando ? 'opacity-60' : ''}`}>
          <DataTable filas={gastos} columnas={columnas} filaKey={g => g.id} onFilaClick={g => abrir({ id: g.id })} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="text-sm text-muted">
              <span className="tabular-nums">{primero}–{ultimo}</span> de {plural(cantidad, 'gasto', 'gastos')} ·{' '}
              <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(resumen.filtradoTotal)}</span>
            </p>
            {paginas > 1 && (
              <nav className="flex items-center gap-2" aria-label="Páginas de gastos">
                <button type="button" onClick={() => irAPagina(filtros.pagina - 1)} disabled={filtros.pagina <= 1 || navegando} className={botonPagina}>
                  <IconChevronLeft size={16} aria-hidden /> Anterior
                </button>
                <span className="text-sm tabular-nums text-muted">{filtros.pagina} / {paginas}</span>
                <button type="button" onClick={() => irAPagina(filtros.pagina + 1)} disabled={filtros.pagina >= paginas || navegando} className={botonPagina}>
                  Siguiente <IconChevronRight size={16} aria-hidden />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      <Modal
        open={modalAbierto}
        onClose={cerrar}
        title={gastoAbierto ? 'Gasto' : 'Nuevo gasto'}
        encabezado={gastoAbierto ? <>Gasto de <span className="tabular-nums">{formatearMonedaExacta(gastoAbierto.monto)}</span></> : undefined}
        size="xl"
        pantallaCompletaMobile
      >
        {modalAbierto && (
          <GastoForm
            key={gastoAbierto?.id ?? 'nuevo'}
            gasto={gastoAbierto}
            proveedores={proveedores}
            cajas={cajas}
            formasPago={formasPago}
            locales={localesCarga}
            cuentas={cuentas}
            onCambios={setConCambios}
            onListo={cerrarYa}
            onCancelar={cerrar}
          />
        )}
      </Modal>
    </div>
  )
}
