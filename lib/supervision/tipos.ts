// Checklist de supervisión de locales (tablas supervision_*, ver la migración
// 20261104180000_supervision_locales.sql).

export type Resultado = 'C' | 'NC' | 'NA'

export interface Respuesta {
  r?: Resultado | null
  obs?: string
  /** No cumple puesto al cerrar la visita porque el ítem quedó sin responder. */
  auto?: boolean
}

/** { idItem: { r, obs } } — los IDs son los del catálogo (p1, l1, …). */
export type Respuestas = Record<string, Respuesta>

export interface SucursalSupervision {
  id: string
  nombre: string
  zona: string
  orden: number
}

export interface ItemSupervision {
  id: string
  bloque_id: string
  texto: string
  orden: number
}

export interface BloqueSupervision {
  id: string
  titulo: string
  referencia: string
  orden: number
  items: ItemSupervision[]
}

export interface ResumenVisita {
  /** Cumple / (Cumple + No cumple). Null si no hay nada que computar. */
  pct: number | null
  cumple: number
  noCumple: number
  na: number
  sinResp: number
  /** De los No cumple, cuántos se marcaron solos al cerrar (sin responder). */
  sinResponder?: number
  bloques: Record<string, number | null>
}

export type EstadoVisita = 'en_curso' | 'cerrada'

export interface VisitaSupervision {
  id: string
  sucursal_id: string
  supervisor_nombre: string
  encargado: string | null
  fecha: string
  cierre: string | null
  estado: EstadoVisita
  respuestas: Respuestas
  obs_general: string
  anterior_id: string | null
  anterior_fecha: string | null
  pendientes_previos: string[]
  obs_previas: Record<string, string>
  resumen: ResumenVisita | null
  creado_por: string | null
  updated_at: string
}
