// Modelo de la sección Gastos: armado de filas, filtros, totales, validación del
// formulario y pendientes de pago (de la app y de Fudo). Funciones puras, sin
// React ni Supabase: `npx tsx lib/gastos/_check_modelo.ts`.

import { codigoPedido } from '@/lib/compras/codigos'
import type { Database } from '@/lib/database.types'

export type GastoFila = Database['public']['Views']['v_gastos']['Row']
export type FudoPagadoFila = Database['public']['Views']['v_fudo_gastos_pagados']['Row']

export type EstadoGasto = 'Pendiente de pago' | 'Parcial' | 'Pagado'

export function aEstadoGasto(v: string | null): EstadoGasto {
  return v === 'Pagado' || v === 'Parcial' ? v : 'Pendiente de pago'
}

/** Un gasto con los null de la vista ya resueltos. */
export interface GastoVista {
  id: string
  fecha: string
  local: string
  rubro: string
  categoria: string
  proveedorId: string | null
  proveedor: string | null
  monto: number
  formaPago: string
  estado: EstadoGasto
  observaciones: string
  fechaPago: string | null
  caja: string | null
  comprobanteUrl: string | null
  pagadoPor: string | null
  creadoPor: string | null
  /** La factura de compras de la que salió (F5), si salió de una. */
  factura: { id: string; numero: string; codigoPedido: string | null; pedidoId: string | null } | null
}

/** `pedidoDeFactura` (factura → pedido) sirve para linkear el pedido; v_gastos solo trae su número. */
export function armarGastos(filas: GastoFila[], pedidoDeFactura: Record<string, string> = {}): GastoVista[] {
  const res: GastoVista[] = []
  for (const g of filas) {
    if (!g.id) continue
    res.push({
      id: g.id,
      fecha: g.fecha ?? '',
      local: g.local ?? '—',
      rubro: g.rubro ?? '',
      categoria: g.categoria ?? '',
      proveedorId: g.proveedor_id,
      proveedor: g.proveedor_nombre,
      monto: Number(g.monto ?? 0),
      formaPago: g.forma_pago ?? '',
      estado: aEstadoGasto(g.estado),
      observaciones: g.observaciones ?? '',
      fechaPago: g.fecha_pago,
      caja: g.caja,
      comprobanteUrl: g.comprobante_url,
      pagadoPor: g.pagado_por_nombre,
      creadoPor: g.creado_por_nombre,
      factura: g.factura_id
        ? {
          id: g.factura_id,
          numero: g.factura_numero ?? '—',
          codigoPedido: g.factura_pedido_numero == null ? null : codigoPedido(g.factura_pedido_numero),
          pedidoId: pedidoDeFactura[g.factura_id] ?? null,
        }
        : null,
    })
  }
  return res.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export const pendiente = (g: Pick<GastoVista, 'estado'>) => g.estado !== 'Pagado'

// ---------------------------------------------------------------------------
// Lista de Gastos: filtros y totales.
// ---------------------------------------------------------------------------

export type FiltroEstadoGasto = 'todos' | 'pendientes' | 'pagados'

export interface FiltrosGastos {
  estado: FiltroEstadoGasto
  local: string
  busqueda: string
  desde: string
  hasta: string
}

export function enRango(fecha: string | null, desde: string, hasta: string): boolean {
  if (!fecha) return false
  const f = fecha.slice(0, 10)
  return (!desde || f >= desde) && (!hasta || f <= hasta)
}

/** Busca por proveedor, categoría, rubro, local, observaciones o número de factura. */
export function coincideBusqueda(g: GastoVista, busqueda: string): boolean {
  const q = busqueda.trim().toLowerCase()
  if (!q) return true
  return [g.proveedor, g.categoria, g.rubro, g.local, g.observaciones, g.factura?.numero, g.factura?.codigoPedido]
    .some(v => (v ?? '').toLowerCase().includes(q))
}

export function filtrarGastos(gastos: GastoVista[], f: FiltrosGastos): GastoVista[] {
  return gastos.filter(g =>
    enRango(g.fecha, f.desde, f.hasta)
    && (f.estado === 'todos' || (f.estado === 'pendientes' ? pendiente(g) : !pendiente(g)))
    && (!f.local || g.local === f.local)
    && coincideBusqueda(g, f.busqueda))
}

export interface ResumenGastos {
  /** Todo lo que se debe hoy, sin mirar el período: es la plata que falta pagar. */
  pendiente: number
  pendientesCount: number
  /** Lo que se pagó dentro del período (por fecha de pago). */
  pagadoPeriodo: number
  /** Lo que se gastó en el período (por fecha del gasto). */
  totalPeriodo: number
  gastosPeriodo: number
}

export function resumirGastos(gastos: GastoVista[], desde: string, hasta: string): ResumenGastos {
  const pendientes = gastos.filter(pendiente)
  const delPeriodo = gastos.filter(g => enRango(g.fecha, desde, hasta))
  return {
    pendiente: redondear(pendientes.reduce((s, g) => s + g.monto, 0)),
    pendientesCount: pendientes.length,
    pagadoPeriodo: redondear(gastos
      .filter(g => g.estado === 'Pagado' && enRango(g.fechaPago, desde, hasta))
      .reduce((s, g) => s + g.monto, 0)),
    totalPeriodo: redondear(delPeriodo.reduce((s, g) => s + g.monto, 0)),
    gastosPeriodo: delPeriodo.length,
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Formulario del gasto.
// ---------------------------------------------------------------------------

export interface FormGasto {
  fecha: string
  local: string
  rubro: string
  categoria: string
  proveedorId: string
  monto: number | null
  formaPago: string
  observaciones: string
  /** Solo en el alta: cargarlo ya pagado. */
  yaPagado: boolean
  fechaPago: string
  caja: string
}

export function formInicial(g: GastoVista | null, hoy: string, defaults: { local?: string; formaPago?: string } = {}): FormGasto {
  if (g) {
    return {
      fecha: g.fecha, local: g.local, rubro: g.rubro, categoria: g.categoria, proveedorId: g.proveedorId ?? '',
      monto: g.monto, formaPago: g.formaPago, observaciones: g.observaciones,
      yaPagado: false, fechaPago: hoy, caja: '',
    }
  }
  return {
    fecha: hoy, local: defaults.local ?? '', rubro: '', categoria: '', proveedorId: '', monto: null,
    formaPago: defaults.formaPago ?? '', observaciones: '', yaPagado: false, fechaPago: hoy, caja: '',
  }
}

export type CampoGasto = 'fecha' | 'local' | 'rubro' | 'categoria' | 'monto' | 'formaPago' | 'fechaPago' | 'caja'

export function validarGasto(f: FormGasto, esNuevo: boolean): { campo: CampoGasto; mensaje: string } | null {
  if (!f.fecha) return { campo: 'fecha', mensaje: 'Elegí la fecha del gasto.' }
  if (!f.local) return { campo: 'local', mensaje: 'Elegí el local al que corresponde el gasto.' }
  if (!f.rubro) return { campo: 'rubro', mensaje: 'Elegí el rubro.' }
  if (!f.categoria) return { campo: 'categoria', mensaje: 'Elegí la categoría.' }
  if (f.monto == null || f.monto <= 0) return { campo: 'monto', mensaje: 'Cargá el monto: tiene que ser mayor a $ 0.' }
  if (!f.formaPago) return { campo: 'formaPago', mensaje: 'Elegí la forma de pago.' }
  if (esNuevo && f.yaPagado) {
    if (!f.fechaPago) return { campo: 'fechaPago', mensaje: 'Elegí la fecha en que se pagó.' }
    if (!f.caja) return { campo: 'caja', mensaje: 'Elegí de qué caja salió la plata.' }
  }
  return null
}

/** Si el formulario difiere de lo guardado (para pedir confirmación al cerrar). */
export function hayCambios(f: FormGasto, inicial: FormGasto): boolean {
  return (Object.keys(f) as (keyof FormGasto)[]).some(k => f[k] !== inicial[k])
}

/** Lo que no se puede tocar de un gasto que salió de una factura. */
export function bloqueoFactura(g: GastoVista | null): string | null {
  if (!g?.factura) return null
  return `Salió de la factura ${g.factura.numero}${g.factura.codigoPedido ? ` (${g.factura.codigoPedido})` : ''}: el monto y el proveedor se corrigen en la factura.`
}

export function motivoNoEliminar(g: GastoVista): string | null {
  if (!g.factura) return null
  return `Este gasto salió de la factura ${g.factura.numero}: no se elimina desde acá. Si la factura está mal, anulala desde Compras › Facturas.`
}

// ---------------------------------------------------------------------------
// Pendientes de pago: de la app y de Fudo.
// ---------------------------------------------------------------------------

/** Un gasto de Fudo tal como llega de /api/fudo/pendientes (JSON:API ya normalizado). */
export interface FudoGastoCrudo {
  id: string | number
  sucursal: string
  date?: string | null
  description?: string | null
  amount?: number | string | null
  expenseCategory?: { name?: string | null } | null
  provider?: { name?: string | null } | null
}

export interface PendienteVista {
  origen: 'app' | 'fudo'
  /** Única entre las dos fuentes (el id de Fudo se repite entre sucursales). */
  clave: string
  id: string
  local: string
  fecha: string
  /** Lo principal: proveedor o descripción. */
  titulo: string
  /** Lo secundario: categoría, o la descripción cuando el título es el proveedor. */
  detalle: string | null
  monto: number
  formaPago: string | null
  gasto: GastoVista | null
}

export function pendienteDeGasto(g: GastoVista): PendienteVista {
  return {
    origen: 'app',
    clave: `app:${g.id}`,
    id: g.id,
    local: g.local,
    fecha: g.fecha,
    titulo: g.proveedor ?? g.categoria,
    detalle: g.proveedor ? g.categoria : (g.observaciones || null),
    monto: g.monto,
    formaPago: g.formaPago || null,
    gasto: g,
  }
}

export function pendienteDeFudo(f: FudoGastoCrudo): PendienteVista {
  const descripcion = (f.description ?? '').trim()
  const proveedor = f.provider?.name?.trim() || null
  const categoria = f.expenseCategory?.name?.trim() || null
  const titulo = descripcion || proveedor || categoria || 'Gasto de Fudo'
  const detalle = [proveedor && proveedor !== titulo ? proveedor : null, categoria && categoria !== titulo ? categoria : null]
    .filter(Boolean).join(' · ') || null
  const monto = Number(f.amount ?? 0)
  return {
    origen: 'fudo',
    clave: `fudo:${f.sucursal}:${f.id}`,
    id: String(f.id),
    local: f.sucursal,
    fecha: (f.date ?? '').slice(0, 10),
    titulo,
    detalle,
    monto: Number.isFinite(monto) ? monto : 0,
    formaPago: null,
    gasto: null,
  }
}

export interface GrupoLocal {
  local: string
  items: PendienteVista[]
  total: number
}

export type OrdenPendientes = 'viejos' | 'nuevos'

/** Por local (alfabético) y, adentro, por fecha: por defecto lo más viejo arriba, que es lo que más urge. */
export function agruparPorLocal(items: PendienteVista[], orden: OrdenPendientes = 'viejos'): GrupoLocal[] {
  const m = new Map<string, PendienteVista[]>()
  for (const i of items) m.set(i.local, [...(m.get(i.local) ?? []), i])
  return [...m.entries()]
    .map(([local, lista]) => ({
      local,
      items: [...lista].sort((a, b) => (orden === 'viejos' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha))),
      total: redondear(lista.reduce((s, i) => s + i.monto, 0)),
    }))
    .sort((a, b) => a.local.localeCompare(b.local))
}

export function filtrarPendientes(items: PendienteVista[], f: { local: string; busqueda: string; desde: string; hasta: string }): PendienteVista[] {
  const q = f.busqueda.trim().toLowerCase()
  return items.filter(i =>
    (!f.local || i.local === f.local)
    && (!f.desde || i.fecha >= f.desde)
    && (!f.hasta || i.fecha <= f.hasta)
    && (!q || [i.titulo, i.detalle, i.local].some(v => (v ?? '').toLowerCase().includes(q))))
}

/** Días desde la fecha del gasto: lo viejo se marca. */
export function diasDesde(fecha: string, hoy: string): number {
  if (!fecha || !hoy) return 0
  const d = (Date.parse(`${hoy}T12:00:00`) - Date.parse(`${fecha}T12:00:00`)) / 86_400_000
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : 0
}

// TODO(config): a compras_config si Marcos quiere otro umbral.
export const DIAS_ATRASADO = 30
