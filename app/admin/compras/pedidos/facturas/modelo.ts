import { codigoPedido } from '@/lib/compras/codigos'
import { hoyISO } from '@/lib/fechas'
import { ALICUOTA_DEFAULT, calcularTotales, esAlicuota, type TotalesFactura } from '@/lib/compras/totalesFactura'
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

export function lineaLibre(): LineaFactura {
  return {
    clave: nuevaClave(), id: null, pedidoItemId: null, itemId: null,
    descripcion: '', unidad: null, cantidad: 1, precioUnitario: null, alicuotaIva: ALICUOTA_DEFAULT,
    pedido: null, recibido: null, precioRef: null,
  }
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
function sueltasDeRemitos(pedido: PedidoFactura): { itemId: string | null; descripcion: string; cantidad: number }[] {
  const m = new Map<string, { itemId: string | null; descripcion: string; cantidad: number }>()
  for (const r of pedido.compras_remitos) {
    for (const ri of r.compras_remito_items) {
      if (ri.pedido_item_id) continue
      const clave = `${ri.item_id ?? ''}|${ri.descripcion}`
      const previo = m.get(clave)
      if (previo) previo.cantidad += ri.cantidad
      else m.set(clave, { itemId: ri.item_id, descripcion: ri.descripcion, cantidad: ri.cantidad })
    }
  }
  return [...m.values()]
}

export interface ContextoPedido {
  pedido: PedidoFactura
  lineas: LineaPendiente[]
  precios: Map<string, number>
  insumos: Map<string, InsumoFactura>
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

  const sueltas = conRemitos ? sueltasDeRemitos(ctx.pedido).map(s => ({
    ...lineaLibre(),
    itemId: s.itemId,
    descripcion: s.descripcion,
    unidad: s.itemId ? ctx.insumos.get(s.itemId)?.unidad ?? null : null,
    cantidad: s.cantidad,
    precioUnitario: s.itemId ? ctx.precios.get(s.itemId) ?? null : null,
    alicuotaIva: alicuotaDe(s.itemId, ctx.insumos),
    precioRef: s.itemId ? ctx.precios.get(s.itemId) ?? null : null,
  })) : []

  return [...delPedido, ...sueltas]
}

function lineaDePedido(l: LineaPendiente, ctx: ContextoPedido, cantidad: number): LineaFactura {
  const ref = l.item_id ? ctx.precios.get(l.item_id) ?? null : null
  return {
    clave: nuevaClave(),
    id: null,
    pedidoItemId: l.pedido_item_id,
    itemId: l.item_id,
    descripcion: l.descripcion ?? '',
    unidad: l.unidad,
    cantidad,
    precioUnitario: ref,
    alicuotaIva: alicuotaDe(l.item_id, ctx.insumos),
    pedido: l.cantidad,
    recibido: l.recibido,
    precioRef: ref,
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

/** Estado del formulario al abrirlo: factura existente, o una nueva sobre un pedido. */
export function estadoInicial(
  factura: FacturaVista | null,
  items: FacturaItemFila[],
  ctx: ContextoPedido | null,
  hoy: string = hoyISO(),
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
        .map(i => ({
          clave: nuevaClave(),
          id: i.id,
          pedidoItemId: i.pedido_item_id,
          itemId: i.item_id,
          descripcion: i.descripcion,
          unidad: i.unidad,
          cantidad: i.cantidad,
          precioUnitario: i.precio_unitario,
          alicuotaIva: esAlicuota(i.alicuota_iva) ? i.alicuota_iva : ALICUOTA_DEFAULT,
          pedido: ctx?.lineas.find(l => l.pedido_item_id === i.pedido_item_id)?.cantidad ?? null,
          recibido: ctx?.lineas.find(l => l.pedido_item_id === i.pedido_item_id)?.recibido ?? null,
          precioRef: i.item_id ? ctx?.precios.get(i.item_id) ?? null : null,
        })),
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
  | { tipo: 'sin_lineas' }
  | { tipo: 'total_cero' }

/** Lo que frena el guardado. `confirmar` suma las reglas que solo valen al confirmar. */
export function validar(estado: EstadoFactura, confirmar = false): Problema | null {
  if (!estado.numero.trim() || !estado.numero.replace(/\D/g, '')) return { tipo: 'sin_numero' }
  if (!estado.fecha) return { tipo: 'sin_fecha' }
  if (estado.vencimiento && estado.vencimiento < estado.fecha) return { tipo: 'vencimiento_antes' }
  const incompleta = estado.lineas.find(l => !l.descripcion.trim())
  if (incompleta) return { tipo: 'linea_incompleta', clave: incompleta.clave }
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
}

export function armarEnvio(estado: EstadoFactura): LineaEnvio[] {
  return estado.lineas.map(l => ({
    id: l.id,
    pedidoItemId: l.pedidoItemId,
    itemId: l.itemId,
    descripcion: l.descripcion.trim(),
    unidad: l.unidad,
    cantidad: l.cantidad ?? 0,
    precioUnitario: l.precioUnitario ?? 0,
    alicuotaIva: l.alicuotaIva,
  }))
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
}

export function armarVistas(facturas: FacturaFila[]): FacturaVista[] {
  const res: FacturaVista[] = []
  for (const f of facturas) {
    if (!f.id || !f.pedido_id) continue
    res.push({
      id: f.id,
      numero: f.numero ?? '',
      estado: aEstadoFactura(f.estado),
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
    })
  }
  return res
}

export type FiltroFacturas = 'activas' | 'borradores' | 'confirmadas' | 'anuladas' | 'todas'

export function entraEnFiltro(v: FacturaVista, filtro: FiltroFacturas): boolean {
  switch (filtro) {
    case 'activas': return v.estado !== 'anulada'
    case 'borradores': return v.estado === 'borrador'
    case 'confirmadas': return v.estado === 'confirmada'
    case 'anuladas': return v.estado === 'anulada'
    case 'todas': return true
  }
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
