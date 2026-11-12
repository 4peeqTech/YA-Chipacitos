// Checklist de supervisión (tablas supervision_*, ver las migraciones
// 20261104180000_supervision_locales.sql y 20261111200000_supervision_v2_base.sql).

export type Resultado = 'C' | 'NC' | 'NA'

export interface Respuesta {
  r?: Resultado | null
  obs?: string
  /** No cumple puesto al cerrar la visita porque el ítem quedó sin responder. */
  auto?: boolean
  /** "Diferencia detectada ($)" en los ítems con con_monto (arqueo). Solo para análisis. */
  monto?: number | null
}

/** { idItem: { r, obs } } — los IDs son los del catálogo (p1, l1, …). */
export type Respuestas = Record<string, Respuesta>

export type TipoVisita = 'sucursal' | 'fabrica' | 'deposito' | 'mayorista'

export const TIPOS_VISITA: { valor: TipoVisita; texto: string }[] = [
  { valor: 'sucursal', texto: 'Sucursal' },
  { valor: 'fabrica', texto: 'Fábrica' },
  { valor: 'deposito', texto: 'Depósito' },
  { valor: 'mayorista', texto: 'Cliente mayorista' },
]

/** Cómo se nombra el lugar de cada tipo en pantalla (singular, plural). */
export const NOMBRE_LUGAR: Record<TipoVisita, { uno: string; varios: string }> = {
  sucursal: { uno: 'sucursal', varios: 'sucursales' },
  fabrica: { uno: 'lugar', varios: 'lugares' },
  deposito: { uno: 'lugar', varios: 'lugares' },
  mayorista: { uno: 'cliente', varios: 'clientes' },
}

/** Atributos que activan ítems condicionales. Si falta uno, el ítem se muestra. */
export interface AtributosLugar {
  horno?: 'rotativo' | 'convector' | 'ya' | 'cliente'
  jugo?: boolean
  perfil?: 'cocina' | 'congelado'
  freezer?: 'ya' | 'cliente'
  /** Cantidad de equipos de Ya! en uso (lo completa la app a partir del registro). */
  equipos?: number
  [clave: string]: unknown
}

export interface LugarSupervision {
  id: string
  nombre: string
  zona: string | null
  orden: number
  tipo: TipoVisita
  encargado: string | null
  atributos: AtributosLugar
}

export type CondicionItem =
  | 'horno_rotativo' | 'horno_convector' | 'jugo' | 'cocina'
  | 'freezer_ya' | 'horno_cliente' | 'horno_ya' | 'con_equipos'

export interface ItemSupervision {
  id: string
  bloque_id: string
  texto: string
  orden: number
  condicion?: CondicionItem | null
  con_monto?: boolean
  parametro?: string | null
}

export interface BloqueSupervision {
  id: string
  titulo: string
  referencia: string
  orden: number
  tipos?: TipoVisita[]
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
  lugar_id: string
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
  /** Ítems que se mostraron al iniciar. Null en las visitas anteriores a la v2. */
  items_visibles: string[] | null
  creado_por: string | null
  updated_at: string
}

// ── Requerimientos de la visita ────────────────────────────────────────────
// Lo que falta, lo que hay que reparar o una idea. No suma al porcentaje.

export type CategoriaRequerimiento = 'herramienta_insumo' | 'mantenimiento' | 'idea' | 'otro'
export type PrioridadRequerimiento = 'urgente' | 'no_urgente' | 'cuando_se_pueda' | 'reunion'
export type EstadoRequerimiento = 'pendiente' | 'en_gestion' | 'resuelto' | 'descartado'

export const CATEGORIAS_REQ: { valor: CategoriaRequerimiento; texto: string }[] = [
  { valor: 'herramienta_insumo', texto: 'Herramienta o insumo' },
  { valor: 'mantenimiento', texto: 'Mantenimiento o reparación' },
  { valor: 'idea', texto: 'Idea o sugerencia' },
  { valor: 'otro', texto: 'Otro' },
]
export const PRIORIDADES_REQ: { valor: PrioridadRequerimiento; texto: string }[] = [
  { valor: 'urgente', texto: 'Urgente' },
  { valor: 'no_urgente', texto: 'No urgente' },
  { valor: 'cuando_se_pueda', texto: 'Cuando se pueda' },
  { valor: 'reunion', texto: 'Para tratar en reunión' },
]
export const ESTADOS_REQ: { valor: EstadoRequerimiento; texto: string }[] = [
  { valor: 'pendiente', texto: 'Pendiente' },
  { valor: 'en_gestion', texto: 'En gestión' },
  { valor: 'resuelto', texto: 'Resuelto' },
  { valor: 'descartado', texto: 'Descartado' },
]

export interface RequerimientoSupervision {
  id: string
  lugar_id: string
  visita_id: string | null
  descripcion: string
  categoria: CategoriaRequerimiento
  prioridad: PrioridadRequerimiento
  estado: EstadoRequerimiento
  respuesta: string
  responsable: string | null
  resuelto_at: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
}
