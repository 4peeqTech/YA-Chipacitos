import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HistoricoInsumoClient from './HistoricoInsumoClient'

export const metadata = { title: 'Histórico por insumo | YA! Chipacitos' }

export default async function HistoricoInsumoPage({
  searchParams,
}: {
  searchParams: Promise<{ insumo?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { insumo } = await searchParams

  // A2a: también los archivados, así el ?insumo= de uno archivado entra. Van al final.
  const { data: items } = await supabase
    .from('compras_items')
    .select('id, nombre, unidad, estado')
    .order('nombre')
  const catalogo = [...(items ?? [])].sort((a, b) => Number(a.estado === 'archivado') - Number(b.estado === 'archivado'))

  return <HistoricoInsumoClient itemsCatalogo={catalogo} insumoInicial={insumo} />
}
