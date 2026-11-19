// Acceso efectivo de una persona (épica roles y permisos, T1). Es la misma
// regla que aplican los helpers SQL (T2); si cambia acá, cambia allá.
//
// - Áreas: las de su rol. La persona no suma ni saca áreas.
// - Permisos: los del rol + los "agregar" de la persona − los "quitar".
//   Una pantalla o acción de un área que la persona no tiene no cuenta.
// - Admin: todos los permisos del catálogo, en las áreas de su rol.

import { CATALOGO, permisoDelCatalogo, type Area } from './catalogo'

export type Efecto = 'agregar' | 'quitar'

export interface AjustePersona {
  permiso: string
  efecto: Efecto
}

export interface EntradaAcceso {
  esAdmin: boolean
  rolAreas: Area[]
  rolPermisos: string[]
  ajustes: AjustePersona[]
  /** Ids de locales_config. */
  sucursales: string[]
}

export interface Acceso {
  esAdmin: boolean
  areas: Area[]
  permisos: Set<string>
  sucursales: string[]
}

export function resolverAcceso(e: EntradaAcceso): Acceso {
  const areas = [...new Set(e.rolAreas)]
  const enSusAreas = (clave: string) => {
    const p = permisoDelCatalogo(clave)
    return !!p && (p.area == null || areas.includes(p.area))
  }

  if (e.esAdmin) {
    return { esAdmin: true, areas, permisos: new Set(CATALOGO.map(p => p.clave).filter(enSusAreas)), sucursales: [...e.sucursales] }
  }

  const permisos = new Set(e.rolPermisos)
  for (const a of e.ajustes) if (a.efecto === 'agregar') permisos.add(a.permiso)
  for (const a of e.ajustes) if (a.efecto === 'quitar') permisos.delete(a.permiso)
  for (const p of [...permisos]) if (!enSusAreas(p)) permisos.delete(p)

  return { esAdmin: false, areas, permisos, sucursales: [...e.sucursales] }
}

/** Ajustes mínimos para que una persona tenga `deseados` partiendo de los defaults de su rol. */
export function ajustesMinimos(rolPermisos: string[], deseados: string[]): AjustePersona[] {
  const rol = new Set(rolPermisos)
  const quiere = new Set(deseados)
  return [
    ...[...quiere].filter(p => !rol.has(p)).sort().map(permiso => ({ permiso, efecto: 'agregar' as const })),
    ...[...rol].filter(p => !quiere.has(p)).sort().map(permiso => ({ permiso, efecto: 'quitar' as const })),
  ]
}
