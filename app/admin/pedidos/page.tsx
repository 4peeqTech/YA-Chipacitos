export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PedidosLocalesAdminClient from './PedidosLocalesAdminClient'

export const metadata = { title: 'Pedidos de locales | YA! Chipacitos' }

// Pedidos de los locales al mayorista, para el admin: solo lectura. El tablero
// (preparar, enviar, chatear) es del mayorista en /mayorista, donde el admin ya no entra.
export default async function PedidosLocalesAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: locales }, { data: inicioVersion }] = await Promise.all([
    // Sucursales para el filtro (también las que hoy no tienen pedidos activos).
    supabase.from('pedidos').select('local_nombre').eq('destino', 'fabrica')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.rpc('pedidos_inicio_version'),
  ])
  const sucursales = [...new Set((locales ?? []).map(l => l.local_nombre as string))].sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <PedidosLocalesAdminClient
      sucursales={sucursales}
      inicioVersion={(inicioVersion as string | null) ?? null}
      usuarioId={user.id}
    />
  )
}
