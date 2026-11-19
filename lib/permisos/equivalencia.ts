// La regla de acceso de antes de la épica (rol + modulos_permitidos), tal como
// la aplican hoy proxy.ts, los layouts y lib/modulos.tsx, y la comparación con
// el modelo nuevo. La usan _check_resolver.ts y scripts/permisos-comparar.ts
// para probar que el pase no le cambia el acceso a nadie. Se borra en T8.

import { MODULOS } from '@/lib/modulos'
import { clavePantalla, type Area } from './catalogo'
import type { Acceso } from './resolver'

/** Áreas que da hoy cada rol con árbol propio (proxy.ts, rolRoutes). */
const AREAS_DE_ROL: Record<string, Area[]> = {
  admin: ['administracion', 'locales', 'deposito', 'fabrica'],
  local: ['locales'],
  deposito: ['deposito'],
  supervisor_fabrica: ['fabrica'],
  mayorista: ['mayorista'],
}

export interface AccesoComparable {
  areas: Area[]
  /** Claves pantalla:<módulo>. */
  pantallas: string[]
}

/** Lo que ve hoy una persona según su rol y modulos_permitidos. */
export function accesoSegunReglaVieja(rol: string, modulosPermitidos: string[]): AccesoComparable {
  const modulos = new Set(modulosPermitidos)
  if (rol === 'admin') {
    return { areas: [...AREAS_DE_ROL.admin].sort(), pantallas: MODULOS.map(m => clavePantalla(m.key)).sort() }
  }
  const areasFijas = AREAS_DE_ROL[rol]
  if (areasFijas) {
    // Roles operativos: de sus módulos solo cuenta Tareas (proxy.ts, /tareas).
    return { areas: [...areasFijas], pantallas: modulos.has('tareas') ? [clavePantalla('tareas')] : [] }
  }
  // Squad y roles personalizados: /admin con sus módulos, menos los soloAdmin.
  return {
    areas: ['administracion'],
    pantallas: MODULOS.filter(m => !m.soloAdmin && modulos.has(m.key)).map(m => clavePantalla(m.key)).sort(),
  }
}

export function comparable(a: Acceso): AccesoComparable {
  return {
    areas: [...a.areas].sort(),
    pantallas: [...a.permisos].filter(p => p.startsWith('pantalla:')).sort(),
  }
}

/** Diferencias legibles entre lo de antes y lo nuevo; vacío = equivalentes. */
export function diferencias(antes: AccesoComparable, despues: AccesoComparable): string[] {
  const res: string[] = []
  const comparar = (que: string, x: string[], y: string[]) => {
    const pierde = x.filter(v => !y.includes(v))
    const gana = y.filter(v => !x.includes(v))
    if (pierde.length) res.push(`pierde ${que}: ${pierde.join(', ')}`)
    if (gana.length) res.push(`gana ${que}: ${gana.join(', ')}`)
  }
  comparar('áreas', antes.areas, despues.areas)
  comparar('pantallas', antes.pantallas, despues.pantallas)
  return res
}
