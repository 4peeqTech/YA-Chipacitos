import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PlantillasClient from './PlantillasClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plantillas WPP | YA! Chipacitos' }

export default async function PlantillasPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tipo } = await searchParams
  const tipoInicial = tipo === 'factura' ? 'factura' : 'pedido'

  const [{ data: plantillas }, { data: locales }, { data: whatsapp }] = await Promise.all([
    supabase.from('compras_plantillas_mensaje').select('*').order('orden'),
    supabase.from('locales_facturacion').select('*').eq('activo', true).order('orden'),
    supabase.from('compras_config').select('valor').eq('clave', 'factura.whatsapp_admin').maybeSingle(),
  ])

  return (
    <PlantillasClient
      plantillasIniciales={plantillas ?? []}
      localesFacturacion={locales ?? []}
      tipoInicial={tipoInicial}
      whatsappAdmin={typeof whatsapp?.valor === 'string' ? whatsapp.valor : ''}
    />
  )
}
