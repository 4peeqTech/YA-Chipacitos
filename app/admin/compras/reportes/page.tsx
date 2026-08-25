import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportesClient from './ReportesClient'

export const metadata = { title: 'Reportes | YA! Chipacitos' }

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: remitos },
    { data: pedidos },
    { data: movimientos },
    { data: stock },
    { data: solicitudItems },
    { data: pedidoItems },
    { data: vItems },
  ] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('*, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(descripcion, cantidad, precio)')
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select('*, proveedores(nombre), compras_remitos(id, numero, fecha, compras_remito_items(descripcion, cantidad, precio))')
      .order('created_at', { ascending: false }),
    supabase
      .from('compras_stock_movimientos')
      .select('*, compras_items(nombre)')
      .order('created_at', { ascending: false }),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    supabase
      .from('compras_solicitud_items')
      .select('solicitud_id, item_id, descripcion, cantidad_sugerida, compras_solicitudes(tipo, fabrica_conteos(semana_desde, semana_hasta))'),
    supabase
      .from('compras_pedido_items')
      .select('item_id, cantidad, compras_pedidos(solicitud_id)'),
    // v_compras_items evita depender de compras_items.proveedor_id (1:N, en desuso
    // desde que existe compras_item_proveedores) solo para mostrar el proveedor principal acá.
    supabase.from('v_compras_items').select('id, proveedor_principal_nombre'),
  ])

  const proveedorPorItem: Record<string, string> = {}
  for (const v of vItems ?? []) {
    proveedorPorItem[v.id] = v.proveedor_principal_nombre ?? '—'
  }

  return (
    <ReportesClient
      remitosIniciales={remitos ?? []}
      pedidosIniciales={pedidos ?? []}
      movimientosIniciales={movimientos ?? []}
      stockInicial={stock ?? []}
      solicitudItemsIniciales={(solicitudItems ?? []) as any}
      pedidoItemsIniciales={(pedidoItems ?? []) as any}
      proveedorPorItem={proveedorPorItem}
    />
  )
}
