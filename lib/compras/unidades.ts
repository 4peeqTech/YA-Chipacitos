// Unidades de medida de un insumo (A2b, decisiones U1–U3). Funciones puras.
//
//   unidad       → unidad de compra y de stock ("Caja"). El stock se cuenta acá.
//   unidadBase   → kg | unidades | litros. La de la receta y la de los kg reales.
//   contenido    → cuánta unidad base trae 1 unidad de compra (nominal: 16,5 kg).
//   cobraPor     → por proveedor: 'unidad' ($/Caja) o 'base' ($/kg).
//
// Los kg reales son información: nunca mueven stock. Chequeo:
// `npx tsx lib/compras/_check_unidades.ts`.

export type UnidadBase = 'kg' | 'unidades' | 'litros'
export type CobraPor = 'unidad' | 'base'

export const UNIDADES_BASE: { valor: UnidadBase; label: string; corto: string }[] = [
  { valor: 'kg', label: 'Kilos', corto: 'kg' },
  { valor: 'unidades', label: 'Unidades', corto: 'u.' },
  { valor: 'litros', label: 'Litros', corto: 'l' },
]

/** E9 (a): aviso si los kg reales se alejan más que esto del nominal. */
export const TOLERANCIA_NOMINAL_PCT = 10
/** E9 (b): aviso si los kg de la factura se alejan más que esto de los del remito. */
export const TOLERANCIA_REMITO_PCT = 1

export interface UnidadesInsumo {
  unidad: string | null
  unidadBase: UnidadBase
  contenido: number
}

export function esUnidadBase(v: unknown): v is UnidadBase {
  return v === 'kg' || v === 'unidades' || v === 'litros'
}

export function esCobraPor(v: unknown): v is CobraPor {
  return v === 'unidad' || v === 'base'
}

/** 'kg', 'u.' o 'l'. */
export function cortoBase(b: UnidadBase): string {
  return UNIDADES_BASE.find(x => x.valor === b)?.corto ?? b
}

export function labelBase(b: UnidadBase): string {
  return UNIDADES_BASE.find(x => x.valor === b)?.label ?? b
}

const SINONIMOS: Record<UnidadBase, RegExp> = {
  kg: /^(kg|kgs|kilo|kilos|kilogramos?)\.?$/i,
  litros: /^(l|lt|lts|litro|litros)\.?$/i,
  unidades: /^(u|un|unid|unidad|unidades)\.?$/i,
}

/** La unidad de compra es la misma que la base ("kg" en un insumo en kg). */
function unidadEsLaBase(u: UnidadesInsumo): boolean {
  const unidad = (u.unidad ?? '').trim()
  return unidad === '' || SINONIMOS[u.unidadBase].test(unidad)
}

/** Hay conversión que mostrar: el contenido no es 1, o la unidad de compra no es la base ("Caja" vs. "kg"). */
export function tieneConversion(u: UnidadesInsumo): boolean {
  if (!(u.contenido > 0)) return false
  if (u.contenido !== 1) return true
  // 1 Unid. = 1 unidad: nada que mostrar.
  if (u.unidadBase === 'unidades') return false
  return !unidadEsLaBase(u)
}

/** 'Caja' para 'unidad'; 'kg' para 'base'. Sin unidad de compra: 'unidad'. */
export function etiquetaCobraPor(c: CobraPor, u: UnidadesInsumo): string {
  if (c === 'base') return cortoBase(u.unidadBase)
  const unidad = (u.unidad ?? '').trim()
  return unidad || 'unidad'
}

/** Número con coma decimal y hasta `decimales` decimales: 56,1. */
export function numeroCorto(n: number, decimales = 1): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: decimales })
}

export function equivalenteBase(cantidad: number, u: UnidadesInsumo): number {
  return cantidad * u.contenido
}

/** '3,4 Caja ≈ 56,1 kg'. null si no hay conversión. Hasta 1 decimal, coma decimal. */
export function textoEquivalencia(cantidad: number, u: UnidadesInsumo): string | null {
  if (!tieneConversion(u)) return null
  const unidad = (u.unidad ?? '').trim()
  return `${numeroCorto(cantidad)}${unidad ? ` ${unidad}` : ''} ≈ ${numeroCorto(equivalenteBase(cantidad, u))} ${cortoBase(u.unidadBase)}`
}

/** Solo el lado de la base: '≈ 56,1 kg'. null si no hay conversión. */
export function textoBase(cantidad: number, u: UnidadesInsumo): string | null {
  if (!tieneConversion(u)) return null
  return `≈ ${numeroCorto(equivalenteBase(cantidad, u))} ${cortoBase(u.unidadBase)}`
}

/** textoBase desde una fila de compras_items: '≈ 56,1 kg', o null. */
export function textoBaseItem(
  cantidad: number,
  i: { unidad: string | null; unidad_base: string | null; cantidad_por_unidad: number | null },
): string | null {
  if (!esUnidadBase(i.unidad_base) || i.cantidad_por_unidad == null) return null
  return textoBase(cantidad, { unidad: i.unidad, unidadBase: i.unidad_base, contenido: i.cantidad_por_unidad })
}

/**
 * Líneas del ejemplo vivo de la ficha del insumo. `stock` es el stock actual
 * (editando) o null (insumo nuevo: el ejemplo usa 2).
 */
export function ejemploUnidades(u: UnidadesInsumo, cobraPor: CobraPor, stock: number | null): string[] {
  const unidad = (u.unidad ?? '').trim() || 'unidad'
  if (!tieneConversion(u)) return [`Se cuenta y se cobra por ${unidad}${unidad.endsWith('.') ? '' : '.'}`]
  const base = cortoBase(u.unidadBase)
  const plural = unidadPlural(unidad, 2)
  const cant = stock ?? 2
  const lineas = [
    `1 ${unidad} = ${numeroCorto(u.contenido, 3)} ${base}`,
    stock == null
      ? `El stock se cuenta en ${plural}: por ejemplo, ${numeroCorto(cant)} ${unidadPlural(unidad, cant)} ≈ ${numeroCorto(equivalenteBase(cant, u))} ${base}`
      : `El stock se cuenta en ${plural}: hoy ${numeroCorto(cant)} ${unidadPlural(unidad, cant)} ≈ ${numeroCorto(equivalenteBase(cant, u))} ${base}`,
  ]
  lineas.push(cobraPor === 'base'
    ? `Se cobra por ${base}: el remito pide los ${base} reales y la factura cobra ${base} × $/${base}.`
    : `Se cobra por ${unidad}: la factura cobra ${plural} × $/${unidad}.`)
  return lineas
}

/** Precio de una unidad a otra: base→unidad × contenido; unidad→base ÷ contenido. 4 decimales. */
export function convertirPrecio(precio: number, de: CobraPor, a: CobraPor, contenido: number): number {
  if (de === a || !(contenido > 0)) return precio
  const v = de === 'unidad' ? precio / contenido : precio * contenido
  return Math.round(v * 1e4) / 1e4
}

/** Lo que se multiplica por el precio en una línea de factura. */
export function cantidadCobrada(l: { cantidad: number | null; cantidadBase?: number | null; precioPor?: CobraPor }): number {
  return l.precioPor === 'base' ? (l.cantidadBase ?? 0) : (l.cantidad ?? 0)
}

/** Desvío en %, redondeado (positivo = más). null si falta un dato o la referencia es 0. */
export function desvioPct(real: number | null, referencia: number | null): number | null {
  if (real == null || referencia == null || referencia === 0) return null
  return Math.round(((real - referencia) / referencia) * 100)
}

/** 'Pesó 12 % menos que lo nominal (33 kg).' si supera TOLERANCIA_NOMINAL_PCT; si no, null. */
export function avisoNominal(cantidadBase: number | null, cantidad: number | null, u: UnidadesInsumo): string | null {
  if (cantidadBase == null || cantidad == null || cantidad <= 0 || !tieneConversion(u)) return null
  const nominal = equivalenteBase(cantidad, u)
  if (nominal <= 0) return null
  const pct = ((cantidadBase - nominal) / nominal) * 100
  if (Math.abs(pct) <= TOLERANCIA_NOMINAL_PCT) return null
  const verbo = u.unidadBase === 'kg' ? 'Pesó' : 'Trajo'
  return `${verbo} ${Math.round(Math.abs(pct))} % ${pct < 0 ? 'menos' : 'más'} que lo nominal (${numeroCorto(nominal)} ${cortoBase(u.unidadBase)}).`
}

/** 'La factura cobra 0,5 kg más que el remito (32,9 kg).' si supera TOLERANCIA_REMITO_PCT; si no, null. */
export function avisoRemito(baseFactura: number | null, baseRemito: number | null, u: UnidadesInsumo): string | null {
  if (baseFactura == null || baseRemito == null || baseRemito <= 0) return null
  const pct = ((baseFactura - baseRemito) / baseRemito) * 100
  if (Math.abs(pct) <= TOLERANCIA_REMITO_PCT) return null
  const base = cortoBase(u.unidadBase)
  const dif = Math.abs(baseFactura - baseRemito)
  return `La factura cobra ${numeroCorto(dif, 2)} ${base} ${pct > 0 ? 'más' : 'menos'} que el remito (${numeroCorto(baseRemito, 2)} ${base}).`
}

const ABREVIATURA = /(^(kg|kgs|g|gr|grs|l|lt|lts|ml|cc|u|un|unid|mts?|cm)$)|\.$/i

/** Plural simple de la unidad de compra: Caja→Cajas, Cajón→Cajones, Unid.→Unid., kg→kg. 1 → singular. */
export function unidadPlural(unidad: string, cantidad: number): string {
  const u = unidad.trim()
  if (!u || cantidad === 1 || ABREVIATURA.test(u)) return u
  const mayus = u === u.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(u)
  const conCaso = (s: string) => (mayus ? s.toUpperCase() : s)
  if (/ón$/i.test(u)) return u.slice(0, -2) + conCaso('ones')
  if (/[sx]$/i.test(u)) return u
  if (/[aeiouáéíóú]$/i.test(u) || /k$/i.test(u)) return u + conCaso('s')
  return u + conCaso('es')
}

/** Cantidad para el mensaje al proveedor: '2 CAJAS (~33 KG)'. El (~…) va solo si cobraPor = 'base' y hay conversión. */
export function cantidadMensaje(
  cantidad: number,
  unidad: string | null,
  u: UnidadesInsumo | null,
  cobraPor: CobraPor | null,
): string {
  const un = (unidad ?? '').trim()
  let txt = `${numeroCorto(cantidad, 3)}${un ? ` ${unidadPlural(un, cantidad)}` : ''}`
  if (cobraPor === 'base' && u && tieneConversion(u)) {
    txt += ` (~${numeroCorto(equivalenteBase(cantidad, u))} ${cortoBase(u.unidadBase)})`
  }
  return txt.toUpperCase()
}
