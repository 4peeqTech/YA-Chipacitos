import type { NivelCumplimiento } from './calculos'

// Hora de Argentina fija: el servidor (Vercel, UTC) y el celular tienen que
// dar el mismo texto, si no React tira error de hidratación.
const ZONA = 'America/Argentina/Buenos_Aires'

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit' })
}

/** Colores del porcentaje: verde desde 85 %, dorado desde 65 %, rojo debajo. */
export const COLOR_NIVEL: Record<NivelCumplimiento, { texto: string; fondo: string; hex: string }> = {
  alto:  { texto: 'text-success',   fondo: 'bg-success',   hex: '#56d68a' },
  medio: { texto: 'text-accent',    fondo: 'bg-accent',    hex: '#e8c547' },
  bajo:  { texto: 'text-brand-red', fondo: 'bg-brand-red', hex: '#e84210' },
}
