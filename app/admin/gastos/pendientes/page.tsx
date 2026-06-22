import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendientesClient from './PendientesClient'

export const metadata = { title: 'Pendientes de pago | YA! Chipacitos' }

export default async function PendientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: gastos } = await supabase
    .from('gastos')
    .select(`
      id, fecha, local, rubro, categoria, monto, forma_pago, estado,
      observaciones, comprobante_url, fecha_pago,
      proveedores (nombre)
    `)
    .in('estado', ['Pendiente de pago', 'Parcial'])
    .order('fecha', { ascending: true })

  // Supabase devuelve proveedores como array; normalizar a objeto o null
  const normalized = (gastos ?? []).map(g => ({
    ...g,
    proveedores: Array.isArray(g.proveedores)
      ? (g.proveedores[0] ?? null)
      : g.proveedores,
  }))

  return <PendientesClient gastos={normalized} />
}
