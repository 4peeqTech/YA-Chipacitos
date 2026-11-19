// Códigos visibles de Compras. El número vive en la base (secuencia global
// para pedidos, secuencia por pedido para remitos); esto solo lo formatea.
// TODO(config): numeracion.* a compras_config (prefijos y largo del relleno).

export function codigoPedido(numero: number): string {
  return `P-${String(numero).padStart(4, '0')}`
}

export function codigoRemito(numeroPedido: number, secuencia: number): string {
  return `R-${String(numeroPedido).padStart(4, '0')}-${String(secuencia).padStart(2, '0')}`
}

/**
 * Cómo se nombra un remito en el pedido: el número impreso del proveedor, que
 * es con el que Marcos los busca (19-11); sin número, el código interno.
 */
export function etiquetaRemito(numeroPedido: number, secuencia: number, numeroProveedor?: string | null): string {
  const n = numeroProveedor?.trim()
  return n ? `N° ${n}` : codigoRemito(numeroPedido, secuencia)
}

/** B4: D-0012-01 = número del pedido + secuencia por pedido (como el remito). */
export function codigoDevolucion(numeroPedido: number, secuencia: number): string {
  return `D-${String(numeroPedido).padStart(4, '0')}-${String(secuencia).padStart(2, '0')}`
}
