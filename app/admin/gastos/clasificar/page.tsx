import { redirect } from 'next/navigation'
import { createClientTipado } from '@/lib/supabase/server'
import { consultarCuentasGastos } from '../datos'
import ClasificarClient from './ClasificarClient'

export const metadata = {
  title: 'Clasificar gastos de Fudo | YA! Chipacitos',
}

export default async function ClasificarPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // La función pide es_admin(): otro rol recibe una lista vacía.
  const [{ data, error }, cuentas] = await Promise.all([
    supabase.rpc('gastos_fudo_etiquetas'),
    consultarCuentasGastos(supabase),
  ])
  if (error) console.error(error)

  return <ClasificarClient etiquetas={data ?? []} cuentas={cuentas} error={error != null} />
}
