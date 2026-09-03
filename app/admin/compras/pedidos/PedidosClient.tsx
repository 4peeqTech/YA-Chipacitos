'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Check, ListChecks, Lock, MessageSquare, Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { construirMensajePedido, renderPlantilla, linkWhatsApp } from '@/lib/compras/pedidoMensaje'
import Modal from '@/components/ui/Modal'
import type { Remito } from '@/lib/compras/tipos'
import ResumenRemitos from './ResumenRemitos'

interface Plantilla {
  id: string
  nombre: string
  cuerpo: string
  es_default: boolean
}

interface LocalFacturacion {
  id: string
  nombre: string
  sucursal: string
  razon_social: string
  cuit: string
  direccion: string
}

interface Proveedor {
  id: string
  nombre: string
  local_facturacion_id: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  maneja_stock: boolean
}

interface CompraItem {
  id: string
  nombre: string
  unidad: string
  stock_minimo: number
  compras_item_proveedores: { proveedor_id: string; precio_ref: number | null; activo: boolean }[]
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
  local_facturacion_id: string | null
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

// Fila del catálogo del proveedor elegido en el modal de creación, con su checkbox de inclusión.
interface FilaCatalogo extends ItemEditor {
  incluir: boolean
  precioRef: number | null
}

export default function PedidosClient({
  proveedores,
  itemsCatalogo,
  stockInicial,
  pedidosIniciales,
  usuarioId,
  plantillas,
  localesFacturacion,
}: {
  proveedores: Proveedor[]
  itemsCatalogo: CompraItem[]
  stockInicial: StockActual[]
  pedidosIniciales: Pedido[]
  usuarioId: string
  plantillas: Plantilla[]
  localesFacturacion: LocalFacturacion[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciales)
  const [filtro, setFiltro] = useState<FiltroPedidos>('activos')
  const [modalCrear, setModalCrear] = useState(false)
  const [proveedorModal, setProveedorModal] = useState('')
  const [filasModal, setFilasModal] = useState<FilaCatalogo[]>([])
  const [lineasLibresModal, setLineasLibresModal] = useState<ItemEditor[]>([])
  const [creandoPedido, setCreandoPedido] = useState(false)
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [itemsEditor, setItemsEditor] = useState<ItemEditor[]>([])
  const [plantillaId, setPlantillaId] = useState('')
  const [localId, setLocalId] = useState('')
  const [envioPreparado, setEnvioPreparado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const stockPorItem = Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad]))

  const pedidosFiltrados = pedidos.filter(p =>
    filtro === 'todos' ? true : p.estado === 'borrador' || p.estado === 'enviado'
  )

  function filasParaProveedor(proveedorId: string): FilaCatalogo[] {
    const proveedor = proveedores.find(p => p.id === proveedorId)
    return itemsCatalogo
      .map(i => ({ item: i, asociado: i.compras_item_proveedores.find(cp => cp.proveedor_id === proveedorId && cp.activo) }))
      .filter((x): x is { item: CompraItem; asociado: NonNullable<typeof x.asociado> } => !!x.asociado)
      .map(({ item: i, asociado }) => {
        const cantidad = proveedor?.maneja_stock ? Math.max(0, i.stock_minimo - (stockPorItem[i.id] ?? 0)) : 0
        return { item_id: i.id, descripcion: i.nombre, unidad: i.unidad, cantidad, incluir: cantidad > 0, precioRef: asociado.precio_ref }
      })
  }

  function abrirModalCrear() {
    setProveedorModal('')
    setFilasModal([])
    setLineasLibresModal([])
    setError('')
    setModalCrear(true)
  }

  function elegirProveedorModal(proveedorId: string) {
    setProveedorModal(proveedorId)
    setFilasModal(filasParaProveedor(proveedorId))
    setLineasLibresModal([])
  }

  function toggleFilaModal(index: number) {
    setFilasModal(prev => prev.map((f, i) => i === index ? { ...f, incluir: !f.incluir } : f))
  }

  function actualizarCantidadFilaModal(index: number, cantidad: number) {
    setFilasModal(prev => prev.map((f, i) => i === index ? { ...f, cantidad } : f))
  }

  function agregarLineaLibreModal() {
    setLineasLibresModal(prev => [...prev, { item_id: null, descripcion: '', unidad: '', cantidad: 0 }])
  }

  function actualizarLineaLibreModal(index: number, cambios: Partial<ItemEditor>) {
    setLineasLibresModal(prev => prev.map((l, i) => i === index ? { ...l, ...cambios } : l))
  }

  function quitarLineaLibreModal(index: number) {
    setLineasLibresModal(prev => prev.filter((_, i) => i !== index))
  }

  function abrirEditor(pedido: Pedido) {
    setPedidoEditando(pedido)
    setItemsEditor(
      [...pedido.compras_pedido_items]
        .sort((a, b) => a.orden - b.orden)
        .map(i => ({ item_id: i.item_id, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad }))
    )
    setPlantillaId(plantillas.find(p => p.es_default)?.id ?? plantillas[0]?.id ?? '')
    setLocalId(pedido.local_facturacion_id ?? pedido.proveedores.local_facturacion_id ?? '')
    setError('')
    setEnvioPreparado(false)
    setCopiado(false)
  }

  function cerrarEditor() {
    setPedidoEditando(null)
    setItemsEditor([])
    setEnvioPreparado(false)
    setCopiado(false)
  }

  async function guardarItems(pedidoOverride?: Pedido, itemsOverride?: ItemEditor[], opts?: { confirmarRemitos?: boolean }): Promise<PedidoItem[] | null> {
    const pedido = pedidoOverride ?? pedidoEditando
    if (!pedido) return null
    if (opts?.confirmarRemitos && pedido.compras_remitos.length > 0 &&
        !confirm('Este pedido ya tiene remitos cargados. Reguardar los ítems va a desvincular las líneas de los remitos. ¿Continuar?')) return null
    setError('')

    const fuente = itemsOverride ?? itemsEditor
    const filas = fuente
      .filter(i => i.descripcion.trim() && i.cantidad > 0)
      .map((i, idx) => ({
        pedido_id: pedido.id,
        item_id: i.item_id,
        descripcion: i.descripcion.trim(),
        unidad: i.unidad?.trim() || null,
        cantidad: i.cantidad,
        orden: idx,
      }))

    const { error: errDelete } = await supabase.from('compras_pedido_items').delete().eq('pedido_id', pedido.id)
    if (errDelete) { setError(errDelete.message); return null }

    let itemsGuardados: PedidoItem[] = []
    if (filas.length) {
      const { data, error: errInsert } = await supabase.from('compras_pedido_items').insert(filas).select()
      if (errInsert) { setError(errInsert.message); return null }
      itemsGuardados = data
    }

    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, compras_pedido_items: itemsGuardados } : p))
    setPedidoEditando(prev => prev && prev.id === pedido.id ? { ...prev, compras_pedido_items: itemsGuardados } : prev)
    return itemsGuardados
  }

  async function confirmarCrearPedido() {
    if (!proveedorModal) { setError('Elegí un proveedor'); return }
    const proveedor = proveedores.find(p => p.id === proveedorModal)
    if (!proveedor) return
    setError('')

    startTransition(async () => {
      const { data: pedido, error: errPedido } = await supabase
        .from('compras_pedidos')
        .insert([{ proveedor_id: proveedor.id, local_facturacion_id: proveedor.local_facturacion_id, estado: 'borrador', creado_por: usuarioId }])
        .select()
        .single()
      if (errPedido) { setError(errPedido.message); return }

      const filasFinal: ItemEditor[] = [
        ...filasModal.filter(f => f.incluir && f.cantidad > 0).map(({ incluir, precioRef, ...resto }) => resto),
        ...lineasLibresModal.filter(l => l.descripcion.trim() && l.cantidad > 0),
      ]

      const nuevoPedido: Pedido = { ...pedido, proveedores: proveedor, compras_pedido_items: [], compras_remitos: [] }
      const itemsGuardados = await guardarItems(nuevoPedido, filasFinal)
      const pedidoFinal = { ...nuevoPedido, compras_pedido_items: itemsGuardados ?? [] }

      setPedidos(prev => [pedidoFinal, ...prev])
      setModalCrear(false)
      abrirEditor(pedidoFinal)
    })
  }

  async function generarMensaje() {
    if (!pedidoEditando) return
    setError('')

    startTransition(async () => {
      const itemsGuardados = await guardarItems()
      if (!itemsGuardados) return
      if (!itemsGuardados.length) { setError('Agregá al menos un ítem antes de generar el mensaje'); return }

      const local = localesFacturacion.find(l => l.id === localId) ?? null
      const plantilla = plantillas.find(p => p.id === plantillaId)
      const mensaje = plantilla
        ? renderPlantilla(plantilla.cuerpo, {
            proveedorNombre: pedidoEditando.proveedores.nombre,
            contactoNombre: pedidoEditando.proveedores.contacto_nombre,
            local,
            items: itemsGuardados,
          })
        : construirMensajePedido(pedidoEditando.proveedores.nombre, local, itemsGuardados)

      const { data, error: errUpdate } = await supabase
        .from('compras_pedidos')
        .update({ mensaje, local_facturacion_id: localId || null })
        .eq('id', pedidoEditando.id)
        .select()
        .single()
      if (errUpdate) { setError(errUpdate.message); return }

      setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, mensaje: data.mensaje, local_facturacion_id: data.local_facturacion_id } : p))
      setPedidoEditando(prev => prev ? { ...prev, mensaje: data.mensaje, local_facturacion_id: data.local_facturacion_id } : prev)
      setEnvioPreparado(false)
      setCopiado(false)
    })
  }

  async function copiarMensaje() {
    if (!pedidoEditando?.mensaje) return
    try {
      await navigator.clipboard.writeText(pedidoEditando.mensaje)
      setCopiado(true)
      setEnvioPreparado(true)
    } catch {
      setError('No se pudo copiar el mensaje al portapapeles')
    }
  }

  async function marcarComoEnviado() {
    if (!pedidoEditando) return
    const { data, error: err } = await supabase
      .from('compras_pedidos')
      .update({ estado: 'enviado', enviado_en: new Date().toISOString() })
      .eq('id', pedidoEditando.id)
      .select()
      .single()
    if (err) { setError(err.message); return }

    setPedidos(prev => prev.map(p => p.id === pedidoEditando.id ? { ...p, ...data } : p))
    const pedidoId = pedidoEditando.id
    cerrarEditor()
    router.push(`/admin/compras/remitos?pedido=${pedidoId}`)
  }

  function enviarWhatsApp() {
    if (!pedidoEditando?.mensaje) return
    const url = linkWhatsApp(pedidoEditando.proveedores.contacto_telefono, pedidoEditando.mensaje)
    window.open(url, '_blank')
    setEnvioPreparado(true)
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

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  const estadoBadgeClass: Record<Pedido['estado'], string> = {
    borrador: 'bg-[#2a2a2a] text-[#ccc]',
    enviado: 'bg-yellow-900/50 text-yellow-300',
    cerrado: 'bg-green-900/50 text-green-300',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Pedidos a proveedores</h1>
          <p className="text-[#888] text-sm mt-0.5">Armá un pedido, generá el mensaje y envialo por WhatsApp.</p>
        </div>
        <button onClick={abrirModalCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Crear pedido
        </button>
      </div>

      {error && !modalCrear && <p className="text-red-400 text-sm">{error}</p>}

      <Modal open={!!pedidoEditando} onClose={cerrarEditor} title={pedidoEditando ? `Pedido a ${pedidoEditando.proveedores.nombre}` : ''} size="2xl">
        {pedidoEditando && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="space-y-3 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-[#e8c547]" />
                <h4 className="font-bold text-sm text-[#f0f0f0]">Ítems del pedido</h4>
                <span className="text-xs text-[#666]">({itemsEditor.length})</span>
                <span className={`ml-auto inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadgeClass[pedidoEditando.estado]}`}>{pedidoEditando.estado}</span>
              </div>

              {itemsEditor.length === 0 ? (
                <p className="text-[#888] text-sm py-6 text-center">Todavía no hay ítems.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="w-16 text-xs font-semibold text-[#888] uppercase tracking-wider">Cant.</span>
                    <span className="w-20 text-xs font-semibold text-[#888] uppercase tracking-wider">Unidad</span>
                    <span className="flex-1 text-xs font-semibold text-[#888] uppercase tracking-wider">Descripción</span>
                  </div>
                  {itemsEditor.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        className={`${inputClass} w-16`}
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={e => setItemsEditor(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Number(e.target.value) } : it))}
                      />
                      <input
                        type="text"
                        className={`${inputClass} w-20`}
                        placeholder="Unidad"
                        value={item.unidad ?? ''}
                        onChange={e => setItemsEditor(prev => prev.map((it, i) => i === idx ? { ...it, unidad: e.target.value } : it))}
                      />
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="Descripción"
                        value={item.descripcion}
                        onChange={e => setItemsEditor(prev => prev.map((it, i) => i === idx ? { ...it, descripcion: e.target.value } : it))}
                      />
                      <button
                        onClick={() => setItemsEditor(prev => prev.filter((_, i) => i !== idx))}
                        title="Quitar ítem"
                        aria-label="Quitar ítem"
                        className="text-[#888] hover:text-red-400 px-1"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setItemsEditor(prev => [...prev, { item_id: null, descripcion: '', unidad: '', cantidad: 0 }])} className="flex items-center gap-1.5 bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
                  <Plus size={16} /> Agregar ítem
                </button>
                <button onClick={() => guardarItems(undefined, undefined, { confirmarRemitos: true })} disabled={isPending} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
                  Guardar ítems
                </button>
              </div>

              <ResumenRemitos pedido={pedidoEditando} />
            </section>

            <section className="space-y-3 lg:max-h-[62vh] lg:overflow-y-auto lg:pl-5 lg:border-l lg:border-[#2a2a2a] scrollbar-thin">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-[#e8c547]" />
                <h4 className="font-bold text-sm text-[#f0f0f0]">Mensaje de WhatsApp</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Plantilla de mensaje</label>
                  <select
                    value={plantillaId}
                    onChange={e => setPlantillaId(e.target.value)}
                    disabled={pedidoEditando.estado === 'cerrado' || plantillas.length === 0}
                    className={`${inputClass} disabled:opacity-40`}
                  >
                    {plantillas.length === 0 && <option value="">Sin plantillas</option>}
                    {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.es_default ? ' (default)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Facturar a</label>
                  <select
                    value={localId}
                    onChange={e => setLocalId(e.target.value)}
                    disabled={pedidoEditando.estado === 'cerrado'}
                    className={`${inputClass} disabled:opacity-40`}
                  >
                    <option value="">Sin asignar</option>
                    {localesFacturacion.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={generarMensaje}
                disabled={isPending || pedidoEditando.estado === 'cerrado'}
                className="w-full flex items-center justify-center gap-1.5 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all"
              >
                {pedidoEditando.mensaje && <RefreshCw size={16} />}
                {pedidoEditando.mensaje ? 'Regenerar mensaje' : 'Generar mensaje'}
              </button>

              {!localId && (
                <p className="text-yellow-400 text-sm">El mensaje va a salir sin bloque de entrega ni de facturación — elegí un local en &quot;Facturar a&quot; si corresponde.</p>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {pedidoEditando.mensaje ? (
                <pre className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 text-[#e0e0e0] text-sm whitespace-pre-wrap font-sans">{pedidoEditando.mensaje}</pre>
              ) : (
                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
                  <p className="text-[#666] text-sm">Generá el mensaje para verlo acá.</p>
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={copiarMensaje}
                  disabled={!pedidoEditando.mensaje}
                  className="bg-[#2a2a2a] hover:bg-[#333] disabled:opacity-40 text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  {copiado ? '✓ Copiado' : 'Copiar mensaje'}
                </button>
                <button
                  onClick={enviarWhatsApp}
                  disabled={!pedidoEditando.mensaje || pedidoEditando.estado === 'cerrado'}
                  className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                >
                  Enviar por WhatsApp
                </button>
                {pedidoEditando.estado !== 'borrador' ? (
                  <button disabled className="flex items-center gap-1.5 bg-[#e8c547] opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl">
                    <Check size={16} /> Enviado
                  </button>
                ) : (
                  <button
                    onClick={marcarComoEnviado}
                    disabled={!envioPreparado}
                    className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                  >
                    Marcar como enviado
                  </button>
                )}
              </div>
              {pedidoEditando.estado !== 'borrador' ? (
                <Link href={`/admin/compras/remitos?pedido=${pedidoEditando.id}`} className="inline-flex items-center gap-1 text-sm text-[#e8c547] hover:opacity-80 transition-opacity">
                  Ir a remitos <ArrowRight size={14} />
                </Link>
              ) : !envioPreparado && (
                <p className="text-[#666] text-xs">Copiá el mensaje o mandalo por WhatsApp para habilitarlo.</p>
              )}
            </section>
          </div>
        )}
      </Modal>

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
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => abrirEditor(p)}
                          title="Editar"
                          aria-label={`Editar pedido a ${p.proveedores.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        {p.estado !== 'cerrado' && (
                          <button
                            onClick={() => cerrarPedido(p)}
                            title="Cerrar pedido"
                            aria-label={`Cerrar pedido a ${p.proveedores.nombre}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
                          >
                            <Lock size={15} />
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

      <Modal open={modalCrear} onClose={() => !isPending && setModalCrear(false)} title="Crear pedido" size="lg">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Proveedor *</label>
            <select className={inputClass} value={proveedorModal} onChange={e => elegirProveedorModal(e.target.value)}>
              <option value="">Seleccionar proveedor...</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {proveedorModal && (
            <>
              <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                {filasModal.length === 0 ? (
                  <p className="p-4 text-center text-sm text-[#666]">Este proveedor no tiene ítems en el catálogo. Usá &quot;+ Línea libre&quot; para agregar uno.</p>
                ) : (
                  <div className="divide-y divide-[#1a1a1a]">
                    {filasModal.map((f, idx) => (
                      <div key={idx} className={`flex items-center gap-3 px-4 py-2.5 ${!f.incluir ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={f.incluir}
                          onChange={() => toggleFilaModal(idx)}
                          className="w-4 h-4 accent-[#e8c547] cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#f0f0f0] truncate">{f.descripcion}</p>
                          <p className="text-xs text-[#666]">{f.unidad}{f.precioRef != null ? ` · ref. $${f.precioRef.toLocaleString('es-AR')}` : ''}</p>
                        </div>
                        <input
                          type="number" step="0.01"
                          placeholder="0"
                          value={f.cantidad === 0 ? '' : f.cantidad}
                          onChange={e => actualizarCantidadFilaModal(idx, Number(e.target.value))}
                          className={`${inputClass} w-24 shrink-0 text-right`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {lineasLibresModal.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="number" step="0.01"
                      placeholder="0"
                      className={`${inputClass} w-24`}
                      value={l.cantidad === 0 ? '' : l.cantidad}
                      onChange={e => actualizarLineaLibreModal(idx, { cantidad: Number(e.target.value) })}
                    />
                    <input
                      type="text"
                      className={`${inputClass} w-24`}
                      placeholder="Unidad"
                      value={l.unidad ?? ''}
                      onChange={e => actualizarLineaLibreModal(idx, { unidad: e.target.value })}
                    />
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="Descripción"
                      value={l.descripcion}
                      onChange={e => actualizarLineaLibreModal(idx, { descripcion: e.target.value })}
                    />
                    <button onClick={() => quitarLineaLibreModal(idx)} className="text-[#888] hover:text-red-400 text-lg px-2">✕</button>
                  </div>
                ))}
                <button onClick={agregarLineaLibreModal} className="text-xs text-[#888] hover:text-[#e8c547] font-semibold py-1.5 px-3 rounded-lg border border-[#2a2a2a] hover:border-[#e8c547] transition-colors">
                  + Línea libre
                </button>
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={confirmarCrearPedido} disabled={isPending || !proveedorModal} className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
              {isPending ? 'Creando...' : 'Guardar'}
            </button>
            <button onClick={() => setModalCrear(false)} disabled={isPending} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2.5 px-6 rounded-xl transition-all disabled:opacity-40">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
