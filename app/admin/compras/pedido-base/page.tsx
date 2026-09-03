import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidoBaseClient from './PedidoBaseClient'

export const metadata = { title: 'Pedido base | YA! Chipacitos' }

export default async function PedidoBasePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: plantilla }, { data: proveedores }, { data: items }] = await Promise.all([
    supabase.from('compras_plantilla_base').select('*').order('orden').order('descripcion'),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    supabase
      .from('compras_items')
      .select('id, nombre, unidad, compras_item_proveedores(proveedor_id, es_principal)')
      .eq('estado', 'activo')
      .order('nombre'),
  ])

  const itemsCatalogo = (items ?? []).map(i => ({
    id: i.id,
    nombre: i.nombre,
    unidad: i.unidad,
    proveedorPrincipalId: i.compras_item_proveedores.find(p => p.es_principal)?.proveedor_id ?? null,
    proveedoresAsociados: i.compras_item_proveedores.map(p => p.proveedor_id),
  }))

  return (
    <PedidoBaseClient
      plantillaInicial={plantilla ?? []}
      proveedores={proveedores ?? []}
      itemsCatalogo={itemsCatalogo}
    />
  )
}
