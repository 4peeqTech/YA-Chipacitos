'use client'

import { useMemo, useState } from 'react'
import { PackageOpen, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToasts, ToastStack } from '@/components/ui/Toast'
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

type Columna = 'proveedor' | 'numero' | 'fecha' | 'lineas' | 'total'

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
  const { confirmar, dialog: confirmDialog } = useConfirm()
  const toast = useToasts()
  const [remitos, setRemitos] = useState(remitosIniciales)
  const [filtro, setFiltro] = useState('')
  const [sortCampo, setSortCampo] = useState<Columna>('fecha')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const [modalAbierto, setModalAbierto] = useState(!!pedidoPreseleccionado)
  const [pedidoId, setPedidoId] = useState(pedidoPreseleccionado ?? '')
  const [remitoEditando, setRemitoEditando] = useState<Remito | null>(null)

  function ordenarPor(campo: Columna) {
    if (campo === sortCampo) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortCampo(campo); setSortDir(1) }
  }

  const filtrados = useMemo(() => {
    const texto = filtro.trim().toLowerCase()
    const porTexto = texto
      ? remitos.filter(r =>
          r.numero.toLowerCase().includes(texto) ||
          (r.compras_pedidos?.proveedores?.nombre ?? '').toLowerCase().includes(texto)
        )
      : remitos

    return [...porTexto].sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortCampo === 'proveedor') {
        va = a.compras_pedidos?.proveedores?.nombre ?? ''
        vb = b.compras_pedidos?.proveedores?.nombre ?? ''
      } else if (sortCampo === 'numero') {
        va = a.numero
        vb = b.numero
      } else if (sortCampo === 'lineas') {
        va = a.compras_remito_items.length
        vb = b.compras_remito_items.length
      } else if (sortCampo === 'total') {
        va = calcularTotal(a.compras_remito_items)
        vb = calcularTotal(b.compras_remito_items)
      } else {
        va = a.fecha
        vb = b.fecha
      }
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [remitos, filtro, sortCampo, sortDir])

  function flecha(campo: Columna) {
    return campo === sortCampo ? (sortDir === 1 ? ' ▲' : ' ▼') : ''
  }

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

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider cursor-pointer select-none"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Remitos</h1>
          <p className="text-[#888] text-sm mt-0.5">Cargá los remitos que llegan y asignalos al pedido correspondiente.</p>
        </div>
        <button onClick={abrirModalAlta} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Cargar remito
        </button>
      </div>

      {pedidosSinRemito.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-yellow-800 bg-yellow-900/20 px-4 py-3">
          <PackageOpen size={18} className="text-yellow-400 shrink-0" />
          <p className="text-sm font-semibold text-yellow-100 shrink-0">
            {pedidosSinRemito.length} pedido{pedidosSinRemito.length === 1 ? '' : 's'} sin remito:
          </p>
          <div className="flex flex-wrap gap-2">
            {pedidosSinRemito.map(p => (
              <button
                key={p.id}
                onClick={() => abrirModalConPedido(p.id)}
                className="text-xs font-medium text-yellow-200 bg-yellow-900/40 hover:bg-yellow-900/60 border border-yellow-800 rounded-full px-3 py-1 transition-colors"
              >
                {p.proveedorNombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        placeholder="Filtrar por N° de remito o proveedor..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
      />

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay remitos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className={thClass} onClick={() => ordenarPor('proveedor')}>Proveedor{flecha('proveedor')}</th>
                  <th className={thClass} onClick={() => ordenarPor('numero')}>N° Remito{flecha('numero')}</th>
                  <th className={thClass} onClick={() => ordenarPor('fecha')}>Fecha{flecha('fecha')}</th>
                  <th className={thClass} onClick={() => ordenarPor('lineas')}>Líneas{flecha('lineas')}</th>
                  <th className={thClass} onClick={() => ordenarPor('total')}>Total{flecha('total')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(r => (
                  <tr key={r.id} onClick={() => abrirEdicion(r)} className="hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{r.compras_pedidos?.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-[#888]">{r.numero}</td>
                    <td className="px-4 py-3 text-[#888]">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#888]">{r.compras_remito_items.length}</td>
                    <td className="px-4 py-3 text-[#888]">{calcularTotal(r.compras_remito_items).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={e => { e.stopPropagation(); borrarRemito(r) }}
                          title="Borrar remito"
                          aria-label={`Borrar remito ${r.numero}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalAbierto} onClose={cerrarModal} title={remitoEditando ? `Editar remito N° ${remitoEditando.numero}` : 'Cargar remito'} size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1">Pedido</label>
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
            <p className="text-[#666] text-sm py-6 text-center">Elegí un pedido para empezar a cargar el remito.</p>
          )}
        </div>
      </Modal>

      {confirmDialog}
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
