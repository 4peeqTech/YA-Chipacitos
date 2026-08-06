import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SolicitudesClient from './SolicitudesClient'

export const metadata = { title: 'Solicitudes | YA! Chipacitos' }

export default async function SolicitudesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: solicitudes }, { data: proveedores }] = await Promise.all([
    supabase
      .from('compras_solicitudes')
      .select('*, fabrica_conteos(semana_desde, semana_hasta, masas_proyectadas), compras_solicitud_items(*)')
      .order('created_at', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
  ])

  return <SolicitudesClient solicitudesIniciales={solicitudes ?? []} proveedores={proveedores ?? []} />
}
