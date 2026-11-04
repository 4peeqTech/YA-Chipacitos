'use client'

import { Clock, MessageCircle, Package, PencilLine, StickyNote } from 'lucide-react'
import type { Pedido } from '@/lib/types'
import { ESTADOS_PEDIDO } from '@/lib/pedidos/estados'
import { fechaReferencia, haceCuanto } from './utiles'

interface Props {
  pedido: Pedido
  nuevo: boolean
  sinLeer: number
  ahora: number
  onAbrir: () => void
}

// Compacta (04-11, pedido de Marcos): dos renglones para ver más pedidos por
// pantalla. Muestra lo mismo que antes; los avisos pasan a chips en el renglón 2.
export default function TarjetaPedido({ pedido, nuevo, sinLeer, ahora, onAbrir }: Props) {
  const items = pedido.pedido_items ?? []
  const productos = items.filter(i => Number(i.cantidad_enviada ?? i.cantidad) > 0).length
  const editado = items.some(i => i.cantidad_enviada != null || i.origen === 'despacho')

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`group w-full text-left bg-surface border border-border border-t-[3px] ${ESTADOS_PEDIDO[pedido.estado].borde} rounded-card px-3 py-2 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        nuevo ? 'ring-1 ring-brand-red/50' : ''
      }`}
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <p className="min-w-0 truncate font-['Syne'] text-sm font-bold text-text">{pedido.local_nombre}</p>
        <span className="shrink-0 text-xs text-muted">#{pedido.numero}</span>
        {nuevo && (
          <span className="ml-auto shrink-0 self-center rounded-full bg-brand-red px-1.5 py-px text-2xs font-bold uppercase tracking-wider text-white">
            Nuevo
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} aria-hidden />
          {pedido.estado === 'enviado' ? 'Salió ' : ''}{haceCuanto(fechaReferencia(pedido), ahora)}
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
        {editado && (
          <span className="inline-flex items-center gap-1 font-semibold text-warning" title="Con cambios en lo que se manda">
            <PencilLine size={12} aria-hidden />
            Con cambios
          </span>
        )}
        {sinLeer > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-1.5 font-semibold text-accent">
            <MessageCircle size={12} aria-hidden />
            {sinLeer} sin leer
          </span>
        )}
      </div>
    </button>
  )
}
