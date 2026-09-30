'use client'

import { useMemo, useState } from 'react'
import { CalendarRange, CircleDollarSign, Clock, Plus, ReceiptText, Wallet } from 'lucide-react'
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
import { controlClass } from '@/components/ui/Field'
import { useConfirmar } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { calcularRangoPreset } from '@/lib/compras/rangoFechas'
import {
  armarGastos, filtrarGastos, pendiente, resumirGastos,
  type FiltroEstadoGasto, type GastoFila, type GastoVista,
} from '@/lib/gastos/modelo'
import GastoForm from './GastoForm'

const FILTROS: { value: FiltroEstadoGasto; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendientes', label: 'Pendientes de pago' },
  { value: 'pagados', label: 'Pagados' },
]

type Abierto = { id: string } | 'nuevo' | null

export default function GastosClient({
  gastos: filas,
  proveedores,
  cajas,
  formasPago,
  gastoInicial,
}: {
  gastos: GastoFila[]
  proveedores: { id: string; nombre: string }[]
  cajas: string[]
  formasPago: string[]
  gastoInicial?: string
}) {
  const confirmar = useConfirmar()
  const mesActual = useMemo(() => calcularRangoPreset('mes_actual', new Date()), [])
  const [estado, setEstado] = useState<FiltroEstadoGasto>('todos')
  const [local, setLocal] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState(mesActual.desde)
  const [hasta, setHasta] = useState(mesActual.hasta)
  const [abierto, setAbierto] = useState<Abierto>(gastoInicial ? { id: gastoInicial } : null)
  const [conCambios, setConCambios] = useState(false)

  // Todo sale de las props: las acciones llaman a refresh() y la pantalla se
  // vuelve a armar con lo que quedó en la base.
  const gastos = useMemo(() => armarGastos(filas), [filas])
  const resumen = useMemo(() => resumirGastos(gastos, desde, hasta), [gastos, desde, hasta])
  const filtrados = useMemo(
    () => filtrarGastos(gastos, { estado, local, busqueda, desde, hasta }),
    [gastos, estado, local, busqueda, desde, hasta],
  )
  const locales = useMemo(() => [...new Set(gastos.map(g => g.local))].sort(), [gastos])
  const totalFiltrado = filtrados.reduce((s, g) => s + g.monto, 0)

  const esMesActual = desde === mesActual.desde && hasta === mesActual.hasta
  const hayFiltros = estado !== 'todos' || !!local || !!busqueda || !esMesActual
  function limpiar() {
    setEstado('todos'); setLocal(''); setBusqueda(''); setDesde(mesActual.desde); setHasta(mesActual.hasta)
  }

  function abrir(a: Abierto) { setAbierto(a); setConCambios(false) }
  function cerrarYa() { setAbierto(null); setConCambios(false) }
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

  const gastoAbierto = abierto && abierto !== 'nuevo' ? gastos.find(g => g.id === abierto.id) ?? null : null
  const modalAbierto = abierto === 'nuevo' || gastoAbierto != null

  const columnas: Columna<GastoVista>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: g => <span className="whitespace-nowrap tabular-nums">{g.fecha ? formatearFecha(g.fecha) : '—'}</span>,
      ordenar: g => g.fecha,
    },
    {
      key: 'concepto',
      header: 'Concepto',
      render: g => (
        <span className="block min-w-0">
          <span className="block font-medium text-text">{g.proveedor ?? g.categoria}</span>
          <span className="block text-xs text-muted">
            {g.proveedor ? g.categoria : g.rubro}
            <span className="sm:hidden"> · {g.local}</span>
          </span>
          {g.factura && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-2xs font-medium text-muted">
              <ReceiptText size={11} /> Factura <span className="font-mono tabular-nums">{g.factura.numero}</span>
            </span>
          )}
        </span>
      ),
      ordenar: g => (g.proveedor ?? g.categoria).toLowerCase(),
    },
    { key: 'local', header: 'Local', render: g => <span className="whitespace-nowrap">{g.local}</span>, ordenar: g => g.local, ocultarHasta: 'sm' },
    { key: 'forma', header: 'Forma de pago', render: g => <span className="text-muted">{g.formaPago}</span>, ordenar: g => g.formaPago, ocultarHasta: 'lg' },
    {
      key: 'monto',
      header: 'Monto',
      alinear: 'right',
      render: g => <span className="whitespace-nowrap font-semibold tabular-nums text-text">{formatearMonedaExacta(g.monto)}</span>,
      ordenar: g => g.monto,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: g => (
        <span className="inline-flex flex-col items-start gap-0.5">
          <EstadoBadge dominio="gastos" estado={g.estado} />
          {g.estado === 'Pagado' && g.fechaPago && (
            <span className="whitespace-nowrap text-2xs text-muted">el {formatearFecha(g.fechaPago)}</span>
          )}
        </span>
      ),
      ordenar: g => (pendiente(g) ? 0 : 1),
      ocultarHasta: 'md',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Wallet}
        titulo="Gastos"
        descripcion="Lo que se gasta en cada local. Cargalo, pagalo y seguilo desde acá."
        acciones={
          <>
            <AyudaLink seccion="admin" ancla="gastos" />
            <button
              type="button"
              onClick={() => abrir('nuevo')}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Plus size={16} /> Nuevo gasto
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Clock size={18} />}
          label="Pendiente de pago"
          value={formatearMonedaExacta(resumen.pendiente)}
          detalle={resumen.pendientesCount === 0 ? 'Todo al día' : `${resumen.pendientesCount} gasto${resumen.pendientesCount === 1 ? '' : 's'}, de cualquier fecha`}
          tono={resumen.pendientesCount > 0 ? 'peligro' : 'exito'}
        />
        <KpiCard
          icon={<CircleDollarSign size={18} />}
          label="Pagado en el período"
          value={formatearMonedaExacta(resumen.pagadoPeriodo)}
          detalle="por fecha de pago"
        />
        <KpiCard
          icon={<CalendarRange size={18} />}
          label="Gastado en el período"
          value={formatearMonedaExacta(resumen.totalPeriodo)}
          detalle={`${resumen.gastosPeriodo} gasto${resumen.gastosPeriodo === 1 ? '' : 's'}, por fecha del gasto`}
        />
      </div>

      <div className="space-y-3">
        <ChipGroup opciones={FILTROS} value={estado} onChange={setEstado} />
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            desde={desde}
            hasta={hasta}
            onChange={(d, h) => { setDesde(d); setHasta(h) }}
            ariaLabel="Período de los gastos"
          />
          <select
            aria-label="Filtrar por local"
            value={local}
            onChange={e => setLocal(e.target.value)}
            className={`${controlClass} min-h-11 w-full sm:w-52`}
          >
            <option value="">Todos los locales</option>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar proveedor o factura" className="w-full sm:w-72" />
          <ClearFiltersButton visible={hayFiltros} onClick={limpiar} />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {gastos.length === 0 ? (
            <EmptyState
              icono={Wallet}
              titulo="Todavía no hay gastos"
              descripcion="Cargá el primero con Nuevo gasto. Los de las facturas de proveedores aparecen solos cuando se confirman."
            />
          ) : (
            <EmptyState
              icono={Wallet}
              titulo="No hay gastos con estos filtros"
              descripcion={esMesActual && !busqueda && !local && estado === 'todos' ? 'Este mes todavía no se cargó ninguno. Probá con otro período.' : 'Probá con otro período o limpiá los filtros.'}
              accion={<ClearFiltersButton visible={hayFiltros} onClick={limpiar} />}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <DataTable filas={filtrados} columnas={columnas} filaKey={g => g.id} onFilaClick={g => abrir({ id: g.id })} />
          <p className="px-1 text-right text-sm text-muted">
            {filtrados.length} gasto{filtrados.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(totalFiltrado)}</span>
          </p>
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
            onCambios={setConCambios}
            onListo={cerrarYa}
            onCancelar={cerrar}
          />
        )}
      </Modal>
    </div>
  )
}
