'use client'

import { useMemo, useState } from 'react'
import { Plus, ReceiptText } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { ChipGroup } from '@/components/ui/Chip'
import { useConfirmar } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import FacturaForm from './FacturaForm'
import {
  armarVistas, coincideBusqueda, entraEnFiltro, esperandoFactura,
  type FacturaVista, type FiltroFacturas,
} from './modelo'
import type { FacturaFila, FacturaItemFila, InsumoFactura, PedidoFactura, PrecioRef } from './datos'
import type { LineaPendiente } from '../datos'

type Abierto = { facturaId: string } | { pedidoId: string | null } | null

const FILTROS: { value: FiltroFacturas; label: string }[] = [
  { value: 'activas', label: 'Activas' },
  { value: 'borradores', label: 'Borradores' },
  { value: 'confirmadas', label: 'Confirmadas' },
  { value: 'anuladas', label: 'Anuladas' },
  { value: 'todas', label: 'Todas' },
]

export default function FacturasClient({
  facturas,
  items,
  pedidos,
  lineas,
  precios,
  insumos,
  stock,
  pedidoInicial,
  facturaInicial,
}: {
  facturas: FacturaFila[]
  items: FacturaItemFila[]
  pedidos: PedidoFactura[]
  lineas: LineaPendiente[]
  precios: PrecioRef[]
  insumos: InsumoFactura[]
  stock: { item_id: string; cantidad: number }[]
  pedidoInicial?: string
  facturaInicial?: string
}) {
  const confirmar = useConfirmar()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroFacturas>('activas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierto, setAbierto] = useState<Abierto>(
    facturaInicial ? { facturaId: facturaInicial } : pedidoInicial ? { pedidoId: pedidoInicial } : null,
  )
  const [conCambios, setConCambios] = useState(false)

  // Todo sale de las props: las acciones llaman a refresh() y la pantalla se
  // vuelve a armar con lo que quedó en la base.
  const vistas = useMemo(() => armarVistas(facturas), [facturas])
  const esperando = useMemo(() => esperandoFactura(pedidos, vistas), [pedidos, vistas])
  const stockPorItem = useMemo(() => Object.fromEntries(stock.map(s => [s.item_id, s.cantidad])), [stock])
  const itemsPorFactura = useMemo(() => {
    const m = new Map<string, FacturaItemFila[]>()
    for (const i of items) m.set(i.factura_id, [...(m.get(i.factura_id) ?? []), i])
    return m
  }, [items])

  const hayFiltros = !!busqueda || filtro !== 'activas' || !!desde || !!hasta
  const filtradas = useMemo(() => vistas
    .filter(v => entraEnFiltro(v, filtro))
    .filter(v => coincideBusqueda(v, busqueda))
    .filter(v => !desde || v.fecha >= desde)
    .filter(v => !hasta || v.fecha <= hasta), [vistas, filtro, busqueda, desde, hasta])

  function limpiarFiltros() { setBusqueda(''); setFiltro('activas'); setDesde(''); setHasta('') }

  function abrir(a: Abierto) {
    setAbierto(a)
    setConCambios(false)
  }

  function cerrarYa() {
    setAbierto(null)
    setConCambios(false)
  }

  function cerrar() {
    if (!conCambios) { cerrarYa(); return }
    confirmar({
      titulo: 'Descartar cambios',
      mensaje: 'Tenés cambios sin guardar en la factura. ¿Descartarlos?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir editando',
      peligroso: true,
      onConfirmar: cerrarYa,
    })
  }

  const facturaAbierta = abierto && 'facturaId' in abierto
    ? vistas.find(v => v.id === abierto.facturaId) ?? null
    : null
  const modalAbierto = abierto != null && (!('facturaId' in abierto) || facturaAbierta != null)

  const columnas: Columna<FacturaVista>[] = [
    {
      key: 'numero',
      header: 'Factura',
      render: v => (
        <span className={`whitespace-nowrap font-mono tabular-nums font-medium ${v.estado === 'anulada' ? 'text-muted line-through' : 'text-text'}`}>
          {v.numero}
        </span>
      ),
      ordenar: v => v.numero,
    },
    {
      key: 'pedido',
      header: 'Pedido',
      render: v => <span className="font-mono tabular-nums text-muted">{v.codigo}</span>,
      ordenar: v => v.pedidoNumero ?? 0,
      ocultarHasta: 'sm',
    },
    { key: 'proveedor', header: 'Proveedor', render: v => <span className="font-medium">{v.proveedor}</span>, ordenar: v => v.proveedor },
    {
      key: 'fecha',
      header: 'Fecha',
      render: v => <span className="whitespace-nowrap">{v.fecha ? formatearFecha(v.fecha) : '—'}</span>,
      ordenar: v => v.fecha,
      ocultarHasta: 'sm',
    },
    {
      key: 'vence',
      header: 'Vence',
      render: v => <span className={`whitespace-nowrap ${v.vencimiento ? '' : 'text-muted'}`}>{v.vencimiento ? formatearFecha(v.vencimiento) : '—'}</span>,
      ordenar: v => v.vencimiento ?? '',
      ocultarHasta: 'lg',
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      alinear: 'right',
      render: v => <span className="whitespace-nowrap tabular-nums text-muted">{formatearMonedaExacta(v.subtotal)}</span>,
      ordenar: v => v.subtotal,
      ocultarHasta: 'xl',
    },
    {
      key: 'iva',
      header: 'IVA',
      alinear: 'right',
      render: v => <span className="whitespace-nowrap tabular-nums text-muted">{formatearMonedaExacta(v.iva)}</span>,
      ordenar: v => v.iva,
      ocultarHasta: 'xl',
    },
    {
      key: 'total',
      header: 'Total',
      alinear: 'right',
      render: v => (
        <span className={`whitespace-nowrap tabular-nums font-semibold ${v.estado === 'anulada' ? 'text-muted line-through' : 'text-text'}`}>
          {formatearMonedaExacta(v.total)}
        </span>
      ),
      ordenar: v => v.total,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: v => <EstadoBadge dominio="compras_factura" estado={v.estado} />,
      ordenar: v => v.estado,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={ReceiptText}
        titulo="Facturas"
        descripcion="Cargá la factura del proveedor de cada pedido. El IVA y el total se calculan solos."
        acciones={
          <>
            <AyudaLink seccion="compras-facturas" />
            <button
              type="button"
              onClick={() => abrir({ pedidoId: null })}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Plus size={16} /> Cargar factura
            </button>
          </>
        }
      />

      {esperando.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <ReceiptText size={17} className="shrink-0 text-accent-fg" />
            {esperando.length === 1 ? '1 pedido esperando su factura' : `${esperando.length} pedidos esperando su factura`}
          </p>
          <div className="flex flex-wrap gap-2">
            {esperando.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir({ pedidoId: p.id })}
                className="presionable min-h-11 sm:min-h-9 rounded-full border border-border bg-surface2 px-3 text-xs font-medium text-text hover:border-accent"
              >
                <span className="font-mono tabular-nums">{codigoPedido(p.numero)}</span> · {p.proveedores?.nombre ?? '—'}
                {p.estado_recepcion === 'parcial' && <span className="text-muted"> · parcial</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <ChipGroup opciones={FILTROS} value={filtro} onChange={setFiltro} />
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar número de factura, P-0001 o proveedor" className="w-full sm:w-80" />
          <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
          <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {facturas.length === 0 ? (
            <EmptyState
              icono={ReceiptText}
              titulo="Todavía no hay facturas"
              descripcion="Cuando llegue la factura de un pedido, cargala acá: el pedido pasa a Facturado y queda el detalle de lo que se pagó."
            />
          ) : (
            <EmptyState
              icono={ReceiptText}
              titulo="Ninguna factura coincide con la búsqueda"
              accion={<ClearFiltersButton visible onClick={limpiarFiltros} />}
            />
          )}
        </div>
      ) : (
        <DataTable filas={filtradas} columnas={columnas} filaKey={v => v.id} onFilaClick={v => abrir({ facturaId: v.id })} />
      )}

      <Modal
        open={modalAbierto}
        onClose={cerrar}
        title={facturaAbierta ? `Factura ${facturaAbierta.numero}` : 'Cargar factura'}
        encabezado={facturaAbierta
          ? <>Factura <span className="font-mono tabular-nums">{facturaAbierta.numero}</span></>
          : undefined}
        size="xl"
        pantallaCompletaMobile
      >
        {modalAbierto && (
          <FacturaForm
            key={facturaAbierta?.id ?? (abierto && 'pedidoId' in abierto ? abierto.pedidoId ?? 'nueva' : 'nueva')}
            factura={facturaAbierta}
            items={facturaAbierta ? itemsPorFactura.get(facturaAbierta.id) ?? [] : []}
            facturas={vistas}
            pedidos={pedidos}
            pedidoIdInicial={abierto && 'pedidoId' in abierto ? abierto.pedidoId : null}
            lineas={lineas}
            precios={precios}
            insumos={insumos}
            stockPorItem={stockPorItem}
            onCambios={() => setConCambios(true)}
            onListo={cerrarYa}
            onCancelar={cerrar}
          />
        )}
      </Modal>
    </div>
  )
}
