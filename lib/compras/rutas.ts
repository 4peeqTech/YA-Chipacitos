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
  | 'devolucion'

const BASE: Record<TipoEntidad, string> = {
  pedido: '/admin/compras/pedidos',
  remito: '/admin/compras/pedidos/remitos',
  factura: '/admin/compras/pedidos/facturas',
  gasto: '/admin/gastos',
  insumo: '/admin/compras/stock',
  solicitud: '/admin/compras/pedidos/solicitudes',
  conteo: '/admin/fabrica/conteos',
  proveedor: '/admin/proveedores',
  // B4: la devolución vive dentro del pedido (sin pantalla propia).
  devolucion: '/admin/compras/pedidos',
}

/** Pestañas de la ficha del proveedor (B3). */
export type PestanaProveedor = 'pedidos' | 'remitos' | 'cuenta' | 'insumos'

/** Pestañas de la ficha del insumo (A2c). */
export type PestanaInsumo = 'stock' | 'compras' | 'movimientos'
export const PESTANAS_INSUMO: PestanaInsumo[] = ['stock', 'compras', 'movimientos']

export type Entidad =
  | { tipo: Exclude<TipoEntidad, 'proveedor' | 'insumo' | 'devolucion'>; id: string }
  | { tipo: 'proveedor'; id: string; pestana?: PestanaProveedor }
  | { tipo: 'insumo'; id: string; pestana?: PestanaInsumo }
  | { tipo: 'devolucion'; id: string; pedidoId: string }

export function rutaDe(entidad: Entidad): string {
  const { tipo, id } = entidad
  // B4: abre el pedido y resalta la devolución.
  if (entidad.tipo === 'devolucion') {
    return `${BASE.devolucion}?pedido=${encodeURIComponent(entidad.pedidoId)}&devolucion=${encodeURIComponent(id)}`
  }
  const base = `${BASE[tipo]}?${tipo}=${encodeURIComponent(id)}`
  return (entidad.tipo === 'proveedor' || entidad.tipo === 'insumo') && entidad.pestana
    ? `${base}&pestana=${entidad.pestana}` : base
}

/** El form del insumo en Insumos (A2c): "Editar insumo" desde la ficha. */
export function rutaEditarInsumo(id: string): string {
  return `/admin/compras/insumos?insumo=${encodeURIComponent(id)}`
}

/** Pedidos ya filtrado en una pestaña (B3: el aviso de "sin factura" de Reportes). */
export function rutaPedidos(filtro: FiltroPedidos): string {
  return `${BASE.pedido}?estado=${filtro}`
}

/** Abre la carga de un remito o una factura nueva con el pedido ya elegido. */
export function rutaCargarDePedido(tipo: 'remito' | 'factura', pedidoId: string): string {
  return `${BASE[tipo]}?pedido=${encodeURIComponent(pedidoId)}`
}
