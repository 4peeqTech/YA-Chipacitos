import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HistoricoInsumoClient from './HistoricoInsumoClient'

export const metadata = { title: 'Histórico por insumo | YA! Chipacitos' }

export default async function HistoricoInsumoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: items } = await supabase
    .from('compras_items')
    .select('id, nombre, unidad')
    .eq('estado', 'activo')
    .order('nombre')

  return <HistoricoInsumoClient itemsCatalogo={items ?? []} />
}
