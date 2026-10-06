import { codigoPedido } from '@/lib/compras/codigos'
import { hoyISO } from '@/lib/fechas'
import { ALICUOTA_DEFAULT, calcularTotales, esAlicuota, type TotalesFactura } from '@/lib/compras/totalesFactura'
import { cantidadAResolver } from '@/lib/compras/diferencias'
import {
  convertirPrecio, cortoBase, esCobraPor, esUnidadBase, etiquetaCobraPor, tieneConversion,
  type CobraPor, type UnidadesInsumo,
} from '@/lib/compras/unidades'
import type { LineaPendiente } from '../datos'
import type { FacturaFila, FacturaItemFila, InsumoFactura, PedidoFactura } from './datos'

// Modelo de la pantalla de Facturas: armado del formulario, validación y lo que
// se manda a la RPC. Funciones puras, sin React ni Supabase, para poder
// chequearlas con `npx tsx app/admin/compras/pedidos/facturas/_check_modelo.ts`.

export type EstadoFacturaValor = 'borrador' | 'confirmada' | 'anulada'

export function aEstadoFactura(v: string | null): EstadoFacturaValor {
  return v === 'confirmada' || v === 'anulada' ? v : 'borrador'
}

export interface LineaFactura {
  /** Clave estable en el cliente (las líneas nuevas todavía no tienen id). */
  clave: string
  id: string | null
  pedidoItemId: string | null
  itemId: string | null
  descripcion: string
  unidad: string | null
  cantidad: number | null
  precioUnitario: number | null
  alicuotaIva: number
  /** Contexto que no se guarda: qué se pidió, qué llegó y a cuánto veníamos comprando. */
  pedido: number | null
  recibido: number | null
  precioRef: number | null
  // A2b ---------------------------------------------------------------------
  /** Kg (o la unidad base) facturados. Obligatorios si precioPor = 'base'. */
  cantidadBase: number | null
  /** 'unidad' = precio por unidad de compra; 'base' = por kg (subtotal = kg × precio). */
  precioPor: CobraPor
  /** En qué unidad está precioRef (cómo cobra el par). null = el proveedor no tiene el insumo. */
  cobraPorRef: CobraPor | null
  /** Unidades del insumo. null = línea libre o insumo sin datos. */
  unidades: UnidadesInsumo | null
  /** Kg que llegaron por remito, y si todas las líneas del remito los tenían. */
  recibidoBase: number | null
  recibidoBaseCompleto: boolean
}

export interface EstadoFactura {
  numero: string
  fecha: string
  vencimiento: string
  totalPapel: number | null
  observaciones: string
  lineas: LineaFactura[]
  /** FA4: pisar el precio de referencia del proveedor al confirmar. */
  actualizarPrecios: boolean
}

let secuencia = 0
function nuevaClave(): string {
  secuencia += 1
  return `l${secuencia}`
}

function alicuotaDe(itemId: string | null, insumos: Map<string, InsumoFactura>): number {
  const a = itemId ? insumos.get(itemId)?.alicuota_iva : null
  return esAlicuota(a) ? a : ALICUOTA_DEFAULT
}

/** A2b: unidades de un insumo, desde la lista de insumos. */
export function unidadesDeInsumo(itemId: string | null, insumos: Map<string, InsumoFactura>): UnidadesInsumo | null {
  const i = itemId ? insumos.get(itemId) : undefined
  if (!i || !esUnidadBase(i.unidad_base)) return null
  return { unidad: i.unidad, unidadBase: i.unidad_base, contenido: i.cantidad_por_unidad }
}

function unidadesDeLineaPedido(l: LineaPendiente | undefined, ctx: ContextoPedido | null): UnidadesInsumo | null {
  if (!l?.item_id) return null
  if (esUnidadBase(l.unidad_base) && l.contenido != null) {
    return { unidad: l.unidad, unidadBase: l.unidad_base, contenido: l.contenido }
  }
  return ctx ? unidadesDeInsumo(l.item_id, ctx.insumos) : null
}

/** Cómo cobra este proveedor el insumo: el par, o el default del insumo. Sin conversión, siempre por unidad. */
function cobraPorDe(itemId: string | null, u: UnidadesInsumo | null, ctx: ContextoPedido | null): CobraPor {
  if (!itemId || !u || !tieneConversion(u)) return 'unidad'
  const par = ctx?.precios.get(itemId)
  if (par) return par.cobraPor
  const def = ctx?.insumos.get(itemId)?.cobra_por_default
  return esCobraPor(def) ? def : 'unidad'
}

export function lineaLibre(): LineaFactura {
  return {
    clave: nuevaClave(), id: null, pedidoItemId: null, itemId: null,
    descripcion: '', unidad: null, cantidad: 1, precioUnitario: null, alicuotaIva: ALICUOTA_DEFAULT,
    pedido: null, recibido: null, precioRef: null,
    cantidadBase: null, precioPor: 'unidad', cobraPorRef: null, unidades: null, recibidoBase: null, recibidoBaseCompleto: false,
  }
}

/** La línea muestra "Cobra por": tiene insumo y una conversión (Caja ≠ kg). */
export function muestraCobraPor(l: LineaFactura): boolean {
  return !!l.itemId && !!l.unidades && tieneConversion(l.unidades)
}

/** El precio de referencia en la misma unidad que el de la línea (para comparar). */
export function precioRefEnLinea(l: LineaFactura): number | null {
  if (l.precioRef == null) return null
  if (!l.cobraPorRef || l.cobraPorRef === l.precioPor || !l.unidades) return l.precioRef
  return convertirPrecio(l.precioRef, l.cobraPorRef, l.precioPor, l.unidades.contenido)
}

/**
 * Cambiar "Cobra por" en una línea: el precio se convierte (÷ o × el contenido)
 * y, al pasar a kg, se prellenan los kg del remito si están completos.
 */
export function cambiarPrecioPor(l: LineaFactura, a: CobraPor): LineaFactura {
  if (a === l.precioPor || !l.unidades) return l
  const precio = l.precioUnitario != null ? convertirPrecio(l.precioUnitario, l.precioPor, a, l.unidades.contenido) : null
  const kg = a === 'base' && l.cantidadBase == null && l.recibidoBaseCompleto && l.cantidad === l.recibido ? l.recibidoBase : l.cantidadBase
  return { ...l, precioPor: a, precioUnitario: precio, cantidadBase: kg }
}

/** 'Caja' o 'kg' para el precio de la línea. */
export function etiquetaPrecioPor(l: LineaFactura): string {
  return l.unidades ? etiquetaCobraPor(l.precioPor, l.unidades) : (l.unidad || 'unidad')
}

/** Cuánto llegó en total de cada línea del pedido, y si el pedido tiene remitos. */
export function tieneRemitos(pedido: PedidoFactura | null): boolean {
  return (pedido?.compras_remitos.length ?? 0) > 0
}

/**
 * Líneas del remito que no corresponden a ninguna línea del pedido pero sí a un
 * insumo (P7: "llegó algo que no estaba en el pedido"). Se suman por insumo y
 * descripción para prellenar una línea de la factura.
 */
type Suelta = { itemId: string | null; descripcion: string; cantidad: number; base: number | null; baseCompleta: boolean }

function sueltasDeRemitos(pedido: PedidoFactura): Suelta[] {
  const m = new Map<string, Suelta>()
  for (const r of pedido.compras_remitos) {
    for (const ri of r.compras_remito_items) {
      if (ri.pedido_item_id) continue
      const clave = `${ri.item_id ?? ''}|${ri.descripcion}`
      const previo = m.get(clave)
      if (previo) {
        previo.cantidad += ri.cantidad
        previo.base = previo.base != null && ri.cantidad_base != null ? previo.base + ri.cantidad_base : null
        previo.baseCompleta = previo.baseCompleta && ri.cantidad_base != null
      } else {
        m.set(clave, {
          itemId: ri.item_id, descripcion: ri.descripcion, cantidad: ri.cantidad,
          base: ri.cantidad_base, baseCompleta: ri.cantidad_base != null,
        })
      }
    }
  }
  return [...m.values()]
}

/** Precio de referencia del par y en qué unidad está (A2b). precio null = el par no tiene precio. */
export interface PrecioRefPar {
  precio: number | null
  cobraPor: CobraPor
}

export interface ContextoPedido {
  pedido: PedidoFactura
  lineas: LineaPendiente[]
  /** Pares activos del proveedor del pedido, por insumo. */
  precios: Map<string, PrecioRefPar>
  insumos: Map<string, InsumoFactura>
}

/** Los pares de un proveedor, para el contexto. */
export function preciosDelProveedor(
  precios: { item_id: string; proveedor_id: string; precio_ref: number | null; cobra_por: string }[],
  proveedorId: string,
): Map<string, PrecioRefPar> {
  return new Map(precios
    .filter(p => p.proveedor_id === proveedorId)
    .map(p => [p.item_id, { precio: p.precio_ref, cobraPor: esCobraPor(p.cobra_por) ? p.cobra_por : 'unidad' }]))
}

/** El precio de referencia expresado en la unidad `a`. */
function refEn(itemId: string | null, a: CobraPor, u: UnidadesInsumo | null, ctx: ContextoPedido | null): number | null {
  const par = itemId ? ctx?.precios.get(itemId) : undefined
  if (!par || par.precio == null) return null
  return u && par.cobraPor !== a ? convertirPrecio(par.precio, par.cobraPor, a, u.contenido) : par.precio
}

/**
 * Líneas con las que arranca una factura nueva: lo que llegó por remitos, o lo
 * que se pidió si todavía no hay ninguno. Las que quedaron en 0 no entran (se
 * pueden sumar a mano desde "Falta en la factura").
 */
export function lineasIniciales(ctx: ContextoPedido): LineaFactura[] {
  const conRemitos = tieneRemitos(ctx.pedido)
  const delPedido = [...ctx.lineas]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(l => lineaDePedido(l, ctx, conRemitos ? (l.recibido ?? 0) : (l.cantidad ?? 0)))
    .filter(l => (l.cantidad ?? 0) > 0)

  const sueltas = conRemitos ? sueltasDeRemitos(ctx.pedido).map(s => {
    const unidades = unidadesDeInsumo(s.itemId, ctx.insumos)
    const precioPor = cobraPorDe(s.itemId, unidades, ctx)
    const par = s.itemId ? ctx.precios.get(s.itemId) : undefined
    const linea: LineaFactura = {
      ...lineaLibre(),
      itemId: s.itemId,
      descripcion: s.descripcion,
      unidad: s.itemId ? ctx.insumos.get(s.itemId)?.unidad ?? null : null,
      cantidad: s.cantidad,
      precioUnitario: refEn(s.itemId, precioPor, unidades, ctx),
      alicuotaIva: alicuotaDe(s.itemId, ctx.insumos),
      precioRef: par?.precio ?? null,
      cobraPorRef: par?.cobraPor ?? null,
      unidades,
      precioPor,
      recibido: s.cantidad,
      recibidoBase: s.base,
      recibidoBaseCompleto: s.baseCompleta,
      // Por kg: los kg del remito si están todos. Nunca el nominal.
      cantidadBase: precioPor === 'base' && s.baseCompleta ? s.base : null,
    }
    return linea
  }) : []

  return [...delPedido, ...sueltas]
}

function lineaDePedido(l: LineaPendiente, ctx: ContextoPedido, cantidad: number): LineaFactura {
  const par = l.item_id ? ctx.precios.get(l.item_id) : undefined
  const unidades = unidadesDeLineaPedido(l, ctx)
  const precioPor = cobraPorDe(l.item_id, unidades, ctx)
  const completo = !!l.recibido_base_completo && (l.remitos ?? 0) > 0
  return {
    clave: nuevaClave(),
    id: null,
    pedidoItemId: l.pedido_item_id,
    itemId: l.item_id,
    descripcion: l.descripcion ?? '',
    unidad: l.unidad,
    cantidad,
    precioUnitario: refEn(l.item_id, precioPor, unidades, ctx),
    alicuotaIva: alicuotaDe(l.item_id, ctx.insumos),
    pedido: l.cantidad,
    recibido: l.recibido,
    precioRef: par?.precio ?? null,
    cantidadBase: precioPor === 'base' && tieneRemitos(ctx.pedido) && completo && cantidad === l.recibido ? l.recibido_base : null,
    precioPor,
    cobraPorRef: par?.cobraPor ?? null,
    unidades,
    recibidoBase: l.recibido_base,
    recibidoBaseCompleto: completo,
  }
}

/** Líneas del pedido que no están en la factura: se ofrecen para sumarlas de a una. */
export function faltantesDelPedido(estado: EstadoFactura, ctx: ContextoPedido | null): LineaPendiente[] {
  if (!ctx) return []
  const usadas = new Set(estado.lineas.map(l => l.pedidoItemId).filter(Boolean))
  return [...ctx.lineas]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .filter(l => l.pedido_item_id && !usadas.has(l.pedido_item_id))
}

export function agregarDelPedido(l: LineaPendiente, ctx: ContextoPedido): LineaFactura {
  const conRemitos = tieneRemitos(ctx.pedido)
  const cantidad = conRemitos ? (l.recibido ?? 0) : (l.cantidad ?? 0)
  return lineaDePedido(l, ctx, cantidad > 0 ? cantidad : (l.cantidad ?? 0))
}

/**
 * Estado del formulario al abrirlo: factura existente, o una nueva sobre un pedido.
 * Las líneas iniciales llevan claves por posición: el formulario se puede
 * renderizar en el servidor (link ?pedido=) y el contador de nuevaClave() no
 * da lo mismo ahí que en el navegador, lo que rompía la hidratación de los id.
 */
export function estadoInicial(
  factura: FacturaVista | null,
  items: FacturaItemFila[],
  ctx: ContextoPedido | null,
  hoy: string = hoyISO(),
): EstadoFactura {
  const e = armarEstadoInicial(factura, items, ctx, hoy)
  return { ...e, lineas: e.lineas.map((l, i) => ({ ...l, clave: `i${i}` })) }
}

function armarEstadoInicial(
  factura: FacturaVista | null,
  items: FacturaItemFila[],
  ctx: ContextoPedido | null,
  hoy: string,
): EstadoFactura {
  if (factura) {
    return {
      numero: factura.numero,
      fecha: factura.fecha || hoy,
      vencimiento: factura.vencimiento ?? '',
      totalPapel: factura.totalPapel,
      observaciones: factura.observaciones,
      actualizarPrecios: false,
      lineas: [...items]
        .sort((a, b) => a.orden - b.orden)
        .map(i => {
          const lp = ctx?.lineas.find(l => l.pedido_item_id === i.pedido_item_id)
          const par = i.item_id ? ctx?.precios.get(i.item_id) : undefined
          const unidades = lp ? unidadesDeLineaPedido(lp, ctx) : ctx ? unidadesDeInsumo(i.item_id, ctx.insumos) : null
          return {
            clave: nuevaClave(),
            id: i.id,
            pedidoItemId: i.pedido_item_id,
            itemId: i.item_id,
            descripcion: i.descripcion,
            unidad: i.unidad,
            cantidad: i.cantidad,
            precioUnitario: i.precio_unitario,
            alicuotaIva: esAlicuota(i.alicuota_iva) ? i.alicuota_iva : ALICUOTA_DEFAULT,
            pedido: lp?.cantidad ?? null,
            recibido: lp?.recibido ?? null,
            precioRef: par?.precio ?? null,
            cantidadBase: i.cantidad_base,
            precioPor: esCobraPor(i.precio_por) ? i.precio_por : 'unidad',
            cobraPorRef: par?.cobraPor ?? null,
            unidades,
            recibidoBase: lp?.recibido_base ?? null,
            recibidoBaseCompleto: !!lp?.recibido_base_completo && (lp.remitos ?? 0) > 0,
          }
        }),
    }
  }
  return {
    numero: '',
    fecha: hoy,
    vencimiento: '',
    totalPapel: null,
    observaciones: '',
    actualizarPrecios: false,
    lineas: ctx ? lineasIniciales(ctx) : [],
  }
}

export function totales(estado: EstadoFactura): TotalesFactura {
  return calcularTotales(estado.lineas)
}

export type Problema =
  | { tipo: 'sin_numero' }
  | { tipo: 'sin_fecha' }
  | { tipo: 'vencimiento_antes' }
  | { tipo: 'linea_incompleta'; clave: string }
  | { tipo: 'falta_kg'; clave: string; descripcion: string; base: string }
  | { tipo: 'base_sin_cantidad'; clave: string; descripcion: string; base: string }
  | { tipo: 'sin_lineas' }
  | { tipo: 'total_cero' }

/** Lo que frena el guardado. `confirmar` suma las reglas que solo valen al confirmar. */
export function validar(estado: EstadoFactura, confirmar = false): Problema | null {
  if (!estado.numero.trim() || !estado.numero.replace(/\D/g, '')) return { tipo: 'sin_numero' }
  if (!estado.fecha) return { tipo: 'sin_fecha' }
  if (estado.vencimiento && estado.vencimiento < estado.fecha) return { tipo: 'vencimiento_antes' }
  const incompleta = estado.lineas.find(l => !l.descripcion.trim())
  if (incompleta) return { tipo: 'linea_incompleta', clave: incompleta.clave }
  // A2b: por kg hacen falta los kg y las cajas (sin cajas, el stock no suma).
  for (const l of estado.lineas) {
    if (l.precioPor !== 'base' || !l.itemId) continue
    const base = l.unidades ? cortoBase(l.unidades.unidadBase) : 'kg'
    if (!(l.cantidadBase != null && l.cantidadBase > 0)) return { tipo: 'falta_kg', clave: l.clave, descripcion: l.descripcion.trim(), base }
    if (!(l.cantidad != null && l.cantidad > 0)) return { tipo: 'base_sin_cantidad', clave: l.clave, descripcion: l.descripcion.trim(), base }
  }
  if (estado.lineas.length === 0) return { tipo: 'sin_lineas' }
  if (confirmar && totales(estado).total <= 0) return { tipo: 'total_cero' }
  return null
}

export function mensajeProblema(p: Problema | null): string {
  switch (p?.tipo) {
    case 'sin_numero': return 'Cargá el número de la factura, tal como figura en el papel.'
    case 'sin_fecha': return 'Elegí la fecha de la factura.'
    case 'vencimiento_antes': return 'El vencimiento no puede ser anterior a la fecha de la factura.'
    case 'linea_incompleta': return 'Hay una línea sin descripción. Escribila o quitá la línea.'
    case 'falta_kg': return `Cargá los ${p.base} de ${p.descripcion}: se cobra por ${p.base}.`
    case 'base_sin_cantidad': return `Cargá cuántas unidades llegaron de ${p.descripcion} (además de los ${p.base}).`
    case 'sin_lineas': return 'La factura no tiene líneas. Agregá al menos una.'
    case 'total_cero': return 'La factura da $ 0. Cargá las cantidades y los precios antes de confirmarla.'
    default: return ''
  }
}

export interface LineaEnvio {
  id: string | null
  pedidoItemId: string | null
  itemId: string | null
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  alicuotaIva: number
  cantidadBase: number | null
  precioPor: CobraPor
}

export function armarEnvio(estado: EstadoFactura): LineaEnvio[] {
  return estado.lineas.map(l => {
    // Los kg viajan solo en las líneas con insumo que se cobran por kg.
    const porBase = !!l.itemId && l.precioPor === 'base'
    return {
      id: l.id,
      pedidoItemId: l.pedidoItemId,
      itemId: l.itemId,
      descripcion: l.descripcion.trim(),
      unidad: l.unidad,
      cantidad: l.cantidad ?? 0,
      precioUnitario: l.precioUnitario ?? 0,
      alicuotaIva: l.alicuotaIva,
      cantidadBase: porBase && l.cantidadBase != null && l.cantidadBase > 0 ? l.cantidadBase : null,
      precioPor: porBase ? 'base' : 'unidad',
    }
  })
}

/**
 * "Actualizar precios" (E7): las líneas que cambiarían el precio de referencia o
 * cómo cobra el proveedor. Por insumo vale la última línea, como en la RPC.
 */
export function cambiosDePrecio(estado: EstadoFactura): { precios: number; cobraPor: { descripcion: string; a: string }[] } {
  const ultima = new Map<string, LineaFactura>()
  for (const l of estado.lineas) {
    if (l.itemId && (l.precioUnitario ?? 0) > 0) ultima.set(l.itemId, l)
  }
  let precios = 0
  const cobraPor: { descripcion: string; a: string }[] = []
  for (const l of ultima.values()) {
    // Sin par activo con este proveedor la RPC no actualiza nada.
    if (l.cobraPorRef == null) continue
    const cambiaCobro = l.cobraPorRef != null && l.cobraPorRef !== l.precioPor
    if (l.precioUnitario !== l.precioRef || cambiaCobro) precios++
    if (cambiaCobro) cobraPor.push({ descripcion: l.descripcion.trim(), a: etiquetaPrecioPor(l) })
  }
  return { precios, cobraPor }
}

/** Solo los dígitos, igual que numero_normalizado en la base (N3). */
export function normalizarNumero(numero: string): string {
  return numero.replace(/\D/g, '')
}

/**
 * FA3: otra factura activa del mismo proveedor con ese número. Se avisa mientras
 * se tipea; la base lo vuelve a frenar con su índice único.
 */
export function facturaDuplicada(
  numero: string,
  proveedorId: string | null,
  facturaId: string | null,
  facturas: FacturaVista[],
): FacturaVista | null {
  const norm = normalizarNumero(numero)
  if (!norm || !proveedorId) return null
  return facturas.find(f =>
    f.id !== facturaId
    && f.proveedorId === proveedorId
    && f.estado !== 'anulada'
    && normalizarNumero(f.numero) === norm) ?? null
}

/** Pedidos a los que hoy se les puede cargar una factura nueva. */
export function pedidosFacturables(pedidos: PedidoFactura[], facturas: FacturaVista[]): PedidoFactura[] {
  const conFactura = new Set(facturas.filter(f => f.estado !== 'anulada').map(f => f.pedidoId))
  return pedidos.filter(p => p.estado_recepcion !== 'sin_enviar' && !conFactura.has(p.id))
}

/** Los que ya recibieron algo y siguen sin factura: el banner de la lista. */
export function esperandoFactura(pedidos: PedidoFactura[], facturas: FacturaVista[]): PedidoFactura[] {
  return pedidosFacturables(pedidos, facturas)
    .filter(p => p.estado_recepcion === 'recibido' || p.estado_recepcion === 'parcial' || tieneRemitos(p))
}

export function etiquetaPedido(p: PedidoFactura): string {
  return `${codigoPedido(p.numero)} · ${p.proveedores?.nombre ?? '—'}`
}

/** Una línea para el resumen del pedido dentro del formulario. */
export function resumenRecepcion(pedido: PedidoFactura, lineas: LineaPendiente[]): string {
  const remitos = pedido.compras_remitos.length
  if (remitos === 0) return 'Todavía no llegó ningún remito de este pedido.'
  const completas = lineas.filter(l => (l.recibido ?? 0) >= (l.cantidad ?? 0)).length
  const cuantos = remitos === 1 ? '1 remito' : `${remitos} remitos`
  if (lineas.length === 0) return `${cuantos} cargados.`
  return `${cuantos} · llegaron ${completas} de ${lineas.length} línea${lineas.length === 1 ? '' : 's'} completas.`
}

/**
 * Una factura ya normalizada. La vista `v_compras_facturas` devuelve todas sus
 * columnas anulables (es lo que infiere el generador de tipos para cualquier
 * vista), así que el null se resuelve una sola vez acá y las pantallas trabajan
 * con valores firmes.
 */
export interface FacturaVista {
  id: string
  numero: string
  estado: EstadoFacturaValor
  /** B2: solo se comparte una 'factura'; la nota de crédito llega en B4. */
  tipoComprobante: 'factura' | 'nota_credito'
  pedidoId: string
  pedidoNumero: number | null
  codigo: string
  proveedorId: string | null
  proveedor: string
  fecha: string
  vencimiento: string | null
  subtotal: number
  iva: number
  total: number
  totalPapel: number | null
  observaciones: string
  mercaderiaLlego: boolean | null
  confirmadaEn: string | null
  confirmadaPor: string | null
  anuladaEn: string | null
  anuladaPor: string | null
  anuladaMotivo: string | null
  /** F5: el gasto de la factura (creado al confirmar o vinculado). */
  gastoId: string | null
  gastoGenerado: boolean
  gastoEstado: string | null
  gastoLocal: string | null
  pedidoEstadoRecepcion: string | null
  /** Diferencias con lo recibido sin resolver, y cuántas ya se pueden resolver (recepción completa). */
  diferenciasPendientes: number
  diferenciasAResolver: number
}

export function armarVistas(facturas: FacturaFila[]): FacturaVista[] {
  const res: FacturaVista[] = []
  for (const f of facturas) {
    if (!f.id || !f.pedido_id) continue
    res.push({
      id: f.id,
      numero: f.numero ?? '',
      estado: aEstadoFactura(f.estado),
      tipoComprobante: f.tipo_comprobante === 'nota_credito' ? 'nota_credito' : 'factura',
      pedidoId: f.pedido_id,
      pedidoNumero: f.pedido_numero,
      codigo: f.pedido_numero == null ? '—' : codigoPedido(f.pedido_numero),
      proveedorId: f.proveedor_id,
      proveedor: f.proveedor_nombre ?? '—',
      fecha: f.fecha ?? '',
      vencimiento: f.fecha_vencimiento,
      subtotal: f.subtotal ?? 0,
      iva: f.iva ?? 0,
      total: f.total ?? 0,
      totalPapel: f.total_papel,
      observaciones: f.observaciones ?? '',
      mercaderiaLlego: f.mercaderia_llego,
      confirmadaEn: f.confirmada_en,
      confirmadaPor: f.confirmada_por_nombre,
      anuladaEn: f.anulada_en,
      anuladaPor: f.anulada_por_nombre,
      anuladaMotivo: f.anulada_motivo,
      gastoId: f.gasto_id,
      gastoGenerado: f.gasto_generado ?? false,
      gastoEstado: f.gasto_estado,
      gastoLocal: f.gasto_local,
      pedidoEstadoRecepcion: f.pedido_estado_recepcion,
      diferenciasPendientes: f.diferencias_pendientes ?? 0,
      diferenciasAResolver: f.estado === 'confirmada'
        ? cantidadAResolver(f.diferencias_pendientes ?? 0, f.pedido_estado_recepcion)
        : 0,
    })
  }
  return res
}

export type FiltroFacturas = 'activas' | 'borradores' | 'confirmadas' | 'con_diferencias' | 'anuladas' | 'todas'

export function entraEnFiltro(v: FacturaVista, filtro: FiltroFacturas): boolean {
  switch (filtro) {
    case 'activas': return v.estado !== 'anulada'
    case 'borradores': return v.estado === 'borrador'
    case 'confirmadas': return v.estado === 'confirmada'
    case 'con_diferencias': return v.diferenciasAResolver > 0
    case 'anuladas': return v.estado === 'anulada'
    case 'todas': return true
  }
}

/**
 * Vencida y sin pagar: se marca en rojo en la lista. Una factura confirmada
 * antes de F5 no tiene gasto, así que cuenta como impaga.
 */
export function estaVencida(v: FacturaVista, hoy: string = hoyISO()): boolean {
  return v.estado === 'confirmada' && v.vencimiento != null && v.vencimiento < hoy && v.gastoEstado !== 'Pagado'
}

/** Busca por número de factura, código de pedido ("P-0012", "12") o proveedor. */
export function coincideBusqueda(v: FacturaVista, busqueda: string): boolean {
  const texto = busqueda.trim().toLowerCase()
  if (!texto) return true
  if (v.proveedor.toLowerCase().includes(texto)) return true
  if (v.numero.toLowerCase().includes(texto)) return true
  if (v.codigo.toLowerCase().includes(texto)) return true
  const digitos = normalizarNumero(texto)
  if (!digitos) return false
  if (normalizarNumero(v.numero).includes(digitos)) return true
  return texto.startsWith('p') && Number(digitos) === v.pedidoNumero
}
