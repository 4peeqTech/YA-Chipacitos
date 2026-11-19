// Catálogo de permisos (épica roles y permisos, T1). Es la fuente de verdad:
// la migración 20261119120000 lo siembra en permisos_catalogo con las mismas
// claves, y _check_resolver.ts compara que no se desfasen.
//
// - Área: a qué parte de la app entra (la da el rol, nunca la persona).
// - Pantalla: un módulo de Administración (MODULOS) o Tareas, que es transversal.
// - Acción: algo puntual que no alcanza con tener la pantalla.

import { MODULOS } from '@/lib/modulos'

export type Area = 'administracion' | 'locales' | 'fabrica' | 'deposito' | 'mayorista'

export const AREAS: { clave: Area; nombre: string; ruta: string }[] = [
  { clave: 'administracion', nombre: 'Administración', ruta: '/admin' },
  { clave: 'locales',        nombre: 'Locales',        ruta: '/local' },
  { clave: 'fabrica',        nombre: 'Fábrica',        ruta: '/fabrica' },
  { clave: 'deposito',       nombre: 'Depósito',       ruta: '/deposito' },
  { clave: 'mayorista',      nombre: 'Mayorista',      ruta: '/mayorista' },
]

export function esArea(v: unknown): v is Area {
  return AREAS.some(a => a.clave === v)
}

export type TipoPermiso = 'pantalla' | 'accion'

export interface PermisoCatalogo {
  clave: string
  tipo: TipoPermiso
  /** null = transversal (Tareas, y acciones que no son de un área). */
  area: Area | null
  nombre: string
  ayuda?: string
  /** Sección del menú (pantallas de Administración), para agrupar en el editor. */
  seccion?: string
  /** Pantalla que la base solo deja usar a Admin: se ve en los editores, no se da. */
  soloAdmin?: boolean
}

/** Clave de la pantalla de un módulo de MODULOS. */
export function clavePantalla(moduloKey: string): string {
  return `pantalla:${moduloKey}`
}

const PANTALLAS: PermisoCatalogo[] = MODULOS.map(m => ({
  clave: clavePantalla(m.key),
  tipo: 'pantalla',
  area: m.key === 'tareas' ? null : 'administracion',
  nombre: m.label,
  seccion: m.section,
  soloAdmin: m.soloAdmin === true,
}))

export const ACCIONES = {
  verPlataCompras: 'compras.ver_plata',
  facturasCompras: 'compras.facturas',
  corregirCargasFabrica: 'fabrica.corregir_cargas_viejas',
  gestionarUsuarios: 'usuarios.gestionar',
  verTodasLasTareas: 'tareas.ver_todas',
} as const

const LISTA_ACCIONES: PermisoCatalogo[] = [
  {
    clave: ACCIONES.verPlataCompras, tipo: 'accion', area: 'administracion', nombre: 'Ver la plata de Compras',
    ayuda: 'Precios, facturas, gasto por proveedor, deuda, cuenta corriente y notas de crédito.',
  },
  {
    clave: ACCIONES.facturasCompras, tipo: 'accion', area: 'administracion', nombre: 'Facturas y notas de crédito',
    ayuda: 'Cargar, confirmar y anular facturas y notas de crédito, y resolver diferencias de precio.',
  },
  {
    clave: ACCIONES.corregirCargasFabrica, tipo: 'accion', area: 'fabrica', nombre: 'Corregir cargas viejas de Fábrica',
    ayuda: 'Editar y borrar producción, congelados y devoluciones de días anteriores (sin esto, solo hoy y ayer).',
  },
  {
    clave: ACCIONES.gestionarUsuarios, tipo: 'accion', area: null, nombre: 'Gestionar usuarios y roles',
    ayuda: 'Crear usuarios, cambiar roles, permisos y sucursales. No se puede dar lo que uno no tiene.',
  },
  {
    clave: ACCIONES.verTodasLasTareas, tipo: 'accion', area: null, nombre: 'Ver todas las tareas',
    ayuda: 'La vista con las tareas de todos, no solo las propias.',
  },
]

export const CATALOGO: PermisoCatalogo[] = [...PANTALLAS, ...LISTA_ACCIONES]

const POR_CLAVE = new Map(CATALOGO.map(p => [p.clave, p]))

export function permisoDelCatalogo(clave: string): PermisoCatalogo | undefined {
  return POR_CLAVE.get(clave)
}
