export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import LocalPedidosClient from './LocalPedidosClient'

export default async function LocalPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: productos }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('productos').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('pedidos')
      .select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('local_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <LocalPedidosClient
      profile={profile}
      productos={productos || []}
      pedidosIniciales={pedidos || []}
    />
  )
}
