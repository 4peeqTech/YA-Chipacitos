export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import AdminCatalogoClient from './AdminCatalogoClient'

export default async function AdminCatalogoPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: mapeos }] = await Promise.all([
    supabase.from('productos').select('*').order('destino').order('nombre'),
    supabase.from('producto_mapeos').select('nombre_posberry, producto_id'),
  ])

  return <AdminCatalogoClient productosIniciales={productos || []} mapeos={mapeos || []} />
}
