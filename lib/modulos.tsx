import type { ReactNode } from 'react'
import {
  LayoutDashboard, Wallet, Clock, BarChart3, Landmark,
  RefreshCw, TrendingUp, Receipt,
  Package, Link2, Users, Shield, ClipboardList, CreditCard, Factory,
  Truck, ShoppingBasket, ListTodo, Boxes, ReceiptText, BellRing,
} from 'lucide-react'
import { IconBooks, IconClipboardCheck, IconPlugConnected, IconRepeat, IconTags, IconTruckDelivery } from '@tabler/icons-react'

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

// Registro único de pantallas de Administración. Lo usan el Sidebar
// (navegación), el catálogo de permisos (lib/permisos/catalogo: cada módulo es
// una pantalla) y el guard de /admin/* (lib/permisos/acceso, puedeEntrarRuta).
export const MODULOS: Modulo[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, href: '/admin/dashboard' },

  { key: 'gastos',            label: 'Gastos',             icon: <Wallet size={16} />, href: '/admin/gastos',            section: 'Gastos' },
  { key: 'gastos_pendientes', label: 'Pendientes de pago', icon: <Clock size={16} />, href: '/admin/gastos/pendientes', section: 'Gastos' },
  { key: 'gastos_recurrentes', label: 'Que se repiten',    icon: <IconRepeat size={16} />, href: '/admin/gastos/recurrentes', section: 'Gastos', soloAdmin: true },
  { key: 'gastos_clasificar', label: 'Clasificar Fudo',    icon: <IconTags size={16} />, href: '/admin/gastos/clasificar', section: 'Gastos', soloAdmin: true },
  { key: 'plan_cuentas',      label: 'Plan de cuentas',    icon: <ClipboardList size={16} />, href: '/admin/plan-cuentas',      section: 'Gastos' },
  { key: 'resumen',           label: 'Resumen por local',  icon: <BarChart3 size={16} />, href: '/admin/resumen',           section: 'Gastos' },

  // Pedidos de los locales al mayorista, solo para consultar (26-10). El tablero y el
  // stock son del rol mayorista en /mayorista; el catálogo, en Parámetros → Catálogo.
  { key: 'pedidos_locales', label: 'Pedidos de locales', icon: <IconTruckDelivery size={16} />, href: '/admin/pedidos', section: 'Mayorista', soloAdmin: true },
  { key: 'importar',     label: 'Sincronizar',  icon: <RefreshCw size={16} />, href: '/admin/importar',     section: 'Mayorista' },
  { key: 'posberry',     label: 'Ventas Posberry', icon: <TrendingUp size={16} />, href: '/admin/posberry',     section: 'Mayorista' },
  { key: 'conciliacion', label: 'Conciliación',   icon: <BarChart3 size={16} />, href: '/admin/conciliacion', section: 'Mayorista' },

  { key: 'integraciones_ventas', label: 'Ventas Fudo', icon: <Receipt size={16} />, href: '/admin/integraciones/ventas', section: 'Integraciones' },
  { key: 'integraciones_fudo',   label: 'Conexión Fudo', icon: <IconPlugConnected size={16} />, href: '/admin/integraciones/fudo', section: 'Integraciones', soloAdmin: true },

  { key: 'nomenclador',  label: 'Nomenclador',     icon: <IconBooks size={16} />, href: '/admin/nomenclador',  section: 'Parámetros' },
  { key: 'catalogo',     label: 'Catálogo de productos', icon: <Package size={16} />, href: '/admin/catalogo',     section: 'Parámetros' },
  { key: 'mapeos',       label: 'Mapeo productos', icon: <Link2 size={16} />, href: '/admin/mapeos',       section: 'Parámetros' },
  { key: 'usuarios',     label: 'Usuarios',        icon: <Users size={16} />, href: '/admin/usuarios',     section: 'Parámetros' },
  { key: 'roles',        label: 'Roles',           icon: <Shield size={16} />, href: '/admin/roles',        section: 'Parámetros' },
  { key: 'cajas',        label: 'Cajas',           icon: <Landmark size={16} />, href: '/admin/cajas',        section: 'Parámetros' },
  { key: 'formas_pago',  label: 'Formas de pago',  icon: <CreditCard size={16} />, href: '/admin/formas-pago',  section: 'Parámetros' },

  { key: 'proveedores', label: 'Proveedores', icon: <Truck size={16} />, href: '/admin/proveedores', section: 'Proveedores', soloAdmin: true },

  { key: 'compras-insumos',  label: 'Insumos',  icon: <ShoppingBasket size={16} />, href: '/admin/compras/insumos',  section: 'Compras' },
  { key: 'compras-stock',    label: 'Stock',    icon: <Package size={16} />, href: '/admin/compras/stock',    section: 'Compras' },
  { key: 'compras-pedidos',  label: 'Pedidos',  icon: <ClipboardList size={16} />, href: '/admin/compras/pedidos',  section: 'Compras' },
  { key: 'compras-reportes', label: 'Reportes', icon: <BarChart3 size={16} />, href: '/admin/compras/reportes', section: 'Compras' },
  // B5: parámetros de los avisos de compras. No entra en MODULOS_COMPRAS (es de admin).
  { key: 'compras-avisos',   label: 'Avisos',   icon: <BellRing size={16} />, href: '/admin/compras/avisos',   section: 'Compras', soloAdmin: true },
  // Pestaña dentro de Pedidos, no ítem del menú: está acá para que el guard de
  // proxy.ts la trate como propia y no herede el permiso de compras-pedidos.
  { key: 'compras-facturas', label: 'Facturas', icon: <ReceiptText size={16} />, href: '/admin/compras/pedidos/facturas', section: 'Compras', soloAdmin: true, oculto: true },

  { key: 'fabrica-reportes',        label: 'Reportes',        icon: <BarChart3 size={16} />,   href: '/admin/fabrica/reportes',        section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-registros',       label: 'Registros',       icon: <ClipboardList size={16} />, href: '/admin/fabrica/registros',     section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-stock-terminado', label: 'Stock terminado', icon: <Boxes size={16} />,       href: '/admin/fabrica/stock-terminado', section: 'Fábrica', soloAdmin: true },
  { key: 'fabrica-conteos',    label: 'Conteos',    icon: <ClipboardList size={16} />, href: '/admin/fabrica/conteos',    section: 'Fábrica' },
  { key: 'fabrica_parametros', label: 'Parámetros', icon: <Factory size={16} />,       href: '/admin/fabrica/parametros', section: 'Fábrica', soloAdmin: true },

  // Checklist del Supervisor de locales (04-11). La RLS de las tablas supervision_*
  // mira este mismo key (puede_supervisar()).
  { key: 'supervision', label: 'Supervisión de locales', icon: <IconClipboardCheck size={16} />, href: '/admin/supervision' },

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

/** Pantallas que dan acceso a Compras: el mismo criterio que tiene_acceso_compras() en SQL. */
export const MODULOS_COMPRAS = ['compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'] as const
