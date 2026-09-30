import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GastosClient from './GastosClient'
import { consultarCatalogosPago } from './datos'

export const metadata = {
  title: 'Gastos | YA! Chipacitos',
  description: 'Gastos del negocio por local: cargalos, pagalos y seguilos.',
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ gasto?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { gasto } = await searchParams

  const [{ data: gastos }, { data: proveedores }, catalogos] = await Promise.all([
    // La vista pide es_admin(): cualquier otro rol recibe una lista vacía.
    supabase.from('v_gastos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    consultarCatalogosPago(supabase),
  ])

  return (
    <GastosClient
      gastos={gastos ?? []}
      proveedores={proveedores ?? []}
      cajas={catalogos.cajas}
      formasPago={catalogos.formasPago}
      gastoInicial={gasto}
    />
  )
}
