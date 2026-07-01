import type { Tarea, PrioridadTarea, EstadoTarea } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

export const PRIORIDAD_META: Record<PrioridadTarea, { label: string; color: string; bg: string }> = {
  alta:  { label: 'Alta',  color: '#e84210', bg: 'rgba(232,66,16,.10)'  },
  media: { label: 'Media', color: '#f0a849', bg: 'rgba(240,168,73,.10)' },
  baja:  { label: 'Baja',  color: '#56d68a', bg: 'rgba(86,214,138,.10)' },
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

export function nombrePerfil(id: string, perfiles: PerfilLite[]) {
  const p = perfiles.find(x => x.id === id)
  if (!p) return '—'
  return p.local_nombre ? `${p.nombre} (${p.local_nombre})` : p.nombre
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
