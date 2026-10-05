// A dónde lleva cada entidad del circuito. Cada pantalla destino lee su param
// y abre el modal o la ficha correspondiente; al cerrarlo, lo saca de la URL.
// Puro, como codigos.ts: sirve igual en el servidor (avisos push) que en el cliente.

export type TipoEntidad =
  | 'pedido'
  | 'remito'
  | 'factura'
  | 'gasto'
  | 'insumo'
  | 'solicitud'
  | 'conteo'
  | 'proveedor'

const BASE: Record<TipoEntidad, string> = {
  pedido: '/admin/compras/pedidos',
  remito: '/admin/compras/pedidos/remitos',
  factura: '/admin/compras/pedidos/facturas',
  gasto: '/admin/gastos',
  insumo: '/admin/compras/stock',
  solicitud: '/admin/compras/pedidos/solicitudes',
  conteo: '/admin/fabrica/conteos',
  proveedor: '/admin/proveedores',
}

export interface Entidad {
  tipo: TipoEntidad
  id: string
}

export function rutaDe({ tipo, id }: Entidad): string {
  return `${BASE[tipo]}?${tipo}=${encodeURIComponent(id)}`
}

/** Abre la carga de un remito o una factura nueva con el pedido ya elegido. */
export function rutaCargarDePedido(tipo: 'remito' | 'factura', pedidoId: string): string {
  return `${BASE[tipo]}?pedido=${encodeURIComponent(pedidoId)}`
}
