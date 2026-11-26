// Acceso efectivo de quien está logueado y las decisiones que se toman con él
// (épica roles y permisos, T3). Puro: lo usan proxy.ts, los layouts y los
// componentes de cliente. El acceso lo calcula la base (mi_acceso()), con la
// misma regla que aplican sus reglas.

import { MODULOS, getModuloPorPath } from '@/lib/modulos'
import { AREAS, clavePantalla, esArea, type Area } from './catalogo'

export interface AccesoUsuario {
  id: string
  nombre: string
  rol: string
  /** Lo completa el servidor con la sesión (la RPC no lo trae). */
  email?: string
  esAdmin: boolean
  areas: Area[]
  permisos: string[]
  /** Ids de locales_config. */
  sucursales: string[]
  /** "Ver como" (T7): este es el acceso de otra persona y quien mira es esta. Solo lectura. */
  quienMira?: { id: string; nombre: string }
}

/** Lo que devuelve la RPC mi_acceso() (null si no hay sesión o la persona no está activa). */
export function accesoDesdeRpc(json: unknown): AccesoUsuario | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  return {
    id: String(j.id ?? ''),
    nombre: String(j.nombre ?? ''),
    rol: String(j.rol ?? ''),
    esAdmin: j.es_admin === true,
    areas: lista(j.areas).filter(esArea),
    permisos: lista(j.permisos),
    sucursales: lista(j.sucursales),
  }
}

export function puede(a: AccesoUsuario | null | undefined, clave: string): boolean {
  return !!a && a.permisos.includes(clave)
}

export function puedePantalla(a: AccesoUsuario | null | undefined, moduloKey: string): boolean {
  return puede(a, clavePantalla(moduloKey))
}

/** Claves de módulo (MODULOS) de las pantallas que puede abrir. */
export function pantallasDe(a: AccesoUsuario): string[] {
  return a.permisos.filter(p => p.startsWith('pantalla:')).map(p => p.slice('pantalla:'.length))
}

/** Mismo criterio que tiene_acceso_compras() en la base: alguna pantalla de Compras. */
export function tieneAccesoComprasDe(a: AccesoUsuario | null | undefined): boolean {
  return ['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'].some(m => puedePantalla(a, m))
}

export function tieneArea(a: AccesoUsuario | null | undefined, area: Area): boolean {
  return !!a && a.areas.includes(area)
}

/** Área a la que pertenece una ruta (por su prefijo); null para el resto (/ayuda, /tareas, /login…). */
export function areaDeRuta(pathname: string): Area | null {
  return AREAS.find(a => pathname === a.ruta || pathname.startsWith(a.ruta + '/'))?.clave ?? null
}

const HOME_AREA: Record<Area, string> = {
  administracion: '/admin/dashboard',
  locales: '/local/pedidos',
  fabrica: '/fabrica/registro',
  deposito: '/deposito/pedidos',
  mayorista: '/mayorista/pedidos',
}

/** Primera pantalla visible del menú de Administración que la persona puede abrir. */
export function primeraPantalla(a: AccesoUsuario): string | null {
  return MODULOS.find(m => !m.oculto && puedePantalla(a, m.key))?.href ?? null
}

function homeDeArea(a: AccesoUsuario, area: Area): string | null {
  if (!a.areas.includes(area)) return null
  // En Administración, quien no es admin arranca por su primera pantalla (como antes con los módulos).
  if (area === 'administracion' && !a.esAdmin) return primeraPantalla(a)
  return HOME_AREA[area]
}

export interface OpcionArea {
  clave: Area
  nombre: string
  /** Su pantalla de inicio para esta persona. */
  href: string
}

/** Áreas a las que puede ir, con su inicio: las opciones del selector de área (T4). */
export function opcionesDeArea(a: AccesoUsuario): OpcionArea[] {
  return AREAS.flatMap(x => {
    const href = homeDeArea(a, x.clave)
    return href ? [{ clave: x.clave, nombre: x.nombre, href }] : []
  })
}

/** A dónde va al entrar: el área preferida (T4: la última que usó) o la primera que tenga. */
export function homeDe(a: AccesoUsuario, areaPreferida?: string | null): string {
  if (areaPreferida && esArea(areaPreferida)) {
    const h = homeDeArea(a, areaPreferida)
    if (h) return h
  }
  for (const area of AREAS) {
    const h = homeDeArea(a, area.clave)
    if (h) return h
  }
  return '/ayuda'
}

export type DecisionRuta = { ok: true } | { ok: false; destino: string; sinAcceso?: string }

/**
 * Si la persona puede abrir una página. Es el chequeo de proxy.ts; también lo
 * usan los links entre pantallas para no ofrecer un salto que el proxy rebotaría.
 */
export function puedeEntrarRuta(a: AccesoUsuario, pathname: string, areaPreferida?: string | null): DecisionRuta {
  if (pathname === '/ayuda' || pathname.startsWith('/ayuda/')) return { ok: true }
  if (pathname === '/tareas' || pathname.startsWith('/tareas/')) {
    return puedePantalla(a, 'tareas') ? { ok: true } : { ok: false, destino: homeDe(a, areaPreferida) }
  }
  const area = areaDeRuta(pathname)
  if (!area) return { ok: true }
  if (!a.areas.includes(area)) return { ok: false, destino: homeDe(a, areaPreferida) }
  if (area === 'administracion' && !a.esAdmin) {
    const modulo = getModuloPorPath(pathname)
    if (!modulo || !puedePantalla(a, modulo.key)) {
      return { ok: false, destino: primeraPantalla(a) ?? '/ayuda', sinAcceso: modulo?.label ?? 'esa pantalla' }
    }
  }
  return { ok: true }
}
