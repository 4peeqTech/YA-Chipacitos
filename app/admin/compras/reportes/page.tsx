import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportesClient from './ReportesClient'

export const metadata = { title: 'Reportes | YA! Chipacitos' }

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El gasto sale de las facturas (F5), que solo ve un administrador (P1).
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esAdmin = perfil?.rol === 'admin'

  const [
    { data: remitos },
    { data: pedidos },
    { data: movimientos },
    { data: stock },
    { data: solicitudItems },
    { data: pedidoItems },
    { data: vItems },
    { data: facturas },
  ] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('id, secuencia, fecha')
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select('*, proveedores(nombre), compras_remitos(id, secuencia, fecha, compras_remito_items(descripcion, cantidad))')
      .order('created_at', { ascending: false }),
    supabase
      .from('v_compras_stock_movimientos')
      .select('*')
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
    supabase.from('v_compras_items').select('id, proveedor_principal_nombre, stock_minimo').eq('estado', 'activo'),
    // Vacía para quien no es admin (la vista pide es_admin()).
    supabase
      .from('v_compras_facturas')
      .select('id, pedido_id, proveedor_id, proveedor_nombre, pedido_numero, numero, fecha, tipo_comprobante, subtotal, iva, total')
      .eq('estado', 'confirmada'),
  ])

  const proveedorPorItem: Record<string, string> = {}
  const stockMinimoPorItem: Record<string, number> = {}
  for (const v of vItems ?? []) {
    proveedorPorItem[v.id] = v.proveedor_principal_nombre ?? '—'
    stockMinimoPorItem[v.id] = v.stock_minimo
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
      stockMinimoPorItem={stockMinimoPorItem}
      facturasIniciales={facturas ?? []}
      esAdmin={esAdmin}
    />
  )
}
