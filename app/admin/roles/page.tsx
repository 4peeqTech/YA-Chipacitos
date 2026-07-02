export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import RolesClient from './RolesClient'

export const metadata = { title: 'Roles | YA! Chipacitos' }

export default async function RolesPage() {
  const supabase = await createClient()
  const [{ data: roles }, { data: perfiles }] = await Promise.all([
    supabase.from('roles').select('*').order('created_at'),
    supabase.from('profiles').select('rol'),
  ])

  const usuariosPorRol: Record<string, number> = {}
  for (const p of perfiles || []) {
    usuariosPorRol[p.rol] = (usuariosPorRol[p.rol] || 0) + 1
  }

  return <RolesClient rolesIniciales={roles || []} usuariosPorRol={usuariosPorRol} />
}
