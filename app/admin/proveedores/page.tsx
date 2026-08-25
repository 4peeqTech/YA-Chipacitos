import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProveedoresClient from './ProveedoresClient'

export const metadata = { title: 'Proveedores | YA! Chipacitos' }

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: proveedores }, { data: itemsProveedores }] = await Promise.all([
    supabase.from('proveedores').select('*').order('nombre'),
    supabase.from('compras_item_proveedores').select('proveedor_id').eq('activo', true),
  ])

  const proveedorIdsConInsumos = [...new Set((itemsProveedores ?? []).map(ip => ip.proveedor_id))]

  return (
    <ProveedoresClient
      proveedoresIniciales={proveedores ?? []}
      proveedorIdsConInsumos={proveedorIdsConInsumos}
    />
  )
}
