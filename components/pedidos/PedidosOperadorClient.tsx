'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, Pedido, TipoProducto, DestinoProducto } from '@/lib/types'
import { BadgeEstado } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import PedidoMensajes from '@/components/pedidos/PedidoMensajes'

interface Props {
  productosIniciales: Producto[]
  pedidosIniciales: Pedido[]
  tipo: TipoProducto
  destino: DestinoProducto
  operadorNombre: string
}

const estadoBorderTop: Record<string, string> = {
  pendiente:  'border-t-[#f0a849]',
  preparando: 'border-t-[#e8c547]',
  enviado:    'border-t-[#f0a030]',
  recibido:   'border-t-[#56d68a]',
}

export default function PedidosOperadorClient({ productosIniciales, pedidosIniciales, tipo, destino, operadorNombre }: Props) {
  const [productos, setProductos] = useState(productosIniciales)
  const [pedidos, setPedidos] = useState(pedidosIniciales)
  const [filtro, setFiltro] = useState('activos')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', descripcion: '', unidad: 'unidad' })
  const [guardando, setGuardando] = useState(false)
  const [flashEnviado, setFlashEnviado] = useState<string | null>(null)
  const supabase = createClient()

  const pendientes = pedidos.filter(p => p.estado === 'pendiente')
  const enviados = pedidos.filter(p => p.estado === 'enviado')
  const pedidosActivos = pedidos.filter(p => p.estado !== 'recibido')
  const pedidosFiltrados = filtro === 'activos' ? pedidosActivos : pedidos.filter(p => p.estado === filtro)

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase.from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function agregarProducto() {
    if (!nuevoForm.nombre) return
    setGuardando(true)
    const { data } = await supabase.from('productos').insert({ ...nuevoForm, tipo, destino, activo: true }).select().single()
    if (data) { setProductos(prev => [...prev, data]); setModalNuevo(false); setNuevoForm({ nombre: '', descripcion: '', unidad: 'unidad' }) }
    setGuardando(false)
  }

  async function cambiarEstado(pedidoId: string, nuevoEstado: 'preparando' | 'enviado') {
    const update: Record<string, string> = { estado: nuevoEstado }
    if (nuevoEstado === 'enviado') update.enviado_at = new Date().toISOString()
    const { data } = await supabase.from('pedidos').update(update).eq('id', pedidoId).select().single()
    if (data) {
      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, ...data } : p))
      if (nuevoEstado === 'enviado') { setFlashEnviado(pedidoId); setTimeout(() => setFlashEnviado(null), 3000) }
    }
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[380px_1fr] gap-6 items-start">

        {/* Catálogo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">
              Catálogo — {tipo === 'producto' ? 'productos' : 'insumos'}
            </p>
            <span className="text-xs text-[#888]">{productos.filter(p => p.activo).length} activos</span>
          </div>

          {productos.filter(p => !p.activo).length > 0 && (
            <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-lg px-3 py-2 text-xs text-[#f0a849]">
              ⚠️ {productos.filter(p => !p.activo).length} desactivado{productos.filter(p => !p.activo).length !== 1 ? 's' : ''}. Revisá el stock.
            </div>
          )}

          <Card>
            {productos.length === 0
              ? <p className="text-xs text-[#888] text-center py-6">Sin {tipo === 'producto' ? 'productos' : 'insumos'}.</p>
              : productos.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between px-4 py-3 ${i < productos.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
                  <div className="flex-1 min-w-0 pr-3">
                    <p className={`text-sm font-medium ${p.activo ? 'text-[#f0f0f0]' : 'text-[#555]'}`}>{p.nombre}</p>
                    <p className="text-xs text-[#555] mt-0.5">
                      {p.activo ? (tipo === 'producto' ? 'Disponible' : 'Insumo activo') : 'Desactivado — stock bajo'}
                    </p>
                  </div>
                  <button onClick={() => toggleActivo(p)}
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${p.activo ? 'bg-[#e8c547]' : 'bg-[#2a2a2a]'}`}>
                    <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full shadow transition-all ${p.activo ? 'right-[3px] bg-black' : 'left-[3px] bg-[#888]'}`} />
                  </button>
                </div>
              ))
            }
          </Card>

          <button onClick={() => setModalNuevo(true)}
            className="w-full border border-dashed border-[#e8c547]/30 text-[#e8c547] rounded-xl py-2.5 text-sm font-medium hover:bg-[#e8c547]/5 transition-colors">
            + Agregar {tipo === 'producto' ? 'producto' : 'insumo'}
          </button>
        </div>

        {/* Pedidos */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 border-t-2 border-t-[#f0a849]">
              <p className={`text-3xl font-['Syne'] font-bold ${pendientes.length > 0 ? 'text-[#f0a849]' : 'text-[#f0f0f0]'}`}>{pendientes.length}</p>
              <p className="text-xs text-[#888] mt-1">Pendientes</p>
            </Card>
            <Card className="p-4 border-t-2 border-t-[#56d68a]">
              <p className="text-3xl font-['Syne'] font-bold text-[#56d68a]">{enviados.length}</p>
              <p className="text-xs text-[#888] mt-1">Enviados hoy</p>
            </Card>
          </div>

          {flashEnviado && (
            <div className="bg-[rgba(86,214,138,.08)] border-l-4 border-[#56d68a] rounded-r-lg px-4 py-2.5 text-sm text-[#56d68a] font-medium">
              ✅ Pedido marcado como enviado.
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-3">Pedidos</p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
              {[
                { key: 'activos',    label: 'Activos' },
                { key: 'pendiente',  label: 'Pendientes' },
                { key: 'preparando', label: 'Preparando' },
                { key: 'enviado',    label: 'Enviados' },
                { key: 'recibido',   label: 'Recibidos' },
              ].map(f => (
                <button key={f.key} onClick={() => setFiltro(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    filtro === f.key
                      ? 'bg-[#e8c547] text-black'
                      : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {pedidosFiltrados.length === 0
              ? <Card className="p-8 text-center text-sm text-[#888]">No hay pedidos.</Card>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pedidosFiltrados.map(pedido => (
                    <div key={pedido.id}
                      className={`bg-[#111111] border border-[#2a2a2a] border-t-[3px] ${estadoBorderTop[pedido.estado] || 'border-t-[#2a2a2a]'} rounded-[14px] overflow-hidden transition-shadow hover:shadow-[0_4px_24px_rgba(0,0,0,.4)]`}>

                      {/* Header comanda */}
                      <div className="px-4 py-3 flex items-start justify-between gap-2 border-b border-[#2a2a2a]">
                        <div className="min-w-0">
                          <p className="font-['Syne'] font-bold text-[#f0f0f0] text-sm">{pedido.local_nombre}</p>
                          <p className="text-xs text-[#888] mt-0.5">
                            #{pedido.numero} · {new Date(pedido.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <BadgeEstado estado={pedido.estado} />
                      </div>

                      {/* Items */}
                      {pedido.pedido_items && pedido.pedido_items.length > 0 && (
                        <div className="px-4 py-2 space-y-1 border-b border-[#2a2a2a]">
                          {pedido.pedido_items.map(i => (
                            <div key={i.id} className="flex justify-between items-center text-xs">
                              <span className="text-[#f0f0f0]">{i.producto_nombre}</span>
                              <span className="text-[#aaa] ml-2">× {i.cantidad}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {pedido.notas && (
                        <div className="px-4 py-2 text-xs text-[#bbb] italic border-b border-[#2a2a2a]">
                          💬 {pedido.notas}
                        </div>
                      )}

                      {/* Barra progreso */}
                      {(pedido.estado === 'pendiente' || pedido.estado === 'preparando') && (
                        <div className="h-[3px] bg-[#2a2a2a]">
                          <div className={`h-full transition-all ${pedido.estado === 'pendiente' ? 'w-[12%] bg-[#f0a849]' : 'w-[55%] bg-[#e8c547]'}`} />
                        </div>
                      )}

                      {/* Footer acciones */}
                      <div className="px-4 py-3 flex flex-col gap-2">
                        {pedido.estado === 'pendiente' && (
                          <button onClick={() => cambiarEstado(pedido.id, 'preparando')}
                            className="w-full bg-[#e8c547] text-black rounded-lg py-2 text-sm font-['Syne'] font-bold">
                            🔄 Empezar preparación
                          </button>
                        )}
                        {pedido.estado === 'preparando' && (
                          <button onClick={() => cambiarEstado(pedido.id, 'enviado')}
                            className="w-full bg-[#e84210] text-white rounded-lg py-2 text-sm font-['Syne'] font-bold">
                            🚚 Marcar como enviado
                          </button>
                        )}
                        <PedidoMensajes pedidoId={pedido.id} mensajesIniciales={pedido.pedido_mensajes || []}
                          autorRol={destino} autorNombre={operadorNombre} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* Modal nuevo producto */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-base text-[#f0f0f0]">Nuevo {tipo === 'producto' ? 'producto' : 'insumo'}</h3>
            {[
              { label: 'Nombre *', key: 'nombre', placeholder: tipo === 'producto' ? 'Chipacitos clásicos' : 'Harina de mandioca 1kg' },
              { label: 'Descripción', key: 'descripcion', placeholder: 'Descripción opcional' },
              { label: 'Unidad', key: 'unidad', placeholder: 'unidad, kg, bolsa...' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type="text" value={nuevoForm[key as keyof typeof nuevoForm]}
                  onChange={e => setNuevoForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModalNuevo(false)}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={agregarProducto} disabled={guardando || !nuevoForm.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
