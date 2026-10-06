'use server'

import { refresh } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { avisarRemitoListo } from '@/lib/compras/avisosServidor'

// La autorización y el stock los resuelven las RPC (tiene_acceso_compras(),
// compras_mover_stock con bloqueo por insumo). Si la RPC rechaza también se
// refresca: la pantalla queda con lo que hay en la base.

const Impacto = z.array(z.object({
  item_id: z.uuid(),
  nombre: z.string().nullable(),
  unidad: z.string().nullable(),
  delta: z.number(),
  cantidad_despues: z.number().nullable(),
}))

export type ImpactoStock = z.infer<typeof Impacto>

const Linea = z.object({
  id: z.uuid().nullable(),
  pedidoItemId: z.uuid().nullable(),
  itemId: z.uuid().nullable(),
  descripcion: z.string().trim().min(1),
  cantidad: z.number().positive(),
  // A2b: kg reales (opcionales). No mueven stock.
  cantidadBase: z.number().positive().nullable().optional(),
})

const GuardarRemito = z.object({
  remitoId: z.uuid().nullable(),
  pedidoId: z.uuid(),
  fecha: z.iso.date(),
  numero: z.string().trim().max(60).optional(),
  lineas: z.array(Linea).min(1),
})

export async function guardarRemito(
  entrada: z.input<typeof GuardarRemito>,
): Promise<Resultado<{ id: string; codigo: string; impacto: ImpactoStock; cambios: boolean }>> {
  const parsed = GuardarRemito.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Revisá el remito: hace falta la fecha y al menos una línea con cantidad mayor a 0.')
  const { remitoId, pedidoId, fecha, numero, lineas } = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_guardar_remito', {
      p_remito_id: remitoId ?? undefined,
      p_pedido_id: pedidoId,
      p_fecha: fecha,
      p_numero: numero || undefined,
      p_items: lineas.map(l => ({
        id: l.id,
        pedido_item_id: l.pedidoItemId,
        item_id: l.pedidoItemId ? null : l.itemId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        cantidad_base: l.cantidadBase ?? null,
      })),
    })
    if (error) { refresh(); return fallo(error, 'No se pudo guardar el remito.') }
    const res = z.object({ id: z.uuid(), codigo: z.string(), impacto: Impacto, cambios: z.boolean().optional() }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'El remito se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    const cambios = res.data.cambios ?? true
    // B5 (E5): si el pedido quedó listo para facturar, avisa a admin (no al autor).
    // Corre después de responder (también el getUser, que lee las cookies de la
    // acción) y nunca cambia el resultado del remito.
    if (cambios) {
      after(async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) await avisarRemitoListo(pedidoId, user.id)
        } catch (e) {
          console.error('[avisos-compras] remito listo: no se pudo leer el usuario', e)
        }
      })
    }
    return ok({ ...res.data, cambios })
  } catch (e) {
    return fallo(e, 'No se pudo guardar el remito.')
  }
}

export async function eliminarRemito(remitoId: string): Promise<Resultado<{ codigo: string; impacto: ImpactoStock }>> {
  if (!z.uuid().safeParse(remitoId).success) return fallo(null, 'No encontramos el remito. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_eliminar_remito', { p_remito_id: remitoId })
    if (error) { refresh(); return fallo(error, 'No se pudo eliminar el remito.') }
    const res = z.object({ codigo: z.string(), impacto: Impacto }).safeParse(data)
    refresh()
    if (!res.success) return fallo(null, 'El remito se eliminó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo eliminar el remito.')
  }
}
