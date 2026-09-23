'use client'

import { useMemo, useState } from 'react'
import { PackageOpen, Plus, Trash2, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearMoneda } from '@/lib/formato'
import RemitoForm, { type PedidoConItems } from './RemitoForm'
import { revertirYBorrar } from '@/lib/compras/stockRemito'
import type { Remito } from '@/lib/compras/tipos'

interface RemitoRow extends Remito {
  compras_pedidos: { proveedores: { nombre: string } | null } | null
}

interface PedidoItemPD {
  id: string
  item_id: string | null
  descripcion: string
  cantidad: number
  orden: number
}

interface PedidoOption {
  id: string
  estado: 'enviado' | 'cerrado'
  enviado_en: string | null
  proveedores: { nombre: string } | null
  compras_pedido_items: PedidoItemPD[]
}

interface PedidoSinRemito {
  id: string
  proveedorNombre: string
}

function calcularTotal(items: RemitoRow['compras_remito_items']): number {
  return items.reduce((total, i) => total + (i.precio != null ? i.cantidad * i.precio : 0), 0)
}

export default function RemitosClient({
  remitosIniciales,
  pedidos,
  pedidosSinRemito,
  usuarioId,
  pedidoPreseleccionado,
}: {
  remitosIniciales: RemitoRow[]
  pedidos: PedidoOption[]
  pedidosSinRemito: PedidoSinRemito[]
  usuarioId: string
  pedidoPreseleccionado?: string
}) {
  const supabase = createClient()
  const confirmar = useConfirmar()
  const toast = useToast()
  const [remitos, setRemitos] = useState(remitosIniciales)
  const [filtro, setFiltro] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [modalAbierto, setModalAbierto] = useState(!!pedidoPreseleccionado)
  const [pedidoId, setPedidoId] = useState(pedidoPreseleccionado ?? '')
  const [remitoEditando, setRemitoEditando] = useState<Remito | null>(null)

  const hayFiltros = !!filtro || !!desde || !!hasta
  function limpiarFiltros() { setFiltro(''); setDesde(''); setHasta('') }

  const filtrados = useMemo(() => {
    const texto = filtro.trim().toLowerCase()
    return remitos
      .filter(r => !texto ||
        r.numero.toLowerCase().includes(texto) ||
        (r.compras_pedidos?.proveedores?.nombre ?? '').toLowerCase().includes(texto)
      )
      .filter(r => !desde || r.fecha >= desde)
      .filter(r => !hasta || r.fecha <= hasta)
  }, [remitos, filtro, desde, hasta])

  const opcionesPedido: OpcionSelect[] = pedidos.map(p => ({
    value: p.id,
    label: `${p.proveedores?.nombre ?? '—'} — ${p.enviado_en ? new Date(p.enviado_en).toLocaleDateString('es-AR') : 's/f'}`,
    grupo: p.estado === 'enviado' ? 'Enviados' : 'Cerrados',
  }))

  const pedidoSeleccionado = pedidos.find(p => p.id === pedidoId) ?? null

  const pedidoParaForm: PedidoConItems | null = pedidoSeleccionado
    ? {
        id: pedidoSeleccionado.id,
        compras_pedido_items: pedidoSeleccionado.compras_pedido_items,
        compras_remitos: remitos.filter(r => r.pedido_id === pedidoSeleccionado.id),
      }
    : null

  function abrirModalAlta() {
    setPedidoId('')
    setRemitoEditando(null)
    setModalAbierto(true)
  }

  function abrirModalConPedido(id: string) {
    setPedidoId(id)
    setRemitoEditando(null)
    setModalAbierto(true)
  }

  function abrirEdicion(remito: RemitoRow) {
    setPedidoId(remito.pedido_id)
    setRemitoEditando(remito)
    setModalAbierto(true)
  }

  function cerrarModal() {
    setModalAbierto(false)
    setRemitoEditando(null)
  }

  function onGuardado(remito: Remito, reemplazoId: string | null) {
    setRemitos(prev => {
      const proveedores = pedidos.find(p => p.id === remito.pedido_id)?.proveedores ?? null
      const fila: RemitoRow = { ...remito, compras_pedidos: { proveedores } }
      return [...prev.filter(r => r.id !== reemplazoId), fila]
    })
    cerrarModal()
  }

  function borrarRemito(remito: RemitoRow) {
    confirmar({
      titulo: 'Borrar remito',
      mensaje: `¿Borrar el remito ${remito.numero}? El stock cargado por sus líneas se va a revertir.`,
      textoConfirmar: 'Borrar',
      peligroso: true,
      onConfirmar: () => borrarRemitoConfirmado(remito),
    })
  }

  async function borrarRemitoConfirmado(remito: RemitoRow) {
    await revertirYBorrar(supabase, remito, usuarioId)
    setRemitos(prev => prev.filter(r => r.id !== remito.id))
    toast.success('Remito borrado')
  }

  const columnas: Columna<RemitoRow>[] = [
    {
      key: 'proveedor',
      header: 'Proveedor',
      render: r => <span className="font-medium">{r.compras_pedidos?.proveedores?.nombre ?? '—'}</span>,
      ordenar: r => r.compras_pedidos?.proveedores?.nombre ?? '',
    },
    { key: 'numero', header: 'N° Remito', render: r => r.numero, ordenar: r => r.numero },
    { key: 'fecha', header: 'Fecha', render: r => formatearFecha(r.fecha), ordenar: r => r.fecha },
    {
      key: 'lineas',
      header: 'Líneas',
      render: r => r.compras_remito_items.length,
      ordenar: r => r.compras_remito_items.length,
      alinear: 'right',
      ocultarHasta: 'sm',
    },
    {
      key: 'total',
      header: 'Total',
      render: r => formatearMoneda(calcularTotal(r.compras_remito_items)),
      ordenar: r => calcularTotal(r.compras_remito_items),
      alinear: 'right',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      alinear: 'right',
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); borrarRemito(r) }}
          title="Borrar remito"
          aria-label={`Borrar remito ${r.numero}`}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-surface2 transition-colors ml-auto"
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Truck}
        titulo="Remitos"
        descripcion="Cargá los remitos que llegan y asignalos al pedido correspondiente."
        acciones={
          <>
            <AyudaLink seccion="compras-remitos" />
            <button onClick={abrirModalAlta} className="flex items-center gap-1.5 bg-accent hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              <Plus size={16} /> Cargar remito
            </button>
          </>
        }
      />

      {pedidosSinRemito.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <PackageOpen size={18} className="text-warning shrink-0" />
          <p className="text-sm font-semibold text-warning shrink-0">
            {pedidosSinRemito.length} pedido{pedidosSinRemito.length === 1 ? '' : 's'} sin remito:
          </p>
          <div className="flex flex-wrap gap-2">
            {pedidosSinRemito.map(p => (
              <button
                key={p.id}
                onClick={() => abrirModalConPedido(p.id)}
                className="text-xs font-medium text-warning bg-warning-bg hover:opacity-80 border border-warning rounded-full px-3 py-1 transition-opacity"
              >
                {p.proveedorNombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={filtro} onChange={setFiltro} placeholder="Filtrar por N° de remito o proveedor..." className="w-72" />
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-border overflow-hidden">
          <EmptyState
            icono={Truck}
            titulo={remitos.length === 0 ? 'Todavía no hay remitos' : 'Ningún remito coincide con los filtros'}
            descripcion={remitos.length === 0 ? 'Usá "Cargar remito" para registrar el primero.' : undefined}
          />
        </div>
      ) : (
        <DataTable
          filas={filtrados}
          columnas={columnas}
          filaKey={r => r.id}
          onFilaClick={abrirEdicion}
        />
      )}

      <Modal open={modalAbierto} onClose={cerrarModal} title={remitoEditando ? `Editar remito N° ${remitoEditando.numero}` : 'Cargar remito'} size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-accent uppercase tracking-wider mb-1">Pedido</label>
            <SelectBuscador
              value={pedidoId}
              onChange={setPedidoId}
              opciones={opcionesPedido}
              placeholderVacio="Elegí un pedido..."
              disabled={!!remitoEditando}
            />
          </div>

          {pedidoParaForm ? (
            <RemitoForm
              key={remitoEditando?.id ?? pedidoParaForm.id}
              pedido={pedidoParaForm}
              usuarioId={usuarioId}
              remitoEditando={remitoEditando}
              onGuardado={onGuardado}
              onCancelar={cerrarModal}
            />
          ) : (
            <p className="text-faint text-sm py-6 text-center">Elegí un pedido para empezar a cargar el remito.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
