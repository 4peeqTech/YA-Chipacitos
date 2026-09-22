/**
 * Formateo de fechas y números para mostrar en pantalla (es-AR). Todo date-only
 * (YYYY-MM-DD) se ancla a mediodía antes de parsear: anclar a medianoche (o no
 * anclar) corre el día mostrado un día atrás al oeste de UTC.
 */
import { formatDecimal } from './numeros'

function fechaDesdeSoloFecha(fecha: string): Date {
  return new Date(fecha.length <= 10 ? `${fecha}T12:00:00` : fecha)
}

export function formatearFecha(fecha: string, formato: 'corta' | 'larga' | 'dia' = 'corta'): string {
  const d = fechaDesdeSoloFecha(fecha)
  if (formato === 'larga') return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  if (formato === 'dia') return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatearRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias < 7) return `hace ${dias} d`
  return formatearFecha(iso)
}

export function formatearKg(kg: number, decimales = 1): string {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: decimales })} kg`
}

export function formatearMoneda(monto: number): string {
  return monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function formatearNumero(n: number, decimales = 2): string {
  return formatDecimal(n, decimales)
}
