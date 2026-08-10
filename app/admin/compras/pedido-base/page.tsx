import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidoBaseClient from './PedidoBaseClient'

export const metadata = { title: 'Pedido base | YA! Chipacitos' }

export default async function PedidoBasePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: plantilla }, { data: proveedores }, { data: items }] = await Promise.all([
    supabase.from('compras_plantilla_base').select('*').order('orden'),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    supabase.from('compras_items').select('id, nombre, unidad, proveedor_id').eq('estado', 'activo').order('nombre'),
  ])

  return (
    <PedidoBaseClient
      plantillaInicial={plantilla ?? []}
      proveedores={proveedores ?? []}
      itemsCatalogo={items ?? []}
    />
  )
}
