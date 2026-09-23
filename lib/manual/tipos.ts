import type { LucideIcon } from 'lucide-react'
import type { Dominio, ESTADOS } from '@/lib/estados'

/**
 * El manual es contenido como datos: una sección por archivo en
 * lib/manual/secciones/. Escribir o corregir texto no toca componentes.
 *
 * Texto enriquecido mínimo en los strings: **negrita** para nombres de botones
 * y pantallas (tal cual aparecen en la app) y `código` para lo que se tipea.
 */

/** Rol que ve la sección. 'colaborador' = cualquier rol con módulos (squad o
 * uno creado a mano en Roles). Admin ve todo siempre. */
export type RolManual = 'local' | 'deposito' | 'supervisor_fabrica' | 'mayorista' | 'admin' | 'colaborador'

export type Area = 'dia-a-dia' | 'compras' | 'fabrica' | 'administracion'

export interface Captura {
  /** Ruta bajo /public, ej. '/manual/compras-remitos/lista.png'. */
  src: string
  alt: string
  ancho: number
  alto: number
}

type BloqueEstados = {
  [D in Dominio]: {
    tipo: 'estados'
    dominio: D
    estados: { estado: keyof (typeof ESTADOS)[D] & string; texto: string }[]
  }
}[Dominio]

export type Bloque =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'pasos'; pasos: { texto: string; captura?: Captura }[] }
  | { tipo: 'lista'; titulo?: string; items: string[] }
  | BloqueEstados
  | { tipo: 'queHagoSi'; casos: { situacion: string; camino: string }[] }
  | { tipo: 'tip'; texto: string }
  | { tipo: 'alerta'; texto: string }
  /** Lista dinámica de los módulos que el usuario tiene habilitados (colaboradores). */
  | { tipo: 'modulosHabilitados' }

export interface Apartado {
  /** Ancla estable: /ayuda/<slug>#<ancla>. La usan los íconos `?` de cada pantalla. */
  ancla: string
  titulo: string
  bloques: Bloque[]
}

export interface Novedad {
  fecha: string // 'AAAA-MM-DD'
  texto: string
}

export interface SeccionManual {
  slug: string
  titulo: string
  icono: LucideIcon
  area: Area
  roles: RolManual[]
  /** Keys de MODULOS: un colaborador la ve si tiene alguno habilitado. */
  modulos: string[]
  resumen: string
  actualizado: string // 'AAAA-MM-DD'
  /** Sección todavía incompleta: aviso arriba de la sección. */
  pendiente?: string
  /** Sección todavía sin contenido (la llena una entrega futura): el índice la marca "Próximamente". */
  proximamente?: boolean
  novedades?: Novedad[]
  apartados: Apartado[]
}
