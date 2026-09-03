import Link from 'next/link'
import { ArrowRight, PackageOpen } from 'lucide-react'
import type { Remito } from '@/lib/compras/tipos'

interface PedidoItemPD {
  id: string
  descripcion: string
  cantidad: number
}

interface PedidoPD {
  id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  compras_pedido_items: PedidoItemPD[]
  compras_remitos: Remito[]
}

export default function ResumenRemitos({ pedido }: { pedido: PedidoPD }) {
  if (pedido.estado === 'borrador') return null

  const recibidoPorItem: Record<string, number> = {}
  for (const remito of pedido.compras_remitos) {
    for (const item of remito.compras_remito_items) {
      if (item.pedido_item_id) {
        recibidoPorItem[item.pedido_item_id] = (recibidoPorItem[item.pedido_item_id] ?? 0) + item.cantidad
      }
    }
  }

  const hayRemitos = pedido.compras_remitos.length > 0

  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PackageOpen size={16} className="text-[#e8c547]" />
        <h4 className="font-bold text-sm text-[#f0f0f0]">Recepción</h4>
      </div>

      {pedido.compras_pedido_items.length > 0 && (
        <div className="space-y-1">
          {pedido.compras_pedido_items.map(item => (
            <div key={item.id} className="flex items-center justify-between text-xs text-[#888]">
              <span>{item.descripcion}</span>
              <span>{recibidoPorItem[item.id] ?? 0} / {item.cantidad}</span>
            </div>
          ))}
        </div>
      )}

      {hayRemitos ? (
        <div className="space-y-1">
          {pedido.compras_remitos.map(remito => (
            <div key={remito.id} className="text-xs text-[#888] border-t border-[#2a2a2a] pt-2">
              N° {remito.numero} — {new Date(remito.fecha + 'T12:00:00').toLocaleDateString('es-AR')} ({remito.compras_remito_items.length} línea/s)
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#666]">Sin remitos cargados</p>
      )}

      <Link
        href={`/admin/compras/remitos?pedido=${pedido.id}`}
        className="inline-flex items-center gap-1 text-sm text-[#e8c547] hover:opacity-80 transition-opacity"
      >
        {hayRemitos ? 'Ver / editar remitos' : 'Cargar remito'} <ArrowRight size={14} />
      </Link>
    </div>
  )
}
