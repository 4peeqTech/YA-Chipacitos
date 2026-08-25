import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PlantillasClient from './PlantillasClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plantillas WPP | YA! Chipacitos' }

export default async function PlantillasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: plantillas } = await supabase
    .from('compras_plantillas_mensaje')
    .select('*')
    .order('orden')

  return <PlantillasClient plantillasIniciales={plantillas ?? []} />
}
