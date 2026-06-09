export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import AdminCatalogoClient from './AdminCatalogoClient'

export default async function AdminCatalogoPage() {
  const supabase = await createClient()
  const { data: productos } = await supabase
    .from('productos').select('*').order('destino').order('nombre')

  return <AdminCatalogoClient productosIniciales={productos || []} />
}
