import type { Tarea, PrioridadTarea, EstadoTarea, Turno } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

export const PRIORIDAD_META: Record<PrioridadTarea, { label: string; color: string; bg: string }> = {
  alta:  { label: 'Alta',  color: '#e84210', bg: 'rgba(232,66,16,.10)'  },
  media: { label: 'Media', color: '#f0a849', bg: 'rgba(240,168,73,.10)' },
  baja:  { label: 'Baja',  color: '#56d68a', bg: 'rgba(86,214,138,.10)' },
}

export const TURNO_META: Record<Turno, { label: string; icon: string }> = {
  manana: { label: 'Turno mañana', icon: '🌅' },
  tarde:  { label: 'Turno tarde',  icon: '🌇' },
}

export const ESTADO_META: Record<EstadoTarea, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#888888', bg: 'rgba(136,136,136,.10)' },
  en_progreso: { label: 'En progreso', color: '#f0a030', bg: 'rgba(240,160,48,.12)'  },
  completada:  { label: 'Completada',  color: '#56d68a', bg: 'rgba(86,214,138,.12)'  },
}

export function fmt(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtRelativoFecha(dateStr: string | null) {
  if (!dateStr) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(dateStr + 'T00:00:00'); fecha.setHours(0, 0, 0, 0)
  const diff = Math.round((fecha.getTime() - hoy.getTime()) / 86400000)
  if (diff < 0) return `venció hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? '' : 's'}`
  if (diff === 0) return 'vence hoy'
  if (diff === 1) return 'vence mañana'
  if (diff <= 7) return `vence en ${diff} días`
  return fmt(dateStr)
}

export function isVencida(fechaLimite: string | null, estado: EstadoTarea) {
  if (!fechaLimite || estado === 'completada') return false
  return new Date(fechaLimite + 'T23:59:59') < new Date()
}

export function esMiaTarea(tarea: Tarea, userId: string) {
  return tarea.creado_por === userId || (Array.isArray(tarea.asignado_a) && tarea.asignado_a.includes(userId))
}

const DIAS_RETENCION_COMPLETADAS_MS = 7 * 24 * 60 * 60 * 1000

// Una tarea completada hace más de 7 días se considera "vieja": se saca del
// Board y del Calendario para que esas vistas no acumulen una lista infinita,
// pero sigue disponible en la vista Lista (historial completo).
export function esCompletadaVieja(tarea: Tarea) {
  if (tarea.estado !== 'completada') return false
  const referencia = tarea.updated_at || tarea.created_at
  if (!referencia) return false
  return Date.now() - new Date(referencia).getTime() > DIAS_RETENCION_COMPLETADAS_MS
}

export function nombrePerfil(id: string, perfiles: PerfilLite[]) {
  const p = perfiles.find(x => x.id === id)
  if (!p) return '—'
  return p.local_nombre ? `${p.nombre} (${p.local_nombre})` : p.nombre
}

export const COLABORA_META: Record<'area' | 'persona', { label: string; icon: string }> = {
  area:    { label: 'Área',    icon: '🤝' },
  persona: { label: 'Persona', icon: '👤' },
}

// Los informes diarios siempre le interesan a Ricardo (Gerencia), así que
// viene precargado como destinatario por defecto — se puede sacar o sumar
// más gente igual desde el buscador.
export const DESTINATARIO_DEFAULT_INFORME_ID = '2957d327-77af-4116-a991-adac12a43c92'

export function minutosDesdeHora(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function duracionMin(inicio: string | null | undefined, fin: string | null | undefined): number | null {
  const i = minutosDesdeHora(inicio)
  const f = minutosDesdeHora(fin)
  if (i === null || f === null || f < i) return null
  return f - i
}

export function fmtHoras(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')} hs`
}

export function truncarTexto(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto
}

export function insertarVineta(textarea: HTMLTextAreaElement | null, value: string, setValue: (v: string) => void) {
  const pos = textarea ? textarea.selectionStart : value.length
  const before = value.slice(0, pos)
  const after = value.slice(pos)
  const necesitaSalto = before.length > 0 && !before.endsWith('\n')
  const inserto = `${necesitaSalto ? '\n' : ''}• `
  setValue(before + inserto + after)
  requestAnimationFrame(() => {
    if (!textarea) return
    textarea.focus()
    const p = before.length + inserto.length
    textarea.setSelectionRange(p, p)
  })
}

export async function notificarTarea({ userIds, title, body, url }: { userIds: string[]; title: string; body: string; url?: string }) {
  if (!userIds?.length) return
  try {
    await fetch('/api/notificaciones/tareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, title, body, url }),
    })
  } catch { /* notificación best-effort */ }
}
