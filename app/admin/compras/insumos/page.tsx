import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsumosClient from './InsumosClient'

export const metadata = { title: 'Insumos | YA! Chipacitos' }

export default async function InsumosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: proveedores }] = await Promise.all([
    supabase.from('compras_items').select('*').order('orden'),
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('maneja_stock', true)
      .eq('estado', 'activo')
      .order('nombre'),
  ])

  return <InsumosClient itemsIniciales={items ?? []} proveedores={proveedores ?? []} />
}
