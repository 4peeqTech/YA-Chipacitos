import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConteosFabricaClient from './ConteosFabricaClient'

export const metadata = { title: 'Conteos de fábrica | YA! Chipacitos' }

export default async function ConteosFabricaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conteos } = await supabase
    .from('v_compras_conteos_historial')
    .select('*')
    .order('cerrado_en', { ascending: false })
    .limit(100)

  return <ConteosFabricaClient conteosIniciales={conteos ?? []} />
}
