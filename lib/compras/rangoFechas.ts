export type PresetRango = 'mes_actual' | 'mes_anterior'

export interface RangoFechas {
  desde: string // 'YYYY-MM-DD', inclusive
  hasta: string // 'YYYY-MM-DD', inclusive
}

// Usa los componentes locales del Date (no toISOString) para no
// arrastrar un corrimiento de huso horario al convertir a UTC.
function formatearFecha(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Calcula el rango de un preset relativo a `ahora`. Recibe `ahora` como
// parámetro (en vez de usar `new Date()` internamente) para que sea
// determinístico y testeable con npx tsx.
export function calcularRangoPreset(preset: PresetRango, ahora: Date): RangoFechas {
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth() // 0-11
  const mesObjetivo = preset === 'mes_actual' ? mes : mes - 1

  const desde = new Date(anio, mesObjetivo, 1)
  const hasta = new Date(anio, mesObjetivo + 1, 0) // día 0 del mes siguiente = último día del mes objetivo

  return { desde: formatearFecha(desde), hasta: formatearFecha(hasta) }
}

// Compara fechas como texto 'YYYY-MM-DD' — comparación lexicográfica
// válida para ese formato, evita reconstruir un Date por cada fila.
// `fecha` puede venir como 'YYYY-MM-DD' (columna date) o como timestamp
// ISO completo (columna timestamptz) — en ambos casos los primeros 10
// caracteres son el día.
export function fechaEnRango(fecha: string, rango: RangoFechas): boolean {
  const dia = fecha.slice(0, 10)
  return dia >= rango.desde && dia <= rango.hasta
}
