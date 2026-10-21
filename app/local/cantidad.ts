// Cantidades de pedidos: la coma o el punto son SIEMPRE decimales (nunca
// miles). "1,5", "1.5", "0,125" y "1,500" son 1,5 / 0,125 / 1,5. No usar
// parseDecimal acá: toma ",ddd" como miles y "0,125" daría 125.

/** Devuelve la cantidad (≥ 0, hasta 3 decimales) o null si está vacía o no es un número. */
export function parseCantidad(texto: string): number | null {
  const t = texto.trim()
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null
}

/** Cantidad para mostrar en un campo editable: coma decimal, hasta 3 decimales. */
export function cantidadATexto(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}
