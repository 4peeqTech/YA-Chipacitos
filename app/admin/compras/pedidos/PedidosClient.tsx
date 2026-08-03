'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { construirMensajePedido, linkWhatsApp } from '@/lib/compras/pedidoMensaje'
import RemitosPedido, { type Remito } from './RemitosPedido'

interface Proveedor {
  id: string
  nombre: string
  local: string | null
  contacto_telefono: string | null
  maneja_stock: boolean
}

interface CompraItem {
  id: string
  proveedor_id: string
  nombre: string
  unidad: string
  meta_semanal: number
}

interface StockActual {
  item_id: string
  cantidad: number
}

interface PedidoItem {
  id: string
  pedido_id: string
  item_id: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  orden: number
}

interface Pedido {
  id: string
  proveedor_id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  mensaje: string | null
  created_at: string
  enviado_en: string | null
  cerrado_en: string | null
  proveedores: Proveedor
  compras_pedido_items: PedidoItem[]
  compras_remitos: Remito[]
}

type FiltroPedidos = 'activos' | 'todos'

// Fila local del editor de ítems: id/pedido_id quedan sin definir hasta guardar.
type ItemEditor = Pick<PedidoItem, 'item_id' | 'descripcion' | 'unidad' | 'cantidad'>

export default function PedidosClient({
  proveedores,
  itemsCatalogo,
  stockInicial,
  pedidosIniciales,
  usuarioId,
}: {
  proveedores: Proveedor[]
  itemsCatalogo: CompraItem[]
  stockInicial: StockActual[]
  pedidosIniciales: Pedido[]
  usuarioId: string
}) {
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciales)
  const [filtro, setFiltro] = useState<FiltroPedidos>('activos')
  const [proveedorNuevo, setProveedorNuevo] = useState('')
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [itemsEditor, setItemsEditor] = useState<ItemEditor[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const stockPorItem = Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad]))

  const pedidosFiltrados = pedidos.filter(p =>
    filtro === 'todos' ? true : p.estado === 'borrador' || p.estado === 'enviado'
  )

  function abrirEditor(pedido: Pedido) {
    setPedidoEditando(pedido)
    setItemsEditor(
      [...pedido.compras_pedido_items]
        .sort((a, b) => a.orden - b.orden)
        .map(i => ({ item_id: i.item_id, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad }))
    )
    setError('')
  }

  function cerrarEditor() {
    setPedidoEditando(null)
    setItemsEditor([])
  }

  async function crearPedido() {
    if (!proveedorNuevo) { setError('Elegí un proveedor'); return }
    const proveedor = proveedores.find(p => p.id === proveedorNuevo)
    if (!proveedor) return
    setError('')

    startTransition(async () => {
      const { data: pedido, error: errPedido } = await supabase
        .from('compras_pedidos')
        .insert([{ proveedor_id: proveedor.id, estado: 'borrador', creado_por: usuarioId }])
        .select()
        .single()
      if (errPedido) { setError(errPedido.message); return }

      let itemsSugeridos: ItemEditor[] = []
      if (proveedor.maneja_stock) {
        itemsSugeridos = itemsCatalogo
          .filter(i => i.proveedor_id === proveedor.id)
          .map(i => ({
            item_id: i.id,
            descripcion: i.nombre,
            unidad: i.unidad,
            cantidad: Math.max(0, i.meta_semanal - (stockPorItem[i.id] ?? 0)),
          }))
          .filter(i => i.cantidad > 0)
      }

      const nuevoPedido: Pedido = { ...pedido, proveedores: proveedor, compras_pedido_items: [], compras_remitos: [] }
      setPedidos(prev => [nuevoPedido, ...prev])
      setProveedorNuevo('')
      abrirEditor(nuevoPedido)
      setItemsEditor(itemsSugeridos)
    })
  }

  function agregarItemLibre() {
    setItemsEditor(prev => [...prev, { item_id: null, descripcion: '', unidad: '', cantidad: 0 }])
  }

  function actualizarItemEditor(index: number, cambios: Partial<ItemEditor>) {
    setItemsEditor(prev => prev.map((it, i) => i === index ? { ...it, ...cambios } : it))
  }

  function quitarItemEditor(index: number) {
    setItemsEditor(prev => prev.filter((_, i) => i !== index))
  }

  async function guardarItems(): Promise<PedidoItem[] | null> {
    if (!pedidoEditando) return null
    setError('')

    const filas = itemsEditor
      .filter(i => i.descripcion.trim() && i.cantidad > 0)
      .map((i, idx) => ({
        pedido_id: pedidoEditando.id,
        item_id: i.item_id,
        descripcion: i.descripcion.trim(),
        unidad: i.unidad?.trim() || null,
        cantidad: i.cantidad,
        orden: idx,
      }))

    const { error: errDelete } = await supabase.from('compras_pedido_items').delete().eq('pedido_id', pedidoEditando.id)
    if (errDelete) { setError(errDelete.message); return null }

    let itemsGuardados: PedidoItem[] = []
    if (filas.length) {
      const { data, error: errInsert } = await supabase.from('compras_pedido_items').insert(filas).select()
      if (errInsert) { setError(errInsert.message); return null }
      itemsGuardados = data
    }

    setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, compras_pedido_items: itemsGuardados } : p))
    setPedidoEditando(prev => prev ? { ...prev, compras_pedido_items: itemsGuardados } : prev)
    return itemsGuardados
  }

  async function generarMensaje() {
    if (!pedidoEditando) return
    setError('')

    startTransition(async () => {
      const itemsGuardados = await guardarItems()
      if (!itemsGuardados) return
      if (!itemsGuardados.length) { setError('Agregá al menos un ítem antes de generar el mensaje'); return }

      const mensaje = construirMensajePedido(pedidoEditando.proveedores.nombre, pedidoEditando.proveedores.local, itemsGuardados)

      const { data, error: errUpdate } = await supabase
        .from('compras_pedidos')
        .update({ mensaje })
        .eq('id', pedidoEditando.id)
        .select()
        .single()
      if (errUpdate) { setError(errUpdate.message); return }

      setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, mensaje: data.mensaje } : p))
      setPedidoEditando(prev => prev ? { ...prev, mensaje: data.mensaje } : prev)
    })
  }

  async function enviarWhatsApp() {
    if (!pedidoEditando?.mensaje) return
    const url = linkWhatsApp(pedidoEditando.proveedores.contacto_telefono, pedidoEditando.mensaje)
    window.open(url, '_blank')

    const { data, error: err } = await supabase
      .from('compras_pedidos')
      .update({ estado: 'enviado', enviado_en: new Date().toISOString() })
      .eq('id', pedidoEditando.id)
      .select()
      .single()
    if (err) { setError(err.message); return }

    setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, ...data } : p))
    setPedidoEditando(prev => prev ? { ...prev, ...data } : prev)
  }

  async function cerrarPedido(pedido: Pedido) {
    if (!confirm(`¿Cerrar el pedido a ${pedido.proveedores.nombre}?`)) return
    const { data, error: err } = await supabase
      .from('compras_pedidos')
      .update({ estado: 'cerrado', cerrado_en: new Date().toISOString() })
      .eq('id', pedido.id)
      .select()
      .single()
    if (err) { setError(err.message); return }

    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, ...data } : p))
    if (pedidoEditando?.id === pedido.id) setPedidoEditando(prev => prev ? { ...prev, ...data } : prev)
  }

  function actualizarRemitos(pedidoId: string, remitos: Remito[]) {
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, compras_remitos: remitos } : p))
    setPedidoEditando(prev => prev && prev.id === pedidoId ? { ...prev, compras_remitos: remitos } : prev)
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  const estadoBadgeClass: Record<Pedido['estado'], string> = {
    borrador: 'bg-[#2a2a2a] text-[#ccc]',
    enviado: 'bg-yellow-900/50 text-yellow-300',
    cerrado: 'bg-green-900/50 text-green-300',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Pedidos a proveedores</h1>
        <p className="text-[#888] text-sm mt-0.5">Armá un pedido, generá el mensaje y envialo por WhatsApp.</p>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className={labelClass}>Nuevo pedido a</label>
          <select className={inputClass} value={proveedorNuevo} onChange={e => setProveedorNuevo(e.target.value)}>
            <option value="">Seleccionar proveedor...</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button onClick={crearPedido} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          + Crear pedido
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {pedidoEditando && (
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#f0f0f0]">Pedido a {pedidoEditando.proveedores.nombre}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadgeClass[pedidoEditando.estado]}`}>{pedidoEditando.estado}</span>
          </div>

          <div className="space-y-2">
            {itemsEditor.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  value={item.cantidad}
                  onChange={e => actualizarItemEditor(idx, { cantidad: Number(e.target.value) })}
                />
                <input
                  type="text"
                  className={`${inputClass} w-24`}
                  placeholder="Unidad"
                  value={item.unidad ?? ''}
                  onChange={e => actualizarItemEditor(idx, { unidad: e.target.value })}
                />
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Descripción"
                  value={item.descripcion}
                  onChange={e => actualizarItemEditor(idx, { descripcion: e.target.value })}
                />
                <button onClick={() => quitarItemEditor(idx)} className="text-[#888] hover:text-red-400 text-lg px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={agregarItemLibre} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              + Agregar ítem
            </button>
            <button onClick={() => guardarItems()} disabled={isPending} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Guardar ítems
            </button>
            <button onClick={generarMensaje} disabled={isPending || pedidoEditando.estado === 'cerrado'} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Generar mensaje
            </button>
            <button onClick={cerrarEditor} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
              Cerrar edición
            </button>
          </div>

          {pedidoEditando.mensaje && (
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
              <pre className="text-[#e0e0e0] text-sm whitespace-pre-wrap font-sans">{pedidoEditando.mensaje}</pre>
              <div className="flex gap-3">
                <button
                  onClick={() => navigator.clipboard.writeText(pedidoEditando.mensaje ?? '')}
                  className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  Copiar mensaje
                </button>
                <button
                  onClick={enviarWhatsApp}
                  disabled={pedidoEditando.estado === 'cerrado'}
                  className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  Enviar por WhatsApp
                </button>
              </div>
            </div>
          )}

          {pedidoEditando.estado !== 'borrador' && (
            <RemitosPedido
              pedido={pedidoEditando}
              usuarioId={usuarioId}
              onRemitosChange={remitos => actualizarRemitos(pedidoEditando.id, remitos)}
            />
          )}
        </div>
      )}

      <div className="flex gap-3">
        {(['activos', 'todos'] as FiltroPedidos[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${filtro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {pedidosFiltrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay pedidos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Ítems</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {pedidosFiltrados.map(p => (
                  <tr key={p.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{p.proveedores.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadgeClass[p.estado]}`}>{p.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-[#888]">{new Date(p.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#888]">{p.compras_pedido_items.length}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => abrirEditor(p)} className="text-xs text-[#888] hover:text-[#e8c547] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Editar
                        </button>
                        {p.estado !== 'cerrado' && (
                          <button onClick={() => cerrarPedido(p)} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                            Cerrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
