import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from './StockClient'

export const metadata = { title: 'Stock | YA! Chipacitos' }

export default async function StockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: items }, { data: stock }, { data: perfil }] = await Promise.all([
    supabase.from('compras_items').select('*').eq('estado', 'activo').order('nombre'),
    supabase.from('v_compras_stock_actual').select('*'),
    supabase.from('profiles').select('nombre').eq('id', user.id).single(),
  ])

  return (
    <StockClient
      itemsIniciales={items ?? []}
      stockInicial={stock ?? []}
      usuarioId={user.id}
      usuarioNombre={perfil?.nombre ?? '—'}
    />
  )
}
