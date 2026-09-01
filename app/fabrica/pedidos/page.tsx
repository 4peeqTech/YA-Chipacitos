export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosOperadorClient from '@/components/pedidos/PedidosOperadorClient'

export default async function FabricaPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: productos }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('nombre, rol').eq('id', user!.id).single(),
    supabase.from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre'),
    supabase.from('pedidos').select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('destino', 'fabrica').order('created_at', { ascending: false }).limit(100),
  ])

  // Pedidos es de mayorista/admin — supervisor_fabrica no entra (ver nav en app/fabrica/layout.tsx).
  if (!['admin', 'mayorista'].includes(profile?.rol ?? '')) redirect('/fabrica/stock')

  return (
    <PedidosOperadorClient
      productosIniciales={productos || []}
      pedidosIniciales={pedidos || []}
      tipo="producto"
      destino="fabrica"
      operadorNombre={profile?.nombre || 'Fábrica'}
    />
  )
}
