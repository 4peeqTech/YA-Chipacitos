import type { createClient } from '@/lib/supabase/client'
import type { Remito } from './tipos'

type SupabaseBrowserClient = ReturnType<typeof createClient>

export async function sumarStock(supabase: SupabaseBrowserClient, itemId: string, delta: number, remitoId: string, usuarioId: string) {
  const { data: actual } = await supabase
    .from('compras_stock_actual')
    .select('cantidad')
    .eq('item_id', itemId)
    .maybeSingle()

  const nuevaCantidad = (actual?.cantidad ?? 0) + delta
  await supabase.from('compras_stock_actual').upsert(
    { item_id: itemId, cantidad: nuevaCantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
    { onConflict: 'item_id' }
  )
  await supabase.from('compras_stock_movimientos').insert(
    { item_id: itemId, delta, tipo: 'entrada_remito', remito_id: remitoId, creado_por: usuarioId }
  )
}

export async function revertirYBorrar(supabase: SupabaseBrowserClient, remito: Remito, usuarioId: string) {
  for (const item of remito.compras_remito_items) {
    if (item.item_id) await sumarStock(supabase, item.item_id, -item.cantidad, remito.id, usuarioId)
  }
  await supabase.from('compras_remitos').delete().eq('id', remito.id)
}
