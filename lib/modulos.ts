export interface Modulo {
  key: string
  label: string
  icon: string
  href: string
  section?: string
  /** Escritura (y asignación en Usuarios) exclusiva de admin, sin importar modulos_permitidos. */
  soloAdmin?: boolean
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

  { key: 'integraciones_ventas', label: 'Ventas',     icon: '🧾', href: '/admin/integraciones/ventas', section: 'Integraciones' },
  { key: 'integraciones_cajas',  label: 'Cajas Fudo', icon: '🏦', href: '/admin/integraciones/cajas',  section: 'Integraciones' },

  { key: 'catalogo',     label: 'Catálogo',        icon: '📦', href: '/admin/catalogo',     section: 'Parámetros' },
  { key: 'mapeos',       label: 'Mapeo productos', icon: '🔗', href: '/admin/mapeos',       section: 'Parámetros' },
  { key: 'usuarios',     label: 'Usuarios',        icon: '👥', href: '/admin/usuarios',     section: 'Parámetros' },
  { key: 'roles',        label: 'Roles',           icon: '🎭', href: '/admin/roles',        section: 'Parámetros' },
  { key: 'plan_cuentas', label: 'Plan de cuentas', icon: '📋', href: '/admin/plan-cuentas', section: 'Parámetros' },
  { key: 'proveedores',  label: 'Proveedores',     icon: '🚚', href: '/admin/proveedores',  section: 'Parámetros' },
  { key: 'cajas',        label: 'Cajas',           icon: '🏦', href: '/admin/cajas',        section: 'Parámetros' },
  { key: 'formas_pago',  label: 'Formas de pago',  icon: '💳', href: '/admin/formas-pago',  section: 'Parámetros' },
  { key: 'fabrica_parametros', label: 'Fábrica', icon: '🏭', href: '/admin/fabrica-parametros', section: 'Parámetros', soloAdmin: true },

  { key: 'compras-insumos', label: 'Insumos', icon: '🧺', href: '/admin/compras/insumos', section: 'Compras' },
  { key: 'compras-stock',   label: 'Stock',   icon: '📦', href: '/admin/compras/stock',   section: 'Compras' },
  { key: 'compras-pedidos', label: 'Pedidos', icon: '📋', href: '/admin/compras/pedidos', section: 'Compras' },
  { key: 'compras-remitos', label: 'Remitos', icon: '📥', href: '/admin/compras/remitos', section: 'Compras' },
  { key: 'compras-solicitudes', label: 'Solicitudes', icon: '📨', href: '/admin/compras/solicitudes', section: 'Compras' },
  { key: 'compras-pedido-base', label: 'Pedido base', icon: '🗂️', href: '/admin/compras/pedido-base', section: 'Compras' },
  { key: 'compras-conteos', label: 'Control de Stock', icon: '📝', href: '/admin/compras/conteos', section: 'Compras' },

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

// Roles operativos: tienen su propio árbol de rutas (/local, /deposito,
// /fabrica) y no pueden borrarse ni cambiar de key (ver tabla `roles`,
// columna es_sistema). Cualquier otro rol —squad o uno creado a mano—
// entra al panel /admin/* y su acceso a módulos depende de
// profiles.modulos_permitidos, igual que ya funciona para squad hoy.
export const ROLES_OPERATIVOS = ['local', 'deposito', 'supervisor_fabrica'] as const

export function esRolConModulos(rol: string | null | undefined): boolean {
  return !!rol && rol !== 'admin' && !ROLES_OPERATIVOS.includes(rol as typeof ROLES_OPERATIVOS[number])
}

export function getRoleHome(rol: string | null | undefined): string {
  if (rol === 'local') return '/local/pedidos'
  if (rol === 'deposito') return '/deposito/pedidos'
  if (rol === 'supervisor_fabrica') return '/fabrica/registro'
  return '/admin/dashboard' // admin, squad, o cualquier rol personalizado
}
