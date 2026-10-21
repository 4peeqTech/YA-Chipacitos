import type { PedidoItem } from '@/lib/types'
import { formatoCantidad } from '@/lib/pedidos/estados'

// Tabla pedida / enviada / recibida (D3). Las columnas sin datos se ocultan:
// un pedido pendiente muestra solo lo pedido; uno editado suma "Enviado";
// uno recibido suma "Recibido" y, si hay importes, "$".

const ORIGEN: Record<string, string> = {
  despacho: 'Agregado al despachar',
  recepcion: 'Llegó sin pedirse',
}

function enviada(i: PedidoItem) {
  return i.cantidad_enviada ?? i.cantidad
}

export default function ItemsPedido({ items, mostrarValores = true }: { items: PedidoItem[]; mostrarValores?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-faint">Sin productos.</p>

  const conEnviado = items.some(i => i.cantidad_enviada != null || (i.origen && i.origen !== 'pedido'))
  const conRecibido = items.some(i => i.cantidad_recibida != null)
  const conValor = mostrarValores && items.some(i => i.valor_total != null)
  const total = items.reduce((s, i) => s + (i.valor_total != null ? Number(i.valor_total) : 0), 0)

  const th = 'py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint'
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className={`${th} text-left`}>Producto</th>
          <th className={`${th} text-right pl-2`}>Pedido</th>
          {conEnviado && <th className={`${th} text-right pl-2`}>Enviado</th>}
          {conRecibido && <th className={`${th} text-right pl-2`}>Recibido</th>}
          {conValor && <th className={`${th} text-right pl-2`}>$</th>}
        </tr>
      </thead>
      <tbody>
        {items.map(i => {
          const env = enviada(i)
          const cambioEnvio = Number(env) !== Number(i.cantidad)
          const cambioRecepcion = i.cantidad_recibida != null && Number(i.cantidad_recibida) !== Number(env)
          return (
            <tr key={i.id} className="border-b border-border/50 last:border-0 align-top">
              <td className="py-1.5 pr-2 text-text leading-tight">
                {i.producto_nombre}
                {i.origen && ORIGEN[i.origen] && <span className="block text-2xs text-warning">{ORIGEN[i.origen]}</span>}
              </td>
              <td className="py-1.5 pl-2 text-right text-muted tabular-nums">
                {i.origen === 'pedido' || !i.origen ? formatoCantidad(i.cantidad) : '—'}
              </td>
              {conEnviado && (
                <td className={`py-1.5 pl-2 text-right tabular-nums ${cambioEnvio ? 'font-semibold text-warning' : 'text-muted'}`}>
                  {i.origen === 'recepcion' ? '—' : formatoCantidad(env)}
                </td>
              )}
              {conRecibido && (
                <td className={`py-1.5 pl-2 text-right tabular-nums ${cambioRecepcion ? 'font-semibold text-warning' : 'text-success'}`}>
                  {formatoCantidad(i.cantidad_recibida)}
                </td>
              )}
              {conValor && (
                <td className="py-1.5 pl-2 text-right text-text tabular-nums">
                  {i.valor_total != null ? `$${Number(i.valor_total).toLocaleString('es-AR')}` : '—'}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
      {conValor && (
        <tfoot>
          <tr className="border-t border-border">
            <td colSpan={1 + 1 + (conEnviado ? 1 : 0) + (conRecibido ? 1 : 0)} className="py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
              Total remito
            </td>
            <td className="py-1.5 pl-2 text-right font-bold text-accent tabular-nums">${total.toLocaleString('es-AR')}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}
