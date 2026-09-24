import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosClient from './PedidosClient'
import { consultarCatalogo, consultarPedidos, consultarProveedores } from './datos'

export const metadata = { title: 'Pedidos | YA! Chipacitos' }

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { pedido } = await searchParams

  const [
    { data: pedidos },
    { data: lineas },
    { data: eventos },
    { data: proveedores },
    { data: itemsCatalogo },
    { data: stock },
    { data: plantillas },
    { data: locales },
  ] = await Promise.all([
    consultarPedidos(supabase),
    supabase.from('v_compras_pedido_pendiente').select('*').order('orden'),
    supabase.from('v_compras_pedido_eventos').select('*').order('fecha'),
    consultarProveedores(supabase),
    consultarCatalogo(supabase),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    supabase
      .from('compras_plantillas_mensaje')
      .select('id, nombre, cuerpo, es_default')
      .eq('activo', true)
      .order('orden'),
    supabase.from('locales_facturacion').select('*').eq('activo', true).order('orden'),
  ])

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      lineas={lineas ?? []}
      eventos={eventos ?? []}
      proveedores={proveedores ?? []}
      itemsCatalogo={itemsCatalogo ?? []}
      stock={stock ?? []}
      plantillas={plantillas ?? []}
      localesFacturacion={locales ?? []}
      pedidoInicial={pedido}
    />
  )
}
