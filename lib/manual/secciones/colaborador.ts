import { UserRound } from 'lucide-react'
import type { SeccionManual } from '../tipos'

/** Descripción corta de cada módulo, para "Módulos disponibles para vos". */
export const MODULO_AYUDA: Record<string, { titulo: string; desc: string }> = {
  dashboard:         { titulo: 'Dashboard',          desc: 'Resumen del día: pedidos activos y accesos rápidos a los módulos habilitados.' },
  gastos:            { titulo: 'Gastos',             desc: 'Registro y consulta de gastos por local, rubro y categoría.' },
  gastos_pendientes: { titulo: 'Pendientes de pago', desc: 'Lista de gastos que todavía no fueron abonados. Podés marcarlos como pagados.' },
  resumen:           { titulo: 'Resumen por local',  desc: 'Total de gastos agrupados por sucursal y período.' },
  fudo:              { titulo: 'Fudo / Caja',        desc: 'Datos de caja importados desde Fudo: gastos, ventas y pagos.' },
  importar:          { titulo: 'Sincronizar',        desc: 'Importa ventas desde Google Sheets (hoja BD) o un archivo CSV de Posberry.' },
  posberry:          { titulo: 'Ventas Posberry',    desc: 'Tabla completa de ventas de Posberry, incluyendo mayoristas.' },
  conciliacion:      { titulo: 'Conciliación',       desc: 'Compara lo vendido en Posberry versus lo pedido por cada local.' },
  catalogo:          { titulo: 'Catálogo',           desc: 'Consulta y administración de productos del sistema.' },
  mapeos:            { titulo: 'Mapeo de productos', desc: 'Vincula nombres de Posberry con productos internos para la conciliación.' },
  usuarios:          { titulo: 'Usuarios',           desc: 'Alta, edición de roles y reseteo de contraseñas de cuentas.' },
  roles:             { titulo: 'Roles',              desc: 'Roles del sistema y qué módulos tiene habilitados cada uno.' },
  integraciones_ventas: { titulo: 'Ventas (integraciones)', desc: 'Ventas importadas desde los sistemas de caja.' },
  integraciones_cajas:  { titulo: 'Cajas Fudo',       desc: 'Cajas sincronizadas desde Fudo.' },
  plan_cuentas:      { titulo: 'Plan de cuentas',    desc: 'Categorías contables para clasificar gastos.' },
  proveedores:       { titulo: 'Proveedores',        desc: 'Alta y edición de proveedores vinculables a gastos.' },
  cajas:             { titulo: 'Cajas',              desc: 'Administración de cajas disponibles.' },
  formas_pago:       { titulo: 'Formas de pago',     desc: 'Alta y edición de medios de pago.' },
  tareas:            { titulo: 'Tareas',             desc: 'Tablero compartido (Board / Lista / Calendario) para gestionar tareas del equipo, con checklist, adjuntos, creación por voz e informes diarios.' },
  'compras-insumos':  { titulo: 'Insumos',           desc: 'Catálogo de insumos de compra: unidad de compra, proveedores y precios de referencia.' },
  'compras-stock':    { titulo: 'Stock',             desc: 'Stock actual de cada insumo y su historial de movimientos.' },
  'compras-pedidos':  { titulo: 'Pedidos a proveedores', desc: 'Pedidos, remitos, solicitudes de fábrica y pedido base.' },
  'compras-reportes': { titulo: 'Reportes de compras', desc: 'Gasto por proveedor, movimientos de stock y compras sugeridas contra reales.' },
  'fabrica-conteos':  { titulo: 'Conteos de fábrica', desc: 'Los conteos semanales que cerró fábrica y sus resultados.' },
}

export const colaborador: SeccionManual = {
  slug: 'colaborador',
  titulo: 'Colaborador',
  icono: UserRound,
  area: 'administracion',
  roles: ['colaborador'],
  modulos: [],
  resumen: 'Qué módulos tenés habilitados y cómo moverte por el sistema.',
  actualizado: '2026-09-23',
  apartados: [
    {
      ancla: 'tu-acceso',
      titulo: 'Tu acceso como colaborador',
      bloques: [
        { tipo: 'parrafo', texto: 'Tenés acceso a un conjunto específico de módulos del panel de administración. Solo ves y podés usar lo que el administrador habilitó para tu cuenta.' },
        { tipo: 'modulosHabilitados' },
      ],
    },
    {
      ancla: 'navegar',
      titulo: 'Cómo navegar el sistema',
      bloques: [
        { tipo: 'parrafo', texto: 'Desde el menú lateral izquierdo accedés a todos los módulos habilitados. Si necesitás acceso a algo que no ves, pedíselo al administrador.' },
        { tipo: 'tip', texto: 'Si un módulo no aparece en el menú, significa que tu cuenta no tiene permiso para usarlo.' },
      ],
    },
  ],
}
