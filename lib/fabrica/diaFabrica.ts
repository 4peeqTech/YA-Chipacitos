export const TZ_FABRICA = 'America/Argentina/Buenos_Aires'

// Intl con 'en-CA' devuelve YYYY-MM-DD directo, sin armar el string a mano.
export function diaFabrica(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_FABRICA }).format(ahora)
}

// Parsea con `new Date(`${dia}T00:00:00`)` — medianoche local, el mismo
// truco que ya usa `formatearFechaCorta()` en StockClient.tsx para no
// arrastrar el corrimiento de UTC.
export function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T00:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${d}`
}

export function diaAnterior(dia: string): string {
  return sumarDias(dia, -1)
}
