'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, Pedido, TipoProducto, DestinoProducto } from '@/lib/types'
import { BadgeEstado } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import PushToggle from '@/components/ui/PushToggle'
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
  const [sucursal, setSucursal] = useState('todas')
  const [actualizando, setActualizando] = useState(false)
  const [flashEnviado, setFlashEnviado] = useState<string | null>(null)
  const [nuevosIds, setNuevosIds] = useState<string[]>([])
  const supabase = createClient()
  const titleRef = useRef(typeof document !== 'undefined' ? document.title : '')
  const pedidosRef = useRef(pedidos)
  const actualizarRef = useRef<() => void>(() => {})

  useEffect(() => { pedidosRef.current = pedidos }, [pedidos])
  useEffect(() => { actualizarRef.current = actualizar })

  // Realtime: nuevos pedidos y cambios de estado
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function conectar() {
      // Topic único por intento: si se reconecta antes de que el `leave`
      // del canal anterior termine del lado del servidor, supabase-js
      // devuelve ese mismo canal (ya suscripto) en vez de uno nuevo al
      // pedir el mismo topic, y `.on()` explota con "after subscribe()".
      const topic = `operador-${destino}-${Math.random().toString(36).slice(2)}`
      channel = supabase.channel(topic)
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

          setPedidos(prev => prev.some(p => p.id === data.id) ? prev : [data, ...prev])
          setNuevosIds(prev => prev.includes(data.id) ? prev : [...prev, data.id])
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
        .subscribe((status) => {
          // El socket puede caerse en silencio (suspensión de la laptop,
          // cambio de red) sin pasar por acá como error visible — cuando
          // sí lo reporta, reconectamos.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (channel) supabase.removeChannel(channel)
            retryTimer = setTimeout(conectar, 3000)
          }
        })
    }
    conectar()

    // Red de seguridad para cuando el socket muere sin avisar: resincroniza
    // por polling al volver a la pestaña y cada 2 min mientras esté visible.
    function alVolver() {
      if (document.visibilityState === 'visible') actualizarRef.current?.()
    }
    document.addEventListener('visibilitychange', alVolver)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') actualizarRef.current?.()
    }, 120000)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(poll)
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
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

  const [busqueda, setBusqueda] = useState('')

  const sucursales = Array.from(new Set(pedidos.map(p => p.local_nombre))).sort()
  const pedidosSucursal = sucursal === 'todas' ? pedidos : pedidos.filter(p => p.local_nombre === sucursal)
  const pendientes = pedidosSucursal.filter(p => p.estado === 'pendiente')
  const enviados = pedidosSucursal.filter(p => p.estado === 'enviado')
  const pedidosActivos = pedidosSucursal.filter(p => p.estado !== 'recibido')
  const pedidosPorFiltro = filtro === 'activos' ? pedidosActivos : pedidosSucursal.filter(p => p.estado === filtro)
  const pedidosFiltrados = busqueda.trim()
    ? pedidosPorFiltro.filter(p => {
        const q = busqueda.toLowerCase()
        return String(p.numero).includes(q) ||
          p.local_nombre.toLowerCase().includes(q) ||
          (p.pedido_items || []).some(i => i.producto_nombre.toLowerCase().includes(q))
      })
    : pedidosPorFiltro

  async function actualizar() {
    setActualizando(true)
    const { data } = await supabase.from('pedidos').select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('destino', destino).order('created_at', { ascending: false }).limit(100)
    if (data) {
      // Si el realtime venía muerto en silencio, esto es lo que detecta
      // pedidos que llegaron sin avisar y los marca como nuevos recién ahora.
      const idsPrevios = new Set(pedidosRef.current.map(p => p.id))
      const nuevos = data.filter(p => !idsPrevios.has(p.id))
      setPedidos(data)
      if (nuevos.length > 0) {
        setNuevosIds(prev => [...new Set([...prev, ...nuevos.map(p => p.id)])])
        playBeep()
      }
    }
    setActualizando(false)
  }

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
      if (nuevoEstado === 'enviado') {
        setFlashEnviado(pedidoId); setTimeout(() => setFlashEnviado(null), 3000)
        fetch('/api/notificaciones/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pedidoId: data.id,
            title: `🚚 Pedido #${data.numero} enviado`,
            body: `Tu pedido de ${destino} está en camino`,
            url: '/local/historial',
          }),
        }).catch(() => { /* notificación best-effort */ })
      }
    }
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4">

      <PushToggle
        descripcionActivar="Te avisamos cuando llegue un pedido nuevo, aunque cierres la pestaña."
        descripcionActiva="Este dispositivo recibe el aviso de pedidos nuevos aunque cierres la pestaña."
      />

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

      <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 border-t-2 border-t-[#f0a849]">
              <p className={`text-3xl font-['Syne'] font-bold ${pendientes.length > 0 ? 'text-[#f0a849]' : 'text-[#f0f0f0]'}`}>{pendientes.length}</p>
              <p className="text-xs text-[#888] mt-1">Pendientes</p>
            </Card>
            <Card className="p-4 border-t-2 border-t-[#56d68a]">
              <p className="text-3xl font-['Syne'] font-bold text-[#56d68a]">{enviados.length}</p>
              <p className="text-xs text-[#888] mt-1">Enviados</p>
            </Card>
          </div>

          {flashEnviado && (
            <div className="bg-[rgba(86,214,138,.08)] border-l-4 border-[#56d68a] rounded-r-lg px-4 py-2.5 text-sm text-[#56d68a] font-medium">
              ✅ Pedido marcado como enviado.
            </div>
          )}

          {/* Buscador */}
          <input
            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por sucursal, número o producto..."
          />

          {/* Controles: filtro estado + sucursal + actualizar */}
          <div className="flex flex-wrap gap-2 items-center sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
            <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1">
              {[
                { key: 'activos',    label: 'Activos' },
                { key: 'pendiente',  label: 'Pendientes' },
                { key: 'preparando', label: 'Preparando' },
                { key: 'enviado',    label: 'Enviados' },
                { key: 'recibido',   label: 'Recibidos' },
              ].map(f => {
                const count = f.key === 'activos' ? pedidosSucursal.filter(p => p.estado !== 'recibido').length : pedidosSucursal.filter(p => p.estado === f.key).length
                return (
                  <button key={f.key} onClick={() => setFiltro(f.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      filtro === f.key ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'
                    }`}>
                    {f.label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filtro === f.key ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-[#666]'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select value={sucursal} onChange={e => setSucursal(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c547]">
                <option value="todas">Todas las sucursales</option>
                {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={actualizar} disabled={actualizando}
                className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-[#e8c547] hover:border-[#e8c547] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap">
                {actualizando ? '...' : '↻ Actualizar'}
              </button>
            </div>
          </div>

          <div>

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
                        <div className="px-4 py-2 border-b border-[#2a2a2a]">
                          {pedido.pedido_items.some(i => i.cantidad_recibida != null || i.valor_total != null) ? (
                            <>
                              <div className="grid grid-cols-[1fr_52px_72px] gap-x-2 pb-1 mb-1 border-b border-[#2a2a2a]">
                                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Producto</span>
                                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-center">Rec./Ped.</span>
                                <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-right">$ Total</span>
                              </div>
                              {pedido.pedido_items.map(i => (
                                <div key={i.id} className="grid grid-cols-[1fr_52px_72px] gap-x-2 py-1 items-center">
                                  <span className="text-xs text-[#f0f0f0] leading-tight">{i.producto_nombre}</span>
                                  <span className={`text-xs text-center font-medium ${i.cantidad_recibida != null && i.cantidad_recibida < i.cantidad ? 'text-[#f59e0b]' : 'text-[#56d68a]'}`}>
                                    {i.cantidad_recibida ?? '—'}{i.cantidad_recibida != null ? `/${i.cantidad}` : ''}
                                  </span>
                                  <span className="text-xs text-right text-[#f0f0f0]">
                                    {i.valor_total != null ? `$${Number(i.valor_total).toLocaleString('es-AR')}` : '—'}
                                  </span>
                                </div>
                              ))}
                              {pedido.pedido_items.some(i => i.valor_total != null) && (
                                <div className="flex justify-between pt-1.5 mt-1 border-t border-[#2a2a2a]">
                                  <span className="text-[10px] font-semibold text-[#888] uppercase tracking-wider">Total remito</span>
                                  <span className="text-xs font-bold text-[#e8c547]">
                                    ${pedido.pedido_items.reduce((s, i) => s + (i.valor_total ? Number(i.valor_total) : 0), 0).toLocaleString('es-AR')}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="space-y-1">
                              {pedido.pedido_items.map(i => (
                                <div key={i.id} className="flex justify-between items-center text-xs">
                                  <span className="text-[#f0f0f0]">{i.producto_nombre}</span>
                                  <span className="text-[#aaa] ml-2">× {i.cantidad}</span>
                                </div>
                              ))}
                            </div>
                          )}
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
  )
}
