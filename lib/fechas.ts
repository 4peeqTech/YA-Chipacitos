/**
 * Conversión entre el string `YYYY-MM-DD` que viaja a/desde Supabase y el `Date`
 * que consume el calendario, más los atajos de rango.
 *
 * Misma regla que `lib/formato.ts`: todo date-only se ancla a MEDIODÍA. Anclar a
 * medianoche (o dejar que `new Date('2026-09-28')` parsee como UTC) corre el día
 * un lugar atrás al oeste de UTC, que es exactamente donde estamos.
 */

/** `'2026-09-28'` → Date local al mediodía. Devuelve undefined si está vacío o mal formado. */
export function desdeISO(fecha: string | null | undefined): Date | undefined {
  if (!fecha) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Date → `'2026-09-28'`, leyendo los componentes LOCALES (nunca `toISOString`, que pasa a UTC). */
export function aISO(d: Date | undefined | null): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Hoy en `YYYY-MM-DD` local. */
export function hoyISO(): string {
  return aISO(new Date())
}

/** Suma días (puede ser negativo) sobre un `YYYY-MM-DD` y devuelve otro `YYYY-MM-DD`. */
export function sumarDias(fecha: string, dias: number): string {
  const d = desdeISO(fecha)
  if (!d) return fecha
  d.setDate(d.getDate() + dias)
  return aISO(d)
}

export type Atajo = { etiqueta: string; desde: string; hasta: string }

/**
 * Atajos de la columna izquierda del selector de rango. Se calculan en el
 * momento de abrir (no al importar el módulo) para que "Hoy" siga siendo hoy
 * aunque la pestaña quede abierta cruzando la medianoche.
 */
export function atajosDeRango(): Atajo[] {
  const hoy = new Date()
  const iso = (d: Date) => aISO(d)
  const dias = (n: number) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d }
  const inicioMes = (desplazamiento = 0) => new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1)
  const finMes = (desplazamiento = 0) => new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento + 1, 0)

  return [
    { etiqueta: 'Hoy', desde: iso(hoy), hasta: iso(hoy) },
    { etiqueta: 'Ayer', desde: iso(dias(-1)), hasta: iso(dias(-1)) },
    { etiqueta: 'Últimos 7 días', desde: iso(dias(-6)), hasta: iso(hoy) },
    { etiqueta: 'Últimos 30 días', desde: iso(dias(-29)), hasta: iso(hoy) },
    { etiqueta: 'Este mes', desde: iso(inicioMes()), hasta: iso(hoy) },
    { etiqueta: 'Mes pasado', desde: iso(inicioMes(-1)), hasta: iso(finMes(-1)) },
  ]
}

/** Etiqueta del botón de rango: usa el nombre del atajo si el rango coincide con uno. */
export function nombreDeRango(desde: string, hasta: string): string | null {
  if (!desde || !hasta) return null
  return atajosDeRango().find(a => a.desde === desde && a.hasta === hasta)?.etiqueta ?? null
}

/**
 * Etiqueta compacta de un periodo para el boton del filtro. Repetir el ano (y el
 * "de ... de" de es-AR) en los dos extremos daba textos como
 * "5 de sept de 2026 – 12 de sept de 2026"; se muestra una sola vez lo que se
 * comparte entre las dos puntas.
 */
export function etiquetaDeRango(desde: string, hasta: string): string {
  const d = desdeISO(desde)
  const h = desdeISO(hasta)
  if (!d || !h) return ''
  const dia = (x: Date) => String(x.getDate())
  const mes = (x: Date) => x.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')
  const anio = (x: Date) => String(x.getFullYear())

  if (desde === hasta) return `${dia(d)} ${mes(d)} ${anio(d)}`
  if (anio(d) !== anio(h)) return `${dia(d)} ${mes(d)} ${anio(d)} – ${dia(h)} ${mes(h)} ${anio(h)}`
  if (mes(d) === mes(h)) return `${dia(d)} – ${dia(h)} ${mes(h)} ${anio(h)}`
  return `${dia(d)} ${mes(d)} – ${dia(h)} ${mes(h)} ${anio(h)}`
}
