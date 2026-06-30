export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TareasClient from './TareasClient'

export const metadata = { title: 'Tareas — YA! Chipacitos' }

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tareas }, { data: perfiles }] = await Promise.all([
    supabase
      .from('tareas')
      .select('*')
      .or(`creado_por.eq.${user.id},asignado_a.cs.{${user.id}}`)
      .order('created_at', { ascending: false }),

    supabase
      .from('profiles')
      .select('id, nombre, rol, local_nombre')
      .or('rol.eq.admin,modulos_permitidos.cs.{tareas}')
      .order('nombre'),
  ])

  const userNombre = perfiles?.find(p => p.id === user.id)?.nombre || user.email?.split('@')[0] || 'Usuario'

  return (
    <TareasClient
      userId={user.id}
      userNombre={userNombre}
      tareas={tareas || []}
      perfiles={perfiles || []}
    />
  )
}
