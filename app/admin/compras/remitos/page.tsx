import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosClient from './RemitosClient'

export const metadata = { title: 'Remitos | YA! Chipacitos' }

export default async function RemitosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: remitos } = await supabase
    .from('compras_remitos')
    .select('*, compras_pedidos(proveedor_id, proveedores(nombre)), compras_remito_items(*)')
    .order('fecha', { ascending: false })

  return <RemitosClient remitosIniciales={remitos ?? []} />
}
