import { parseDecimal } from './numeros'

export { parseDecimal, formatDecimal } from './numeros'

/**
 * Parser CSV robusto que maneja:
 * - Campos entre comillas con comas internas (ej: "6868,91")
 * - Separador de miles con punto (ej: 103.033,65)
 * - Saltos de línea \r\n o \n
 */
export function parseCSVRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

export function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines.filter(l => l.trim()).map(parseCSVRow)
}

/** Convierte "dd/mm/yyyy" → "yyyy-mm-dd" */
export function parseFechaSheet(fecha: string): string | null {
  const parts = fecha.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Convierte "yyyy-mm-dd" → "dd/mm/yyyy" para comparar con el sheet */
export function formatDateForSheet(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** Parsea número con coma decimal y posibles puntos de miles.
 *  Soporta símbolo $, espacios, y formato "1.234" (solo punto de miles sin decimales).
 */
export function parseNumero(str: string): number {
  return parseDecimal(str) ?? 0
}
