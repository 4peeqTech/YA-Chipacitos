import { codigoPedido } from '@/lib/compras/codigos'
import type { PedidoFactura } from './datos'

/** Encabezado de los confirm: la factura y su pedido, bien legibles. */
export default function CabeceraFactura({ numero, pedido }: { numero: string; pedido: PedidoFactura | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-surface2 px-4 py-3">
      <span className="font-mono text-lg font-bold tabular-nums text-text">{numero || 'Factura'}</span>
      {pedido && (
        <span className="text-sm text-muted">
          del pedido <span className="font-mono font-semibold tabular-nums text-text">{codigoPedido(pedido.numero)}</span>
          {' · '}<span className="text-text">{pedido.proveedores?.nombre ?? '—'}</span>
        </span>
      )}
    </div>
  )
}
