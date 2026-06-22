import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProveedoresClient from './ProveedoresClient'

export const metadata = { title: 'Proveedores | YA! Chipacitos' }

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre')

  return <ProveedoresClient proveedoresIniciales={proveedores ?? []} />
}
