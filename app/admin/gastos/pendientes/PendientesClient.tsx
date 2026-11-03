'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconCircleCheck, IconClock, IconHistory, IconRefresh, IconRotate, IconBuildingStore, IconWallet,
} from '@tabler/icons-react'
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
import { Puntos } from '@/components/ui/Cargando'
import { controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { usePuedeEntrar } from '@/components/ui/AccesoModulos'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import {
  agruparPorLocal, armarGastos, atraso, filtrarPendientes, paramsDePendientes, pendienteDeFudo, pendienteDeGasto,
  type FiltrosPendientes, type FudoGastoCrudo, type FudoPagadoFila, type GastoFila, type PendienteVista,
} from '@/lib/gastos/modelo'
import { deshacerPagoFudo, masPendientes, registrarPagoFudo, registrarPagoGasto } from '../acciones'
import PagoModal, { type DatosPago } from '../PagoModal'
import { rutaDe } from '@/lib/compras/rutas'

type Pestana = 'app' | 'fudo' | 'pagados'

interface GrupoServidor {
  local: string
  cantidad: number
  total: number
  vencidos: number
  filas: GastoFila[]
}

interface EstadoFudo {
  cargando: boolean
  items: PendienteVista[]
  errores: { sucursal: string; motivo: 'sin_conexion' | 'error'; error: string }[]
  /** Falló la consulta entera (no una sucursal). */
  error: string | null
}

// Secundario: con decenas de filas, un botón amarillo por fila tapaba todo lo demás.
const botonPago = 'presionable min-h-11 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:border-accent hover:bg-surface2 disabled:opacity-50'
const botonMas = 'flex min-h-11 w-full items-center justify-center gap-2 border-t border-border text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-60'

// Un local de Fudo puede tener cientos: se muestran de a tandas.
const POR_TANDA = 15
const TANDA_MAS = 60

function suma(items: PendienteVista[]): number {
  return Math.round(items.reduce((s, i) => s + i.monto, 0) * 100) / 100
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Un gasto pendiente: qué es, de cuándo, si está atrasado, cuánto falta y el botón de pagar. */
function FilaPendiente({ p, hoy, pendiente, onPagar }: { p: PendienteVista; hoy: string; pendiente: boolean; onPagar: (p: PendienteVista) => void }) {
  // Gastos es otro módulo: sin él, el título queda como texto.
  const puedeEntrar = usePuedeEntrar()
  const atrasado = atraso(p, hoy)
  const parcial = p.gasto && p.gasto.pagado > 0
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text">
          {p.origen === 'app' && puedeEntrar(rutaDe({ tipo: 'gasto', id: p.id })) ? (
            <Link href={rutaDe({ tipo: 'gasto', id: p.id })} className="-my-3 inline-block py-3 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4">
              {p.titulo}
            </Link>
          ) : p.titulo}
        </p>
        <p className="text-xs text-muted">
          <span className="tabular-nums">{p.fecha ? formatearFecha(p.fecha) : 'Sin fecha'}</span>
          {atrasado && <span className="font-semibold text-warning"> · {atrasado}</span>}
          {p.detalle && <> · {p.detalle}</>}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className="whitespace-nowrap text-base font-semibold tabular-nums text-text">{formatearMonedaExacta(p.monto)}</p>
        {parcial && <p className="whitespace-nowrap text-2xs text-muted">falta, de <span className="tabular-nums">{formatearMonedaExacta(p.gasto!.monto)}</span></p>}
      </div>
      <button type="button" onClick={() => onPagar(p)} disabled={pendiente} className={`${botonPago} w-full sm:w-auto`}>
        <IconWallet size={15} aria-hidden /> Registrar pago
      </button>
    </li>
  )
}

function EncabezadoGrupo({ local, cantidad, total, vencidos }: { local: string; cantidad: number; total: number; vencidos?: number }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border bg-surface2 px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-text">
        <IconBuildingStore size={15} className="text-accent-fg" aria-hidden /> {local}
      </h2>
      <p className="text-sm text-muted">
        {plural(cantidad, 'gasto', 'gastos')}
        {vencidos ? <span className="font-semibold text-warning"> · {plural(vencidos, 'vencido', 'vencidos')}</span> : null}
        {' · '}<span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(total)}</span>
      </p>
    </header>
  )
}

/** Un local de la app: la primera tanda viene del servidor y "Ver más" pide la siguiente. */
function GrupoApp({ grupo, filtros, hoy, pendiente, onPagar }: {
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
      <EncabezadoGrupo local={grupo.local} cantidad={grupo.cantidad} total={grupo.total} vencidos={grupo.vencidos} />
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

/** Un local de Fudo: todo viene junto del navegador; se muestra de a tandas. */
function GrupoFudo({ local, items, total, hoy, pendiente, onPagar }: {
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
      <EncabezadoGrupo local={local} cantidad={items.length} total={total} />
      <ul className="divide-y divide-border">
        {mostrados.map(p => <FilaPendiente key={p.clave} p={p} hoy={hoy} pendiente={pendiente} onPagar={onPagar} />)}
      </ul>
      {resto > 0 && (
        <button type="button" onClick={() => setVisibles(v => v + TANDA_MAS)} className={botonMas}>
          Ver {Math.min(resto, TANDA_MAS)} más de {local} <span className="text-muted">(quedan {resto})</span>
        </button>
      )}
    </section>
  )
}

export default function PendientesClient({
  grupos,
  totalApp,
  filtros,
  hoy,
  error,
  pagadosFudo,
  cajas,
  formasPago,
  locales,
}: {
  /** De la app, ya filtrados por la base: un renglón por local con su primera tanda. */
  grupos: GrupoServidor[]
  /** Todo lo que se debe de la app, sin filtros (el número de arriba). */
  totalApp: { cantidad: number; total: number }
  filtros: FiltrosPendientes
  hoy: string
  error: boolean
  pagadosFudo: FudoPagadoFila[]
  cajas: string[]
  formasPago: string[]
  locales: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [isPending, startTransition] = useTransition()
  const [navegando, startNav] = useTransition()
  const [pestana, setPestana] = useState<Pestana>('app')
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [pagando, setPagando] = useState<PendienteVista | null>(null)
  const [fudo, setFudo] = useState<EstadoFudo>({ cargando: true, items: [], errores: [], error: null })
  const consulta = useRef(0)

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

  // Fudo se filtra acá con los mismos filtros de la URL (F3 lo pasa a la base).
  const fudoFiltrados = filtrarPendientes(fudo.items, { local: filtros.local, busqueda: filtros.q, desde: filtros.desde, hasta: filtros.hasta })
  const gruposFudo = agruparPorLocal(fudoFiltrados, filtros.orden)
  const hayFiltros = !!filtros.local || !!filtros.q || !!filtros.desde || !!filtros.hasta
  const fallidas = fudo.errores.filter(e => e.motivo !== 'sin_conexion')
  const sinConexion = fudo.errores.filter(e => e.motivo === 'sin_conexion')
  const cantidadApp = grupos.reduce((s, g) => s + g.cantidad, 0)
  const totalAppFiltrado = grupos.reduce((s, g) => s + g.total, 0)
  function limpiar() { setBusqueda(''); ir({ local: '', q: '', desde: '', hasta: '' }) }

  async function pagar(datos: DatosPago): Promise<boolean> {
    const p = pagando
    if (!p) return false
    return await new Promise(resolve => startTransition(async () => {
      const { monto: montoPago, ...resto } = datos
      const r = p.origen === 'app'
        ? await registrarPagoGasto({ id: p.id, ...resto, monto: montoPago })
        : await registrarPagoFudo({
          fudoExpenseId: p.id,
          sucursal: p.local,
          descripcion: p.titulo,
          monto: p.monto,
          fechaGasto: p.fecha || null,
          ...resto,
        })
      if (!r.ok) { toast.error(r.error); resolve(false); return }
      // Los de Fudo los trajo el navegador: se sacan a mano de la lista.
      if (p.origen === 'fudo') setFudo(f => ({ ...f, items: f.items.filter(i => i.clave !== p.clave) }))
      toast.success(`Pago registrado · ${p.titulo} · ${formatearMonedaExacta(montoPago ?? p.monto)}`)
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
          <IconRotate size={13} aria-hidden /> Deshacer
        </button>
      ),
    },
  ]

  const opcionesPestana: { value: Pestana; label: React.ReactNode }[] = [
    { value: 'app', label: <>De la app <span className="tabular-nums">({cantidadApp})</span></> },
    { value: 'fudo', label: <>De Fudo <span className="tabular-nums">({fudo.cargando ? '…' : fudoFiltrados.length})</span></> },
    { value: 'pagados', label: 'Pagos de Fudo registrados' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconClock}
        titulo="Pendientes de pago"
        descripcion="Lo que falta pagar en cada local: los gastos cargados acá y los de Fudo."
        acciones={<AyudaLink seccion="admin" ancla="gastos" />}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<IconWallet size={18} aria-hidden />}
          label="De la app"
          value={formatearMonedaExacta(totalApp.total)}
          detalle={totalApp.cantidad === 0 ? 'Todo al día' : plural(totalApp.cantidad, 'gasto sin pagar', 'gastos sin pagar')}
          tono={totalApp.cantidad > 0 ? 'peligro' : 'exito'}
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
            icon={<IconBuildingStore size={18} aria-hidden />}
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
        )}
      </div>

      {pestana === 'fudo' && !fudo.cargando && (fudo.error || fallidas.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {fudo.error
                ? `No pudimos consultar Fudo: ${fudo.error}`
                : `${fallidas.map(e => e.sucursal).join(', ')} no ${fallidas.length === 1 ? 'respondió' : 'respondieron'}: sus gastos no están en la lista.`}
            </span>
          </p>
          <button type="button" onClick={cargarFudo} className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface2">
            <IconRefresh size={15} aria-hidden /> Volver a consultar
          </button>
        </div>
      )}
      {pestana === 'fudo' && !fudo.cargando && sinConexion.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <IconBuildingStore size={15} className="mt-0.5 shrink-0" aria-hidden />
          {sinConexion.map(e => e.sucursal).join(', ')} no {sinConexion.length === 1 ? 'tiene' : 'tienen'} Fudo conectado: sus gastos no aparecen acá.
        </p>
      )}

      {pestana === 'pagados' ? (
        pagadosFudo.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            <EmptyState
              icono={IconHistory}
              titulo="Todavía no registraste pagos de Fudo"
              descripcion="Cuando registres el pago de un gasto de Fudo, aparece acá. Si te equivocaste, lo deshacés desde esta lista."
            />
          </div>
        ) : (
          <div className="space-y-2">
            <DataTable filas={pagadosFudo} columnas={columnasPagados} filaKey={f => f.id ?? `${f.sucursal}-${f.fudo_expense_id}`} />
            <p className="px-1 text-xs text-muted">Los últimos 200 pagos registrados. Los de la app se anulan desde el gasto.</p>
          </div>
        )
      ) : pestana === 'app' ? (
        error ? (
          <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            No pudimos cargar los pendientes. Recargá la página; si sigue pasando, avisanos.
          </p>
        ) : grupos.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            {hayFiltros ? (
              <EmptyState icono={IconWallet} titulo="Ningún pendiente coincide con los filtros" accion={<ClearFiltersButton visible onClick={limpiar} />} />
            ) : (
              <EmptyState icono={IconCircleCheck} titulo="Todo al día" descripcion="No hay gastos de la app pendientes de pago." />
            )}
          </div>
        ) : (
          <div className={`space-y-4 transition-opacity ${navegando ? 'opacity-60' : ''}`}>
            {hayFiltros && (
              <p className="text-sm text-muted">
                {plural(cantidadApp, 'gasto', 'gastos')} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(totalAppFiltrado)}</span>
              </p>
            )}
            {grupos.map(g => (
              // La clave cambia si cambian sus totales (un pago): vuelve a la primera tanda, ya al día.
              <GrupoApp key={`${g.local}-${g.cantidad}-${g.total}-${filtros.orden}-${filtros.q}-${filtros.desde}-${filtros.hasta}`}
                grupo={g} filtros={filtros} hoy={hoy} pendiente={isPending} onPagar={setPagando} />
            ))}
          </div>
        )
      ) : fudo.cargando ? (
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
      ) : gruposFudo.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {fudo.items.length === 0 ? (
            <EmptyState
              icono={IconCircleCheck}
              titulo={fudo.error ? 'Sin datos de Fudo' : 'Todo al día'}
              descripcion={fudo.error ? 'Volvé a consultar cuando Fudo responda.' : 'Fudo no tiene gastos impagos sin registrar.'}
            />
          ) : (
            <EmptyState icono={IconWallet} titulo="Ningún pendiente coincide con los filtros" accion={<ClearFiltersButton visible onClick={limpiar} />} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {hayFiltros && (
            <p className="text-sm text-muted">
              {plural(fudoFiltrados.length, 'gasto', 'gastos')} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(suma(fudoFiltrados))}</span>
            </p>
          )}
          {gruposFudo.map(g => <GrupoFudo key={`fudo-${g.local}`} {...g} hoy={hoy} pendiente={isPending} onPagar={setPagando} />)}
        </div>
      )}

      {pagando && (
        <PagoModal
          key={pagando.clave}
          gasto={{
            clave: pagando.origen === 'app' ? pagando.id : pagando.clave,
            titulo: pagando.titulo,
            detalle: pagando.detalle,
            local: pagando.local,
            fecha: pagando.fecha,
            monto: pagando.monto,
            montoTotal: pagando.gasto?.monto,
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
