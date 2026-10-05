import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosClient from './PedidosClient'
import { consultarCatalogo, consultarFacturasDePedidos, consultarPedidos, consultarProveedores } from './datos'

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

  // Solo admin ve y carga facturas (P1). La RLS ya lo garantiza; el rol define
  // además qué le ofrecemos en pantalla.
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esAdmin = perfil?.rol === 'admin'

  const [
    { data: pedidos },
    { data: lineas },
    { data: proveedores },
    { data: itemsCatalogo },
    { data: stock },
    { data: plantillas },
    { data: locales },
    { data: eliminados },
    { data: facturas },
    { data: diferencias },
  ] = await Promise.all([
    consultarPedidos(supabase),
    supabase.from('v_compras_pedido_pendiente').select('*').order('orden'),
    consultarProveedores(supabase),
    consultarCatalogo(supabase),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    supabase
      .from('compras_plantillas_mensaje')
      .select('id, nombre, cuerpo, es_default')
      .eq('activo', true)
      .order('orden'),
    supabase.from('locales_facturacion').select('*').eq('activo', true).order('orden'),
    supabase.from('v_compras_pedidos_eliminados').select('*').order('numero', { ascending: false }),
    consultarFacturasDePedidos(supabase),
    // F5: vacía para quien no es admin (la vista pide es_admin()).
    supabase.from('v_compras_factura_diferencias').select('*'),
  ])

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      lineas={lineas ?? []}
      proveedores={proveedores ?? []}
      itemsCatalogo={itemsCatalogo ?? []}
      stock={stock ?? []}
      plantillas={plantillas ?? []}
      localesFacturacion={locales ?? []}
      eliminados={eliminados ?? []}
      facturas={facturas ?? []}
      diferencias={diferencias ?? []}
      esAdmin={esAdmin}
      pedidoInicial={pedido}
    />
  )
}
