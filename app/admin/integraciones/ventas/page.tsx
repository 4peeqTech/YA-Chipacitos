import { redirect } from 'next/navigation'
import { createClientTipado } from '@/lib/supabase/server'
import VentasFudoClient from './VentasFudoClient'

export const metadata = {
  title: 'Ventas Fudo | YA! Chipacitos',
  description: 'Las ventas y la caja de cada local en el período, sacadas de Fudo, con descarga en CSV.',
}

export default async function VentasFudoPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('locales_config').select('sucursal').eq('activo', true).eq('tiene_fudo', true).order('orden')
  if (error) console.error(error)
  return <VentasFudoClient locales={(data ?? []).map(l => l.sucursal)} error={error != null} />
}
