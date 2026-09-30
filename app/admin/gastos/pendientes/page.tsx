import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendientesClient from './PendientesClient'
import { consultarCatalogosPago } from '../datos'

export const metadata = { title: 'Pendientes de pago | YA! Chipacitos' }

export default async function PendientesPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Los de Fudo los trae el cliente (API externa, lenta): la página no espera por ellos.
  const [{ data: gastos }, { data: pagadosFudo }, catalogos] = await Promise.all([
    supabase.from('v_gastos').select('*').neq('estado', 'Pagado').order('fecha'),
    supabase.from('v_fudo_gastos_pagados').select('*').order('created_at', { ascending: false }).limit(200),
    consultarCatalogosPago(supabase),
  ])

  return (
    <PendientesClient
      gastos={gastos ?? []}
      pagadosFudo={pagadosFudo ?? []}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
    />
  )
}
