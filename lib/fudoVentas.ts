// Ventas y caja de Fudo (Integraciones › Ventas Fudo y Resumen por local).
// Funciones puras: período, lectura del JSON:API de Fudo, totales y CSV.
// `npx tsx lib/_check_fudoVentas.ts`.

/** Un período más largo tarda demasiado y el CSV sale enorme. */
export const MAX_DIAS = 62

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const DIA_MS = 86_400_000

/** Días del período, contando los dos extremos. */
export function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1
}

export function validarPeriodo(desde: string, hasta: string): string | null {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return 'Elegí las dos fechas del período.'
  if (hasta < desde) return 'La fecha de fin no puede ser antes del inicio.'
  if (diasDelPeriodo(desde, hasta) > MAX_DIAS) return `El período puede tener hasta ${MAX_DIAS} días. Consultalo en partes.`
  return null
}

/**
 * Filtro de Fudo para los días de Argentina (UTC-3, sin horario de verano): el
 * día local va de las 03:00 UTC a las 02:59:59 UTC del día siguiente.
 */
export function filtroDiasArgentina(desde: string, hasta: string): string {
  const siguiente = new Date(Date.parse(`${hasta}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10)
  return `and(gte.${desde}T03:00:00Z,lte.${siguiente}T02:59:59Z)`
}

/** Fecha (dd/mm/aaaa) y hora (hh:mm) de Argentina de un instante de Fudo. */
export function fechaHoraArgentina(iso: string): { fecha: string; hora: string; dia: string } {
  const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString()
  return { fecha: `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`, hora: d.slice(11, 16), dia: d.slice(0, 10) }
}

export const TIPO_VENTA: Record<string, string> = {
  TAKEAWAY: 'Para llevar',
  DELIVERY: 'Delivery',
  'EAT-IN': 'En el local',
  TABLE: 'Mesa',
  COUNTER: 'Mostrador',
}

// ---------------------------------------------------------------------------
// Lectura de las páginas que devuelve Fudo (JSON:API).
// ---------------------------------------------------------------------------

type Ref = { type: string; id: string }
type Recurso = {
  id: string
  type: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { data?: Ref | Ref[] | null }>
}
export type PaginaFudo = { data: Recurso[]; included?: Recurso[] }

export interface VentaFudo {
  id: string
  local: string
  /** Instante de Fudo (UTC). */
  fecha: string
  caja: string | null
  tipo: string | null
  total: number
  /** Cobros vigentes de la venta, por medio de pago. */
  pagos: { medio: string; monto: number }[]
}

export type OrigenMovimiento = 'venta' | 'gasto' | 'otro'

export interface MovimientoFudo {
  id: string
  local: string
  fecha: string
  medio: string
  monto: number
  origen: OrigenMovimiento
  cancelado: boolean
}

const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const uno = (d: Ref | Ref[] | null | undefined): Ref | null => (Array.isArray(d) ? d[0] ?? null : d ?? null)
const varios = (d: Ref | Ref[] | null | undefined): Ref[] => (Array.isArray(d) ? d : d ? [d] : [])

function indice(paginas: PaginaFudo[]): Map<string, Recurso> {
  const m = new Map<string, Recurso>()
  for (const p of paginas) for (const r of p.included ?? []) m.set(`${r.type}:${r.id}`, r)
  return m
}

function nombre(idx: Map<string, Recurso>, ref: Ref | null): string | null {
  if (!ref) return null
  const n = idx.get(`${ref.type}:${ref.id}`)?.attributes?.name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

export function ventasDePaginas(paginas: PaginaFudo[], local: string): VentaFudo[] {
  const idx = indice(paginas)
  const res: VentaFudo[] = []
  const vistos = new Set<string>()
  for (const p of paginas) {
    for (const s of p.data) {
      if (vistos.has(s.id)) continue
      vistos.add(s.id)
      const a = s.attributes ?? {}
      const pagos: VentaFudo['pagos'] = []
      for (const ref of varios(s.relationships?.payments?.data)) {
        const pago = idx.get(`${ref.type}:${ref.id}`)
        if (!pago || pago.attributes?.canceled === true) continue
        pagos.push({ medio: nombre(idx, uno(pago.relationships?.paymentMethod?.data)) ?? 'Sin medio', monto: num(pago.attributes?.amount) })
      }
      res.push({
        id: s.id,
        local,
        fecha: String(a.createdAt ?? ''),
        caja: nombre(idx, uno(s.relationships?.cashRegister?.data)),
        tipo: typeof a.saleType === 'string' ? a.saleType : null,
        total: num(a.total),
        pagos,
      })
    }
  }
  return res
}

export function movimientosDePaginas(paginas: PaginaFudo[], local: string): MovimientoFudo[] {
  const idx = indice(paginas)
  const res: MovimientoFudo[] = []
  const vistos = new Set<string>()
  for (const p of paginas) {
    for (const m of p.data) {
      if (vistos.has(m.id)) continue
      vistos.add(m.id)
      const r = m.relationships ?? {}
      res.push({
        id: m.id,
        local,
        fecha: String(m.attributes?.createdAt ?? ''),
        medio: nombre(idx, uno(r.paymentMethod?.data)) ?? 'Sin medio',
        monto: num(m.attributes?.amount),
        origen: uno(r.sale?.data) ? 'venta' : uno(r.expense?.data) ? 'gasto' : 'otro',
        cancelado: m.attributes?.canceled === true,
      })
    }
  }
  return res
}

// ---------------------------------------------------------------------------
// Totales.
// ---------------------------------------------------------------------------

const redondear = (n: number) => Math.round(n * 100) / 100

export interface ResumenVentasLocal {
  local: string
  ventas: number
  total: number
  ticket: number
  porMedio: Record<string, number>
}

export function resumirVentas(local: string, ventas: VentaFudo[]): ResumenVentasLocal {
  const porMedio: Record<string, number> = {}
  let total = 0
  for (const v of ventas) {
    total += v.total
    for (const p of v.pagos) porMedio[p.medio] = redondear((porMedio[p.medio] ?? 0) + p.monto)
  }
  return { local, ventas: ventas.length, total: redondear(total), ticket: ventas.length ? redondear(total / ventas.length) : 0, porMedio }
}

export interface ResumenCajaLocal {
  local: string
  /** Lo cobrado por ventas y lo pagado por gastos (sin los cancelados). */
  cobros: number
  pagos: number
  otros: number
  porMedio: Record<string, { cobros: number; pagos: number; otros: number }>
}

export function resumirCaja(local: string, movimientos: MovimientoFudo[]): ResumenCajaLocal {
  const r: ResumenCajaLocal = { local, cobros: 0, pagos: 0, otros: 0, porMedio: {} }
  for (const m of movimientos) {
    if (m.cancelado) continue
    const campo = m.origen === 'venta' ? 'cobros' : m.origen === 'gasto' ? 'pagos' : 'otros'
    const medio = (r.porMedio[m.medio] ??= { cobros: 0, pagos: 0, otros: 0 })
    medio[campo] = redondear(medio[campo] + m.monto)
    r[campo] = redondear(r[campo] + m.monto)
  }
  return r
}

/** Los medios de pago, del que más movió al que menos. */
export function mediosOrdenados(porMedio: Record<string, number>[]): string[] {
  const t: Record<string, number> = {}
  for (const pm of porMedio) for (const [m, v] of Object.entries(pm)) t[m] = (t[m] ?? 0) + v
  return Object.keys(t).sort((a, b) => t[b] - t[a] || a.localeCompare(b))
}

// ---------------------------------------------------------------------------
// CSV para Excel en castellano: separador ";", coma decimal y BOM (tildes).
// ---------------------------------------------------------------------------

const campoCsv = (v: string | number | null) => {
  if (v == null) return ''
  if (typeof v === 'number') return redondear(v).toFixed(2).replace('.', ',')
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
const lineaCsv = (vs: (string | number | null)[]) => vs.map(campoCsv).join(';')
const BOM = '﻿'

export function csvVentas(ventas: VentaFudo[]): string {
  const medios = mediosOrdenados(ventas.map(v => Object.fromEntries(v.pagos.map(p => [p.medio, p.monto]))))
  const filas = [lineaCsv(['Local', 'Fecha', 'Hora', 'Caja', 'Tipo', 'Total', ...medios])]
  const ordenadas = [...ventas].sort((a, b) => a.local.localeCompare(b.local) || a.fecha.localeCompare(b.fecha))
  for (const v of ordenadas) {
    const { fecha, hora } = fechaHoraArgentina(v.fecha)
    const porMedio: Record<string, number> = {}
    for (const p of v.pagos) porMedio[p.medio] = (porMedio[p.medio] ?? 0) + p.monto
    filas.push(lineaCsv([v.local, fecha, hora, v.caja, v.tipo ? TIPO_VENTA[v.tipo] ?? v.tipo : null, v.total, ...medios.map(m => porMedio[m] ?? null)]))
  }
  return BOM + filas.join('\r\n') + '\r\n'
}

const ORIGEN_TEXTO: Record<OrigenMovimiento, string> = { venta: 'Cobro de venta', gasto: 'Pago de gasto', otro: 'Otro' }

export function csvCaja(movimientos: MovimientoFudo[]): string {
  const filas = [lineaCsv(['Local', 'Fecha', 'Hora', 'Movimiento', 'Medio de pago', 'Monto', 'Cancelado'])]
  const ordenados = [...movimientos].sort((a, b) => a.local.localeCompare(b.local) || a.fecha.localeCompare(b.fecha))
  for (const m of ordenados) {
    const { fecha, hora } = fechaHoraArgentina(m.fecha)
    filas.push(lineaCsv([m.local, fecha, hora, ORIGEN_TEXTO[m.origen], m.medio, m.monto, m.cancelado ? 'Sí' : 'No']))
  }
  return BOM + filas.join('\r\n') + '\r\n'
}

/** Fudo cortó por exceso de pedidos: conviene esperar y reintentar ese local. */
export const PEDIR_ESPERA = 'Fudo pidió esperar un rato. Probá de nuevo en unos minutos.'
/** Cuánto esperar antes de reintentar un local al que Fudo le pidió esperar. */
export const ESPERA_REINTENTO_MS = 15_000

/** "ventas-fudo_2026-10-01_2026-10-31.csv" */
export function nombreCsv(tipo: 'ventas' | 'caja', desde: string, hasta: string, local?: string): string {
  const l = local ? `_${local.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}` : ''
  return `${tipo === 'ventas' ? 'ventas' : 'caja'}-fudo${l}_${desde}_${hasta}.csv`
}
