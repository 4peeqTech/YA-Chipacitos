export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import CatalogoClient from '@/components/pedidos/CatalogoClient'

export default async function DepositoCatalogoPage() {
  const supabase = await createClient()
  const { data: productos } = await supabase
    .from('productos').select('*').eq('tipo', 'insumo').eq('destino', 'deposito').order('nombre')

  return <CatalogoClient productosIniciales={productos || []} tipo="insumo" destino="deposito" />
}
