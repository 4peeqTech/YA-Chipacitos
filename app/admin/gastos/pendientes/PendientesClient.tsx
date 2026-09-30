'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, History, RefreshCw, RotateCcw, Store, Wallet } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import KpiCard from '@/components/ui/KpiCard'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SearchInput from '@/components/ui/SearchInput'
import DateRangePicker from '@/components/ui/DateRangePicker'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { SegmentedControl } from '@/components/ui/Chip'
import { Skeleton } from '@/components/ui/Skeleton'
import { controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import {
  agruparPorLocal, armarGastos, diasDesde, DIAS_ATRASADO, filtrarPendientes, pendienteDeFudo, pendienteDeGasto,
  type FudoGastoCrudo, type OrdenPendientes, type FudoPagadoFila, type GastoFila, type PendienteVista,
} from '@/lib/gastos/modelo'
import { deshacerPagoFudo, registrarPagoFudo, registrarPagoGasto } from '../acciones'
import PagoModal, { type DatosPago } from '../PagoModal'

type Pestana = 'app' | 'fudo' | 'pagados'

interface EstadoFudo {
  cargando: boolean
  items: PendienteVista[]
  errores: { sucursal: string; motivo: 'sin_conexion' | 'error'; error: string }[]
  /** Falló la consulta entera (no una sucursal). */
  error: string | null
}

// Secundario: con decenas de filas, un botón amarillo por fila tapaba todo lo demás.
const botonPago = 'presionable min-h-11 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:border-accent hover:bg-surface2 disabled:opacity-50'

// Un local de Fudo puede tener cientos: se muestran de a tandas.
const POR_TANDA = 15

function suma(items: PendienteVista[]): number {
  return Math.round(items.reduce((s, i) => s + i.monto, 0) * 100) / 100
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Un grupo por local: encabezado con el subtotal y una fila por gasto. */
function GrupoPendientes({
  local, items, total, hoy, pendiente, onPagar,
}: {
  local: string
  items: PendienteVista[]
  total: number
  hoy: string
  pendiente: boolean
  onPagar: (p: PendienteVista) => void
}) {
  const [visibles, setVisibles] = useState(POR_TANDA)
  const mostrados = items.slice(0, visibles)
  const resto = items.length - mostrados.length
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label={`Pendientes de ${local}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border bg-surface2 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <Store size={15} className="text-accent-fg" /> {local}
        </h2>
        <p className="text-sm text-muted">
          {plural(items.length, 'gasto', 'gastos')} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(total)}</span>
        </p>
      </header>
      <ul className="divide-y divide-border">
        {mostrados.map(p => {
          const dias = diasDesde(p.fecha, hoy)
          const atrasado = dias >= DIAS_ATRASADO
          return (
            <li key={p.clave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text">
                  {p.origen === 'app' ? (
                    <Link href={`/admin/gastos?gasto=${p.id}`} className="-my-3 inline-block py-3 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4">
                      {p.titulo}
                    </Link>
                  ) : p.titulo}
                </p>
                <p className="text-xs text-muted">
                  <span className="tabular-nums">{p.fecha ? formatearFecha(p.fecha) : 'Sin fecha'}</span>
                  {atrasado && <span className="font-semibold text-warning"> · hace {dias} días</span>}
                  {p.detalle && <> · {p.detalle}</>}
                </p>
              </div>
              <p className="ml-auto whitespace-nowrap text-base font-semibold tabular-nums text-text">{formatearMonedaExacta(p.monto)}</p>
              <button type="button" onClick={() => onPagar(p)} disabled={pendiente} className={`${botonPago} w-full sm:w-auto`}>
                <Wallet size={15} /> Registrar pago
              </button>
            </li>
          )
        })}
      </ul>
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setVisibles(v => v + POR_TANDA * 4)}
          className="flex min-h-11 w-full items-center justify-center border-t border-border text-sm font-medium text-text transition-colors hover:bg-surface2"
        >
          Ver {Math.min(resto, POR_TANDA * 4)} más de {local} <span className="ml-1 text-muted">(quedan {resto})</span>
        </button>
      )}
    </section>
  )
}

export default function PendientesClient({
  gastos: filasGastos,
  pagadosFudo,
  cajas,
  formasPago,
}: {
  gastos: GastoFila[]
  pagadosFudo: FudoPagadoFila[]
  cajas: string[]
  formasPago: string[]
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [isPending, startTransition] = useTransition()
  const [pestana, setPestana] = useState<Pestana>('app')
  const [local, setLocal] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagando, setPagando] = useState<PendienteVista | null>(null)
  const [orden, setOrden] = useState<OrdenPendientes>('viejos')
  const [fudo, setFudo] = useState<EstadoFudo>({ cargando: true, items: [], errores: [], error: null })
  const consulta = useRef(0)
  const hoy = hoyISO()

  const cargarFudo = useCallback(() => {
    const n = ++consulta.current
    setFudo(f => ({ ...f, cargando: true, error: null }))
    fetch('/api/fudo/pendientes')
      .then(async r => {
        const data = await r.json()
        if (n !== consulta.current) return
        if (!r.ok) throw new Error(data?.error ?? 'Fudo no respondió.')
        const items = Array.isArray(data?.items) ? (data.items as FudoGastoCrudo[]).map(pendienteDeFudo) : []
        setFudo({ cargando: false, items, errores: Array.isArray(data?.errores) ? data.errores : [], error: null })
      })
      .catch((e: unknown) => {
        if (n !== consulta.current) return
        setFudo({ cargando: false, items: [], errores: [], error: e instanceof Error ? e.message : 'No pudimos conectarnos con Fudo.' })
      })
  }, [])

  // Fudo es una API externa: se consulta una vez al entrar y con "Volver a consultar".
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarFudo() }, [cargarFudo])

  const app = useMemo(() => armarGastos(filasGastos).map(pendienteDeGasto), [filasGastos])
  const filtro = { local, busqueda, desde, hasta }
  const appFiltrados = filtrarPendientes(app, filtro)
  const fudoFiltrados = filtrarPendientes(fudo.items, filtro)
  const visibles = pestana === 'app' ? appFiltrados : fudoFiltrados
  const grupos = agruparPorLocal(visibles, orden)
  const locales = useMemo(
    () => [...new Set([...app, ...fudo.items].map(i => i.local))].sort(),
    [app, fudo.items],
  )
  const hayFiltros = !!local || !!busqueda || !!desde || !!hasta
  const fallidas = fudo.errores.filter(e => e.motivo !== 'sin_conexion')
  const sinConexion = fudo.errores.filter(e => e.motivo === 'sin_conexion')
  function limpiar() { setLocal(''); setBusqueda(''); setDesde(''); setHasta('') }

  async function pagar(datos: DatosPago): Promise<boolean> {
    const p = pagando
    if (!p) return false
    return await new Promise(resolve => startTransition(async () => {
      const r = p.origen === 'app'
        ? await registrarPagoGasto({ id: p.id, ...datos })
        : await registrarPagoFudo({
          fudoExpenseId: p.id,
          sucursal: p.local,
          descripcion: p.titulo,
          monto: p.monto,
          fechaGasto: p.fecha || null,
          ...datos,
        })
      if (!r.ok) { toast.error(r.error); resolve(false); return }
      // Los de Fudo los trajo el navegador: se sacan a mano de la lista.
      if (p.origen === 'fudo') setFudo(f => ({ ...f, items: f.items.filter(i => i.clave !== p.clave) }))
      toast.success(`Pago registrado · ${p.titulo} · ${formatearMonedaExacta(p.monto)}`)
      setPagando(null)
      resolve(true)
    }))
  }

  function deshacerFudo(fila: FudoPagadoFila) {
    if (!fila.id) return
    const id = fila.id
    confirmar({
      titulo: 'Deshacer el pago',
      mensaje: `El gasto de Fudo "${fila.descripcion ?? 'sin descripción'}" (${formatearMonedaExacta(Number(fila.monto ?? 0))}) vuelve a Pendientes de pago la próxima vez que se consulte Fudo.`,
      textoConfirmar: 'Deshacer pago',
      onConfirmar: () => startTransition(async () => {
        const r = await deshacerPagoFudo(id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success('Pago deshecho')
        cargarFudo()
      }),
    })
  }

  const columnasPagados: Columna<FudoPagadoFila>[] = [
    {
      key: 'pago',
      header: 'Pagado',
      render: f => <span className="whitespace-nowrap tabular-nums">{f.fecha_pago ? formatearFecha(f.fecha_pago) : '—'}</span>,
      ordenar: f => f.fecha_pago ?? '',
    },
    {
      key: 'gasto',
      header: 'Gasto',
      render: f => (
        <span className="block min-w-0">
          <span className="block font-medium text-text">{f.descripcion ?? 'Gasto de Fudo'}</span>
          <span className="block text-xs text-muted">
            {f.sucursal}{f.fecha_gasto && <> · del {formatearFecha(f.fecha_gasto)}</>}
          </span>
        </span>
      ),
    },
    {
      key: 'como',
      header: 'Cómo',
      render: f => <span className="text-muted">{[f.forma_pago, f.caja && `caja ${f.caja}`, f.pagado_por_nombre].filter(Boolean).join(' · ')}</span>,
      ocultarHasta: 'lg',
    },
    {
      key: 'monto',
      header: 'Monto',
      alinear: 'right',
      render: f => <span className="whitespace-nowrap font-semibold tabular-nums">{formatearMonedaExacta(Number(f.monto ?? 0))}</span>,
      ordenar: f => Number(f.monto ?? 0),
    },
    {
      key: 'acciones',
      header: <span className="sr-only">Acciones</span>,
      alinear: 'right',
      render: f => (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); deshacerFudo(f) }}
          disabled={isPending}
          className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-text hover:bg-surface2 disabled:opacity-50"
        >
          <RotateCcw size={13} /> Deshacer
        </button>
      ),
    },
  ]

  const opcionesPestana: { value: Pestana; label: React.ReactNode }[] = [
    { value: 'app', label: <>De la app <span className="tabular-nums">({app.length})</span></> },
    { value: 'fudo', label: <>De Fudo <span className="tabular-nums">({fudo.cargando ? '…' : fudo.items.length})</span></> },
    { value: 'pagados', label: 'Pagos de Fudo registrados' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Clock}
        titulo="Pendientes de pago"
        descripcion="Lo que falta pagar en cada local: los gastos cargados acá y los de Fudo."
        acciones={<AyudaLink seccion="admin" ancla="gastos" />}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<Wallet size={18} />}
          label="De la app"
          value={formatearMonedaExacta(suma(app))}
          detalle={app.length === 0 ? 'Todo al día' : plural(app.length, 'gasto sin pagar', 'gastos sin pagar')}
          tono={app.length > 0 ? 'peligro' : 'exito'}
        />
        {fudo.cargando ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4" aria-live="polite">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-muted">Consultando Fudo…</p>
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
        ) : (
          <KpiCard
            icon={<Store size={18} />}
            label="De Fudo"
            value={fudo.error ? '—' : formatearMonedaExacta(suma(fudo.items))}
            detalle={fudo.error ? 'No se pudo consultar' : plural(fudo.items.length, 'gasto sin pagar', 'gastos sin pagar')}
            tono={fudo.error || fallidas.length ? 'alerta' : 'neutro'}
          />
        )}
      </div>

      <div className="space-y-3">
        <SegmentedControl opciones={opcionesPestana} value={pestana} onChange={setPestana} />
        {pestana !== 'pagados' && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filtrar por local"
              value={local}
              onChange={e => setLocal(e.target.value)}
              className={`${controlClass} min-h-11 w-full sm:w-52`}
            >
              <option value="">Todos los locales</option>
              {locales.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <DateRangePicker desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h) }} ariaLabel="Fecha de los gastos" placeholder="Cualquier fecha" />
            <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar descripción o proveedor" className="w-full sm:w-72" />
            <SegmentedControl
              opciones={[{ value: 'viejos', label: 'Más viejos primero' }, { value: 'nuevos', label: 'Más nuevos primero' }]}
              value={orden}
              onChange={setOrden}
            />
            <ClearFiltersButton visible={hayFiltros} onClick={limpiar} />
          </div>
        )}
      </div>

      {pestana === 'fudo' && !fudo.cargando && (fudo.error || fallidas.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {fudo.error
                ? `No pudimos consultar Fudo: ${fudo.error}`
                : `${fallidas.map(e => e.sucursal).join(', ')} no ${fallidas.length === 1 ? 'respondió' : 'respondieron'}: sus gastos no están en la lista.`}
            </span>
          </p>
          <button type="button" onClick={cargarFudo} className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface2">
            <RefreshCw size={15} /> Volver a consultar
          </button>
        </div>
      )}
      {pestana === 'fudo' && !fudo.cargando && sinConexion.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Store size={15} className="mt-0.5 shrink-0" />
          {sinConexion.map(e => e.sucursal).join(', ')} no {sinConexion.length === 1 ? 'tiene' : 'tienen'} Fudo conectado: sus gastos no aparecen acá.
        </p>
      )}

      {pestana === 'pagados' ? (
        pagadosFudo.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            <EmptyState
              icono={History}
              titulo="Todavía no registraste pagos de Fudo"
              descripcion="Cuando registres el pago de un gasto de Fudo, aparece acá. Si te equivocaste, lo deshacés desde esta lista."
            />
          </div>
        ) : (
          <div className="space-y-2">
            <DataTable filas={pagadosFudo} columnas={columnasPagados} filaKey={f => f.id ?? `${f.sucursal}-${f.fudo_expense_id}`} />
            <p className="px-1 text-xs text-muted">Los últimos 200 pagos registrados. Los de la app se deshacen desde Gastos.</p>
          </div>
        )
      ) : pestana === 'fudo' && fudo.cargando ? (
        <div className="space-y-3" aria-live="polite">
          <p className="text-sm text-muted">Consultando los gastos impagos de cada sucursal en Fudo…</p>
          {[0, 1].map(i => (
            <div key={i} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {(pestana === 'app' ? app : fudo.items).length === 0 ? (
            <EmptyState
              icono={CheckCircle2}
              titulo={pestana === 'fudo' && fudo.error ? 'Sin datos de Fudo' : 'Todo al día'}
              descripcion={pestana === 'app'
                ? 'No hay gastos de la app pendientes de pago.'
                : fudo.error ? 'Volvé a consultar cuando Fudo responda.' : 'Fudo no tiene gastos impagos sin registrar.'}
            />
          ) : (
            <EmptyState
              icono={Wallet}
              titulo="Ningún pendiente coincide con los filtros"
              accion={<ClearFiltersButton visible onClick={limpiar} />}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {hayFiltros && (
            <p className="text-sm text-muted">
              {plural(visibles.length, 'gasto', 'gastos')} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(suma(visibles))}</span>
            </p>
          )}
          {grupos.map(g => (
            <GrupoPendientes key={`${pestana}-${g.local}`} {...g} hoy={hoy} pendiente={isPending} onPagar={setPagando} />
          ))}
        </div>
      )}

      {pagando && (
        <PagoModal
          key={pagando.clave}
          gasto={{
            clave: pagando.clave,
            titulo: pagando.titulo,
            detalle: pagando.detalle,
            local: pagando.local,
            fecha: pagando.fecha,
            monto: pagando.monto,
            origen: pagando.origen,
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
