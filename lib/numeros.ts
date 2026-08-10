/**
 * Parseo y formateo de números tolerante a coma decimal, punto de miles y
 * símbolo de moneda. Usado por cualquier input numérico de la app para que
 * "0,5" y "0.5" lleguen al mismo valor en vez de perderse en silencio.
 */

/** Parsea un string numérico. Devuelve null si está vacío o no es un número válido. */
export function parseDecimal(input: string): number | null {
  if (input == null) return null
  const trimmed = String(input).trim()
  if (!trimmed || trimmed === '#N/A') return null

  let s = trimmed.replace(/[$\s]/g, '')
  if (!s) return null

  if (s.includes('.') && s.includes(',')) {
    // Tiene ambos: el punto es separador de miles, la coma es decimal (1.234,56)
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    // Solo coma: puede ser decimal (6868,91) o miles (1,234)
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length === 3 && !parts[1].includes('.')) {
      s = s.replace(',', '')
    } else {
      s = s.replace(',', '.')
    }
  } else if (s.includes('.')) {
    // Solo punto: si hay exactamente 3 dígitos después, es miles (1.234)
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length === 3) {
      s = s.replace('.', '')
    }
  }

  const n = parseFloat(s)
  return Number.isNaN(n) ? null : n
}

/** Formatea un número con coma decimal (es-AR). */
export function formatDecimal(n: number, decimales = 2): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
}
