import type { DestinoProducto, Pedido } from '@/lib/types'

export function nombreDestino(destino: DestinoProducto) {
  return destino === 'fabrica' ? 'Mayorista' : 'Depósito'
}

export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** El que despacha cambió algo de lo pedido (cantidad, quitó o agregó un producto). */
export function fabricaCambio(pedido: Pedido) {
  return (pedido.pedido_items ?? []).some(i =>
    i.origen === 'despacho' || (i.cantidad_enviada != null && Number(i.cantidad_enviada) !== Number(i.cantidad)),
  )
}

/** Productos que importan para el local: los pedidos y los agregados al despachar. */
export function cantidadProductos(pedido: Pedido) {
  return (pedido.pedido_items ?? []).filter(i => i.origen !== 'recepcion').length
}
