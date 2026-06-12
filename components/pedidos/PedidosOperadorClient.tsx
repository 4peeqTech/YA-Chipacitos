'use client'

import { useState, useEffect, useRef } from 'react'
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

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch {}
}

function showBrowserNotification(pedido: Pedido) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const items = pedido.pedido_items?.map(i => `${i.cantidad}× ${i.producto_nombre}`).join(', ') || ''
  const notif = new Notification(`🔔 Nuevo pedido #${pedido.numero}`, {
    body: `${pedido.local_nombre}${items ? `\n${items}` : ''}`,
    icon: '/chipacitos-logo.png',
    tag: pedido.id,
    requireInteraction: true,
  })
  notif.onclick = () => {
    window.focus()
    notif.close()
  }
}

export default function PedidosOperadorClient({ productosIniciales, pedidosIniciales, tipo, destino, operadorNombre }: Props) {
  const [productos, setProductos] = useState(productosIniciales)
  const [pedidos, setPedidos] = useState(pedidosIniciales)
  const [filtro, setFiltro] = useState('activos')
  const [flashEnviado, setFlashEnviado] = useState<string | null>(null)
  const [nuevosIds, setNuevosIds] = useState<string[]>([])
  const [notifPermiso, setNotifPermiso] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const supabase = createClient()
  const titleRef = useRef(document.title)

  // Detectar soporte y permiso actual
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermiso(Notification.permission)
    }
  }, [])

  // Realtime: nuevos pedidos y cambios de estado
  useEffect(() => {
    const ch = supabase.channel(`operador-${destino}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pedidos',
        filter: `destino=eq.${destino}`,
      }, async (payload) => {
        // Cargar el pedido completo con items
        const { data } = await supabase
          .from('pedidos')
          .select('*, pedido_items(*), pedido_mensajes(*)')
          .eq('id', payload.new.id)
          .single()
        if (!data) return

        setPedidos(prev => [data, ...prev])
        setNuevosIds(prev => [...prev, data.id])
        playBeep()
        showBrowserNotification(data)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos',
        filter: `destino=eq.${destino}`,
      }, (payload) => {
        setPedidos(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [destino]) // eslint-disable-line react-hooks/exhaustive-deps

  // Título parpadeante cuando hay pedidos nuevos
  useEffect(() => {
    if (nuevosIds.length === 0) {
      document.title = titleRef.current
      return
    }
    const n = nuevosIds.length
    const msg = `🔴 ${n} pedido${n > 1 ? 's' : ''} nuevo${n > 1 ? 's' : ''}!`
    let toggle = true
    document.title = msg
    const iv = setInterval(() => {
      document.title = toggle ? msg : 'Pedidos — YA! Chipacitos'
      toggle = !toggle
    }, 1000)
    return () => {
      clearInterval(iv)
      document.title = titleRef.current
    }
  }, [nuevosIds])

  async function pedirPermiso() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotifPermiso(result)
  }

  const pendientes = pedidos.filter(p => p.estado === 'pendiente')
  const enviados = pedidos.filter(p => p.estado === 'enviado')
  const pedidosActivos = pedidos.filter(p => p.estado !== 'recibido')
  const pedidosFiltrados = filtro === 'activos' ? pedidosActivos : pedidos.filter(p => p.estado === filtro)

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase.from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function cambiarEstado(pedidoId: string, nuevoEstado: 'preparando' | 'enviado') {
    const update: Record<string, string> = { estado: nuevoEstado }
    if (nuevoEstado === 'preparando') update.preparando_at = new Date().toISOString()
    if (nuevoEstado === 'enviado') update.enviado_at = new Date().toISOString()
    const { data } = await supabase.from('pedidos').update(update).eq('id', pedidoId).select().single()
    if (data) {
      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, ...data } : p))
      if (nuevoEstado === 'enviado') { setFlashEnviado(pedidoId); setTimeout(() => setFlashEnviado(null), 3000) }
    }
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4">

      {/* Banner: pedir permiso de notificaciones */}
      {notifPermiso === 'default' && (
        <div className="bg-[rgba(232,197,71,.08)] border border-[#e8c547]/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#e8c547]">🔔 Activar notificaciones</p>
            <p className="text-xs text-[#888] mt-0.5">Te avisamos cuando llegue un pedido nuevo, aunque estés en otra pestaña.</p>
          </div>
          <button
            onClick={pedirPermiso}
            className="shrink-0 bg-[#e8c547] text-black text-xs font-['Syne'] font-bold px-4 py-2 rounded-lg whitespace-nowrap"
          >
            Activar
          </button>
        </div>
      )}

      {notifPermiso === 'denied' && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs text-[#555]">
          🔕 Notificaciones bloqueadas en este browser. Para activarlas, hacé clic en el candado de la barra de dirección.
        </div>
      )}

      {/* Banner de pedidos nuevos (persiste hasta cerrar) */}
      {nuevosIds.length > 0 && (
        <div className="bg-[rgba(232,66,16,.12)] border-2 border-[#e84210] rounded-xl px-4 py-3 flex items-center justify-between gap-3 animate-pulse">
          <div>
            <p className="text-sm font-bold text-[#e84210]">
              🚨 {nuevosIds.length} pedido{nuevosIds.length > 1 ? 's' : ''} nuevo{nuevosIds.length > 1 ? 's' : ''} sin revisar
            </p>
            <p className="text-xs text-[#e84210]/70 mt-0.5">
              {pedidos.filter(p => nuevosIds.includes(p.id)).map(p => `#${p.numero} ${p.local_nombre}`).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => setNuevosIds([])}
            className="shrink-0 text-[#e84210] hover:text-[#f0f0f0] transition-colors text-xl leading-none"
            title="Marcar como visto"
          >
            ×
          </button>
        </div>
      )}

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
                      className={`bg-[#111111] border border-[#2a2a2a] border-t-[3px] ${estadoBorderTop[pedido.estado] || 'border-t-[#2a2a2a]'} rounded-[14px] overflow-hidden transition-shadow hover:shadow-[0_4px_24px_rgba(0,0,0,.4)] ${nuevosIds.includes(pedido.id) ? 'ring-1 ring-[#e84210]/40' : ''}`}>

                      {nuevosIds.includes(pedido.id) && (
                        <div className="bg-[#e84210] text-white text-[10px] font-bold px-3 py-1 text-center tracking-wider uppercase">
                          Nuevo
                        </div>
                      )}

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
                          <button onClick={() => { cambiarEstado(pedido.id, 'preparando'); setNuevosIds(prev => prev.filter(id => id !== pedido.id)) }}
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
    </div>
  )
}
