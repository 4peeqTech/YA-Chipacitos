export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import PedidosOperadorClient from '@/components/pedidos/PedidosOperadorClient'

export default async function DepositoPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: productos }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('nombre').eq('id', user!.id).single(),
    supabase.from('productos').select('*').eq('tipo', 'insumo').eq('destino', 'deposito').order('nombre'),
    supabase.from('pedidos').select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('destino', 'deposito').order('created_at', { ascending: false }).limit(100),
  ])

  return (
    <PedidosOperadorClient
      productosIniciales={productos || []}
      pedidosIniciales={pedidos || []}
      tipo="insumo"
      destino="deposito"
      operadorNombre={profile?.nombre || 'Depósito'}
    />
  )
}
