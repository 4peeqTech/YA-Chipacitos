import type { ReactNode } from 'react'
import {
  LayoutDashboard, Wallet, Clock, BarChart3, Landmark,
  RefreshCw, TrendingUp, Receipt,
  Package, Link2, Users, Shield, ClipboardList, CreditCard, Factory,
  Truck, ShoppingBasket, ListTodo, Boxes, ReceiptText,
} from 'lucide-react'

export interface Modulo {
  key: string
  label: string
  icon: ReactNode
  href: string
  section?: string
  /** Escritura (y asignación en Usuarios) exclusiva de admin, sin importar modulos_permitidos. */
  soloAdmin?: boolean
  /**
   * No aparece en el Sidebar ni en el editor de permisos: la pantalla se abre
   * desde otro lado (una pestaña, un link profundo). Sigue estando en MODULOS
   * porque el guard de /admin/* de proxy.ts resuelve el permiso por href, y sin
   * su entrada heredaría el del módulo padre.
   */
  oculto?: boolean
}

// Registro único de módulos asignables. Lo usan el Sidebar (navegación),
// el guard de acceso de /admin/* para el rol squad, y el editor de
// permisos en Usuarios. Admin siempre tiene acceso a todos, sin mirar
// modulos_permitidos.
export const MODULOS: Modulo[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, href: '/admin/dashboard' },

  { key: 'gastos',            label: 'Gastos',             icon: <Wallet size={16} />, href: '/admin/gastos',            section: 'Gastos' },
  { key: 'gastos_pendientes', label: 'Pendientes de pago', icon: <Clock size={16} />, href: '/admin/gastos/pendientes', section: 'Gastos' },
  { key: 'resumen',           label: 'Resumen por local',  icon: <BarChart3 size={16} />, href: '/admin/resumen',           section: 'Gastos' },
  { key: 'fudo',               label: 'Fudo / Caja',        icon: <Landmark size={16} />, href: '/admin/fudo',              section: 'Gastos' },

  { key: 'importar',     label: 'Sincronizar',  icon: <RefreshCw size={16} />, href: '/admin/importar',     section: 'Mayorista' },
  { key: 'posberry',     label: 'Ventas Posberry', icon: <TrendingUp size={16} />, href: '/admin/posberry',     section: 'Mayorista' },
  { key: 'conciliacion', label: 'Conciliación',   icon: <BarChart3 size={16} />, href: '/admin/conciliacion', section: 'Mayorista' },

  { key: 'integraciones_ventas', label: 'Ventas',     icon: <Receipt size={16} />, href: '/admin/integraciones/ventas', section: 'Integraciones' },
  { key: 'integraciones_cajas',  label: 'Cajas Fudo', icon: <Landmark size={16} />, href: '/admin/integraciones/cajas',  section: 'Integraciones' },

  { key: 'catalogo',     label: 'Catálogo',        icon: <Package size={16} />, href: '/admin/catalogo',     section: 'Parámetros' },
  { key: 'mapeos',       label: 'Mapeo productos', icon: <Link2 size={16} />, href: '/admin/mapeos',       section: 'Parámetros' },
  { key: 'usuarios',     label: 'Usuarios',        icon: <Users size={16} />, href: '/admin/usuarios',     section: 'Parámetros' },
  { key: 'roles',        label: 'Roles',           icon: <Shield size={16} />, href: '/admin/roles',        section: 'Parámetros' },
  { key: 'plan_cuentas', label: 'Plan de cuentas', icon: <ClipboardList size={16} />, href: '/admin/plan-cuentas', section: 'Parámetros' },
  { key: 'cajas',        label: 'Cajas',           icon: <Landmark size={16} />, href: '/admin/cajas',        section: 'Parámetros' },
  { key: 'formas_pago',  label: 'Formas de pago',  icon: <CreditCard size={16} />, href: '/admin/formas-pago',  section: 'Parámetros' },

  { key: 'proveedores', label: 'Proveedores', icon: <Truck size={16} />, href: '/admin/proveedores', section: 'Proveedores', soloAdmin: true },

  { key: 'compras-insumos',  label: 'Insumos',  icon: <ShoppingBasket size={16} />, href: '/admin/compras/insumos',  section: 'Compras' },
  { key: 'compras-stock',    label: 'Stock',    icon: <Package size={16} />, href: '/admin/compras/stock',    section: 'Compras' },
  { key: 'compras-pedidos',  label: 'Pedidos',  icon: <ClipboardList size={16} />, href: '/admin/compras/pedidos',  section: 'Compras' },
  { key: 'compras-reportes', label: 'Reportes', icon: <BarChart3 size={16} />, href: '/admin/compras/reportes', section: 'Compras' },
  // Pestaña dentro de Pedidos, no ítem del menú: está acá para que el guard de
  // proxy.ts la trate como propia y no herede el permiso de compras-pedidos.
  { key: 'compras-facturas', label: 'Facturas', icon: <ReceiptText size={16} />, href: '/admin/compras/pedidos/facturas', section: 'Compras', soloAdmin: true, oculto: true },

  { key: 'fabrica-reportes',        label: 'Reportes',        icon: <BarChart3 size={16} />,   href: '/admin/fabrica/reportes',        section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-registros',       label: 'Registros',       icon: <ClipboardList size={16} />, href: '/admin/fabrica/registros',     section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-stock-terminado', label: 'Stock terminado', icon: <Boxes size={16} />,       href: '/admin/fabrica/stock-terminado', section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-conteos',    label: 'Conteos',    icon: <ClipboardList size={16} />, href: '/admin/fabrica/conteos',    section: 'Fábrica' },
  { key: 'fabrica_parametros', label: 'Parámetros', icon: <Factory size={16} />,       href: '/admin/fabrica/parametros', section: 'Fábrica', soloAdmin: true },

  { key: 'tareas', label: 'Tareas', icon: <ListTodo size={16} />, href: '/tareas' },
]

// Devuelve el módulo cuyo href coincide mejor con el pathname dado
// (el más específico / más largo), igual que el criterio de "activo"
// que ya usa Sidebar.tsx.
export function getModuloPorPath(pathname: string): Modulo | undefined {
  return [...MODULOS]
    .filter(m => pathname === m.href || pathname.startsWith(m.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

// Roles operativos: tienen su propio árbol de rutas (/local, /deposito,
// /fabrica) y no pueden borrarse ni cambiar de key (ver tabla `roles`,
// columna es_sistema). No todos nacieron como roles de sistema fijos:
// `mayorista` es un rol dinámico (creado desde /admin/roles) al que se
// le da este mismo trato de ruta fija y se protege con es_sistema=true
// igual que los demás. Cualquier otro rol —squad o uno creado a mano—
// entra al panel /admin/* y su acceso a módulos depende de
// profiles.modulos_permitidos, igual que ya funciona para squad hoy.
export const ROLES_OPERATIVOS = ['local', 'deposito', 'supervisor_fabrica', 'mayorista'] as const

export function esRolConModulos(rol: string | null | undefined): boolean {
  return !!rol && rol !== 'admin' && !ROLES_OPERATIVOS.includes(rol as typeof ROLES_OPERATIVOS[number])
}

/**
 * Si un rol con módulos (squad o personalizado) puede entrar a un pathname de
 * /admin/*: el módulo tiene que estar asignado y no ser solo de admin. Es el
 * chequeo de proxy.ts; los links entre pantallas (LinkEntidad) lo usan para no
 * ofrecer un salto que el proxy rebotaría.
 */
export function moduloPermitido(pathname: string, modulosPermitidos: string[]): boolean {
  const modulo = getModuloPorPath(pathname)
  return !!modulo && !modulo.soloAdmin && modulosPermitidos.includes(modulo.key)
}

/** Si el usuario puede abrir ese pathname de /admin/*. Admin entra a todo. */
export function puedeEntrarAdmin(pathname: string, rol: string | null | undefined, modulosPermitidos: string[]): boolean {
  if (rol === 'admin') return true
  if (!esRolConModulos(rol)) return false
  return moduloPermitido(pathname, modulosPermitidos)
}

/**
 * Módulos que dan acceso a Compras. Replica tiene_acceso_compras() en SQL
 * (desde 20261005160000, sin fabrica-conteos: ese módulo solo lee conteos).
 */
export const MODULOS_COMPRAS = ['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'] as const

/** Mismo criterio que tiene_acceso_compras(): admin, o algún módulo de Compras. */
export function tieneAccesoCompras(rol: string | null | undefined, modulosPermitidos: string[] | null | undefined): boolean {
  if (rol === 'admin') return true
  return (modulosPermitidos ?? []).some(m => (MODULOS_COMPRAS as readonly string[]).includes(m))
}

export function getRoleHome(rol: string | null | undefined): string {
  if (rol === 'local') return '/local/pedidos'
  if (rol === 'deposito') return '/deposito/pedidos'
  if (rol === 'supervisor_fabrica') return '/fabrica/registro'
  if (rol === 'mayorista') return '/fabrica/pedidos'
  return '/admin/dashboard' // admin, squad, o cualquier rol personalizado
}
