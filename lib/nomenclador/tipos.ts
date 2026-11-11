// Tipos y etiquetas del nomenclador (plan: artifact "Nomenclador — Plan técnico del MVP").

export const TIPOS = [
  'materia_prima', 'insumo', 'semielaborado', 'producto_terminado', 'presentacion', 'combo', 'concepto',
] as const
export type TipoItem = (typeof TIPOS)[number]

export const UNIDADES = ['kg', 'unidades', 'litros'] as const
export type Unidad = (typeof UNIDADES)[number]

export const SISTEMAS = ['posberry', 'fudo'] as const
export type Sistema = (typeof SISTEMAS)[number]

export const TIPO_INFO: Record<TipoItem, { label: string; plural: string; prefijo: string; color: string }> = {
  materia_prima:      { label: 'Materia prima',      plural: 'Materias primas',       prefijo: 'MP', color: 'text-warning bg-warning-bg' },
  insumo:             { label: 'Insumo',             plural: 'Insumos',               prefijo: 'IN', color: 'text-info bg-info-bg' },
  semielaborado:      { label: 'Semielaborado',      plural: 'Semielaborados',        prefijo: 'SE', color: 'text-orange bg-orange-bg' },
  producto_terminado: { label: 'Producto terminado', plural: 'Productos terminados',  prefijo: 'PT', color: 'text-success bg-green-bg' },
  presentacion:       { label: 'Presentación',       plural: 'Presentaciones',        prefijo: 'PV', color: 'text-accent-fg bg-accent-bg' },
  combo:              { label: 'Combo',              plural: 'Combos',                prefijo: 'CB', color: 'text-brand-red bg-danger-bg' },
  concepto:           { label: 'Concepto',           plural: 'Conceptos',             prefijo: 'CO', color: 'text-muted bg-surface2' },
}

/** Tipos que no llevan composición (la base lo rechaza igual). */
export const SIN_COMPOSICION: TipoItem[] = ['materia_prima', 'insumo', 'concepto']
/** Tipos sin unidad base obligatoria. */
export const UNIDAD_OPCIONAL: TipoItem[] = ['combo', 'concepto']

export const SISTEMA_LABEL: Record<Sistema, string> = { posberry: 'Posberry', fudo: 'Fudo' }

export interface ItemNom {
  id: string
  codigo: string
  tipo: TipoItem
  nombre: string
  nombres_alternativos: string[]
  categoria_id: string | null
  sabor_id: string | null
  presentacion_id: string | null
  variante_de: string | null
  unidad_base: Unidad | null
  rinde_cantidad: number | null
  notas: string | null
  a_revisar: boolean
  estado: 'activo' | 'archivado'
}

export interface ExternoNom {
  id: string
  sistema: Sistema
  codigo: string
  nombre: string
  item_id: string | null
  origen: 'excel_marcos' | 'manual'
  activo: boolean
  notas: string | null
}

export interface ComponenteNom {
  item_id: string
  componente_id: string
  cantidad: number | null
  unidad: Unidad | null
  merma_pct: number | null
  orden: number
  notas: string | null
}

export interface CategoriaNom { id: string; nombre: string; tipo: TipoItem | null; orden: number; activo: boolean }
export interface SaborNom { id: string; nombre: string; nombres_alternativos: string[]; orden: number; activo: boolean }
export interface PresentacionNom { id: string; nombre: string; cantidad: number | null; unidad: Unidad | null; orden: number; activo: boolean }

/** Minúsculas y sin acentos, para buscar "jamon" y encontrar "Jamón". */
export function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
