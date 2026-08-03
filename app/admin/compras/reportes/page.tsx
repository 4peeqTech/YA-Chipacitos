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
      .select('*, compras_items(nombre, proveedores(nombre))')
      .order('created_at', { ascending: false }),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
  ])

  return (
    <ReportesClient
      remitosIniciales={remitos ?? []}
      pedidosIniciales={pedidos ?? []}
      movimientosIniciales={movimientos ?? []}
      stockInicial={stock ?? []}
    />
  )
}
