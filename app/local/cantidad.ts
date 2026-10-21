// Cantidades de pedidos: la coma o el punto son SIEMPRE decimales (nunca
// miles). "1,5", "1.5", "0,125" y "1,500" son 1,5 / 0,125 / 1,5. No usar
// parseDecimal acá: toma ",ddd" como miles y "0,125" daría 125.
// El parser es el mismo que usa el editor del mayorista (lib/numeros.ts).
export { parseCantidad } from '@/lib/numeros'

/** Cantidad para mostrar en un campo editable: coma decimal, hasta 3 decimales. */
export function cantidadATexto(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}
