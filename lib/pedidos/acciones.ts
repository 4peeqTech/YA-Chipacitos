// Acciones de pedidos desde el navegador. Cada una envuelve una RPC (todo
// cambio de estado o de ítems pasa por la base, D7) y, si corresponde, pide
// el aviso a /api/notificaciones/pedidos (D9). Nunca tiran: devuelven
// {ok, error} con un mensaje en castellano listo para el toast. Si la acción
// salió bien pero el aviso no, vuelve ok con `advertencia`.

import { createClient } from '@/lib/supabase/client'
import type { PedidoMensaje } from '@/lib/types'

export type Resultado<T = undefined> =
  | { ok: true; data: T; advertencia?: string }
  | { ok: false; error: string }

export type EventoAviso = 'creado' | 'editado' | 'enviado' | 'cancelado' | 'recibido' | 'mensaje'

export interface ItemNuevoPedido { producto_id: string; cantidad: number }
export interface PedidoCreado { id: string; numero: number; destino: 'fabrica' | 'deposito' }
/** Con item_id edita esa línea; sin item_id agrega el producto (o edita su línea si ya estaba). 0 = no se manda. */
export interface ItemEdicion { item_id?: string; producto_id: string; cantidad_enviada: number }
/** Solo los ítems con diferencias: los que no se informan se dan por recibidos igual a lo enviado. */
export interface ItemRecepcion { id: string; cantidad_recibida: number; valor_total?: number | null }
export interface ItemRecepcionNuevo { producto_id: string; cantidad_recibida: number; valor_total?: number | null }

const AVISO_FALLIDO = 'Se guardó, pero no se pudo avisar a la otra parte. Si es urgente, avisá por otro medio.'

let cliente: ReturnType<typeof createClient> | null = null
function db() {
  if (!cliente) cliente = createClient()
  return cliente
}

// Los raise exception de las RPC (código P0001) ya vienen en castellano y
// pensados para el usuario; el resto se traduce a algo entendible.
function mensajeError(error: { message?: string; code?: string } | null | undefined, accion: string): string {
  const msg = error?.message ?? ''
  if (error?.code === 'P0001' && msg) return msg
  if (/fetch|network|Failed to/i.test(msg)) return `Sin conexión: no se pudo ${accion}. Revisá internet y probá de nuevo.`
  if (/row-level security|permission denied/i.test(msg)) return `No tenés permiso para ${accion}.`
  return `No se pudo ${accion}. Probá de nuevo.`
}

async function rpc<T>(fn: string, args: Record<string, unknown>, accion: string): Promise<Resultado<T>> {
  try {
    const { data, error } = await db().rpc(fn, args)
    if (error) return { ok: false, error: mensajeError(error, accion) }
    return { ok: true, data: data as T }
  } catch (e) {
    return { ok: false, error: mensajeError({ message: e instanceof Error ? e.message : String(e) }, accion) }
  }
}

/** Pide el aviso del evento. true si salió bien. */
export async function avisar(pedidoId: string, evento: EventoAviso): Promise<boolean> {
  try {
    const res = await fetch('/api/notificaciones/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId, evento }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function conAviso<T>(r: Resultado<T>, pedidoId: string, evento: EventoAviso): Promise<Resultado<T>> {
  if (!r.ok) return r
  const avisado = await avisar(pedidoId, evento)
  return avisado ? r : { ...r, advertencia: AVISO_FALLIDO }
}

/** Local: crea el pedido (uno por destino, en una sola transacción) y avisa a cada destino. */
export async function crearPedido(items: ItemNuevoPedido[], notas?: string | null): Promise<Resultado<PedidoCreado[]>> {
  const r = await rpc<PedidoCreado[]>('pedidos_crear', { p_items: items, p_notas: notas ?? null }, 'enviar el pedido')
  if (!r.ok) return r
  const avisos = await Promise.all(r.data.map(p => avisar(p.id, 'creado')))
  return avisos.every(Boolean) ? r : { ...r, advertencia: AVISO_FALLIDO }
}

/** Operador del destino: pendiente → en preparación. Sin aviso. */
export async function empezarPreparacion(pedidoId: string): Promise<Resultado> {
  return rpc<undefined>('pedido_empezar_preparacion', { p_pedido_id: pedidoId }, 'empezar la preparación')
}

/** Operador del destino: fija lo que se va a mandar. Devuelve cuántos cambios hubo; solo avisa si hubo alguno. */
export async function editarItemsPedido(pedidoId: string, items: ItemEdicion[]): Promise<Resultado<number>> {
  const r = await rpc<number>('pedido_editar_items', { p_pedido_id: pedidoId, p_items: items }, 'guardar los cambios del pedido')
  if (!r.ok || r.data === 0) return r
  return conAviso(r, pedidoId, 'editado')
}

/** Operador del destino: → en camino (descuenta stock con lo enviado). Avisa al local. */
export async function marcarEnviado(pedidoId: string): Promise<Resultado> {
  const r = await rpc<undefined>('fabrica_marcar_pedido_enviado', { p_pedido_id: pedidoId }, 'marcar el pedido como enviado')
  return conAviso(r, pedidoId, 'enviado')
}

/** Local dueño, operador del destino o admin, antes de "En camino". Avisa a la otra parte. */
export async function cancelarPedido(pedidoId: string, motivo?: string | null): Promise<Resultado> {
  const r = await rpc<undefined>('pedido_cancelar', { p_pedido_id: pedidoId, p_motivo: motivo ?? null }, 'cancelar el pedido')
  return conAviso(r, pedidoId, 'cancelado')
}

/**
 * Local dueño o admin, solo con el pedido en camino. Sin `items` ni
 * `itemsNuevos` es "Llegó todo bien". Si hubo diferencias avisa al destino.
 */
export async function confirmarRecepcion(
  pedidoId: string,
  opciones: { items?: ItemRecepcion[]; itemsNuevos?: ItemRecepcionNuevo[]; nota?: string | null } = {},
): Promise<Resultado<{ con_diferencias: boolean }>> {
  const r = await rpc<{ con_diferencias: boolean }>('fabrica_confirmar_recepcion_pedido', {
    p_pedido_id: pedidoId,
    p_items: opciones.items ?? [],
    p_items_nuevos: opciones.itemsNuevos ?? [],
    p_nota: opciones.nota ?? null,
  }, 'confirmar la recepción')
  if (!r.ok || !r.data.con_diferencias) return r
  return conAviso(r, pedidoId, 'recibido')
}

/** Cualquiera que vea el pedido. El autor lo completa la base. Avisa a la otra parte. */
export async function enviarMensaje(pedidoId: string, texto: string): Promise<Resultado<PedidoMensaje>> {
  const limpio = texto.trim()
  if (!limpio) return { ok: false, error: 'El mensaje está vacío.' }
  try {
    const { data, error } = await db()
      .from('pedido_mensajes')
      // autor_rol/autor_nombre son NOT NULL: el trigger los pisa con los del perfil.
      .insert({ pedido_id: pedidoId, texto: limpio, autor_rol: '-', autor_nombre: '-' })
      .select()
      .single()
    if (error || !data) return { ok: false, error: mensajeError(error, 'enviar el mensaje') }
    return conAviso<PedidoMensaje>({ ok: true, data: data as PedidoMensaje }, pedidoId, 'mensaje')
  } catch (e) {
    return { ok: false, error: mensajeError({ message: e instanceof Error ? e.message : String(e) }, 'enviar el mensaje') }
  }
}

/** Fecha (YYYY-MM-DD) del corte de versión: los pedidos anteriores son de la versión vieja. */
export async function obtenerInicioVersion(): Promise<Resultado<string | null>> {
  return rpc<string | null>('pedidos_inicio_version', {}, 'leer la fecha de la versión nueva')
}
