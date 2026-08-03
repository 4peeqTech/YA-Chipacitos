import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from './StockClient'

export const metadata = { title: 'Stock | YA! Chipacitos' }

export default async function StockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: stock }] = await Promise.all([
    supabase.from('compras_items').select('*').eq('estado', 'activo').order('orden'),
    supabase.from('compras_stock_actual').select('*'),
  ])

  return <StockClient itemsIniciales={items ?? []} stockInicial={stock ?? []} usuarioId={user.id} />
}
