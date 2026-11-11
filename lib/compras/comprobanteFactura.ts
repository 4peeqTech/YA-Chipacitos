// Comprobante interno de una factura de proveedor (B2): los datos que comparten
// la imagen (`ComprobanteImagen`, vía la ruta /api/compras/facturas/[id]/comprobante)
// y el mensaje para la administración (`facturaMensaje.ts`). Funciones puras:
// las consultas viven en `cargarComprobante.ts`.
// Chequeo: `npx tsx lib/compras/_check_comprobante.ts`.

import { codigoPedido, codigoRemito } from './codigos'
import { calcularTotales } from './totalesFactura'
import { cortoBase, esCobraPor, esUnidadBase, type CobraPor } from './unidades'

export interface LineaComprobante {
  descripcion: string
  cantidad: number
  unidad: string | null
  precioUnitario: number
  alicuota: number
  /** Sin IVA, el de la base. */
  subtotal: number
  /** A2b: kg facturados y en qué unidad es el precio (subtotal = kg × precio si es 'base'). */
  cantidadBase: number | null
  precioPor: CobraPor
  /** 'kg', 'u.' o 'l' (corto), para mostrar los kg y el "/kg" del precio. */
  unidadBase: string | null
}

export interface DatosComprobante {
  facturaId: string
  /** compras_facturas.numero, tal cual (= "código de facturación"). */
  numero: string
  proveedor: { nombre: string; cuit: string | null }
  /** YYYY-MM-DD */
  fecha: string
  vencimiento: string | null
  /** P-0016 */
  pedido: string
  /** ['R-0016-01', …], por secuencia. */
  remitos: string[]
  facturadoA: { razonSocial: string; cuit: string; sucursal: string } | null
  lineas: LineaComprobante[]
  /** Los confirmados de compras_facturas (= monto del gasto), no los recalculados. */
  subtotal: number
  iva: number
  total: number
  /** Desglose de las líneas, sin las alícuotas que no suman IVA. */
  porAlicuota: { alicuota: number; base: number; iva: number }[]
  /** gastos.estado ('Pendiente de pago', 'Pagado', 'Parcial') o null sin gasto. */
  estadoPago: string | null
  confirmada: { en: string | null; por: string | null }
  /** ISO + nombre de quien lo genera. */
  generado: { en: string; por: string }
}

/** Por encima, la imagen corta y avisa "y N líneas más". El mensaje va completo. */
export const TOPE_LINEAS = 120

export interface FilasComprobante {
  factura: {
    id: string
    numero: string
    fecha: string
    fecha_vencimiento: string | null
    subtotal: number
    iva: number
    total: number
    gasto_estado: string | null
    confirmada_en: string | null
    confirmada_por_nombre: string | null
  }
  pedidoNumero: number
  /** Ya ordenados por `orden`. */
  items: {
    descripcion: string
    cantidad: number
    unidad: string | null
    precio_unitario: number
    alicuota_iva: number
    subtotal: number | null
    // A2b (opcionales: las filas viejas no los traen).
    cantidad_base?: number | null
    precio_por?: string | null
    compras_items?: { unidad_base: string | null } | null
  }[]
  remitos: { secuencia: number }[]
  local: { razon_social: string; cuit: string; sucursal: string } | null
  proveedor: { nombre: string; cuit: string | null }
  generadoPor: string
  /** ISO */
  ahora: string
}

export function armarComprobante(f: FilasComprobante): DatosComprobante {
  const lineas: LineaComprobante[] = f.items.map(i => ({
    descripcion: i.descripcion,
    cantidad: Number(i.cantidad),
    unidad: i.unidad,
    precioUnitario: Number(i.precio_unitario),
    alicuota: Number(i.alicuota_iva),
    subtotal: Number(i.subtotal ?? 0),
    cantidadBase: i.cantidad_base != null ? Number(i.cantidad_base) : null,
    precioPor: esCobraPor(i.precio_por) ? i.precio_por : 'unidad',
    unidadBase: esUnidadBase(i.compras_items?.unidad_base) ? cortoBase(i.compras_items.unidad_base) : null,
  }))
  // El desglose por alícuota sale de kg × precio en las líneas por kg (A2b).
  const { porAlicuota } = calcularTotales(
    lineas.map(l => ({
      cantidad: l.cantidad, precioUnitario: l.precioUnitario, alicuotaIva: l.alicuota,
      cantidadBase: l.cantidadBase, precioPor: l.precioPor,
    })),
  )
  return {
    facturaId: f.factura.id,
    numero: f.factura.numero,
    proveedor: { nombre: f.proveedor.nombre, cuit: f.proveedor.cuit || null },
    fecha: f.factura.fecha,
    vencimiento: f.factura.fecha_vencimiento,
    pedido: codigoPedido(f.pedidoNumero),
    remitos: [...f.remitos].sort((a, b) => a.secuencia - b.secuencia).map(r => codigoRemito(f.pedidoNumero, r.secuencia)),
    facturadoA: f.local ? { razonSocial: f.local.razon_social, cuit: f.local.cuit, sucursal: f.local.sucursal } : null,
    lineas,
    subtotal: Number(f.factura.subtotal),
    iva: Number(f.factura.iva),
    total: Number(f.factura.total),
    porAlicuota: porAlicuota.filter(g => g.iva !== 0),
    estadoPago: f.factura.gasto_estado,
    confirmada: { en: f.factura.confirmada_en, por: f.factura.confirmada_por_nombre },
    generado: { en: f.ahora, por: f.generadoPor },
  }
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', partiendo el string (sin Date: no corre el día por zona horaria). */
export function fechaNumerica(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Timestamp → 'DD/MM/YYYY HH:mm' en hora de Argentina (la ruta corre en UTC). */
export function fechaHoraNumerica(isoTimestamp: string): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(isoTimestamp))
  const p = (t: Intl.DateTimeFormatPartTypes) => partes.find(x => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

function sanear(s: string): string {
  return s.replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** `Factura-<numero>-<PROVEEDOR>.png`, solo [A-Za-z0-9-]. */
export function nombreArchivoComprobante(d: Pick<DatosComprobante, 'numero' | 'proveedor'>): string {
  const proveedor = sanear(d.proveedor.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()).slice(0, 30).replace(/-$/, '')
  const numero = sanear(d.numero)
  return `${['Factura', numero, proveedor].filter(Boolean).join('-')}.png`
}

// --- Alto de la imagen --------------------------------------------------------
// Lo comparten `altoComprobante` y `ComprobanteImagen`: si cambia el diseño,
// cambian acá y el chequeo lo detecta.
export const ALTO = {
  /** Cabecera, metadatos, encabezado de tabla, subtotal, una fila de IVA, total, pie y un margen. */
  base: 1010,
  facturadoA: 64,
  estadoPago: 40,
  /** Cada alícuota con IVA después de la primera. */
  alicuotaExtra: 48,
  linea: 56,
  lineaDoble: 88,
  minimo: 1200,
} as const

/**
 * Cuánto entra en un renglón de la columna Descripción, en em de DM Sans
 * (344 px de columna / 22 px de letra, con un 8 % de resguardo). Calibrado
 * renderizando: contar caracteres no alcanza, porque "MMMM" ocupa el doble que "iiii".
 */
export const RENGLON_DESCRIPCION_EM = 14.4

/** Ancho aproximado de un texto en DM Sans, en em. */
export function anchoEstimadoEm(texto: string): number {
  let em = 0
  for (const c of texto) {
    if (c === ' ') em += 0.26
    else if (/[ilIjtf.,:;'|!()\-/]/.test(c)) em += 0.3
    else if (/[mwMW]/.test(c)) em += 0.82
    else if (/[A-ZÁÉÍÓÚÑ]/.test(c)) em += 0.68
    else if (/\d/.test(c)) em += 0.58
    else em += 0.54
  }
  return em
}

export function lineaEsDoble(descripcion: string): boolean {
  return anchoEstimadoEm(descripcion) > RENGLON_DESCRIPCION_EM
}

export function altoComprobante(d: DatosComprobante): number {
  const visibles = d.lineas.slice(0, TOPE_LINEAS)
  let alto = ALTO.base
  if (d.facturadoA) alto += ALTO.facturadoA
  if (d.estadoPago) alto += ALTO.estadoPago
  alto += Math.max(0, d.porAlicuota.length - 1) * ALTO.alicuotaExtra
  for (const l of visibles) alto += lineaEsDoble(l.descripcion) ? ALTO.lineaDoble : ALTO.linea
  // "y N líneas más" o "Sin líneas cargadas": una fila simple.
  if (d.lineas.length > TOPE_LINEAS || d.lineas.length === 0) alto += ALTO.linea
  return Math.max(ALTO.minimo, alto)
}

/** Texto del estado de pago del gasto, o null sin gasto. */
export function textoEstadoPago(estado: string | null): string | null {
  if (!estado) return null
  if (estado === 'Pagado') return 'Pagado'
  if (estado === 'Parcial') return 'Pagado en parte'
  return 'Pendiente de pago'
}
