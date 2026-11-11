import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosClient from './PedidosClient'
import { consultarCatalogo, consultarFacturasDePedidos, consultarPedidos, consultarProveedores } from './datos'
import { consultarDevoluciones } from './devoluciones/datos'
import { CLAVE, leerConfigAvisos } from '@/lib/compras/avisos'

export const metadata = { title: 'Pedidos | YA! Chipacitos' }

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; devolucion?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { pedido, devolucion } = await searchParams

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
    { data: config },
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
      .eq('tipo', 'pedido')
      .order('orden'),
    supabase.from('locales_facturacion').select('*').eq('activo', true).order('orden'),
    supabase.from('v_compras_pedidos_eliminados').select('*').order('numero', { ascending: false }),
    consultarFacturasDePedidos(supabase),
    // F5: vacía para quien no es admin (la vista pide es_admin()).
    supabase.from('v_compras_factura_diferencias').select('*'),
    // B5: "demorado" con los días de Compras › Avisos.
    supabase.from('compras_config').select('clave, valor').eq('clave', CLAVE.diasDemora),
  ])

  // B4: las devoluciones de los pedidos cargados (en tandas; los montos solo para admin).
  const devoluciones = await consultarDevoluciones(supabase, (pedidos ?? []).map(p => p.id))

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
      devoluciones={devoluciones}
      esAdmin={esAdmin}
      pedidoInicial={pedido}
      devolucionInicial={devolucion}
      diasDemora={leerConfigAvisos(config ?? []).diasDemora}
    />
  )
}
