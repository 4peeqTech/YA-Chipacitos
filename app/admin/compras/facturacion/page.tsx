import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FacturacionClient from './FacturacionClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Datos de facturación | YA! Chipacitos' }

export default async function FacturacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: locales } = await supabase
    .from('locales_facturacion')
    .select('*')
    .order('orden')

  return <FacturacionClient localesIniciales={locales ?? []} />
}
