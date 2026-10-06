// A dónde lleva cada entidad del circuito. Cada pantalla destino lee su param
// y abre el modal o la ficha correspondiente; al cerrarlo, lo saca de la URL.
// Puro, como codigos.ts: sirve igual en el servidor (avisos push) que en el cliente.

import type { FiltroPedidos } from './estadoPedido'

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

/** Pestañas de la ficha del proveedor (B3). */
export type PestanaProveedor = 'pedidos' | 'remitos' | 'cuenta' | 'insumos'

export type Entidad =
  | { tipo: Exclude<TipoEntidad, 'proveedor'>; id: string }
  | { tipo: 'proveedor'; id: string; pestana?: PestanaProveedor }

export function rutaDe(entidad: Entidad): string {
  const { tipo, id } = entidad
  const base = `${BASE[tipo]}?${tipo}=${encodeURIComponent(id)}`
  return entidad.tipo === 'proveedor' && entidad.pestana ? `${base}&pestana=${entidad.pestana}` : base
}

/** Pedidos ya filtrado en una pestaña (B3: el aviso de "sin factura" de Reportes). */
export function rutaPedidos(filtro: FiltroPedidos): string {
  return `${BASE.pedido}?estado=${filtro}`
}

/** Abre la carga de un remito o una factura nueva con el pedido ya elegido. */
export function rutaCargarDePedido(tipo: 'remito' | 'factura', pedidoId: string): string {
  return `${BASE[tipo]}?pedido=${encodeURIComponent(pedidoId)}`
}
