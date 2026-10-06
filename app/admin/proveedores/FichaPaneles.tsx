'use client'

import { useMemo, useState } from 'react'
import { ClipboardList, FileText, Info, Loader2, Package, Star, Tag, Truck, Wallet } from 'lucide-react'
import {
  aEstadoFacturacion, aEstadoRecepcion, diasDesdeEnvio, estaDemorado, estadoVisible, pedidoAbierto,
} from '@/lib/compras/estadoPedido'
import { estadoPago, resumirPagos } from '@/lib/compras/reportes'
import { calcularRangoPreset, fechaEnRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import { codigoPedido, codigoRemito } from '@/lib/compras/codigos'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import KpiCard from '@/components/ui/KpiCard'
import LinkEntidad from '@/components/ui/LinkEntidad'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { ChipGroup, SegmentedControl } from '@/components/ui/Chip'
import PagoFactura from '@/components/compras/PagoFactura'
import {
  LIMITE_FACTURAS, LIMITE_PEDIDOS, LIMITE_REMITOS,
  type FacturaDePedidoProveedor, type FacturaDeProveedor, type InsumoDeProveedor, type PedidoDeProveedor, type RemitoDeProveedor,
} from './datos'

// Paneles de la ficha del proveedor (B3, §6.3). Reciben los datos ya cargados
// por la ficha; undefined = todavía cargando.

export function Cargando() {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-muted justify-center">
      <Loader2 size={16} className="animate-spin" /> Cargando...
    </p>
  )
}

export function ErrorCarga({ mensaje }: { mensaje: string }) {
  return <p role="alert" className="py-6 text-center text-sm text-brand-red">{mensaje}</p>
}

const fecha = (v: string | null) => (v ? formatearFecha(v) : '—')

function Seccion({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{icono}{titulo}</h4>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

interface FilaPedido {
  p: PedidoDeProveedor
  abierto: boolean
  factura: FacturaDePedidoProveedor | null
}

export function PanelPedidos({
  pedidos,
  facturas,
  esAdmin,
  diasDemora,
}: {
  pedidos: PedidoDeProveedor[]
  facturas: FacturaDePedidoProveedor[]
  esAdmin: boolean
  /** B5: compras_config 'pedidos.dias_demora' (default DIAS_DEMORA). */
  diasDemora?: number
}) {
  const filas: FilaPedido[] = useMemo(() => pedidos.map(p => ({
    p,
    abierto: pedidoAbierto({
      estado_recepcion: aEstadoRecepcion(p.estado_recepcion),
      estado_facturacion: aEstadoFacturacion(p.estado_facturacion),
      recibioAlgo: p.compras_remitos.length > 0,
    }),
    factura: facturas.find(f => f.pedido_id === p.id) ?? null,
  })), [pedidos, facturas])
  const abiertos = filas.filter(f => f.abierto)
  const [vista, setVista] = useState<'abiertos' | 'todos' | null>(null)
  const actual = vista ?? (abiertos.length ? 'abiertos' : 'todos')
  const mostradas = actual === 'abiertos' ? abiertos : filas

  const columnas: Columna<FilaPedido>[] = [
    {
      key: 'pedido',
      header: 'Pedido',
      ordenar: f => f.p.numero,
      render: f => <LinkEntidad entidad={{ tipo: 'pedido', id: f.p.id }} className="text-text">{codigoPedido(f.p.numero)}</LinkEntidad>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: f => {
        const er = aEstadoRecepcion(f.p.estado_recepcion)
        const dias = diasDesdeEnvio(f.p.enviado_en)
        const demorado = estaDemorado({ estado_recepcion: er, enviado_en: f.p.enviado_en }, undefined, diasDemora)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <EstadoBadge dominio="compras_pedido" estado={estadoVisible({ estado_recepcion: er, estado_facturacion: aEstadoFacturacion(f.p.estado_facturacion) })} />
            {(er === 'enviado' || er === 'parcial') && dias != null && (
              <span className={`text-xs ${demorado ? 'font-semibold text-warning' : 'text-muted'}`}>
                enviado {dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'creado',
      header: 'Creado',
      ocultarHasta: 'sm',
      ordenar: f => f.p.created_at ?? '',
      render: f => <span className="whitespace-nowrap tabular-nums text-muted">{fecha(f.p.created_at)}</span>,
    },
    {
      key: 'remitos',
      header: 'Remitos',
      alinear: 'right',
      ocultarHasta: 'md',
      render: f => <span className="tabular-nums text-muted">{f.p.compras_remitos.length || '—'}</span>,
    },
    ...(esAdmin ? [{
      key: 'factura',
      header: 'Factura',
      ocultarHasta: 'sm' as const,
      render: (f: FilaPedido) => f.factura
        ? <LinkEntidad entidad={{ tipo: 'factura', id: f.factura.id }} variante="texto" className="whitespace-nowrap text-text">N° {f.factura.numero}</LinkEntidad>
        : <span className="text-muted">Sin facturar</span>,
    }] : []),
  ]

  return (
    <div className="space-y-3">
      <SegmentedControl<'abiertos' | 'todos'>
        opciones={[
          { value: 'abiertos', label: <span className="tabular-nums">Abiertos ({abiertos.length})</span> },
          { value: 'todos', label: <span className="tabular-nums">Todos ({filas.length})</span> },
        ]}
        value={actual}
        onChange={setVista}
      />
      <DataTable
        filas={mostradas}
        columnas={columnas}
        filaKey={f => f.p.id}
        vacio={<EmptyState icono={ClipboardList} titulo={actual === 'abiertos' ? 'No tiene pedidos abiertos' : 'Todavía no tiene pedidos'} />}
      />
      {pedidos.length >= LIMITE_PEDIDOS && <p className="text-xs text-muted">Se muestran los últimos {LIMITE_PEDIDOS}.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Remitos y facturas
// ---------------------------------------------------------------------------

export function PanelRemitos({
  remitos,
  facturas,
  esAdmin,
  errorFacturas,
}: {
  remitos: RemitoDeProveedor[]
  /** undefined = cargando (solo admin). */
  facturas: FacturaDeProveedor[] | undefined
  esAdmin: boolean
  errorFacturas?: string
}) {
  const columnasRemitos: Columna<RemitoDeProveedor>[] = [
    {
      key: 'remito',
      header: 'Remito',
      render: r => (
        <div className="flex flex-col gap-0.5">
          <LinkEntidad entidad={{ tipo: 'remito', id: r.id }} className="text-text">{codigoRemito(r.compras_pedidos.numero, r.secuencia)}</LinkEntidad>
          <span className="text-xs text-muted sm:hidden">{fecha(r.fecha)}</span>
        </div>
      ),
    },
    { key: 'fecha', header: 'Fecha', ocultarHasta: 'sm', render: r => <span className="whitespace-nowrap tabular-nums text-muted">{fecha(r.fecha)}</span> },
    {
      key: 'pedido',
      header: 'Pedido',
      render: r => <LinkEntidad entidad={{ tipo: 'pedido', id: r.compras_pedidos.id }} className="text-muted">{codigoPedido(r.compras_pedidos.numero)}</LinkEntidad>,
    },
    {
      key: 'lineas',
      header: 'Líneas',
      alinear: 'right',
      ocultarHasta: 'md',
      render: r => (
        <span className="whitespace-nowrap tabular-nums text-muted">
          {r.compras_remito_items[0]?.count ?? 0}
          {r.origen === 'factura' && <span className="ml-1.5 text-xs">· desde factura</span>}
        </span>
      ),
    },
  ]

  const listaFacturas = (facturas ?? []).slice(0, LIMITE_FACTURAS)
  const columnasFacturas: Columna<FacturaDeProveedor>[] = [
    {
      key: 'numero',
      header: 'Factura',
      render: f => {
        const anulada = f.estado === 'anulada'
        return (
          <div className={`flex flex-col gap-0.5 ${anulada ? 'line-through decoration-muted' : ''}`} title={anulada && f.anulada_motivo ? `Anulada: ${f.anulada_motivo}` : undefined}>
            {f.id ? <LinkEntidad entidad={{ tipo: 'factura', id: f.id }} variante="texto" className="whitespace-nowrap text-text">N° {f.numero ?? '—'}</LinkEntidad> : <span>N° {f.numero ?? '—'}</span>}
            {f.tipo_comprobante === 'nota_credito' && <span className="text-xs text-muted no-underline">nota de crédito</span>}
            <span className="text-xs text-muted sm:hidden">{fecha(f.fecha)}</span>
          </div>
        )
      },
    },
    { key: 'fecha', header: 'Fecha', ocultarHasta: 'sm', render: f => <span className="whitespace-nowrap tabular-nums text-muted">{fecha(f.fecha)}</span> },
    {
      key: 'pedido',
      header: 'Pedido',
      ocultarHasta: 'md',
      render: f => f.pedido_id && f.pedido_numero != null
        ? <LinkEntidad entidad={{ tipo: 'pedido', id: f.pedido_id }} className="text-muted">{codigoPedido(f.pedido_numero)}</LinkEntidad>
        : <span className="text-muted">—</span>,
    },
    {
      key: 'total',
      header: 'Total',
      alinear: 'right',
      render: f => (
        <span className={`whitespace-nowrap tabular-nums ${f.estado === 'anulada' ? 'text-muted line-through' : 'text-text'}`}>
          {formatearMonedaExacta((f.tipo_comprobante === 'nota_credito' ? -1 : 1) * (f.total ?? 0))}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      ocultarHasta: 'md',
      render: f => f.estado === 'borrador' || f.estado === 'confirmada' || f.estado === 'anulada'
        ? <EstadoBadge dominio="compras_factura" estado={f.estado} />
        : null,
    },
    {
      key: 'pago',
      header: 'Pago',
      render: f => f.estado === 'confirmada' ? <PagoFactura gastoId={f.gasto_id} gastoEstado={f.gasto_estado} aFavor={estadoPago(f) === 'a_favor'} /> : <span className="text-muted">—</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <Seccion titulo="Remitos" icono={<Truck size={13} />}>
        <DataTable
          filas={remitos}
          columnas={columnasRemitos}
          filaKey={r => r.id}
          vacio={<EmptyState icono={Truck} titulo="Todavía no tiene remitos" />}
        />
        {remitos.length >= LIMITE_REMITOS && <p className="text-xs text-muted">Se muestran los últimos {LIMITE_REMITOS}.</p>}
      </Seccion>
      {esAdmin && (
        <Seccion titulo="Facturas" icono={<FileText size={13} />}>
          {errorFacturas ? <ErrorCarga mensaje={errorFacturas} /> : facturas === undefined ? <Cargando /> : (
            <>
              <DataTable
                filas={listaFacturas}
                columnas={columnasFacturas}
                filaKey={f => f.id ?? `${f.numero}-${f.fecha}`}
                filaClassName={f => (f.estado === 'anulada' ? 'opacity-60' : '')}
                vacio={<EmptyState icono={FileText} titulo="Todavía no tiene facturas" />}
              />
              {(facturas.length > LIMITE_FACTURAS) && <p className="text-xs text-muted">Se muestran las últimas {LIMITE_FACTURAS}.</p>}
            </>
          )}
        </Seccion>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cuenta (solo admin, E11)
// ---------------------------------------------------------------------------

type Periodo = 'mes_actual' | 'mes_anterior' | 'este_anio' | 'todo' | 'personalizado'

function rangoDe(periodo: Exclude<Periodo, 'personalizado' | 'todo'>, ahora: Date): RangoFechas {
  if (periodo === 'este_anio') {
    const y = ahora.getFullYear()
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` }
  }
  return calcularRangoPreset(periodo, ahora)
}

export function PanelCuenta({ facturas }: { facturas: FacturaDeProveedor[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes_actual')
  const [personalizado, setPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))

  const confirmadas = useMemo(() => facturas.filter(f => f.estado === 'confirmada'), [facturas])
  const rango = periodo === 'todo' ? null : periodo === 'personalizado' ? personalizado : rangoDe(periodo, new Date())
  const delPeriodo = useMemo(
    () => confirmadas.filter(f => !rango || (f.fecha != null && fechaEnRango(f.fecha, rango))),
    // rango se recalcula en cada render; alcanza con sus fechas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmadas, rango?.desde, rango?.hasta],
  )
  const r = resumirPagos(delPeriodo)
  const pendienteTotal = resumirPagos(confirmadas).pendiente

  const columnas: Columna<FacturaDeProveedor>[] = [
    {
      key: 'numero',
      header: 'Factura',
      render: f => (
        <div className="flex flex-col gap-0.5">
          {f.id ? <LinkEntidad entidad={{ tipo: 'factura', id: f.id }} variante="texto" className="whitespace-nowrap text-text">N° {f.numero ?? '—'}</LinkEntidad> : <span>N° {f.numero ?? '—'}</span>}
          {f.tipo_comprobante === 'nota_credito' && <span className="text-xs text-muted">nota de crédito</span>}
          <span className="text-xs text-muted sm:hidden">{fecha(f.fecha)}</span>
        </div>
      ),
    },
    { key: 'fecha', header: 'Fecha', ocultarHasta: 'sm', ordenar: f => f.fecha ?? '', render: f => <span className="whitespace-nowrap tabular-nums text-muted">{fecha(f.fecha)}</span> },
    {
      key: 'pedido',
      header: 'Pedido',
      ocultarHasta: 'md',
      render: f => f.pedido_id && f.pedido_numero != null
        ? <LinkEntidad entidad={{ tipo: 'pedido', id: f.pedido_id }} className="text-muted">{codigoPedido(f.pedido_numero)}</LinkEntidad>
        : <span className="text-muted">—</span>,
    },
    {
      key: 'total',
      header: 'Total',
      alinear: 'right',
      ordenar: f => (f.tipo_comprobante === 'nota_credito' ? -1 : 1) * (f.total ?? 0),
      render: f => <span className="whitespace-nowrap tabular-nums text-text">{formatearMonedaExacta((f.tipo_comprobante === 'nota_credito' ? -1 : 1) * (f.total ?? 0))}</span>,
    },
    {
      key: 'pago',
      header: 'Pago',
      ordenar: f => estadoPago(f),
      render: f => <PagoFactura gastoId={f.gasto_id} gastoEstado={f.gasto_estado} aFavor={estadoPago(f) === 'a_favor'} />,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup<Periodo>
          opciones={[
            { value: 'mes_actual', label: 'Mes actual' },
            { value: 'mes_anterior', label: 'Mes anterior' },
            { value: 'este_anio', label: 'Este año' },
            { value: 'todo', label: 'Todo' },
            { value: 'personalizado', label: 'Personalizado' },
          ]}
          value={periodo}
          onChange={setPeriodo}
        />
        {periodo === 'personalizado' && (
          <DateRangePicker
            atajos={false}
            limpiable={false}
            desde={personalizado.desde}
            hasta={personalizado.hasta}
            onChange={(desde, hasta) => setPersonalizado({ desde, hasta })}
          />
        )}
      </div>

      <div className={`grid grid-cols-2 gap-3 ${[r.sinGasto, r.aFavor].filter(x => x !== 0).length === 2 ? 'lg:grid-cols-5' : r.sinGasto !== 0 || r.aFavor !== 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <KpiCard icon={<FileText size={18} />} label="Facturado" value={formatearMonedaExacta(r.facturado)} detalle={`${r.facturas} factura${r.facturas === 1 ? '' : 's'}`} />
        <KpiCard icon={<Wallet size={18} />} label="Pagado" value={formatearMonedaExacta(r.pagado)} tono="exito" />
        <KpiCard
          icon={<Wallet size={18} />}
          label="Pendiente"
          value={formatearMonedaExacta(r.pendiente)}
          detalle={r.parcial !== 0 ? `incluye ${formatearMonedaExacta(r.parcial)} de gastos marcados Parcial` : undefined}
          tono={r.pendiente > 0 ? 'alerta' : 'neutro'}
        />
        {r.sinGasto !== 0 && <KpiCard icon={<Info size={18} />} label="Sin gasto" value={formatearMonedaExacta(r.sinGasto)} detalle="facturas sin gasto en Gastos" />}
        {/* B4 (D5): Pagado + Pendiente + Sin gasto + A favor = Facturado. */}
        {r.aFavor !== 0 && (
          <KpiCard
            icon={<Wallet size={18} />}
            label="A favor"
            value={formatearMonedaExacta(r.aFavor)}
            detalle="Notas de crédito que llegaron con el gasto ya pagado: se descuentan del próximo pago (cuenta corriente en noviembre)"
            tono="info"
          />
        )}
      </div>

      <p className={`text-sm ${pendienteTotal > 0 ? 'font-semibold text-warning' : 'text-muted'}`}>
        Pendiente de todas las fechas: <span className="tabular-nums">{formatearMonedaExacta(pendienteTotal)}</span>
      </p>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        No es una cuenta corriente: los pagos parciales y los pagos que no salen de una factura todavía no se registran.
      </p>

      <DataTable
        filas={delPeriodo}
        columnas={columnas}
        filaKey={f => f.id ?? `${f.numero}-${f.fecha}`}
        vacio={<EmptyState icono={FileText} titulo={confirmadas.length ? 'No hay facturas confirmadas en el período' : 'Todavía no tiene facturas confirmadas'} />}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------------------

function sufijo(cobraPor: string | null, unidad: string | null, unidadBase: string | null): string {
  const u = cobraPor === 'base' ? unidadBase : unidad
  return u ? ` / ${u}` : ''
}

function FilaInsumo({ i, esAdmin }: { i: InsumoDeProveedor; esAdmin: boolean }) {
  const distinto = i.ultimo_precio != null && i.precio_ref != null && i.precio_ref > 0
    && i.cobra_por === i.ultimo_precio_por
    && Math.abs(i.ultimo_precio - i.precio_ref) / i.precio_ref > 0.005
  return (
    <li className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {i.item_id
            ? <LinkEntidad entidad={{ tipo: 'insumo', id: i.item_id }} variante="texto" title="Ver el stock de este insumo" className="font-medium text-text">{i.item_nombre}</LinkEntidad>
            : <span className="font-medium text-text">{i.item_nombre}</span>}
          {i.es_principal && <span className="inline-flex items-center gap-1 text-xs text-accent-fg" title="Proveedor principal de este insumo"><Star size={11} fill="currentColor" /> principal</span>}
          {i.item_estado === 'archivado' && <span className="text-xs text-muted">(archivado)</span>}
        </span>
        {i.codigo_proveedor && <span className="block text-xs text-muted">Código del proveedor: {i.codigo_proveedor}</span>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums sm:justify-end sm:text-right">
        <span className="whitespace-nowrap text-muted">
          Ref. {i.precio_ref != null ? `${formatearMonedaExacta(i.precio_ref)}${sufijo(i.cobra_por, i.unidad, i.unidad_base)}` : '—'}
        </span>
        {esAdmin && i.ultimo_precio != null && (
          <span className="whitespace-nowrap">
            <span className={distinto ? 'font-semibold text-warning' : 'text-text'} title={distinto ? 'Distinto del precio de referencia' : undefined}>
              Último {formatearMonedaExacta(i.ultimo_precio)}{sufijo(i.ultimo_precio_por, i.unidad, i.unidad_base)}
            </span>
            {i.ultima_factura_id && i.ultima_factura_fecha && (
              <span className="text-xs text-muted">
                {' · '}
                <LinkEntidad entidad={{ tipo: 'factura', id: i.ultima_factura_id }} variante="texto" title="Ver la factura">{formatearFecha(i.ultima_factura_fecha)}</LinkEntidad>
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

export function PanelInsumos({ insumos, esAdmin }: { insumos: InsumoDeProveedor[]; esAdmin: boolean }) {
  const activos = insumos.filter(i => i.activo)
  const anteriores = insumos.filter(i => !i.activo)
  if (insumos.length === 0) {
    return <EmptyState icono={Package} titulo="Este proveedor no tiene insumos asociados" descripcion="Se asocian desde Compras › Insumos." />
  }
  return (
    <div className="space-y-3">
      {activos.length === 0
        ? <p className="text-sm text-muted">No tiene insumos activos.</p>
        : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {activos.map(i => <FilaInsumo key={`${i.item_id}`} i={i} esAdmin={esAdmin} />)}
          </ul>
        )}
      {anteriores.length > 0 && (
        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm font-medium text-muted">
            <Tag size={14} /> Insumos anteriores ({anteriores.length})
          </summary>
          <ul className="mt-2 divide-y divide-border opacity-70">
            {anteriores.map(i => <FilaInsumo key={`${i.item_id}`} i={i} esAdmin={esAdmin} />)}
          </ul>
        </details>
      )}
    </div>
  )
}
