import { sugerirPedidoItem } from '@/lib/compras/matchRemito'
import type { LineaPedido, RemitoFila } from './datos'

// Modelo del formulario de remito. Funciones puras: el form guarda el estado,
// acá se calcula qué mueve en el stock y qué se manda a la RPC.
// Chequeo: npx tsx app/admin/compras/pedidos/remitos/_check_modelo.ts

/** Cantidad que llegó en este remito para una línea del pedido. */
export interface CantidadLinea {
  /** Id de la línea del remito si ya existía (edición). */
  id: string | null
  cantidad: number | null
}

/** '' = todavía no se eligió; 'nada' = no está en el pedido; si no, id de la línea del pedido. */
export type Corresponde = '' | 'nada' | string

/** Algo que llegó y no estaba en el pedido, o que vino con otro nombre (P7/P8). */
export interface LineaLibre {
  clave: string
  id: string | null
  descripcion: string
  cantidad: number | null
  corresponde: Corresponde
  /** Insumo opcional cuando corresponde = 'nada'. Sin insumo no mueve stock. */
  itemId: string | null
  /** El usuario eligió "corresponde a" a mano: ya no se sugiere solo. */
  manual: boolean
}

export interface EstadoRemito {
  fecha: string
  porLinea: Record<string, CantidadLinea>
  libres: LineaLibre[]
}

export interface ImpactoItem {
  itemId: string
  delta: number
  antes: number
  despues: number
}

export interface LineaEnvio {
  id: string | null
  pedidoItemId: string | null
  itemId: string | null
  descripcion: string
  cantidad: number
}

let contador = 0
export function nuevaClave(): string {
  contador += 1
  return `libre-${contador}`
}

export function hoyISO(): string {
  // en-CA formatea como AAAA-MM-DD, en la zona horaria del navegador.
  return new Date().toLocaleDateString('en-CA')
}

export function libreVacia(): LineaLibre {
  return { clave: nuevaClave(), id: null, descripcion: '', cantidad: null, corresponde: '', itemId: null, manual: false }
}

/**
 * Estado de arranque. En un remito nuevo, las líneas del pedido arrancan
 * vacías (nadie guarda "llegó todo" sin mirar). En una edición, vuelve a la
 * fila del pedido solo lo que se cargó ahí (misma descripción); lo que vino
 * con otro nombre queda como línea libre que corresponde a esa línea, así un
 * guardado no pisa el texto del remito ni desvincula la línea.
 */
export function estadoInicial(remito: RemitoFila | null, lineasPedido: LineaPedido[]): EstadoRemito {
  const porLinea: Record<string, CantidadLinea> = {}
  const descripcionDe = new Map<string, string>()
  for (const l of lineasPedido) {
    if (!l.pedido_item_id) continue
    porLinea[l.pedido_item_id] = { id: null, cantidad: null }
    descripcionDe.set(l.pedido_item_id, l.descripcion ?? '')
  }
  const libres: LineaLibre[] = []
  if (remito) {
    for (const ri of remito.compras_remito_items) {
      const destino = ri.pedido_item_id ? porLinea[ri.pedido_item_id] : undefined
      if (destino && destino.id == null && descripcionDe.get(ri.pedido_item_id ?? '') === ri.descripcion) {
        destino.id = ri.id
        destino.cantidad = ri.cantidad
      } else {
        libres.push({
          clave: nuevaClave(),
          id: ri.id,
          descripcion: ri.descripcion,
          cantidad: ri.cantidad,
          // Si la línea del pedido no vino en la consulta, igual se conserva el vínculo.
          corresponde: ri.pedido_item_id ?? 'nada',
          itemId: ri.pedido_item_id ? null : ri.item_id,
          manual: true,
        })
      }
    }
  }
  return { fecha: remito?.fecha ?? hoyISO(), porLinea, libres }
}

/** Lo que este remito ya había cargado, por línea del pedido (para no contarlo dos veces en "Ya llegó"). */
export function cargadoPorLinea(remito: RemitoFila | null): Record<string, number> {
  const res: Record<string, number> = {}
  for (const ri of remito?.compras_remito_items ?? []) {
    if (ri.pedido_item_id) res[ri.pedido_item_id] = (res[ri.pedido_item_id] ?? 0) + ri.cantidad
  }
  return res
}

/** Al tipear la descripción de una línea libre se sugiere a qué línea del pedido corresponde. */
export function conDescripcion(linea: LineaLibre, descripcion: string, lineasPedido: LineaPedido[]): LineaLibre {
  if (linea.manual) return { ...linea, descripcion }
  const candidatos = lineasPedido
    .filter(l => l.pedido_item_id)
    .map(l => ({ id: l.pedido_item_id as string, descripcion: l.descripcion ?? '' }))
  const sugerido = sugerirPedidoItem(descripcion, candidatos)
  return { ...linea, descripcion, corresponde: sugerido ?? '' }
}

function positiva(n: number | null): n is number {
  return n != null && n > 0
}

/** Líneas libres que el usuario empezó a cargar (una fila totalmente vacía no cuenta). */
export function libresUsadas(libres: LineaLibre[]): LineaLibre[] {
  return libres.filter(l => l.descripcion.trim() || l.cantidad != null)
}

export type ProblemaRemito =
  | { tipo: 'sin_fecha' }
  | { tipo: 'sin_lineas' }
  | { tipo: 'libre_incompleta'; clave: string }
  | { tipo: 'libre_sin_destino'; clave: string }

export function validar(estado: EstadoRemito): ProblemaRemito | null {
  if (!estado.fecha) return { tipo: 'sin_fecha' }
  for (const l of libresUsadas(estado.libres)) {
    if (!l.descripcion.trim() || !positiva(l.cantidad)) return { tipo: 'libre_incompleta', clave: l.clave }
    if (l.corresponde === '') return { tipo: 'libre_sin_destino', clave: l.clave }
  }
  if (armarEnvio(estado, []).length === 0) return { tipo: 'sin_lineas' }
  return null
}

/** Líneas que se mandan a compras_guardar_remito. */
export function armarEnvio(estado: EstadoRemito, lineasPedido: LineaPedido[]): LineaEnvio[] {
  const descripcionDe = new Map(lineasPedido.map(l => [l.pedido_item_id, l.descripcion ?? '']))
  const res: LineaEnvio[] = []
  for (const [pedidoItemId, c] of Object.entries(estado.porLinea)) {
    if (!positiva(c.cantidad)) continue
    res.push({ id: c.id, pedidoItemId, itemId: null, descripcion: descripcionDe.get(pedidoItemId) || 'Línea del pedido', cantidad: c.cantidad })
  }
  for (const l of libresUsadas(estado.libres)) {
    if (!positiva(l.cantidad) || !l.descripcion.trim() || l.corresponde === '') continue
    const esDelPedido = l.corresponde !== 'nada'
    res.push({
      id: l.id,
      pedidoItemId: esDelPedido ? l.corresponde : null,
      itemId: esDelPedido ? null : l.itemId,
      descripcion: l.descripcion.trim(),
      cantidad: l.cantidad,
    })
  }
  return res
}

/** Insumo que mueve cada línea del envío (el de la línea del pedido, o el elegido en la libre). */
function totalesPorInsumo(lineas: LineaEnvio[], itemDeLinea: Map<string, string | null>): Map<string, number> {
  const res = new Map<string, number>()
  for (const l of lineas) {
    const itemId = l.pedidoItemId ? itemDeLinea.get(l.pedidoItemId) ?? null : l.itemId
    if (!itemId) continue
    res.set(itemId, (res.get(itemId) ?? 0) + l.cantidad)
  }
  return res
}

/**
 * Qué le pasa al stock si se guarda: por insumo, la diferencia entre lo que
 * el remito suma ahora y lo que sumaba antes (lo mismo que reconcilia la RPC).
 */
export function calcularImpacto(
  envio: LineaEnvio[],
  remitoOriginal: RemitoFila | null,
  lineasPedido: LineaPedido[],
  stockPorItem: Record<string, number>,
): ImpactoItem[] {
  const itemDeLinea = new Map(lineasPedido.map(l => [l.pedido_item_id ?? '', l.item_id]))
  const ahora = totalesPorInsumo(envio, itemDeLinea)
  const antes = new Map<string, number>()
  for (const ri of remitoOriginal?.compras_remito_items ?? []) {
    if (ri.item_id) antes.set(ri.item_id, (antes.get(ri.item_id) ?? 0) + ri.cantidad)
  }
  const ids = new Set([...ahora.keys(), ...antes.keys()])
  const res: ImpactoItem[] = []
  for (const itemId of ids) {
    const delta = redondear((ahora.get(itemId) ?? 0) - (antes.get(itemId) ?? 0))
    if (delta === 0) continue
    const stock = stockPorItem[itemId] ?? 0
    res.push({ itemId, delta, antes: stock, despues: redondear(stock + delta) })
  }
  return res
}

/** Impacto de eliminar el remito: resta todo lo que sumó. */
export function impactoEliminar(remito: RemitoFila, stockPorItem: Record<string, number>): ImpactoItem[] {
  return calcularImpacto([], remito, [], stockPorItem)
}

/** Líneas que no mueven stock (libres sin insumo). */
export function lineasSinStock(envio: LineaEnvio[]): number {
  return envio.filter(l => !l.pedidoItemId && !l.itemId).length
}

function redondear(n: number): number {
  return Math.round(n * 10000) / 10000
}
