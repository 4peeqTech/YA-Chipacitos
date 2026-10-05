import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConteosFabricaClient from './ConteosFabricaClient'

export const metadata = { title: 'Conteos de fábrica | YA! Chipacitos' }

export default async function ConteosFabricaPage({
  searchParams,
}: {
  searchParams: Promise<{ conteo?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { conteo } = await searchParams

  const [{ data: conteos }, { data: umbralRow }] = await Promise.all([
    supabase
      .from('v_compras_conteos_historial')
      .select('*')
      .order('cerrado_en', { ascending: false })
      .limit(100),
    // A1 (D11): % del stock esperado a partir del cual una diferencia se resalta.
    supabase.from('compras_config').select('valor').eq('clave', 'conteo.diferencia_resaltar_pct').maybeSingle(),
  ])

  const umbralLeido = Number(umbralRow?.valor)
  const umbralPct = umbralRow && Number.isFinite(umbralLeido) ? umbralLeido : 20

  return (
    <ConteosFabricaClient
      conteosIniciales={conteos ?? []}
      conteoInicial={conteo ?? null}
      umbralPct={umbralPct}
    />
  )
}
