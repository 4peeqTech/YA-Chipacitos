'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'

// La autorización la hacen las RPC (tiene_acceso_compras()): estas acciones son
// alcanzables por POST directo, nunca confiar en lo que muestra la UI.
// Si la RPC rechaza (casi siempre porque otra persona cambió el pedido), también
// se refresca: la pantalla queda con el estado real y el error explica qué pasó.

const Linea = z.object({
  id: z.uuid().nullable().optional(),
  item_id: z.uuid().nullable().optional(),
  descripcion: z.string().trim().min(1),
  unidad: z.string().trim().nullable().optional(),
  cantidad: z.number().positive(),
})

const GuardarPedido = z.object({
  pedidoId: z.uuid().nullable(),
  proveedorId: z.uuid().nullable(),
  localFacturacionId: z.uuid().nullable(),
  lineas: z.array(Linea),
})

export async function guardarPedido(
  entrada: z.input<typeof GuardarPedido>,
): Promise<Resultado<{ id: string; numero: number }>> {
  const parsed = GuardarPedido.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Cada línea necesita una descripción y una cantidad mayor a 0.')
  const { pedidoId, proveedorId, localFacturacionId, lineas } = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_guardar_pedido', {
      p_pedido_id: pedidoId ?? undefined,
      p_proveedor_id: proveedorId ?? undefined,
      p_local_facturacion_id: localFacturacionId ?? undefined,
      p_items: lineas.map(l => ({
        id: l.id ?? null,
        item_id: l.item_id ?? null,
        descripcion: l.descripcion,
        unidad: l.unidad || null,
        cantidad: l.cantidad,
      })),
    })
    if (error) { refresh(); return fallo(error, 'No se pudo guardar el pedido.') }
    const res = z.object({ id: z.uuid(), numero: z.number() }).safeParse(data)
    if (!res.success) return fallo(null, 'El pedido se guardó, pero no pudimos leer su número. Recargá la página.')
    refresh()
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el pedido.')
  }
}

const GuardarMensaje = z.object({
  pedidoId: z.uuid(),
  mensaje: z.string().trim().min(1),
  localFacturacionId: z.uuid().nullable(),
})

export async function guardarMensaje(entrada: z.input<typeof GuardarMensaje>): Promise<Resultado<null>> {
  const parsed = GuardarMensaje.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'El mensaje está vacío.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase
      .from('compras_pedidos')
      .update({ mensaje: parsed.data.mensaje, local_facturacion_id: parsed.data.localFacturacionId })
      .eq('id', parsed.data.pedidoId)
    if (error) { refresh(); return fallo(error, 'No se pudo guardar el mensaje del pedido.') }
    refresh()
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el mensaje del pedido.')
  }
}

const SoloPedido = z.object({ pedidoId: z.uuid() })

async function rpcSobrePedido(
  fn: 'compras_marcar_pedido_enviado' | 'compras_reabrir_pedido' | 'compras_eliminar_pedido',
  entrada: z.input<typeof SoloPedido>,
  fallback: string,
): Promise<Resultado<null>> {
  const parsed = SoloPedido.safeParse(entrada)
  if (!parsed.success) return fallo(null, fallback)
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc(fn, { p_pedido_id: parsed.data.pedidoId })
    if (error) { refresh(); return fallo(error, fallback) }
    refresh()
    return ok(null)
  } catch (e) {
    return fallo(e, fallback)
  }
}

export async function marcarPedidoEnviado(entrada: z.input<typeof SoloPedido>): Promise<Resultado<null>> {
  return rpcSobrePedido('compras_marcar_pedido_enviado', entrada, 'No se pudo marcar el pedido como enviado.')
}

export async function reabrirPedido(entrada: z.input<typeof SoloPedido>): Promise<Resultado<null>> {
  return rpcSobrePedido('compras_reabrir_pedido', entrada, 'No se pudo reabrir el pedido.')
}

export async function eliminarPedido(entrada: z.input<typeof SoloPedido>): Promise<Resultado<null>> {
  return rpcSobrePedido('compras_eliminar_pedido', entrada, 'No se pudo eliminar el pedido.')
}

const CerrarPedido = z.object({ pedidoId: z.uuid(), motivo: z.string().trim().min(1).max(500) })

export async function cerrarPedidoManual(entrada: z.input<typeof CerrarPedido>): Promise<Resultado<null>> {
  const parsed = CerrarPedido.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Contanos por qué cerrás el pedido.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('compras_cerrar_pedido_manual', {
      p_pedido_id: parsed.data.pedidoId,
      p_motivo: parsed.data.motivo,
    })
    if (error) { refresh(); return fallo(error, 'No se pudo cerrar el pedido.') }
    refresh()
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo cerrar el pedido.')
  }
}
