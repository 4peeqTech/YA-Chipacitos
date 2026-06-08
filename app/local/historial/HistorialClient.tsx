'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pedido } from '@/lib/types'
import { BadgeEstado, BadgeDestino } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import PedidoMensajes from '@/components/pedidos/PedidoMensajes'

interface Props { pedidos: Pedido[]; localId: string; localNombre: string }

const ESTADOS = ['todos', 'pendiente', 'preparando', 'enviado', 'recibido']

export default function HistorialClient({ pedidos: init, localNombre }: Props) {
  const [pedidos, setPedidos] = useState(init)
  const [filtro, setFiltro] = useState('todos')
  const supabase = createClient()

  const filtrados = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  async function confirmar(pedidoId: string) {
    await supabase.from('pedidos').update({ estado: 'recibido', recibido_at: new Date().toISOString() }).eq('id', pedidoId)
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: 'recibido' as const } : p))
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {ESTADOS.map(e => (
          <button key={e} onClick={() => setFiltro(e)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              filtro === e ? 'bg-[#1A1A1A] text-white' : 'bg-[#111111] text-[#888] border border-[#2a2a2a]'
            }`}>
            {e === 'todos' ? 'Todos' : e === 'preparando' ? 'En preparación' : e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      {filtrados.length === 0
        ? <Card className="p-6 text-center text-xs text-[#888]">No hay pedidos.</Card>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtrados.map(pedido => (
              <Card key={pedido.id} className="px-3 py-2.5">
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
                {pedido.pedido_items && pedido.pedido_items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#2a2a2a] space-y-0.5">
                    {pedido.pedido_items.map(item => (
                      <p key={item.id} className="text-[11px] text-[#c0c0c0]">{item.cantidad}× {item.producto_nombre}</p>
                    ))}
                  </div>
                )}
                {pedido.estado === 'enviado' && (
                  <button onClick={() => confirmar(pedido.id)}
                    className="mt-2 w-full bg-[#2E7D52] text-white rounded-lg py-1.5 text-xs font-medium">
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
