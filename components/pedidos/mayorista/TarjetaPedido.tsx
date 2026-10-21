'use client'

import { Clock, MessageCircle, Package, StickyNote } from 'lucide-react'
import type { Pedido } from '@/lib/types'
import { ESTADOS_PEDIDO } from '@/lib/pedidos/estados'
import { haceCuanto } from './utiles'

interface Props {
  pedido: Pedido
  nuevo: boolean
  sinLeer: number
  ahora: number
  onAbrir: () => void
}

export default function TarjetaPedido({ pedido, nuevo, sinLeer, ahora, onAbrir }: Props) {
  const items = pedido.pedido_items ?? []
  const productos = items.filter(i => Number(i.cantidad_enviada ?? i.cantidad) > 0).length
  const editado = items.some(i => i.cantidad_enviada != null || i.origen === 'despacho')
  // Hace cuánto llegó; en camino, hace cuánto salió.
  const referencia = pedido.estado === 'enviado' && pedido.enviado_at ? pedido.enviado_at : pedido.created_at

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`group w-full text-left bg-surface border border-border border-t-[3px] ${ESTADOS_PEDIDO[pedido.estado].borde} rounded-card px-4 py-3 space-y-2 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        nuevo ? 'ring-1 ring-brand-red/50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-['Syne'] font-bold text-text text-sm truncate">{pedido.local_nombre}</p>
          <p className="text-xs text-muted mt-0.5">#{pedido.numero}</p>
        </div>
        {nuevo && (
          <span className="shrink-0 rounded-full bg-brand-red px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
            Nuevo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} aria-hidden />
          {pedido.estado === 'enviado' ? 'Salió ' : ''}{haceCuanto(referencia, ahora)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Package size={12} aria-hidden />
          {productos} producto{productos === 1 ? '' : 's'}
        </span>
        {pedido.notas && (
          <span className="inline-flex items-center gap-1" title="Tiene observaciones">
            <StickyNote size={12} aria-hidden />
            Obs.
          </span>
        )}
        {sinLeer > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 font-semibold text-accent">
            <MessageCircle size={12} aria-hidden />
            {sinLeer} sin leer
          </span>
        )}
      </div>

      {editado && <p className="text-2xs font-semibold text-warning">Con cambios en lo que se manda</p>}
    </button>
  )
}
