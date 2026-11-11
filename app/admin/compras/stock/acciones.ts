'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'

// La autorización y el bloqueo por insumo los hacen las RPC. Si rechazan
// (casi siempre porque otra persona movió el stock), también se refresca.

const Ajuste = z.object({
  itemId: z.uuid(),
  cantidad: z.number().min(0),
  motivo: z.string().trim().min(1),
})

export async function ajustarStock(entrada: z.input<typeof Ajuste>): Promise<Resultado<{ antes: number; despues: number }>> {
  const parsed = Ajuste.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Cargá la cantidad real (0 o más) y el motivo del ajuste.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_ajustar_stock', {
      p_item_id: parsed.data.itemId,
      p_cantidad_objetivo: parsed.data.cantidad,
      p_motivo: parsed.data.motivo,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo ajustar el stock.')
    const res = z.object({ antes: z.number(), despues: z.number() }).safeParse(data)
    if (!res.success) return fallo(null, 'El ajuste se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo ajustar el stock.')
  }
}

const Reversion = z.object({
  movimientoId: z.uuid(),
  motivo: z.string().trim().min(1),
})

export async function revertirMovimiento(entrada: z.input<typeof Reversion>): Promise<Resultado<{ despues: number }>> {
  const parsed = Reversion.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Contá por qué revertís el ajuste.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_revertir_movimiento', {
      p_movimiento_id: parsed.data.movimientoId,
      p_motivo: parsed.data.motivo,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo revertir el ajuste.')
    const res = z.object({ despues: z.number() }).safeParse(data)
    if (!res.success) return fallo(null, 'La reversión se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo revertir el ajuste.')
  }
}
