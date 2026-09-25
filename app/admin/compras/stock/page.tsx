import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from './StockClient'

export const metadata = { title: 'Stock | YA! Chipacitos' }

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ insumo?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { insumo } = await searchParams

  const [{ data: items }, { data: stock }] = await Promise.all([
    supabase.from('compras_items').select('id, nombre, unidad, stock_minimo').eq('estado', 'activo').order('nombre'),
    supabase.from('v_compras_stock_actual').select('item_id, cantidad, actualizado_en, actualizado_por_nombre'),
  ])

  return <StockClient items={items ?? []} stock={stock ?? []} insumoInicial={insumo} />
}
