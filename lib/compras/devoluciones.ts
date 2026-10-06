// Devoluciones al proveedor y notas de crédito (B4). Funciones puras: la pantalla
// muestra los máximos, la NC y el impacto antes de mandar, y la RPC vuelve a
// validar todo (compras_registrar_devolucion, compras_cargar_nota_credito).
// Las reglas replican las de la migración 20261006150000 (§3.5–§3.8 del plan).
// Chequeo: `npx tsx lib/compras/_check_devoluciones.ts`.

import { ESTADOS } from '@/lib/estados'
import { formatearMonedaExacta } from '@/lib/formato'
import { calcularTotales, subtotalLinea, ivaLinea, type TotalesFactura } from './totalesFactura'
import { cortoBase, esUnidadBase, textoBaseItem, type CobraPor } from './unidades'
import {
  estadoVisible, type EstadoFacturacion, type EstadoRecepcion, type EstadoVisible,
} from './estadoPedido'

// ---------------------------------------------------------------------------
// Motivos: la base piensa en flags, la pantalla en efectos (E1).
// ---------------------------------------------------------------------------

export type EfectoMotivo = 'mercaderia' | 'no_entregado' | 'precio'

export const EFECTOS: EfectoMotivo[] = ['mercaderia', 'no_entregado', 'precio']

export function efectoDeMotivo(m: { devuelve_mercaderia: boolean | null; corrige_precio: boolean | null }): EfectoMotivo {
  if (m.devuelve_mercaderia) return 'mercaderia'
  return m.corrige_precio ? 'precio' : 'no_entregado'
}

export function flagsDeEfecto(e: EfectoMotivo): { devuelve_mercaderia: boolean; corrige_precio: boolean } {
  return { devuelve_mercaderia: e === 'mercaderia', corrige_precio: e === 'precio' }
}

export function esEfecto(v: unknown): v is EfectoMotivo {
  return v === 'mercaderia' || v === 'no_entregado' || v === 'precio'
}

export const TEXTO_EFECTO: Record<EfectoMotivo, string> = {
  mercaderia: 'Sale del stock y vuelve al proveedor',
  no_entregado: 'No mueve stock: corrige lo que te facturaron de más',
  precio: 'No mueve stock: corrige el precio cobrado',
}

/** El chip corto (motivos, tarjeta de la devolución). */
export const CHIP_EFECTO: Record<EfectoMotivo, string> = {
  mercaderia: 'Sale del stock',
  no_entregado: 'Corrige la factura',
  precio: 'Corrige el precio',
}

export interface Motivo {
  id: string
  nombre: string
  devuelve_mercaderia: boolean
  corrige_precio: boolean
  orden: number
  activo: boolean
}

// ---------------------------------------------------------------------------
// Datos de entrada (independientes de las filas de la base, para el check).
// ---------------------------------------------------------------------------

/** Una línea del pedido (de v_compras_pedido_pendiente). */
export interface LineaPedidoDev {
  pedidoItemId: string
  itemId: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  /** Llegó por esta línea (remitos con su pedido_item_id). */
  recibido: number
  devuelto: number
  devueltoSinRepone: number
  /** El par insumo–proveedor cobra por kg (A2b). */
  cobraPor: CobraPor | null
}

/** Lo que llegó por remito, por insumo (incluye las líneas libres del remito). */
export interface RecibidoInsumo {
  itemId: string
  descripcion: string
  unidad: string | null
  cantidad: number
}

export interface LineaDevolucion {
  itemId: string | null
  pedidoItemId: string | null
  facturaItemId: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  cantidadBase: number | null
}

export interface DevolucionDev {
  id: string
  estado: string
  devuelveMercaderia: boolean
  corrigePrecio: boolean
  repone: boolean
  notaCreditoId: string | null
  lineas: LineaDevolucion[]
}

export interface LineaFacturaDev {
  id: string
  itemId: string | null
  pedidoItemId: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  cantidadBase: number | null
  precioUnitario: number
  precioPor: CobraPor
  alicuotaIva: number
  orden: number
}

export interface FacturaDev {
  id: string
  numero: string
  total: number
  lineas: LineaFacturaDev[]
  /** Líneas con insumo de las NC confirmadas de esta factura (lo acreditado). */
  acreditado: { itemId: string; cantidad: number }[]
  /** Σ del total de las NC confirmadas de esta factura. */
  notasCreditoTotal: number
}

// ---------------------------------------------------------------------------
// Qué se puede devolver (§3.8.4): una fila por insumo.
// ---------------------------------------------------------------------------

export interface FilaDevolvible {
  key: string
  itemId: string
  /** La línea del pedido si hay exactamente una de ese insumo (la RPC la usa igual). */
  pedidoItemId: string | null
  descripcion: string
  unidad: string | null
  /** La factura (o el par) lo cobra por kg: con NC, los kg son obligatorios. */
  cobraPorBase: boolean
  llego: number
  devuelto: number
  /** Con mercadería: llegó − devuelto. */
  maximo: number
  facturado: number
  acreditado: number
  /** Facturado y no entregado: reclamos activos sin NC. */
  reclamado: number
  /** Facturado y no entregado: facturado − acreditado − reclamado. */
  maximoNoEntregado: number
}

function activas(devs: DevolucionDev[]): DevolucionDev[] {
  return devs.filter(d => d.estado === 'activa')
}

const suma = (xs: number[]) => xs.reduce((t, x) => t + x, 0)

/** Redondeo a 4 decimales para que 2 − 1,5 no dé 0,4999999. */
function r4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** Última línea de la factura con ese insumo (la más abajo en el papel), como la RPC. */
export function lineaOrigen(factura: Pick<FacturaDev, 'lineas'>, itemId: string): LineaFacturaDev | null {
  const lineas = factura.lineas.filter(l => l.itemId === itemId)
  if (lineas.length === 0) return null
  return [...lineas].sort((a, b) => b.orden - a.orden || b.id.localeCompare(a.id))[0]
}

export function lineasDevolvibles(
  pedido: LineaPedidoDev[],
  recibidos: RecibidoInsumo[],
  devoluciones: DevolucionDev[],
  factura: FacturaDev | null,
): FilaDevolvible[] {
  const filas = new Map<string, FilaDevolvible>()
  const fila = (itemId: string, descripcion: string, unidad: string | null): FilaDevolvible => {
    let f = filas.get(itemId)
    if (!f) {
      const lineasPedido = pedido.filter(l => l.itemId === itemId)
      const origen = factura ? lineaOrigen(factura, itemId) : null
      f = {
        key: `item:${itemId}`,
        itemId,
        pedidoItemId: lineasPedido.length === 1 ? lineasPedido[0].pedidoItemId : null,
        descripcion: lineasPedido[0]?.descripcion ?? descripcion,
        unidad: lineasPedido[0]?.unidad ?? unidad,
        cobraPorBase: origen ? origen.precioPor === 'base' : lineasPedido.some(l => l.cobraPor === 'base'),
        llego: 0, devuelto: 0, maximo: 0, facturado: 0, acreditado: 0, reclamado: 0, maximoNoEntregado: 0,
      }
      filas.set(itemId, f)
    }
    return f
  }

  for (const r of recibidos) fila(r.itemId, r.descripcion, r.unidad).llego += r.cantidad
  for (const d of activas(devoluciones)) {
    for (const l of d.lineas) {
      if (!l.itemId) continue
      if (d.devuelveMercaderia) fila(l.itemId, l.descripcion, l.unidad).devuelto += l.cantidad
      else if (!d.corrigePrecio && !d.notaCreditoId) fila(l.itemId, l.descripcion, l.unidad).reclamado += l.cantidad
    }
  }
  if (factura) {
    for (const l of factura.lineas) if (l.itemId) fila(l.itemId, l.descripcion, l.unidad).facturado += l.cantidad
    for (const a of factura.acreditado) fila(a.itemId, '', null).acreditado += a.cantidad
  }

  const orden = new Map(pedido.map((l, i) => [l.itemId, i]))
  return [...filas.values()]
    .map(f => ({
      ...f,
      llego: r4(f.llego),
      devuelto: r4(f.devuelto),
      maximo: Math.max(r4(f.llego - f.devuelto), 0),
      maximoNoEntregado: Math.max(r4(f.facturado - f.acreditado - f.reclamado), 0),
    }))
    .sort((a, b) => (orden.get(a.itemId) ?? 999) - (orden.get(b.itemId) ?? 999) || a.descripcion.localeCompare(b.descripcion))
}

/** Línea de la factura que se puede corregir de precio, con la cantidad cobrada en su unidad. */
export interface LineaPrecio {
  facturaItemId: string
  itemId: string | null
  descripcion: string
  /** 'kg' si cobra por kg; si no, la unidad de la línea. */
  unidadCobro: string
  cantidadCobrada: number
  precio: number
  precioPor: CobraPor
  alicuotaIva: number
}

export function lineasPrecio(
  factura: Pick<FacturaDev, 'lineas'>,
  unidadBaseDe: (itemId: string | null) => string | null = () => 'kg',
): LineaPrecio[] {
  return [...factura.lineas]
    .filter(l => l.precioUnitario > 0)
    .sort((a, b) => a.orden - b.orden)
    .map(l => {
      const porBase = l.precioPor === 'base'
      const ub = unidadBaseDe(l.itemId)
      return {
        facturaItemId: l.id,
        itemId: l.itemId,
        descripcion: l.descripcion,
        unidadCobro: porBase ? (esUnidadBase(ub) ? cortoBase(ub) : 'kg') : (l.unidad || 'unidad'),
        cantidadCobrada: porBase ? (l.cantidadBase ?? 0) : l.cantidad,
        precio: l.precioUnitario,
        precioPor: l.precioPor,
        alicuotaIva: l.alicuotaIva,
      }
    })
}

// ---------------------------------------------------------------------------
// La nota de crédito (E5): la misma regla que _compras_crear_nota_credito.
// ---------------------------------------------------------------------------

export interface ItemNc {
  itemId: string | null
  facturaItemId: string | null
  descripcion: string
  cantidad: number
  cantidadBase: number | null
  /** Solo corrección de precio. */
  precioCorrecto: number | null
}

export interface PrecioEditado {
  precioUnitario?: number | null
  alicuotaIva?: number | null
}

export interface LineaNc {
  descripcion: string
  /** Lo que se cobra: kg si precioPor = 'base', si no la cantidad. */
  cantidad: number
  cantidadBase: number | null
  unidadCobro: string
  precioUnitario: number
  precioPor: CobraPor
  alicuotaIva: number
  subtotal: number
  iva: number
  /** Precio de la línea de la factura (para la variación). */
  precioFactura: number | null
  /** Error de la línea, si no se puede armar (falta la línea en la factura, faltan kg…). */
  error: string | null
}

export interface NotaCreditoArmada {
  lineas: LineaNc[]
  totales: TotalesFactura
  /** Alguna línea tiene error: no se puede mandar. */
  incompleta: boolean
}

function pesos(n: number): string {
  // Como _compras_pesos_txt: "$ 1.250" o "$ 1.250,50".
  const abs = Math.abs(Math.round(n * 100) / 100)
  const entero = Math.trunc(abs).toLocaleString('es-AR')
  const cent = Math.round((abs - Math.trunc(abs)) * 100)
  return `${n < 0 ? '-' : ''}$ ${entero}${cent ? `,${String(cent).padStart(2, '0')}` : ''}`
}

export function descripcionDiferenciaPrecio(descripcion: string, cobrado: number, correcto: number, unidadCobro: string): string {
  return `Diferencia de precio · ${descripcion}: de ${pesos(cobrado)} a ${pesos(correcto)} por ${unidadCobro}`
}

export function armarNotaCredito(
  items: ItemNc[],
  factura: Pick<FacturaDev, 'lineas'>,
  efecto: EfectoMotivo,
  preciosEditados: PrecioEditado[] = [],
  unidadBaseDe: (itemId: string | null) => string | null = () => 'kg',
): NotaCreditoArmada {
  const lineas: LineaNc[] = items.map((it, i) => {
    const editado = preciosEditados[i] ?? {}
    if (efecto === 'precio') {
      const fi = factura.lineas.find(l => l.id === it.facturaItemId) ?? null
      const ub = unidadBaseDe(fi?.itemId ?? null)
      const unidadCobro = fi?.precioPor === 'base' ? (esUnidadBase(ub) ? cortoBase(ub) : 'kg') : (fi?.unidad || 'unidad')
      const alicuota = editado.alicuotaIva ?? fi?.alicuotaIva ?? 21
      const error = !fi ? 'Esa línea ya no está en la factura.'
        : it.precioCorrecto == null ? `Cargá el precio correcto de ${fi.descripcion}.`
          : it.precioCorrecto >= fi.precioUnitario ? `El precio correcto tiene que ser menor que el facturado (${pesos(fi.precioUnitario)}).`
            : null
      const precio = fi && it.precioCorrecto != null ? Math.max(fi.precioUnitario - it.precioCorrecto, 0) : 0
      const base = { cantidad: it.cantidad, precioUnitario: precio, alicuotaIva: alicuota, precioPor: 'unidad' as const }
      return {
        descripcion: fi ? descripcionDiferenciaPrecio(fi.descripcion, fi.precioUnitario, it.precioCorrecto ?? 0, unidadCobro) : it.descripcion,
        cantidad: it.cantidad,
        cantidadBase: null,
        unidadCobro,
        precioUnitario: precio,
        precioPor: 'unidad',
        alicuotaIva: alicuota,
        subtotal: subtotalLinea(base),
        iva: ivaLinea(base),
        precioFactura: fi?.precioUnitario ?? null,
        error,
      }
    }
    const fi = it.itemId ? lineaOrigen(factura, it.itemId) : null
    const precioPor: CobraPor = fi?.precioPor ?? 'unidad'
    const precio = editado.precioUnitario ?? fi?.precioUnitario ?? 0
    const alicuota = editado.alicuotaIva ?? fi?.alicuotaIva ?? 21
    const ub = unidadBaseDe(it.itemId)
    const corto = esUnidadBase(ub) ? cortoBase(ub) : 'kg'
    const error = !fi ? `${it.descripcion} no está en la factura: no se puede acreditar.`
      : precioPor === 'base' && it.cantidadBase == null ? `Cargá los ${corto} devueltos de ${it.descripcion}: la factura lo cobra por ${corto}.`
        : !(precio > 0) ? `Cargá el precio de ${it.descripcion} (mayor que 0).`
          : null
    const base = { cantidad: it.cantidad, cantidadBase: it.cantidadBase, precioUnitario: precio, alicuotaIva: alicuota, precioPor }
    return {
      descripcion: it.descripcion,
      cantidad: precioPor === 'base' ? (it.cantidadBase ?? 0) : it.cantidad,
      cantidadBase: it.cantidadBase,
      unidadCobro: precioPor === 'base' ? corto : (fi?.unidad || 'unidad'),
      precioUnitario: precio,
      precioPor,
      alicuotaIva: alicuota,
      subtotal: subtotalLinea(base),
      iva: ivaLinea(base),
      precioFactura: fi?.precioUnitario ?? null,
      error,
    }
  })
  const totales = calcularTotales(lineas.map(l => ({
    cantidad: l.precioPor === 'base' ? null : l.cantidad,
    cantidadBase: l.cantidadBase,
    precioUnitario: l.precioUnitario,
    alicuotaIva: l.alicuotaIva,
    precioPor: l.precioPor,
  })))
  return { lineas, totales, incompleta: lineas.some(l => l.error != null) || totales.total <= 0 }
}

/** Lo que queda de la factura para acreditar (tope de la NC, §3.5.5). */
export function topeNotaCredito(factura: Pick<FacturaDev, 'total' | 'notasCreditoTotal'>): number {
  return Math.round((factura.total - factura.notasCreditoTotal) * 100) / 100
}

// ---------------------------------------------------------------------------
// Impacto en el gasto (E10) y en el estado del pedido (E8).
// ---------------------------------------------------------------------------

export type CasoGasto = 'descontado' | 'cancelo_gasto' | 'a_favor' | 'sin_gasto'

export interface ImpactoGasto {
  caso: CasoGasto
  texto: string
  montoDespues: number | null
}

export function impactoGasto(g: {
  gastoId: string | null
  gastoEstado: string | null
  gastoMonto: number | null
  totalNc: number
  facturaNumero: string
}): ImpactoGasto {
  if (!g.gastoId || g.gastoMonto == null) {
    return { caso: 'sin_gasto', texto: 'La factura no tiene gasto: la nota de crédito resta en los reportes.', montoDespues: null }
  }
  if (g.gastoEstado === 'Pagado' || g.gastoEstado === 'Parcial') {
    return {
      caso: 'a_favor',
      texto: `El gasto ya está pagado: estos ${formatearMonedaExacta(g.totalNc)} quedan a favor. Se verán en la cuenta corriente del proveedor (noviembre); por ahora figuran como «A favor» en la Cuenta del proveedor.`,
      montoDespues: g.gastoMonto,
    }
  }
  const despues = Math.round((g.gastoMonto - Math.min(g.totalNc, g.gastoMonto)) * 100) / 100
  if (despues === 0) {
    return {
      caso: 'cancelo_gasto',
      texto: 'La nota de crédito cubre todo el gasto: queda en $ 0 y se marca como pagado con la nota de crédito.',
      montoDespues: 0,
    }
  }
  return {
    caso: 'descontado',
    texto: `El gasto pendiente de la factura ${g.facturaNumero} baja de ${formatearMonedaExacta(g.gastoMonto)} a ${formatearMonedaExacta(despues)}.`,
    montoDespues: despues,
  }
}

/** Lo que dice el toast cuando la RPC devuelve el caso del gasto. */
export function textoToastGasto(caso: string | null | undefined, montoDespues: number | null | undefined): string | null {
  switch (caso) {
    case 'descontado': return montoDespues != null ? `el gasto bajó a ${formatearMonedaExacta(montoDespues)}` : 'se descontó del gasto'
    case 'cancelo_gasto': return 'el gasto quedó en $ 0, pagado con la nota de crédito'
    case 'a_favor': return 'el gasto ya estaba pagado: queda a favor'
    default: return null
  }
}

export interface LineaRecepcion {
  cantidad: number
  recibido: number
  devuelto: number
  devueltoSinRepone: number
}

/**
 * E8, igual que compras_recalcular_estado_pedido. neto = recibido − devuelto;
 * cubierto = neto + devuelto sin reposición. Cerrado a mano y sin enviar no se recalculan.
 */
export function estadoRecepcionConDevolucion(p: {
  actual: EstadoRecepcion
  lineas: LineaRecepcion[]
  /** Σ de los remitos del pedido (con insumo) − Σ devuelto. */
  netoTotal: number
  hayRemitos: boolean
  /** Hay alguna devolución activa con mercadería y sin reposición. */
  haySinRepone: boolean
}): EstadoRecepcion {
  if (p.actual === 'cerrado_manual' || p.actual === 'sin_enviar') return p.actual
  const cubiertas = p.lineas.filter(l => r4(l.recibido - l.devuelto + l.devueltoSinRepone) >= l.cantidad).length
  const conAlgo = p.lineas.filter(l => r4(l.recibido - l.devuelto) > 0).length
  if (p.lineas.length > 0 && cubiertas === p.lineas.length) {
    return r4(p.netoTotal) === 0 && p.haySinRepone ? 'devuelto' : 'recibido'
  }
  if (conAlgo > 0 || p.hayRemitos) return 'parcial'
  return 'enviado'
}

const ETIQUETA_VISIBLE = (v: EstadoVisible) => ESTADOS.compras_pedido[v].label

/** "Queda Devuelto" / "Vuelve a Parcialmente recibido: espera la reposición" / "Sigue Facturado". */
export function textoImpactoEstado(
  antes: { estado_recepcion: EstadoRecepcion; estado_facturacion: EstadoFacturacion },
  recepcionDespues: EstadoRecepcion,
  repone: boolean,
): string {
  const vAntes = estadoVisible(antes)
  const vDespues = estadoVisible({ ...antes, estado_recepcion: recepcionDespues })
  if (vAntes === vDespues) return `Sigue ${ETIQUETA_VISIBLE(vDespues)}.`
  if (vDespues === 'devuelto') return 'Queda Devuelto.'
  if (vDespues === 'parcial' && repone) return `Vuelve a ${ETIQUETA_VISIBLE('parcial')}: espera la reposición.`
  return `Pasa a ${ETIQUETA_VISIBLE(vDespues)}.`
}

/**
 * Cómo queda la recepción si se registra esta devolución (mercadería). `lineas`
 * son las del pedido con lo que ya pasó; `nuevas` lo que se devuelve ahora,
 * por insumo (se asigna a la línea si hay una sola, como la RPC).
 */
export function recepcionDespues(p: {
  actual: EstadoRecepcion
  lineas: LineaPedidoDev[]
  recibidoTotal: number
  devueltoTotal: number
  hayRemitos: boolean
  haySinRepone: boolean
  nuevas: { itemId: string; cantidad: number }[]
  repone: boolean
}): EstadoRecepcion {
  const lineas = p.lineas.map(l => ({
    cantidad: l.cantidad, recibido: l.recibido, devuelto: l.devuelto, devueltoSinRepone: l.devueltoSinRepone,
  }))
  for (const n of p.nuevas) {
    const delInsumo = p.lineas.map((l, i) => ({ l, i })).filter(x => x.l.itemId === n.itemId)
    if (delInsumo.length !== 1) continue
    const { l, i } = delInsumo[0]
    // La RPC solo la asigna a la línea si lo que llegó por esa línea alcanza.
    if (l.recibido - l.devuelto < n.cantidad) continue
    lineas[i].devuelto += n.cantidad
    if (!p.repone) lineas[i].devueltoSinRepone += n.cantidad
  }
  const nuevo = suma(p.nuevas.map(n => n.cantidad))
  return estadoRecepcionConDevolucion({
    actual: p.actual,
    lineas,
    netoTotal: p.recibidoTotal - p.devueltoTotal - nuevo,
    hayRemitos: p.hayRemitos,
    haySinRepone: p.haySinRepone || (!p.repone && nuevo > 0),
  })
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

function numero(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

/** "Queso Barra 2 Caja (33,4 kg)"; sin kg reales, el nominal "(≈ 33 kg)" si hay conversión. */
export function textoLineaDevolucion(
  l: Pick<LineaDevolucion, 'descripcion' | 'unidad' | 'cantidad' | 'cantidadBase'> & { unidadBase?: string | null },
  item?: { unidad: string | null; unidad_base: string | null; cantidad_por_unidad: number | null } | null,
): string {
  const cant = `${l.descripcion} ${numero(l.cantidad)}${l.unidad ? ` ${l.unidad}` : ''}`
  if (l.cantidadBase != null) {
    const ub = l.unidadBase ?? item?.unidad_base ?? 'kg'
    return `${cant} (${numero(l.cantidadBase)} ${esUnidadBase(ub) ? cortoBase(ub) : ub})`
  }
  const nominal = item ? textoBaseItem(l.cantidad, item) : null
  return nominal ? `${cant} (${nominal})` : cant
}

/** Aviso de A2b: los kg reales se alejan más del 10 % del nominal. */
export function kgFueraDeRango(cantidad: number, kg: number | null, contenido: number | null): boolean {
  if (kg == null || contenido == null || contenido <= 0 || cantidad <= 0) return false
  const nominal = cantidad * contenido
  return Math.abs(kg - nominal) / nominal > 0.1
}

// ---------------------------------------------------------------------------
// Desde una diferencia (§6.2): qué se prellena. Por flags, nunca por nombre.
// ---------------------------------------------------------------------------

export interface Sugerencia {
  motivoId: string | null
  efecto: EfectoMotivo
  itemId: string
  cantidad: number
  notaCredito: boolean
  repone: boolean
}

export function sugerenciaDesdeDiferencia(
  dif: { itemId: string; diferencia: number },
  motivos: Motivo[],
): Sugerencia | null {
  if (dif.diferencia === 0) return null
  const activos = [...motivos].filter(m => m.activo).sort((a, b) => a.orden - b.orden)
  const efecto: EfectoMotivo = dif.diferencia > 0 ? 'no_entregado' : 'mercaderia'
  const motivo = activos.find(m => efectoDeMotivo(m) === efecto) ?? null
  return {
    motivoId: motivo?.id ?? null,
    efecto,
    itemId: dif.itemId,
    cantidad: Math.abs(dif.diferencia),
    notaCredito: efecto === 'no_entregado',
    repone: false,
  }
}

// ---------------------------------------------------------------------------
// Bloqueos que la pantalla conoce de antemano (§6.5).
// ---------------------------------------------------------------------------

/**
 * Anular una NC que descontó un gasto ya pagado se frena (§3.5.7). Devuelve el
 * mensaje si se sabe de antemano; null si se puede intentar.
 */
export function bloqueoAnularNc(nc: { ncGasto: string | null; gastoEstado: string | null; facturaNumero: string | null }): string | null {
  if (nc.ncGasto === 'descontado' && nc.gastoEstado && nc.gastoEstado !== 'Pendiente de pago') {
    return `El gasto de la factura ${nc.facturaNumero ?? ''} ya se pagó con el descuento de esta nota de crédito: no se puede anular. Si hay que corregirlo, hablalo con la administración.`
  }
  if (nc.ncGasto === 'cancelo_gasto' && nc.gastoEstado && nc.gastoEstado !== 'Pagado') {
    return `El gasto de la factura ${nc.facturaNumero ?? ''} cambió después de esta nota de crédito: revisalo en Gastos antes de anular.`
  }
  return null
}
