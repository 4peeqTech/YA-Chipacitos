// Modelo de la sección Gastos: armado de filas, filtros, totales, validación del
// formulario y pendientes de pago (de la app y de Fudo). Funciones puras, sin
// React ni Supabase: `npx tsx lib/gastos/_check_modelo.ts`.

import { codigoPedido } from '@/lib/compras/codigos'
import type { Database } from '@/lib/database.types'

export type GastoFila = Database['public']['Views']['v_gastos']['Row']
export type FudoPagadoFila = Database['public']['Views']['v_fudo_gastos_pagados']['Row']

// El estado lo calcula la base con la suma de pagos vigentes (gastos_pagos).
// 'Anulado': un gasto de Fudo que se canceló allá; no suma en ningún total.
export type EstadoGasto = 'Pendiente de pago' | 'Parcial' | 'Pagado' | 'Anulado'

export function aEstadoGasto(v: string | null): EstadoGasto {
  return v === 'Pagado' || v === 'Parcial' || v === 'Anulado' ? v : 'Pendiente de pago'
}

/** Un gasto con los null de la vista ya resueltos. */
export interface GastoVista {
  id: string
  /** Lo principal (proveedor, o la descripción de Fudo) y lo secundario (categoría). */
  titulo: string
  subtitulo: string
  /** Los datos que manda Fudo, si vino de ahí. */
  fudo: { descripcion: string | null; categoria: string | null; proveedor: string | null; revisar: boolean } | null
  /** Generado por un gasto que se repite: su plantilla y si el monto está por confirmar. */
  recurrente: { id: string; periodo: string | null; aConfirmar: boolean } | null
  fecha: string
  local: string
  rubro: string
  categoria: string
  proveedorId: string | null
  proveedor: string | null
  monto: number
  /** Suma de los pagos vigentes. */
  pagado: number
  /** Lo que falta pagar. */
  saldo: number
  formaPago: string
  estado: EstadoGasto
  observaciones: string
  fechaVencimiento: string | null
  vencido: boolean
  origen: OrigenGasto
  /** Cantidad de pagos vigentes y de archivos adjuntos. */
  pagos: number
  adjuntos: number
  /** Del último pago vigente. */
  ultimoPagoForma: string | null
  fechaPago: string | null
  caja: string | null
  comprobanteUrl: string | null
  pagadoPor: string | null
  creadoPor: string | null
  /** La factura de compras de la que salió (F5), si salió de una. */
  factura: { id: string; numero: string; codigoPedido: string | null; pedidoId: string | null } | null
}

/**
 * Qué se lee primero en una lista. Uno de Fudo: su descripción (o su
 * proveedor o categoría de Fudo) y, abajo, la categoría de la app o "Sin clasificar".
 */
function titulos(g: GastoFila, fudo: GastoVista['fudo']): { titulo: string; subtitulo: string } {
  if (fudo) {
    const titulo = g.proveedor_nombre ?? fudo.descripcion ?? fudo.proveedor ?? fudo.categoria ?? 'Gasto de Fudo'
    const deFudo = [fudo.proveedor, fudo.categoria].filter(v => v && v !== titulo).join(' · ')
    return { titulo, subtitulo: [g.categoria ?? 'Sin clasificar', deFudo].filter(Boolean).join(' · ') }
  }
  // Uno que se repite: la primera línea de las observaciones es el nombre de la plantilla.
  const nombrePlantilla = g.origen === 'recurrente' ? (g.observaciones ?? '').split('\n')[0].trim() : ''
  if (nombrePlantilla) {
    return { titulo: nombrePlantilla, subtitulo: [g.proveedor_nombre, g.categoria].filter(Boolean).join(' · ') }
  }
  return {
    titulo: g.proveedor_nombre ?? g.categoria ?? '—',
    subtitulo: (g.proveedor_nombre ? g.categoria : g.rubro) ?? '',
  }
}

// ---------------------------------------------------------------------------
// Gastos que se repiten (plantillas).
// ---------------------------------------------------------------------------

export type RecurrenteFila = Database['public']['Views']['v_gastos_recurrentes']['Row']

export interface FormRecurrente {
  nombre: string
  local: string
  rubro: string
  categoria: string
  proveedorId: string
  monto: number | null
  montoVariable: boolean
  formaPago: string
  diaDelMes: number | null
  /** null = sin vencimiento. */
  diasParaVencer: number | null
  desde: string
  /** '' = sin fin. */
  hasta: string
  observaciones: string
}

export function formRecurrenteInicial(r: RecurrenteFila | null, hoy: string, formaPago = ''): FormRecurrente {
  if (r) {
    return {
      nombre: r.nombre ?? '', local: r.local ?? '', rubro: r.rubro ?? '', categoria: r.categoria ?? '',
      proveedorId: r.proveedor_id ?? '', monto: r.monto == null ? null : Number(r.monto), montoVariable: r.monto_variable ?? false,
      formaPago: r.forma_pago ?? '', diaDelMes: r.dia_del_mes, diasParaVencer: r.dias_para_vencer,
      desde: r.desde ?? hoy, hasta: r.hasta ?? '', observaciones: r.observaciones ?? '',
    }
  }
  return {
    nombre: '', local: '', rubro: '', categoria: '', proveedorId: '', monto: null, montoVariable: false, formaPago,
    diaDelMes: Number(hoy.slice(8, 10)) || 1, diasParaVencer: null, desde: hoy, hasta: '', observaciones: '',
  }
}

export type CampoRecurrente = keyof FormRecurrente

export function validarRecurrente(f: FormRecurrente): { campo: CampoRecurrente; mensaje: string } | null {
  if (!f.nombre.trim()) return { campo: 'nombre', mensaje: 'Poné un nombre, por ejemplo "Alquiler San Lorenzo".' }
  if (!f.local) return { campo: 'local', mensaje: 'Elegí el local.' }
  if (!f.rubro) return { campo: 'rubro', mensaje: 'Elegí el rubro.' }
  if (!f.categoria) return { campo: 'categoria', mensaje: 'Elegí la categoría.' }
  if (f.monto == null || f.monto <= 0) return { campo: 'monto', mensaje: 'Cargá el monto: tiene que ser mayor a $ 0.' }
  if (!f.formaPago) return { campo: 'formaPago', mensaje: 'Elegí la forma de pago.' }
  if (f.diaDelMes == null || f.diaDelMes < 1 || f.diaDelMes > 31 || !Number.isInteger(f.diaDelMes)) {
    return { campo: 'diaDelMes', mensaje: 'El día del mes va del 1 al 31.' }
  }
  if (f.diasParaVencer != null && (f.diasParaVencer < 0 || f.diasParaVencer > 120 || !Number.isInteger(f.diasParaVencer))) {
    return { campo: 'diasParaVencer', mensaje: 'Los días para vencer van de 0 a 120.' }
  }
  if (!f.desde) return { campo: 'desde', mensaje: 'Elegí desde cuándo se repite.' }
  if (f.hasta && f.hasta < f.desde) return { campo: 'hasta', mensaje: 'La fecha de fin no puede ser antes del inicio.' }
  return null
}

/** "el 10 de cada mes", "el último día de cada mes" (el 31). */
export function textoDia(dia: number | null): string {
  if (!dia) return '—'
  if (dia >= 31) return 'el último día de cada mes'
  return dia > 28 ? `el ${dia} de cada mes (o el último, si el mes es más corto)` : `el ${dia} de cada mes`
}

/** `pedidoDeFactura` (factura → pedido) sirve para linkear el pedido; v_gastos solo trae su número. */
export function armarGastos(filas: GastoFila[], pedidoDeFactura: Record<string, string> = {}): GastoVista[] {
  const res: GastoVista[] = []
  for (const g of filas) {
    if (!g.id) continue
    const monto = Number(g.monto ?? 0)
    const pagado = Number(g.pagado ?? 0)
    const fudo = g.origen === 'fudo'
      ? { descripcion: g.fudo_descripcion, categoria: g.fudo_categoria, proveedor: g.fudo_proveedor, revisar: g.fudo_revisar ?? false }
      : null
    res.push({
      id: g.id,
      ...titulos(g, fudo),
      fudo,
      recurrente: g.recurrente_id ? { id: g.recurrente_id, periodo: g.periodo, aConfirmar: g.a_confirmar ?? false } : null,
      fecha: g.fecha ?? '',
      local: g.local ?? '—',
      rubro: g.rubro ?? '',
      categoria: g.categoria ?? '',
      proveedorId: g.proveedor_id,
      proveedor: g.proveedor_nombre,
      monto,
      pagado,
      saldo: g.saldo == null ? redondear(Math.max(monto - pagado, 0)) : Number(g.saldo),
      formaPago: g.forma_pago ?? '',
      estado: aEstadoGasto(g.estado),
      observaciones: g.observaciones ?? '',
      fechaVencimiento: g.fecha_vencimiento,
      vencido: g.vencido ?? false,
      origen: aOrigen(g.origen),
      pagos: Number(g.pagos ?? 0),
      adjuntos: Number(g.adjuntos ?? 0),
      ultimoPagoForma: g.ultimo_pago_forma,
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

export const pendiente = (g: Pick<GastoVista, 'estado'>) => g.estado === 'Pendiente de pago' || g.estado === 'Parcial'

// ---------------------------------------------------------------------------
// Lista de Gastos: filtros y totales.
// ---------------------------------------------------------------------------

// Los filtros viven en la URL y los aplica la base (gastos_listar): la lista
// llega filtrada y paginada.

export const POR_PAGINA = 50

export type FiltroEstadoGasto = 'todos' | 'pendientes' | 'pagados' | 'anulados'
const ESTADOS_FILTRO: readonly FiltroEstadoGasto[] = ['todos', 'pendientes', 'pagados', 'anulados']

export type OrigenGasto = 'manual' | 'factura' | 'fudo' | 'recurrente'
const ORIGENES: readonly OrigenGasto[] = ['manual', 'factura', 'fudo', 'recurrente']

function aOrigen(v: string | null): OrigenGasto {
  return ORIGENES.includes(v as OrigenGasto) ? (v as OrigenGasto) : 'manual'
}

export interface FiltrosLista {
  /** '' en los dos = todo el período. */
  desde: string
  hasta: string
  estado: FiltroEstadoGasto
  local: string
  q: string
  origen: OrigenGasto | ''
  /** Desde 1. */
  pagina: number
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const dos = (n: number) => String(n).padStart(2, '0')

/** El mes calendario de `hoy` (YYYY-MM-DD). */
export function mesDe(hoy: string): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split('-').map(Number)
  const ultimo = new Date(anio, mes, 0).getDate()
  return { desde: `${anio}-${dos(mes)}-01`, hasta: `${anio}-${dos(mes)}-${dos(ultimo)}` }
}

type Params = Record<string, string | string[] | undefined>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/** Sin fechas en la URL = el mes de hoy. `periodo=todo` = sin límite de fechas. */
export function leerFiltros(p: Params, hoy: string): FiltrosLista {
  const mes = mesDe(hoy)
  const desde = FECHA.test(uno(p.desde)) ? uno(p.desde) : ''
  const hasta = FECHA.test(uno(p.hasta)) ? uno(p.hasta) : ''
  const todo = uno(p.periodo) === 'todo'
  const estado = uno(p.estado) as FiltroEstadoGasto
  const origen = uno(p.origen) as OrigenGasto
  const pagina = Number.parseInt(uno(p.pagina), 10)
  return {
    desde: desde || hasta || todo ? desde : mes.desde,
    hasta: desde || hasta || todo ? hasta : mes.hasta,
    estado: ESTADOS_FILTRO.includes(estado) ? estado : 'todos',
    local: uno(p.local).trim(),
    q: uno(p.q).trim().slice(0, 100),
    origen: ORIGENES.includes(origen) ? origen : '',
    pagina: Number.isFinite(pagina) && pagina > 1 ? pagina : 1,
  }
}

/** La inversa de leerFiltros: lo que va en la URL (sin los valores por defecto). */
export function paramsDeFiltros(f: FiltrosLista, hoy: string): string {
  const s = new URLSearchParams()
  const mes = mesDe(hoy)
  if (!f.desde && !f.hasta) s.set('periodo', 'todo')
  else if (f.desde !== mes.desde || f.hasta !== mes.hasta) {
    if (f.desde) s.set('desde', f.desde)
    if (f.hasta) s.set('hasta', f.hasta)
  }
  if (f.estado !== 'todos') s.set('estado', f.estado)
  if (f.local) s.set('local', f.local)
  if (f.q.trim()) s.set('q', f.q.trim())
  if (f.origen) s.set('origen', f.origen)
  if (f.pagina > 1) s.set('pagina', String(f.pagina))
  return s.toString()
}

/** Si algo difiere de lo que muestra la pantalla al entrar (el mes de hoy, todo). */
export function hayFiltros(f: FiltrosLista, hoy: string): boolean {
  return paramsDeFiltros({ ...f, pagina: 1 }, hoy) !== ''
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
  /** Suma de lo que muestra la lista con todos los filtros. */
  filtradoTotal: number
}

/** El jsonb de gastos_resumen. */
export function leerResumen(j: unknown): ResumenGastos {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  const n = (k: string) => {
    const v = Number(o[k] ?? 0)
    return Number.isFinite(v) ? redondear(v) : 0
  }
  return {
    pendiente: n('pendiente'),
    pendientesCount: n('pendientes_count'),
    pagadoPeriodo: n('pagado_periodo'),
    totalPeriodo: n('total_periodo'),
    gastosPeriodo: n('gastos_periodo'),
    filtradoTotal: n('filtrado_total'),
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
  /** '' = sin vencimiento. */
  fechaVencimiento: string
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
      fechaVencimiento: g.fechaVencimiento ?? '', yaPagado: false, fechaPago: hoy, caja: '',
    }
  }
  return {
    fecha: hoy, local: defaults.local ?? '', rubro: '', categoria: '', proveedorId: '', monto: null,
    formaPago: defaults.formaPago ?? '', observaciones: '', fechaVencimiento: '', yaPagado: false, fechaPago: hoy, caja: '',
  }
}

export type CampoGasto = 'fecha' | 'local' | 'rubro' | 'categoria' | 'monto' | 'formaPago' | 'fechaVencimiento' | 'fechaPago' | 'caja'

/** `deFudo`: se puede guardar sin clasificar (entra así de Fudo); si se elige rubro, pide categoría. */
export function validarGasto(f: FormGasto, esNuevo: boolean, deFudo = false): { campo: CampoGasto; mensaje: string } | null {
  if (!f.fecha) return { campo: 'fecha', mensaje: 'Elegí la fecha del gasto.' }
  if (!f.local) return { campo: 'local', mensaje: 'Elegí el local al que corresponde el gasto.' }
  if (!f.rubro && !deFudo) return { campo: 'rubro', mensaje: 'Elegí el rubro.' }
  if (f.rubro && !f.categoria) return { campo: 'categoria', mensaje: 'Elegí la categoría.' }
  if (f.monto == null || f.monto <= 0) return { campo: 'monto', mensaje: 'Cargá el monto: tiene que ser mayor a $ 0.' }
  if (!f.formaPago) return { campo: 'formaPago', mensaje: 'Elegí la forma de pago.' }
  if (f.fechaVencimiento && f.fechaVencimiento < f.fecha) {
    return { campo: 'fechaVencimiento', mensaje: 'El vencimiento no puede ser antes de la fecha del gasto.' }
  }
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
  if (g.factura) {
    return `Este gasto salió de la factura ${g.factura.numero}: no se elimina desde acá. Si la factura está mal, anulala desde Compras › Facturas.`
  }
  if (g.origen === 'fudo') return 'Este gasto viene de Fudo: no se elimina desde acá. Si está mal, se anula en Fudo.'
  if (g.pagos > 0) return 'Este gasto tiene pagos registrados: anulalos antes de eliminarlo.'
  return null
}

// ---------------------------------------------------------------------------
// Pagos y adjuntos de un gasto.
// ---------------------------------------------------------------------------

export type PagoFila = Database['public']['Views']['v_gastos_pagos']['Row']
export type AdjuntoFila = Database['public']['Tables']['gastos_adjuntos']['Row']

export interface PagoVista {
  id: string
  fecha: string
  monto: number
  formaPago: string
  caja: string | null
  comprobanteUrl: string | null
  origen: 'app' | 'fudo'
  registradoPor: string | null
  anulado: { en: string; por: string | null; motivo: string | null } | null
}

/** Los vigentes primero (el más reciente arriba) y después los anulados. */
export function armarPagos(filas: PagoFila[]): PagoVista[] {
  return filas
    .filter((p): p is PagoFila & { id: string } => !!p.id)
    .map(p => ({
      id: p.id,
      fecha: p.fecha ?? '',
      monto: Number(p.monto ?? 0),
      formaPago: p.forma_pago ?? '',
      caja: p.caja,
      comprobanteUrl: p.comprobante_url,
      origen: p.origen === 'fudo' ? 'fudo' as const : 'app' as const,
      registradoPor: p.registrado_por_nombre,
      anulado: p.anulado_en ? { en: p.anulado_en, por: p.anulado_por_nombre, motivo: p.anulado_motivo } : null,
    }))
    .sort((a, b) => Number(!!a.anulado) - Number(!!b.anulado) || b.fecha.localeCompare(a.fecha))
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
  /** Si tiene vencimiento: lo atrasado se mide por él y no por la fecha del gasto. */
  vencimiento: string | null
  vencido: boolean
  gasto: GastoVista | null
}

export function pendienteDeGasto(g: GastoVista): PendienteVista {
  return {
    origen: 'app',
    clave: `app:${g.id}`,
    id: g.id,
    local: g.local,
    fecha: g.fecha,
    titulo: g.titulo,
    detalle: g.fudo ? g.subtitulo : g.proveedor ? g.categoria : (g.observaciones || null),
    // Lo que falta: un gasto pagado en parte se paga por el saldo.
    monto: g.saldo,
    formaPago: g.formaPago || null,
    vencimiento: g.fechaVencimiento,
    vencido: g.vencido,
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
    vencimiento: null,
    vencido: false,
    gasto: null,
  }
}

/** Atrasado: si tiene vencimiento, cuando venció; si no, a los DIAS_ATRASADO de la fecha. */
export function atraso(p: Pick<PendienteVista, 'fecha' | 'vencimiento' | 'vencido'>, hoy: string): string | null {
  if (p.vencimiento) return p.vencido ? `venció el ${p.vencimiento.split('-').reverse().slice(0, 2).join('/')}` : null
  const dias = diasDesde(p.fecha, hoy)
  return dias >= DIAS_ATRASADO ? `hace ${dias} días` : null
}

export interface FiltrosPendientes { desde: string; hasta: string; local: string; q: string; orden: OrdenPendientes }

export function leerFiltrosPendientes(p: Record<string, string | string[] | undefined>): FiltrosPendientes {
  const uno1 = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  const fecha = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  return {
    desde: fecha(uno1(p.desde)),
    hasta: fecha(uno1(p.hasta)),
    local: uno1(p.local).trim(),
    q: uno1(p.q).trim().slice(0, 100),
    orden: uno1(p.orden) === 'nuevos' ? 'nuevos' : 'viejos',
  }
}

export function paramsDePendientes(f: FiltrosPendientes): string {
  const s = new URLSearchParams()
  if (f.desde) s.set('desde', f.desde)
  if (f.hasta) s.set('hasta', f.hasta)
  if (f.local) s.set('local', f.local)
  if (f.q.trim()) s.set('q', f.q.trim())
  if (f.orden !== 'viejos') s.set('orden', f.orden)
  return s.toString()
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
