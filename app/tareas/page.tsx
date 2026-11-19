export const dynamic = 'force-dynamic'

import { cargarAcceso } from '@/lib/permisos/servidor'
import { puede } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TareasClient from './TareasClient'

export const metadata = { title: 'Tareas — YA! Chipacitos' }

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { acceso } = await cargarAcceso()
  const [{ data: tareas }, { data: perfiles }] = await Promise.all([
    supabase
      .from('tareas')
      .select('*')
      .or(`creado_por.eq.${user.id},asignado_a.cs.{${user.id}}`)
      .order('created_at', { ascending: false }),

    // Personas con la pantalla Tareas (a quién se le puede asignar).
    supabase.rpc('personas_con_alguno', { p_claves: ['pantalla:tareas'] }).then(async ({ data: ids }) =>
      supabase.from('profiles').select('id, nombre, rol, local_nombre').in('id', ids ?? []).order('nombre')),
  ])

  const userNombre = perfiles?.find(p => p.id === user.id)?.nombre || user.email?.split('@')[0] || 'Usuario'

  return (
    <TareasClient
      userId={user.id}
      userNombre={userNombre}
      tareas={tareas || []}
      perfiles={perfiles || []}
      puedeVerTodas={puede(acceso, ACCIONES.verTodasLasTareas)}
    />
  )
}
