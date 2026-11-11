'use client'

import { useMemo, useState } from 'react'
import { PackageOpen, Plus, Truck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { useConfirmar } from '@/components/ui/ProveedorUI'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import { formatearFecha } from '@/lib/formato'
import { codigoPedido, codigoRemito } from '@/lib/compras/codigos'
import { porcentajeRecibido } from '../modelo'
import RemitoForm from './RemitoForm'
import type { InsumoRemito, LineaPedido, PedidoRemito, RemitoFila } from './datos'

interface RemitoVista {
  fila: RemitoFila
  codigo: string
  pedido: PedidoRemito | null
  proveedor: string
  facturado: boolean
  /** Cuánto del pedido trajo este remito, 0–100 (mismo criterio que "Recibido" en Pedidos). */
  porcentaje: number | null
}

type Abierto = { remitoId: string } | { pedidoId: string | null } | null

/** De dónde salió el pedido: la tanda semanal (base) o lo que pidió el conteo (complementario). */
function origenPedido(p: PedidoRemito): string | null {
  if (!p.solicitud_id) return null
  return p.compras_solicitudes?.tipo === 'base' ? 'Pedido base' : 'Complementario'
}

// Busca por código de remito ("R-0025-02", "25-02"), de pedido ("P-0025"),
// número impreso del proveedor o nombre del proveedor.
function coincide(r: RemitoVista, busqueda: string): boolean {
  const texto = busqueda.trim().toLowerCase()
  if (!texto) return true
  if (r.proveedor.toLowerCase().includes(texto)) return true
  if (r.fila.numero?.toLowerCase().includes(texto)) return true
  if (r.codigo.toLowerCase().includes(texto)) return true
  if (r.pedido && codigoPedido(r.pedido.numero).toLowerCase().includes(texto)) return true
  const m = texto.replace(/^[rp]-?/, '').match(/^0*(\d+)(?:-0*(\d+))?$/)
  if (!m || !r.pedido) return false
  return Number(m[1]) === r.pedido.numero && (m[2] == null || Number(m[2]) === r.fila.secuencia)
}

export default function RemitosClient({
  remitos,
  pedidos,
  lineas,
  stock,
  insumos,
  pedidoInicial,
  remitoInicial,
}: {
  remitos: RemitoFila[]
  pedidos: PedidoRemito[]
  lineas: LineaPedido[]
  stock: { item_id: string; cantidad: number }[]
  insumos: InsumoRemito[]
  pedidoInicial?: string
  remitoInicial?: string
}) {
  const confirmar = useConfirmar()
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierto, setAbierto] = useState<Abierto>(
    remitoInicial ? { remitoId: remitoInicial } : pedidoInicial ? { pedidoId: pedidoInicial } : null,
  )
  const [conCambios, setConCambios] = useState(false)
  const quitarParams = useQuitarParams('remito', 'pedido')
  useAlCambiarParam(remitoInicial, id => abrir({ remitoId: id }))
  useAlCambiarParam(pedidoInicial, id => abrir({ pedidoId: id }))

  // Todo sale de las props: las acciones llaman a refresh() y la pantalla se
  // vuelve a armar con lo que quedó en la base.
  const pedidoPorId = useMemo(() => new Map(pedidos.map(p => [p.id, p])), [pedidos])
  const stockPorItem = useMemo(() => Object.fromEntries(stock.map(s => [s.item_id, s.cantidad])), [stock])

  const lineasPorPedido = useMemo(() => {
    const m = new Map<string, LineaPedido[]>()
    for (const l of lineas) {
      if (!l.pedido_id) continue
      m.set(l.pedido_id, [...(m.get(l.pedido_id) ?? []), l])
    }
    return m
  }, [lineas])

  const vistas = useMemo<RemitoVista[]>(() => remitos.map(fila => {
    const pedido = pedidoPorId.get(fila.pedido_id) ?? null
    const delPedido = (lineasPorPedido.get(fila.pedido_id) ?? []).map(l => ({
      cantidad: l.cantidad,
      recibido: fila.compras_remito_items
        .filter(ri => ri.pedido_item_id === l.pedido_item_id)
        .reduce((t, ri) => t + ri.cantidad, 0),
    }))
    return {
      fila,
      pedido,
      codigo: pedido ? codigoRemito(pedido.numero, fila.secuencia) : '—',
      proveedor: pedido?.proveedores?.nombre ?? '—',
      facturado: pedido?.estado_facturacion === 'facturado',
      porcentaje: delPedido.length ? porcentajeRecibido(delPedido) : null,
    }
  }), [remitos, pedidoPorId, lineasPorPedido])

  const esperando = useMemo(
    () => pedidos.filter(p => p.estado_recepcion === 'enviado' || p.estado_recepcion === 'parcial'),
    [pedidos],
  )

  const hayFiltros = !!busqueda || !!desde || !!hasta
  const filtrados = useMemo(() => vistas
    .filter(r => coincide(r, busqueda))
    .filter(r => !desde || r.fila.fecha >= desde)
    .filter(r => !hasta || r.fila.fecha <= hasta), [vistas, busqueda, desde, hasta])

  function limpiarFiltros() { setBusqueda(''); setDesde(''); setHasta('') }

  function abrir(a: Abierto) {
    setAbierto(a)
    setConCambios(false)
  }

  function cerrarYa() {
    quitarParams()
    setAbierto(null)
    setConCambios(false)
  }

  function cerrar() {
    if (!conCambios) { cerrarYa(); return }
    confirmar({
      titulo: 'Descartar cambios',
      mensaje: 'Tenés cambios sin guardar en el remito. ¿Descartarlos?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir editando',
      peligroso: true,
      onConfirmar: cerrarYa,
    })
  }

  const remitoAbierto = abierto && 'remitoId' in abierto
    ? vistas.find(v => v.fila.id === abierto.remitoId) ?? null
    : null
  const modalAbierto = abierto != null && (!('remitoId' in abierto) || remitoAbierto != null)

  const columnas: Columna<RemitoVista>[] = [
    {
      key: 'codigo',
      header: 'Remito',
      render: r => <span className="whitespace-nowrap font-mono tabular-nums font-medium text-text">{r.codigo}</span>,
      ordenar: r => r.codigo,
    },
    {
      key: 'pedido',
      header: 'Pedido',
      render: r => r.pedido
        ? <LinkEntidad entidad={{ tipo: 'pedido', id: r.pedido.id }} className="text-muted">{codigoPedido(r.pedido.numero)}</LinkEntidad>
        : <span className="text-muted">—</span>,
      ordenar: r => r.pedido?.numero ?? 0,
      ocultarHasta: 'sm',
    },
    {
      key: 'numero',
      header: 'N° proveedor',
      render: r => r.fila.numero
        ? <span className="whitespace-nowrap font-mono tabular-nums text-text">{r.fila.numero}</span>
        : <span className="text-muted">—</span>,
      ordenar: r => r.fila.numero ?? '',
      ocultarHasta: 'sm',
    },
    { key: 'proveedor', header: 'Proveedor', render: r => <span className="font-medium">{r.proveedor}</span>, ordenar: r => r.proveedor },
    { key: 'fecha', header: 'Llegó', render: r => formatearFecha(r.fila.fecha), ordenar: r => r.fila.fecha, ocultarHasta: 'sm' },
    {
      key: 'lineas',
      header: 'Líneas',
      render: r => r.fila.compras_remito_items.length,
      ordenar: r => r.fila.compras_remito_items.length,
      alinear: 'right',
      ocultarHasta: 'md',
    },
    {
      key: 'porcentaje',
      header: 'Del pedido',
      alinear: 'right',
      render: r => r.porcentaje == null
        ? <span className="text-muted">—</span>
        : <span className="tabular-nums font-semibold">{r.porcentaje}%</span>,
      ordenar: r => r.porcentaje ?? -1,
      ocultarHasta: 'sm',
    },
    {
      key: 'estado',
      header: 'Estado',
      render: r => <EstadoBadge dominio="compras_remito" estado={r.facturado ? 'facturado' : 'no_facturado'} />,
      ordenar: r => (r.facturado ? 1 : 0),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Truck}
        titulo="Remitos"
        descripcion="Registrá lo que llega de cada pedido. El stock se suma solo al guardar."
        acciones={
          <>
            <AyudaLink seccion="compras-remitos" />
            <button
              type="button"
              onClick={() => abrir({ pedidoId: null })}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Plus size={16} /> Cargar remito
            </button>
          </>
        }
      />

      {esperando.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <PackageOpen size={17} className="shrink-0 text-accent-fg" />
            {esperando.length === 1 ? '1 pedido esperando mercadería' : `${esperando.length} pedidos esperando mercadería`}
          </p>
          <div className="flex flex-wrap gap-2">
            {esperando.map(p => {
              const origen = origenPedido(p)
              return (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir({ pedidoId: p.id })}
                className="presionable min-h-11 sm:min-h-9 rounded-full border border-border bg-surface2 px-3 text-xs font-medium text-text hover:border-accent"
              >
                <span className="font-mono tabular-nums">{codigoPedido(p.numero)}</span> · {p.proveedores?.nombre ?? '—'}
                {origen && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${origen === 'Pedido base' ? 'bg-info-bg text-info' : 'bg-accent-bg text-accent-fg'}`}>
                    {origen}
                  </span>
                )}
                {p.estado_recepcion === 'parcial' && <span className="text-muted"> · parcial</span>}
              </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar remito, pedido, N° o proveedor" className="w-full sm:w-80" />
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      {filtrados.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {remitos.length === 0 ? (
            <EmptyState icono={Truck} titulo="Todavía no hay remitos" descripcion="Cuando llegue mercadería de un pedido enviado, usá “Cargar remito”." />
          ) : (
            <EmptyState
              icono={Truck}
              titulo="Ningún remito coincide con la búsqueda"
              accion={<ClearFiltersButton visible onClick={limpiarFiltros} />}
            />
          )}
        </div>
      ) : (
        <DataTable filas={filtrados} columnas={columnas} filaKey={r => r.fila.id} onFilaClick={r => abrir({ remitoId: r.fila.id })} />
      )}

      <Modal
        open={modalAbierto}
        onClose={cerrar}
        title={remitoAbierto ? `Remito ${remitoAbierto.codigo}` : 'Cargar remito'}
        encabezado={remitoAbierto ? <>Remito <span className="font-mono tabular-nums">{remitoAbierto.codigo}</span></> : undefined}
        size="xl"
        pantallaCompletaMobile
      >
        {modalAbierto && (
          <RemitoForm
            key={remitoAbierto?.fila.id ?? (abierto && 'pedidoId' in abierto ? abierto.pedidoId ?? 'nuevo' : 'nuevo')}
            remito={remitoAbierto?.fila ?? null}
            pedidos={pedidos}
            pedidoIdInicial={abierto && 'pedidoId' in abierto ? abierto.pedidoId : null}
            lineas={lineas}
            remitos={remitos}
            stockPorItem={stockPorItem}
            insumos={insumos}
            onCambios={() => setConCambios(true)}
            onListo={cerrarYa}
            onCancelar={cerrar}
          />
        )}
      </Modal>
    </div>
  )
}
