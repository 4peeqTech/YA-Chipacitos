export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AgenteClient from './AgenteClient'

export const metadata = { title: 'Agente de Tareas — YA! Chipacitos' }

export default async function AgenteTareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Personas con la pantalla Tareas (a quién se le puede asignar).
  const { data: ids } = await supabase.rpc('personas_con_alguno', { p_claves: ['pantalla:tareas'] })
  const { data: perfiles } = await supabase
    .from('profiles')
    .select('id, nombre, rol, local_nombre')
    .in('id', ids ?? [])
    .order('nombre')

  const userNombre = perfiles?.find(p => p.id === user.id)?.nombre || user.email?.split('@')[0] || 'Usuario'

  return (
    <AgenteClient userNombre={userNombre} perfiles={perfiles || []} />
  )
}
