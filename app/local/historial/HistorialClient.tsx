'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pedido, PedidoItem } from '@/lib/types'
import { BadgeEstado, BadgeDestino } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import PedidoMensajes from '@/components/pedidos/PedidoMensajes'

interface Props { pedidos: Pedido[]; localId: string; localNombre: string }

const ESTADOS = ['pendiente', 'preparando', 'enviado', 'recibido']
const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', preparando: 'En preparación', enviado: 'Enviado', recibido: 'Recibido',
}

export default function HistorialClient({ pedidos: init, localNombre }: Props) {
  const [pedidos, setPedidos] = useState(init)
  const [filtro, setFiltro] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [remitoPedidoId, setRemitoPedidoId] = useState<string | null>(null)
  const [remitoItems, setRemitoItems] = useState<Record<string, { cantidad_recibida: string; valor_total: string }>>({})
  const [confirmando, setConfirmando] = useState(false)
  const supabase = createClient()

  function filtrados() {
    let lista = pedidos
    if (filtro) lista = lista.filter(p => p.estado === filtro)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      lista = lista.filter(p =>
        String(p.numero).includes(q) ||
        p.destino.includes(q) ||
        (p.pedido_items || []).some(i => i.producto_nombre.toLowerCase().includes(q))
      )
    }
    return lista
  }

  function abrirRemito(pedido: Pedido) {
    const inicial: Record<string, { cantidad_recibida: string; valor_total: string }> = {}
    for (const item of pedido.pedido_items || []) {
      inicial[item.id] = { cantidad_recibida: String(item.cantidad), valor_total: '' }
    }
    setRemitoItems(inicial)
    setRemitoPedidoId(pedido.id)
  }

  async function confirmarRecepcion(pedido: Pedido) {
    setConfirmando(true)
    const items = pedido.pedido_items || []
    await Promise.all(items.map(item => {
      const vals = remitoItems[item.id]
      return supabase.from('pedido_items').update({
        cantidad_recibida: vals?.cantidad_recibida ? parseInt(vals.cantidad_recibida) : null,
        valor_total: vals?.valor_total ? parseFloat(vals.valor_total.replace(',', '.')) : null,
      }).eq('id', item.id)
    }))
    await supabase.from('pedidos').update({ estado: 'recibido', recibido_at: new Date().toISOString() }).eq('id', pedido.id)
    setPedidos(prev => prev.map(p => p.id === pedido.id
      ? {
          ...p, estado: 'recibido' as const,
          pedido_items: p.pedido_items?.map(item => ({
            ...item,
            cantidad_recibida: remitoItems[item.id]?.cantidad_recibida ? parseInt(remitoItems[item.id].cantidad_recibida) : null,
            valor_total: remitoItems[item.id]?.valor_total ? parseFloat(remitoItems[item.id].valor_total.replace(',', '.')) : null,
          }))
        }
      : p
    ))
    setRemitoPedidoId(null)
    setRemitoItems({})
    setConfirmando(false)
  }

  const lista = filtrados()

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4">

      {/* Buscador */}
      <input
        type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por número, producto o destino..."
      />

      {/* Filtros de estado */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {ESTADOS.map(e => {
          const count = pedidos.filter(p => p.estado === e).length
          return (
            <button key={e} onClick={() => setFiltro(filtro === e ? null : e)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                filtro === e ? 'bg-[#1A1A1A] text-white border border-[#444]' : 'bg-[#111111] text-[#888] border border-[#2a2a2a]'
              }`}>
              {ESTADO_LABELS[e]}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filtro === e ? 'bg-[#e8c547] text-black' : 'bg-[#2a2a2a] text-[#666]'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {lista.length === 0
        ? <Card className="p-6 text-center text-xs text-[#888]">No hay pedidos.</Card>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {lista.map(pedido => (
              <Card key={pedido.id} className="px-3 py-2.5 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium text-[#f0f0f0]">Pedido #{pedido.numero}</span>
                    <p className="text-[11px] text-[#aaa] mt-0.5">
                      {new Date(pedido.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <BadgeEstado estado={pedido.estado} />
                    <BadgeDestino destino={pedido.destino} />
                  </div>
                </div>

                {pedido.pedido_items && pedido.pedido_items.length > 0 && remitoPedidoId !== pedido.id && (
                  <div className="pt-1 border-t border-[#2a2a2a] space-y-0.5">
                    {pedido.estado === 'recibido' && pedido.pedido_items.some(i => i.cantidad_recibida != null || i.valor_total != null) ? (
                      <>
                        <div className="grid grid-cols-[1fr_52px_68px] gap-x-2 pb-1 mb-0.5 border-b border-[#2a2a2a]">
                          <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Producto</span>
                          <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-center">Rec./Ped.</span>
                          <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-right">$ Total</span>
                        </div>
                        {pedido.pedido_items.map(i => (
                          <div key={i.id} className="grid grid-cols-[1fr_52px_68px] gap-x-2 py-0.5 items-center">
                            <span className="text-[11px] text-[#c0c0c0] leading-tight">{i.producto_nombre}</span>
                            <span className={`text-[11px] text-center font-medium ${i.cantidad_recibida != null && i.cantidad_recibida < i.cantidad ? 'text-[#f59e0b]' : 'text-[#56d68a]'}`}>
                              {i.cantidad_recibida ?? '—'}{i.cantidad_recibida != null ? `/${i.cantidad}` : ''}
                            </span>
                            <span className="text-[11px] text-right text-[#f0f0f0]">
                              {i.valor_total != null ? `$${Number(i.valor_total).toLocaleString('es-AR')}` : '—'}
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      pedido.pedido_items.map(item => (
                        <p key={item.id} className="text-[11px] text-[#c0c0c0]">{item.cantidad}× {item.producto_nombre}</p>
                      ))
                    )}
                  </div>
                )}

                {/* Form remito inline */}
                {remitoPedidoId === pedido.id && (
                  <div className="border-t border-[#2a2a2a] pt-2 space-y-2 bg-[#0d1f14] -mx-3 px-3 pb-2 rounded-b-xl">
                    <p className="text-[10px] font-semibold text-[#56d68a] uppercase tracking-wider pt-1">Cargar remito</p>
                    <div className="grid grid-cols-[1fr_72px_72px] gap-x-2 pb-1 border-b border-[#2a2a2a]">
                      <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Producto</span>
                      <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-center">Recibido</span>
                      <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-right">$ Total</span>
                    </div>
                    {(pedido.pedido_items || []).map(item => (
                      <div key={item.id} className="grid grid-cols-[1fr_72px_72px] gap-x-2 items-center">
                        <span className="text-[11px] text-[#f0f0f0] leading-tight">{item.producto_nombre}</span>
                        <input
                          type="number" min="0" step="1"
                          value={remitoItems[item.id]?.cantidad_recibida ?? ''}
                          onChange={e => setRemitoItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], cantidad_recibida: e.target.value } }))}
                          placeholder={String(item.cantidad)}
                          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-[#56d68a]"
                        />
                        <input
                          type="number" min="0" step="0.01"
                          value={remitoItems[item.id]?.valor_total ?? ''}
                          onChange={e => setRemitoItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], valor_total: e.target.value } }))}
                          placeholder="$0"
                          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#56d68a]"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setRemitoPedidoId(null); setRemitoItems({}) }}
                        className="flex-1 py-1.5 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                        Cancelar
                      </button>
                      <button onClick={() => confirmarRecepcion(pedido)} disabled={confirmando}
                        className="flex-1 py-1.5 bg-[#56d68a] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                        {confirmando ? 'Guardando...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}

                {pedido.estado === 'enviado' && remitoPedidoId !== pedido.id && (
                  <button onClick={() => abrirRemito(pedido)}
                    className="w-full bg-[#56d68a] text-black rounded-lg py-1.5 text-xs font-['Syne'] font-bold">
                    ✓ Confirmar recepción
                  </button>
                )}

                <PedidoMensajes
                  pedidoId={pedido.id}
                  mensajesIniciales={pedido.pedido_mensajes || []}
                  autorRol="local"
                  autorNombre={localNombre}
                />
              </Card>
            ))}
          </div>
        )
      }
    </div>
  )
}
