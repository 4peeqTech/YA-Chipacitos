export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cargarAcceso } from '@/lib/permisos/servidor'
import { puede } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'
import TodasTareasClient from './TodasTareasClient'

export const metadata = { title: 'Todas las tareas — YA! Chipacitos' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Todas las tareas del sistema, no solo las propias: permiso tareas.ver_todas
// (antes, solo Ricardo Cabrera por id; épica roles y permisos). El resto de la
// app respeta la RLS de `tareas` (creador o asignado); acá se usa el cliente de
// service role a propósito, sólo después de validar el permiso.
export default async function TodasTareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.verTodasLasTareas)) redirect('/tareas')

  const admin = getAdminClient()

  const [{ data: tareas }, { data: perfiles }] = await Promise.all([
    admin
      .from('tareas')
      .select('*')
      .order('created_at', { ascending: false }),

    admin
      .from('profiles')
      .select('id, nombre, rol, local_nombre')
      .order('nombre'),
  ])

  return (
    <TodasTareasClient
      userId={user.id}
      tareas={tareas || []}
      perfiles={perfiles || []}
    />
  )
}
