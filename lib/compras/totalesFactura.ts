// Totales de una factura de proveedor. Funciones puras: la pantalla los calcula
// en vivo mientras se tipea y la RPC los vuelve a calcular al guardar. Los dos
// tienen que dar lo mismo, así que el redondeo imita el de la base
// (compras_factura_items.subtotal/iva son columnas generadas):
//
//   subtotal de la línea = round(cantidad × precio, 2)
//   iva de la línea      = round(subtotal × alícuota / 100, 2)
//
// y recién después se suman. Chequeo: `npx tsx lib/compras/_check_totales.ts`.

/** Las que admite el CHECK de compras_items.alicuota_iva y de las líneas. */
export const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27] as const
export type Alicuota = (typeof ALICUOTAS)[number]
export const ALICUOTA_DEFAULT: Alicuota = 21

export function esAlicuota(v: number | null | undefined): v is Alicuota {
  return v != null && (ALICUOTAS as readonly number[]).includes(v)
}

/** Etiqueta con coma decimal: 10,5 %. */
export function etiquetaAlicuota(a: number): string {
  return `${a.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
}

export interface LineaTotalizable {
  cantidad: number | null
  precioUnitario: number | null
  alicuotaIva: number
}

export interface TotalAlicuota {
  alicuota: number
  /** Suma de los subtotales de las líneas con esta alícuota. */
  base: number
  iva: number
}

export interface TotalesFactura {
  subtotal: number
  iva: number
  total: number
  /** Desglose para el pie (FA5), de menor a mayor alícuota. Sin las que no tienen base. */
  porAlicuota: TotalAlicuota[]
}

/**
 * Redondea a 2 decimales como `round(numeric, 2)` de Postgres. El paso
 * intermedio corrige el error binario de multiplicar por 100 (0,145 × 100 da
 * 14,499999999999998 en punto flotante y redondearía para abajo).
 */
export function redondear2(n: number): number {
  return Math.round(Math.round(n * 1e10) / 1e8) / 100
}

export function subtotalLinea(l: LineaTotalizable): number {
  return redondear2((l.cantidad ?? 0) * (l.precioUnitario ?? 0))
}

export function ivaLinea(l: LineaTotalizable): number {
  return redondear2((subtotalLinea(l) * l.alicuotaIva) / 100)
}

export function totalLinea(l: LineaTotalizable): number {
  return redondear2(subtotalLinea(l) + ivaLinea(l))
}

export function calcularTotales(lineas: LineaTotalizable[]): TotalesFactura {
  const grupos = new Map<number, TotalAlicuota>()
  let subtotal = 0
  let iva = 0
  for (const l of lineas) {
    const s = subtotalLinea(l)
    const i = ivaLinea(l)
    subtotal = redondear2(subtotal + s)
    iva = redondear2(iva + i)
    const g = grupos.get(l.alicuotaIva) ?? { alicuota: l.alicuotaIva, base: 0, iva: 0 }
    g.base = redondear2(g.base + s)
    g.iva = redondear2(g.iva + i)
    grupos.set(l.alicuotaIva, g)
  }
  return {
    subtotal,
    iva,
    total: redondear2(subtotal + iva),
    porAlicuota: [...grupos.values()].filter(g => g.base !== 0 || g.iva !== 0).sort((a, b) => a.alicuota - b.alicuota),
  }
}

/** FA6: a partir de cuánto avisamos que el total calculado no da igual al del papel. */
export const TOLERANCIA_PAPEL = 1

/** Diferencia contra el "Total según el papel". null si no se cargó. */
export function diferenciaPapel(total: number, totalPapel: number | null): number | null {
  if (totalPapel == null) return null
  return redondear2(totalPapel - total)
}

export function avisaPorPapel(total: number, totalPapel: number | null): boolean {
  const d = diferenciaPapel(total, totalPapel)
  return d != null && Math.abs(d) > TOLERANCIA_PAPEL
}

/**
 * FA4: cuánto se movió el precio contra el de referencia del proveedor, en %.
 * null si no hay referencia, si es 0 o si la diferencia no llega al 1 %.
 */
export function variacionPrecio(precio: number | null, referencia: number | null | undefined): number | null {
  if (precio == null || precio <= 0 || referencia == null || referencia <= 0) return null
  const pct = Math.round(((precio - referencia) / referencia) * 100)
  return pct === 0 ? null : pct
}
