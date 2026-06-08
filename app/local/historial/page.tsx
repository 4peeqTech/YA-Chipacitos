export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import HistorialClient from './HistorialClient'

export default async function HistorialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('nombre, local_nombre').eq('id', user.id).single(),
    supabase.from('pedidos')
      .select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('local_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <HistorialClient
      pedidos={pedidos || []}
      localId={user.id}
      localNombre={profile?.local_nombre || profile?.nombre || ''}
    />
  )
}
