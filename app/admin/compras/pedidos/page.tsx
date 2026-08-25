import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosClient from './PedidosClient'

export const metadata = { title: 'Pedidos | YA! Chipacitos' }

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: proveedores },
    { data: itemsCatalogo },
    { data: stock },
    { data: pedidos },
    { data: plantillas },
  ] = await Promise.all([
    supabase
      .from('proveedores')
      .select('id, nombre, local, contacto_nombre, contacto_telefono, maneja_stock')
      .eq('estado', 'activo')
      .order('nombre'),
    supabase
      .from('compras_items')
      .select('*, compras_item_proveedores(proveedor_id, precio_ref, activo)')
      .eq('estado', 'activo')
      .order('nombre'),
    supabase.from('compras_stock_actual').select('*'),
    supabase
      .from('compras_pedidos')
      .select('*, proveedores(id, nombre, local, contacto_nombre, contacto_telefono, maneja_stock), compras_pedido_items(*), compras_remitos(*, compras_remito_items(*))')
      .order('created_at', { ascending: false }),
    supabase
      .from('compras_plantillas_mensaje')
      .select('id, nombre, cuerpo, es_default')
      .eq('activo', true)
      .order('orden'),
  ])

  return (
    <PedidosClient
      proveedores={proveedores ?? []}
      itemsCatalogo={itemsCatalogo ?? []}
      stockInicial={stock ?? []}
      pedidosIniciales={pedidos ?? []}
      usuarioId={user.id}
      plantillas={plantillas ?? []}
    />
  )
}
