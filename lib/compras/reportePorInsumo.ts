// Reporte "Por insumo" de Compras › Reportes (A2c, plan-A2c.md §4.2 y §6.7).
// Funciones puras sobre las filas de compras_trazabilidad_insumo.
// Chequeo: `npx tsx lib/compras/_check_reportePorInsumo.ts`.
import { aTrazabilidad, type FilaTrazabilidad, type Trazabilidad } from './trazabilidad'
import { cortoBase, etiquetaCobraPor, numeroCorto, tieneConversion } from './unidades'

export interface FilaReporteInsumo {
  t: Trazabilidad
  /** "170 Caja · 49,1 kg (6 sin pesar)" */
  recibidoTexto: string
  /** "84 Caja · 1.386,8 kg"; null si no es admin. */
  facturadoTexto: string | null
  /** "$ 2.898,81 /Caja · $ 175,58 /kg" (solo los modos con dato); null si no hay o no es admin. */
  precioPromTexto: string | null
}

function pesos(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function cantidadConUnidad(cantidad: number, unidad: string | null): string {
  const u = (unidad ?? '').trim()
  return `${numeroCorto(cantidad, 3)}${u ? ` ${u}` : ''}`
}

function recibidoTexto(t: Trazabilidad): string {
  const { unidades: u, recibido: r } = t
  let txt = cantidadConUnidad(r.cantidad, u.unidad)
  // Los kg del remito son opcionales (A2b): se muestran solo los pesados, y
  // "sin pesar" solo cuando el insumo se pesa (alguna línea trae kg).
  if (tieneConversion(u) && r.baseReal != null) {
    txt += ` · ${numeroCorto(r.baseReal)} ${cortoBase(u.unidadBase)}`
    if (r.sinPesar > 0) txt += ` (${r.sinPesar} sin pesar)`
  }
  return txt
}

function facturadoTexto(t: Trazabilidad): string | null {
  const f = t.facturado
  if (!f) return null
  let txt = cantidadConUnidad(f.cantidad, t.unidades.unidad)
  if (tieneConversion(t.unidades)) txt += ` · ${numeroCorto(f.base)} ${cortoBase(t.unidades.unidadBase)}`
  return txt
}

function precioPromTexto(t: Trazabilidad): string | null {
  const f = t.facturado
  if (!f) return null
  const partes: string[] = []
  if (f.promUnidad != null) partes.push(`${pesos(f.promUnidad)} /${etiquetaCobraPor('unidad', t.unidades)}`)
  if (f.promBase != null && tieneConversion(t.unidades)) partes.push(`${pesos(f.promBase)} /${etiquetaCobraPor('base', t.unidades)}`)
  return partes.length ? partes.join(' · ') : null
}

export function filasReporte(filas: FilaTrazabilidad[]): FilaReporteInsumo[] {
  return filas.map(f => {
    const t = aTrazabilidad(f)
    return { t, recibidoTexto: recibidoTexto(t), facturadoTexto: facturadoTexto(t), precioPromTexto: precioPromTexto(t) }
  })
}

export interface TotalesReporte { neto: number; total: number; insumos: number; facturas: number }

/** `facturas` suma las de cada insumo: cuenta comprobantes por insumo, no comprobantes únicos. */
export function totalesReporte(filas: FilaReporteInsumo[]): TotalesReporte {
  return filas.reduce<TotalesReporte>(
    (acc, { t }) => ({
      neto: acc.neto + (t.facturado?.neto ?? 0),
      total: acc.total + (t.facturado?.total ?? 0),
      insumos: acc.insumos + 1,
      facturas: acc.facturas + (t.facturado?.facturas ?? 0),
    }),
    { neto: 0, total: 0, insumos: 0, facturas: 0 },
  )
}

const CABECERAS_INICIO = ['Insumo', 'Categoría', 'Unidad de compra', 'Unidad base', 'Pedido', 'Recibido', 'Recibido kg reales', 'Líneas sin pesar']
const CABECERAS_FACTURAS = [
  'Facturado', 'Facturado kg', 'Neto $', 'Total con IVA $', 'Facturas', 'Proveedores',
  '$ prom. por unidad', '$ prom. por unidad base', 'Último precio', 'Último precio por (unidad/base)', 'Fecha último precio',
]
const CABECERAS_FIN = ['Stock inicio', 'Stock fin']

export function cabecerasCsv(esAdmin: boolean): string[] {
  return [...CABECERAS_INICIO, ...(esAdmin ? CABECERAS_FACTURAS : []), ...CABECERAS_FIN]
}

/** Números crudos (como los exports de Fábrica); los nulls van vacíos. */
export function filasCsv(filas: FilaReporteInsumo[], esAdmin: boolean): (string | number | null)[][] {
  return filas.map(({ t }) => {
    const inicio = [
      t.nombre, t.categoria, t.unidades.unidad, t.unidades.unidadBase,
      t.pedido.cantidad, t.recibido.cantidad, t.recibido.baseReal, t.recibido.sinPesar,
    ]
    const f = t.facturado
    const facturas = esAdmin
      ? [
          f?.cantidad ?? null, f?.base ?? null, f?.neto ?? null, f?.total ?? null, f?.facturas ?? null, f?.proveedores ?? null,
          f?.promUnidad ?? null, f?.promBase ?? null, f?.ultimo?.precio ?? null, f?.ultimo?.por ?? null, f?.ultimo?.fecha ?? null,
        ]
      : []
    return [...inicio, ...facturas, t.puente.inicio, t.puente.fin]
  })
}

export function nombreCsv(desde: string, hasta: string): string {
  return `compras_por_insumo_${desde}_${hasta}.csv`
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarReporte(
  filas: FilaReporteInsumo[],
  f: { texto: string; categoria: string | null },
): FilaReporteInsumo[] {
  const texto = sinTildes(f.texto.trim())
  return filas.filter(({ t }) =>
    (!texto || sinTildes(t.nombre).includes(texto)) && (f.categoria == null || t.categoria === f.categoria))
}

/** Categorías presentes, en orden alfabético (para el ChipGroup). */
export function categoriasReporte(filas: FilaReporteInsumo[]): string[] {
  const set = new Set<string>()
  for (const { t } of filas) if (t.categoria) set.add(t.categoria)
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}
