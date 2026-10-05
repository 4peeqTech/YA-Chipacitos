'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'

// A1: Compras resuelve las diferencias de un conteo cerrado. La autorización
// (tiene_acceso_compras) y los bloqueos (descartado, superada, ya resuelta) los
// hace la RPC. Si rechaza, también se refresca: casi siempre es que otra
// persona ya la resolvió.

const Resolver = z.object({
  conteoId: z.uuid(),
  itemIds: z.array(z.uuid()).min(1).nullable(),
  accion: z.enum(['aplicar', 'ignorar', 'revertir']),
  nota: z.string().trim().max(500).optional(),
})

const Respuesta = z.object({
  hechas: z.number(),
  omitidas_superadas: z.number(),
  items: z.array(z.object({ item_id: z.string(), nombre: z.string(), cantidad_despues: z.number().nullable() })),
})

export interface ResultadoResolver {
  hechas: number
  omitidasSuperadas: number
  items: { item_id: string; nombre: string; cantidad_despues: number | null }[]
}

export async function resolverDiferenciasConteo(entrada: z.input<typeof Resolver>): Promise<Resultado<ResultadoResolver>> {
  const parsed = Resolver.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'Elegí qué diferencia resolver.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_resolver_diferencias_conteo', {
      p_conteo_id: parsed.data.conteoId,
      p_accion: parsed.data.accion,
      ...(parsed.data.itemIds ? { p_item_ids: parsed.data.itemIds } : {}),
      ...(parsed.data.nota ? { p_nota: parsed.data.nota } : {}),
    })
    refresh()
    if (error) return fallo(error, 'No se pudo resolver la diferencia.')
    const res = Respuesta.safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ hechas: res.data.hechas, omitidasSuperadas: res.data.omitidas_superadas, items: res.data.items })
  } catch (e) {
    return fallo(e, 'No se pudo resolver la diferencia.')
  }
}
