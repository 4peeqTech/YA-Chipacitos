export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import LocalPedidosClient, { type UltimoPedido } from './LocalPedidosClient'

export default async function LocalPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Por ahora el local solo le pide al mayorista (D10): los productos de
  // depósito no se muestran.
  const [{ data: productos }, { data: ultimo }] = await Promise.all([
    supabase.from('productos').select('*').eq('activo', true).eq('destino', 'fabrica').order('nombre'),
    supabase
      .from('pedidos')
      .select('numero, pedido_items(producto_id, producto_nombre, cantidad, origen)')
      .eq('local_id', user.id)
      .eq('destino', 'fabrica')
      .neq('estado', 'cancelado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <LocalPedidosClient
      usuarioId={user.id}
      productos={productos || []}
      ultimoPedido={(ultimo as UltimoPedido | null) ?? null}
    />
  )
}
