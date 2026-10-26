export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CatalogoMayorista from '@/components/pedidos/mayorista/CatalogoMayorista'
import type { Producto } from '@/lib/types'

export default async function MayoristaCatalogoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Catálogo es del mayorista (el layout ya lo controla; esto cubre un acceso directo).
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user!.id).single()
  if (profile?.rol !== 'mayorista') redirect('/login')

  const { data: productos } = await supabase
    .from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre')

  return <CatalogoMayorista productosIniciales={(productos ?? []) as Producto[]} />
}
