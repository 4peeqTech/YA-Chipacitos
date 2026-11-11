import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hoyISOArgentina } from '@/lib/fechas'
import RecurrentesClient from './RecurrentesClient'
import { consultarCatalogosPago, consultarCuentasGastos, consultarLocales, generarRecurrentes } from '../datos'

export const metadata = {
  title: 'Gastos que se repiten | YA! Chipacitos',
}

export default async function RecurrentesPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await generarRecurrentes(supabase)

  const [{ data: plantillas, error }, { data: proveedores }, catalogos, locales, cuentas] = await Promise.all([
    // La vista pide es_admin(): otro rol recibe una lista vacía.
    supabase.from('v_gastos_recurrentes').select('*').order('activo', { ascending: false }).order('nombre'),
    supabase.from('proveedores').select('id, nombre, estado').order('nombre'),
    consultarCatalogosPago(supabase),
    consultarLocales(supabase),
    consultarCuentasGastos(supabase),
  ])

  return (
    <RecurrentesClient
      plantillas={plantillas ?? []}
      error={error != null}
      hoy={hoyISOArgentina()}
      proveedores={proveedores ?? []}
      formasPago={catalogos.formasPago}
      locales={locales}
      cuentas={cuentas}
    />
  )
}
