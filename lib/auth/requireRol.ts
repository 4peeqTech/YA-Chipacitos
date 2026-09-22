import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PerfilRol {
  rol: string
  nombre: string
}

export interface GuardRol<TPerfil extends PerfilRol = PerfilRol> {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string } | null
  profile: TPerfil | null
  autorizado: boolean
}

/**
 * Guard de rol reusable por layouts de servidor y route handlers. No redirige
 * ni responde por su cuenta — layouts llaman redirect('/login') si !autorizado;
 * los route handlers usan requireRolApi (abajo), que ya arma el NextResponse.
 */
export async function requireRol<TPerfil extends PerfilRol = PerfilRol>(
  roles: string[],
  select = 'rol, nombre'
): Promise<GuardRol<TPerfil>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null, autorizado: false }

  const { data: profile } = await supabase.from('profiles').select(select).eq('id', user.id).single()
  const autorizado = !!profile && roles.includes((profile as unknown as PerfilRol).rol)
  return { supabase, user, profile: profile as TPerfil | null, autorizado }
}

/** Variante para route handlers: ya arma el NextResponse de error (401 sin sesión, 403 sin permiso). */
export async function requireRolApi(roles: string[], mensajeProhibido = 'No tenés permiso para hacer esto') {
  const { supabase, user, profile, autorizado } = await requireRol(roles)
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (!profile || !autorizado) return { supabase, error: NextResponse.json({ error: mensajeProhibido }, { status: 403 }) }
  return { supabase, error: null }
}
