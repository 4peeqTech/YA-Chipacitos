export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CatalogoClient from '@/components/pedidos/CatalogoClient'

export default async function FabricaCatalogoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Catálogo es de mayorista/admin — supervisor_fabrica no entra (ver nav en app/fabrica/layout.tsx).
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user!.id).single()
  if (!['admin', 'mayorista'].includes(profile?.rol ?? '')) redirect('/fabrica/stock')

  const { data: productos } = await supabase
    .from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre')

  return <CatalogoClient productosIniciales={productos || []} tipo="producto" destino="fabrica" />
}
