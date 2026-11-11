import { redirect } from 'next/navigation'
import { createClientTipado } from '@/lib/supabase/server'
import { COLUMNAS_PLAN, armarPlan } from '@/lib/gastos/plan'
import PlanCuentasClient from './PlanCuentasClient'

export const metadata = {
  title: 'Plan de cuentas | YA! Chipacitos',
  description: 'Las cuentas con las que se clasifican los gastos y los movimientos de plata.',
}

export default async function PlanCuentasPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.from('plan_cuentas').select(COLUMNAS_PLAN).order('orden')
  if (error) console.error(error)
  return <PlanCuentasClient plan={armarPlan(data ?? [])} error={error != null} />
}
