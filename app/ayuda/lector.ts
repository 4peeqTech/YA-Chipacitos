import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MODULOS, esRolConModulos, getRoleHome } from '@/lib/modulos'
import type { Lector } from '@/lib/manual'

/** Usuario que lee el manual — compartido por el layout y las páginas de /ayuda en el mismo request. */
export const obtenerLector = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('nombre, rol, modulos_permitidos').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const modulos: string[] = profile.modulos_permitidos ?? []
  const lector: Lector = { rol: profile.rol, modulos }

  // Un colaborador vuelve a su primer módulo habilitado (el dashboard puede no estar entre ellos).
  const inicio = esRolConModulos(profile.rol)
    ? MODULOS.find(m => modulos.includes(m.key))?.href ?? '/ayuda'
    : getRoleHome(profile.rol)

  return { lector, inicio, email: user.email, nombre: profile.nombre as string | undefined }
})
