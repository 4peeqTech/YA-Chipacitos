import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SolicitudesClient from './SolicitudesClient'

export const metadata = { title: 'Solicitudes | YA! Chipacitos' }

export default async function SolicitudesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: solicitudes }, { data: proveedores }, { data: itemsProveedores }] = await Promise.all([
    supabase
      .from('compras_solicitudes')
      .select('*, fabrica_conteos(semana_desde, semana_hasta, masas_proyectadas), compras_solicitud_items(*)')
      .order('created_at', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre'),
    supabase.from('compras_item_proveedores').select('item_id, proveedor_id').eq('activo', true),
  ])

  const proveedoresPorItem: Record<string, string[]> = {}
  for (const ip of itemsProveedores ?? []) {
    proveedoresPorItem[ip.item_id] ??= []
    proveedoresPorItem[ip.item_id].push(ip.proveedor_id)
  }

  return (
    <SolicitudesClient
      solicitudesIniciales={solicitudes ?? []}
      proveedores={proveedores ?? []}
      proveedoresPorItem={proveedoresPorItem}
    />
  )
}
