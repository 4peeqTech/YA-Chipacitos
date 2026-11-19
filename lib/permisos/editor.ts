// Reglas de los editores de acceso (épica roles y permisos, T5/T6): qué se
// muestra según las áreas del rol y cómo se tilda. Puro: lo usan la pantalla de
// Roles y la ficha de usuario; la base valida lo mismo al guardar
// (roles_guardar, persona_guardar_acceso).

import { MODULOS } from '@/lib/modulos'
import { ACCIONES, CATALOGO, clavePantalla, permisoDelCatalogo, type Area, type PermisoCatalogo } from './catalogo'

export interface SeccionPantallas {
  clave: string
  nombre: string
  pantallas: PermisoCatalogo[]
  /** Casi todo solo Admin (Fábrica en Administración, Proveedores): va plegada al final. */
  plegada: boolean
}

const OCULTOS = new Set(MODULOS.filter(m => m.oculto).map(m => clavePantalla(m.key)))
const PLEGADAS = new Set(['Fábrica', 'Proveedores'])

/** Pantallas que se tildan con estas áreas, por sección del menú. Sin Administración, solo Tareas. */
export function seccionesPantallas(areas: Area[]): SeccionPantallas[] {
  const conAdmin = areas.includes('administracion')
  const secciones = new Map<string, SeccionPantallas>()
  for (const p of CATALOGO) {
    if (p.tipo !== 'pantalla' || OCULTOS.has(p.clave)) continue
    if (p.area != null && !areas.includes(p.area)) continue
    if (!conAdmin && p.area != null) continue
    const nombre = p.seccion ?? 'Generales'
    if (!secciones.has(nombre)) secciones.set(nombre, { clave: nombre, nombre, pantallas: [], plegada: PLEGADAS.has(nombre) })
    secciones.get(nombre)!.pantallas.push(p)
  }
  // Generales primero, después el orden del menú, y las plegadas al final.
  const peso = (s: SeccionPantallas) => (s.nombre === 'Generales' ? 0 : s.plegada ? 2 : 1)
  return [...secciones.values()].sort((a, b) => peso(a) - peso(b))
}

/** Acciones que aplican con estas áreas (las transversales siempre). */
export function accionesVisibles(areas: Area[]): PermisoCatalogo[] {
  return CATALOGO.filter(p => p.tipo === 'accion' && (p.area == null || areas.includes(p.area)))
}

export function tildable(p: PermisoCatalogo): boolean {
  return !p.soloAdmin
}

/**
 * Tildar o destildar una clave. "Facturas y notas de crédito" se lee con "Ver la
 * plata de Compras": al tildar la primera se tilda la segunda, y al destildar la
 * segunda se destilda la primera. Así nunca queda una sin la otra.
 */
export function alternar(valor: ReadonlySet<string>, clave: string): Set<string> {
  const nuevo = new Set(valor)
  if (nuevo.has(clave)) {
    nuevo.delete(clave)
    if (clave === ACCIONES.verPlataCompras) nuevo.delete(ACCIONES.facturasCompras)
  } else {
    nuevo.add(clave)
    if (clave === ACCIONES.facturasCompras) nuevo.add(ACCIONES.verPlataCompras)
  }
  return nuevo
}

/** Lo que vale para estas áreas: saca claves de áreas que no tiene y las solo Admin. */
export function normalizar(valor: Iterable<string>, areas: Area[]): string[] {
  return [...new Set(valor)]
    .filter(c => {
      const p = permisoDelCatalogo(c)
      return !!p && tildable(p) && (p.area == null || areas.includes(p.area))
    })
    .sort()
}

/** Error para mostrar antes de guardar, o null. */
export function problemaAlGuardar(valor: ReadonlySet<string>): string | null {
  if (valor.has(ACCIONES.facturasCompras) && !valor.has(ACCIONES.verPlataCompras)) {
    return '"Facturas y notas de crédito" necesita "Ver la plata de Compras".'
  }
  return null
}

export function nombrePermiso(clave: string): string {
  const p = permisoDelCatalogo(clave)
  if (!p) return clave
  return p.tipo === 'pantalla' && p.seccion ? `${p.seccion} › ${p.nombre}` : p.nombre
}

export function mismosElementos(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every(x => sb.has(x))
}
