import { redirect } from 'next/navigation'
import { createClientTipado } from '@/lib/supabase/server'
import ConexionesClient from './ConexionesClient'

export const metadata = {
  title: 'Conexión Fudo | YA! Chipacitos',
  description: 'Qué locales tienen Fudo y sus claves de la API.',
}

export default async function ConexionFudoPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // La función pide es_admin(): otro rol recibe una lista vacía.
  const { data, error } = await supabase.rpc('fudo_conexiones_estado')
  if (error) console.error(error)
  return <ConexionesClient locales={data ?? []} error={error != null} />
}
