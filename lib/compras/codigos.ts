// Códigos visibles de Compras. El número vive en la base (secuencia global
// para pedidos, secuencia por pedido para remitos); esto solo lo formatea.
// TODO(config): numeracion.* a compras_config (prefijos y largo del relleno).

export function codigoPedido(numero: number): string {
  return `P-${String(numero).padStart(4, '0')}`
}

export function codigoRemito(numeroPedido: number, secuencia: number): string {
  return `R-${String(numeroPedido).padStart(4, '0')}-${String(secuencia).padStart(2, '0')}`
}
