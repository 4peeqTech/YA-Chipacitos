import { Rol } from './types'

export interface Modulo {
  key: string
  label: string
  icon: string
  href: string
  section?: string
}

// Registro único de módulos asignables. Lo usan el Sidebar (navegación),
// el guard de acceso de /admin/* para el rol squad, y el editor de
// permisos en Usuarios. Admin siempre tiene acceso a todos, sin mirar
// modulos_permitidos.
export const MODULOS: Modulo[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠', href: '/admin/dashboard' },

  { key: 'gastos',            label: 'Gastos',             icon: '💰', href: '/admin/gastos',            section: 'Gastos' },
  { key: 'gastos_pendientes', label: 'Pendientes de pago', icon: '⏳', href: '/admin/gastos/pendientes', section: 'Gastos' },
  { key: 'resumen',           label: 'Resumen por local',  icon: '📊', href: '/admin/resumen',           section: 'Gastos' },
  { key: 'fudo',               label: 'Fudo / Caja',        icon: '🏧', href: '/admin/fudo',              section: 'Gastos' },

  { key: 'importar',     label: 'Sincronizar',  icon: '🔄', href: '/admin/importar',     section: 'Mayorista' },
  { key: 'posberry',     label: 'Ventas Posberry', icon: '📈', href: '/admin/posberry',     section: 'Mayorista' },
  { key: 'conciliacion', label: 'Conciliación',   icon: '📊', href: '/admin/conciliacion', section: 'Mayorista' },

  { key: 'catalogo',     label: 'Catálogo',        icon: '📦', href: '/admin/catalogo',     section: 'Parámetros' },
  { key: 'mapeos',       label: 'Mapeo productos', icon: '🔗', href: '/admin/mapeos',       section: 'Parámetros' },
  { key: 'usuarios',     label: 'Usuarios',        icon: '👥', href: '/admin/usuarios',     section: 'Parámetros' },
  { key: 'plan_cuentas', label: 'Plan de cuentas', icon: '📋', href: '/admin/plan-cuentas', section: 'Parámetros' },
  { key: 'proveedores',  label: 'Proveedores',     icon: '🚚', href: '/admin/proveedores',  section: 'Parámetros' },
  { key: 'locales',      label: 'APIs',            icon: '🔌', href: '/admin/locales',      section: 'Parámetros' },
  { key: 'cajas',        label: 'Cajas',           icon: '🏦', href: '/admin/cajas',        section: 'Parámetros' },
  { key: 'formas_pago',  label: 'Formas de pago',  icon: '💳', href: '/admin/formas-pago',  section: 'Parámetros' },

  { key: 'tareas', label: 'Tareas', icon: '📋', href: '/tareas' },
]

// Devuelve el módulo cuyo href coincide mejor con el pathname dado
// (el más específico / más largo), igual que el criterio de "activo"
// que ya usa Sidebar.tsx.
export function getModuloPorPath(pathname: string): Modulo | undefined {
  return [...MODULOS]
    .filter(m => pathname === m.href || pathname.startsWith(m.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

export const ROLE_HOME: Record<Rol, string> = {
  local:    '/local/pedidos',
  deposito: '/deposito/pedidos',
  fabrica:  '/fabrica/pedidos',
  admin:    '/admin/dashboard',
  squad:    '/admin/dashboard',
}
