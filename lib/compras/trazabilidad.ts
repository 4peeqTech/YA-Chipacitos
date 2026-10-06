// Trazabilidad de un insumo (A2c, plan-A2c.md §4.1). Funciones puras sobre la
// fila de compras_trazabilidad_insumo y las líneas de v_compras_insumo_documentos.
// Chequeo: `npx tsx lib/compras/_check_trazabilidad.ts`.
import type { Database } from '@/lib/database.types'
import { esCobraPor, esUnidadBase, tieneConversion, type CobraPor, type UnidadesInsumo } from './unidades'

export type FilaTrazabilidad = Database['public']['Functions']['compras_trazabilidad_insumo']['Returns'][number]
export type FilaDocumento = Database['public']['Views']['v_compras_insumo_documentos']['Row']

// El generador tipa las columnas de un `returns table` como no nulas, pero las
// de facturas vienen null para un no admin (E8) y otras (kg, promedios) pueden
// venir null siempre. Se leen todas por acá.
function num(v: number | null | undefined): number | null {
  return v == null ? null : Number(v)
}
function cero(v: number | null | undefined): number {
  return v == null ? 0 : Number(v)
}

export function unidadesDe(f: { unidad: string | null; unidad_base: string | null; contenido: number | null }): UnidadesInsumo {
  return {
    unidad: f.unidad,
    unidadBase: esUnidadBase(f.unidad_base) ? f.unidad_base : 'unidades',
    contenido: f.contenido != null && Number(f.contenido) > 0 ? Number(f.contenido) : 1,
  }
}

// ----------------------------------------------------------------------------
// Puente de stock (E7)
// ----------------------------------------------------------------------------

export interface PasoPuente {
  clave: 'remitos' | 'conteo' | 'factura' | 'manual' | 'devolucion' | 'consumo' | 'otros'
  label: string
  delta: number
}
export interface PuenteStock { inicio: number; pasos: PasoPuente[]; fin: number; cuadra: boolean }

const TOLERANCIA_PUENTE = 1e-9

export function armarPuente(f: FilaTrazabilidad): PuenteStock {
  const pasos: PasoPuente[] = [
    { clave: 'remitos', label: 'Remitos', delta: cero(f.mov_remitos) },
    { clave: 'conteo', label: 'Conteos de fábrica', delta: cero(f.mov_conteo) },
    { clave: 'factura', label: 'Diferencias con facturas', delta: cero(f.mov_factura) },
    { clave: 'manual', label: 'Ajustes a mano', delta: cero(f.mov_manual) },
    { clave: 'devolucion', label: 'Devoluciones al proveedor', delta: cero(f.mov_devolucion) },
    { clave: 'consumo', label: 'Consumo de producción', delta: -cero(f.consumido_produccion) },
    { clave: 'otros', label: 'Otros (apertura)', delta: cero(f.mov_otros) },
  ]
  const inicio = cero(f.stock_inicio)
  const fin = cero(f.stock_fin)
  const suma = pasos.reduce((s, p) => s + p.delta, inicio)
  return { inicio, pasos, fin, cuadra: Math.abs(suma - fin) < TOLERANCIA_PUENTE }
}

// ----------------------------------------------------------------------------
// Fila normalizada
// ----------------------------------------------------------------------------

export interface UltimoPrecio { precio: number; por: CobraPor; fecha: string; facturaId: string; proveedor: string | null }

export interface Trazabilidad {
  itemId: string; nombre: string; estado: string; categoria: string | null
  unidades: UnidadesInsumo
  pedido: { cantidad: number; pedidos: number }
  recibido: { cantidad: number; baseReal: number | null; sinPesar: number; remitos: number }
  /** null = no es admin (E8). */
  facturado: null | {
    cantidad: number; base: number; neto: number; total: number; facturas: number; proveedores: number
    promUnidad: number | null; promBase: number | null
    ultimo: UltimoPrecio | null
  }
  puente: PuenteStock
  stockActual: number
  pendienteRecibir: number
}

export function aTrazabilidad(f: FilaTrazabilidad): Trazabilidad {
  const esAdmin = f.facturado_cantidad != null
  const ultimoPrecio = num(f.ultimo_precio)
  const ultimo: UltimoPrecio | null =
    ultimoPrecio != null && f.ultimo_precio_fecha && f.ultimo_precio_factura_id
      ? {
          precio: ultimoPrecio,
          por: esCobraPor(f.ultimo_precio_por) ? f.ultimo_precio_por : 'unidad',
          fecha: f.ultimo_precio_fecha,
          facturaId: f.ultimo_precio_factura_id,
          proveedor: f.ultimo_precio_proveedor ?? null,
        }
      : null
  return {
    itemId: f.item_id,
    nombre: f.item_nombre,
    estado: f.item_estado,
    categoria: f.categoria_nombre ?? null,
    unidades: unidadesDe(f),
    pedido: { cantidad: cero(f.pedido_cantidad), pedidos: cero(f.pedidos) },
    recibido: {
      cantidad: cero(f.recibido_cantidad),
      baseReal: num(f.recibido_base_real),
      sinPesar: cero(f.recibido_sin_pesar),
      remitos: cero(f.remitos),
    },
    facturado: esAdmin
      ? {
          cantidad: cero(f.facturado_cantidad),
          base: cero(f.facturado_base),
          neto: cero(f.facturado_neto),
          total: cero(f.facturado_total),
          facturas: cero(f.facturas),
          proveedores: cero(f.proveedores_facturados),
          promUnidad: num(f.precio_prom_unidad),
          promBase: num(f.precio_prom_base),
          ultimo,
        }
      : null,
    puente: armarPuente(f),
    stockActual: cero(f.stock_actual),
    pendienteRecibir: cero(f.pendiente_recibir),
  }
}

// ----------------------------------------------------------------------------
// Líneas de documentos y precio en el tiempo (§6.4)
// ----------------------------------------------------------------------------

export interface LineaDocumento {
  tipo: 'remito' | 'factura'
  lineaId: string
  documentoId: string
  fecha: string
  codigo: string
  /** Remito: 'manual' | 'factura' (desde factura). */
  origen: string | null
  /** Factura: 'factura' | 'nota_credito'. */
  tipoComprobante: string | null
  pedidoId: string | null
  pedidoNumero: number | null
  proveedorId: string | null
  proveedor: string | null
  cantidad: number
  cantidadBase: number | null
  precioPor: CobraPor | null
  precioUnitario: number | null
  subtotal: number | null
  cargadoEn: string | null
}

export function aLineaDocumento(r: FilaDocumento): LineaDocumento {
  return {
    tipo: r.tipo === 'factura' ? 'factura' : 'remito',
    lineaId: r.linea_id ?? '',
    documentoId: r.documento_id ?? '',
    fecha: r.fecha ?? '',
    codigo: r.codigo ?? '',
    origen: r.origen,
    tipoComprobante: r.tipo_comprobante,
    pedidoId: r.pedido_id,
    pedidoNumero: r.pedido_numero,
    proveedorId: r.proveedor_id,
    proveedor: r.proveedor_nombre,
    cantidad: cero(r.cantidad),
    cantidadBase: num(r.cantidad_base),
    precioPor: esCobraPor(r.precio_por) ? r.precio_por : null,
    precioUnitario: num(r.precio_unitario),
    subtotal: num(r.subtotal),
    cargadoEn: r.cargado_en,
  }
}

export type ModoPrecio = 'unidad' | 'base'

/** Precio efectivo de una línea de factura: subtotal / cantidad (unidad) o subtotal / kg (base). null si no se puede. */
export function precioEfectivo(
  l: { cantidad: number; cantidadBase: number | null; subtotal: number | null },
  u: UnidadesInsumo,
  modo: ModoPrecio,
): number | null {
  if (l.subtotal == null || !(l.subtotal > 0) || !(l.cantidad > 0)) return null
  if (modo === 'unidad') return l.subtotal / l.cantidad
  const base = l.cantidadBase ?? l.cantidad * u.contenido
  return base > 0 ? l.subtotal / base : null
}

export interface PuntoPrecio {
  fecha: string
  precio: number
  proveedorId: string
  proveedor: string
  facturaId: string
  numero: string
  subtotal: number
}

/** Puntos del gráfico: solo facturas (no NC), subtotal > 0, en orden de fecha. */
export function puntosPrecio(lineas: LineaDocumento[], u: UnidadesInsumo, modo: ModoPrecio): PuntoPrecio[] {
  const puntos: { orden: string; punto: PuntoPrecio }[] = []
  for (const l of lineas) {
    if (l.tipo !== 'factura' || l.tipoComprobante !== 'factura') continue
    const precio = precioEfectivo(l, u, modo)
    if (precio == null) continue
    puntos.push({
      orden: `${l.fecha}|${l.cargadoEn ?? ''}|${l.lineaId}`,
      punto: {
        fecha: l.fecha,
        precio,
        proveedorId: l.proveedorId ?? 'sin-proveedor',
        proveedor: l.proveedor ?? 'Sin proveedor',
        facturaId: l.documentoId,
        numero: l.codigo,
        subtotal: l.subtotal ?? 0,
      },
    })
  }
  puntos.sort((a, b) => (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0))
  return puntos.map(p => p.punto)
}

/** Colores de las series en orden: el principal primero y el resto por nombre (§6.4). */
export const COLORES_SERIES = ['var(--color-accent)', 'var(--color-info)', 'var(--color-green)', 'var(--color-orange)'] as const
export const COLOR_OTROS = 'var(--color-muted)'
export const MAX_SERIES = COLORES_SERIES.length
export const ID_OTROS = 'otros'

export interface SeriePrecio { proveedorId: string; proveedor: string; color: string; puntos: PuntoPrecio[] }

/**
 * Una serie por proveedor: hasta 4 y el resto junto en "Otros". El orden (y con
 * él el color) es fijo: el principal primero y el resto por nombre, así que un
 * proveedor conserva su color aunque desaparezca otro que va después.
 */
export function seriesPrecio(puntos: PuntoPrecio[], principalId: string | null): SeriePrecio[] {
  const porProveedor = new Map<string, { proveedor: string; puntos: PuntoPrecio[] }>()
  for (const p of puntos) {
    const s = porProveedor.get(p.proveedorId)
    if (s) s.puntos.push(p)
    else porProveedor.set(p.proveedorId, { proveedor: p.proveedor, puntos: [p] })
  }
  const orden = [...porProveedor.entries()].sort(([idA, a], [idB, b]) => {
    if (idA === principalId) return -1
    if (idB === principalId) return 1
    return a.proveedor.localeCompare(b.proveedor, 'es')
  })
  const series: SeriePrecio[] = orden.slice(0, MAX_SERIES).map(([id, s], i) => ({
    proveedorId: id, proveedor: s.proveedor, color: COLORES_SERIES[i], puntos: s.puntos,
  }))
  const resto = orden.slice(MAX_SERIES).flatMap(([, s]) => s.puntos)
  if (resto.length) {
    resto.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    series.push({ proveedorId: ID_OTROS, proveedor: 'Otros', color: COLOR_OTROS, puntos: resto })
  }
  return series
}

/** Modo por defecto del gráfico: el cobra_por del proveedor principal; sin conversión, siempre 'unidad'. */
export function modoPrecioInicial(u: UnidadesInsumo, cobraPorPrincipal: CobraPor | null): ModoPrecio {
  if (!tieneConversion(u)) return 'unidad'
  return cobraPorPrincipal === 'base' ? 'base' : 'unidad'
}

// ----------------------------------------------------------------------------
// Pestaña Movimientos (§6.5)
// ----------------------------------------------------------------------------

export type FiltroMovimientos = 'todos' | 'remitos' | 'conteos' | 'facturas' | 'manuales'

export const FILTROS_MOVIMIENTOS: { valor: FiltroMovimientos; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'remitos', label: 'Remitos' },
  { valor: 'conteos', label: 'Conteos' },
  { valor: 'facturas', label: 'Facturas' },
  { valor: 'manuales', label: 'A mano' },
]

export function esFiltroMovimientos(v: unknown): v is FiltroMovimientos {
  return FILTROS_MOVIMIENTOS.some(f => f.valor === v)
}
