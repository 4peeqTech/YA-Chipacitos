import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosClient from './RemitosClient'
import { consultarInsumos, consultarPedidosRemito, consultarRemitos } from './datos'

export const metadata = { title: 'Remitos | YA! Chipacitos' }

export default async function RemitosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; remito?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { pedido, remito } = await searchParams

  const [
    { data: remitos },
    { data: pedidos },
    { data: lineas },
    { data: stock },
    { data: insumos },
  ] = await Promise.all([
    consultarRemitos(supabase),
    consultarPedidosRemito(supabase),
    supabase.from('v_compras_pedido_pendiente').select('*').order('orden'),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    consultarInsumos(supabase),
  ])

  return (
    <RemitosClient
      remitos={remitos ?? []}
      pedidos={pedidos ?? []}
      lineas={lineas ?? []}
      stock={stock ?? []}
      insumos={insumos ?? []}
      pedidoInicial={pedido}
      remitoInicial={remito}
    />
  )
}
