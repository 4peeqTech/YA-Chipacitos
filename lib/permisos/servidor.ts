// Acceso en el servidor (épica roles y permisos, T3): layouts, páginas, server
// actions y rutas API. Reemplaza requireRol, requireRolApi, getRoleHome y las
// comparaciones de rol escritas a mano.

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Area } from './catalogo'
import { accesoDesdeRpc, homeDe, puede, type AccesoUsuario } from './acceso'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Una vez por request: sesión y acceso efectivo (null si no hay sesión o la persona no está activa). */
export const cargarAcceso = cache(async (): Promise<{ supabase: Supabase; acceso: AccesoUsuario | null }> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, acceso: null }
  const { data } = await supabase.rpc('mi_acceso')
  const acceso = accesoDesdeRpc(data)
  if (acceso) acceso.email = user.email
  return { supabase, acceso }
})

/** Para layouts y páginas: sin sesión va a /login; sin el área, a su inicio. */
export async function exigirArea(area: Area): Promise<{ supabase: Supabase; acceso: AccesoUsuario }> {
  const { supabase, acceso } = await cargarAcceso()
  if (!acceso) redirect('/login')
  if (!acceso.areas.includes(area)) redirect(homeDe(acceso))
  return { supabase, acceso }
}

/** Para páginas que necesitan sesión pero no un área (Tareas, Ayuda). */
export async function exigirSesion(): Promise<{ supabase: Supabase; acceso: AccesoUsuario }> {
  const { supabase, acceso } = await cargarAcceso()
  if (!acceso) redirect('/login')
  return { supabase, acceso }
}

/**
 * Para rutas API y server actions: 401 sin sesión, 403 sin permiso.
 * `'admin'` = solo Admin (lo que todavía no es una acción del catálogo).
 */
export async function exigirApi(clave: string | 'admin', mensajeProhibido = 'No tenés permiso para hacer esto') {
  const { supabase, acceso } = await cargarAcceso()
  if (!acceso) return { supabase, acceso: null, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const ok = clave === 'admin' ? acceso.esAdmin : puede(acceso, clave)
  if (!ok) return { supabase, acceso, error: NextResponse.json({ error: mensajeProhibido }, { status: 403 }) }
  return { supabase, acceso, error: null }
}
