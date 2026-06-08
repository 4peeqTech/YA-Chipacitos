export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import CatalogoClient from '@/components/pedidos/CatalogoClient'

export default async function FabricaCatalogoPage() {
  const supabase = await createClient()
  const { data: productos } = await supabase
    .from('productos').select('*').eq('tipo', 'producto').eq('destino', 'fabrica').order('nombre')

  return <CatalogoClient productosIniciales={productos || []} tipo="producto" destino="fabrica" />
}
