// Acceso en el servidor (épica roles y permisos, T3): layouts, páginas, server
// actions y rutas API. Reemplaza requireRol, requireRolApi, getRoleHome y las
// comparaciones de rol escritas a mano.

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Area } from './catalogo'
import { ACCIONES } from './catalogo'
import { accesoDesdeRpc, homeDe, puede, type AccesoUsuario } from './acceso'
import { COOKIE_VER_COMO, MENSAJE_SOLO_LECTURA } from './verComo'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Una vez por request: sesión y acceso efectivo (null si no hay sesión o la persona no está activa).
 * Con "ver como" (T7) es el acceso de la otra persona, con `quienMira`; solo si quien mira gestiona usuarios.
 */
export const cargarAcceso = cache(async (): Promise<{ supabase: Supabase; acceso: AccesoUsuario | null }> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, acceso: null }
  const { data } = await supabase.rpc('mi_acceso')
  const acceso = accesoDesdeRpc(data)
  if (acceso) acceso.email = user.email

  const verComo = (await cookies()).get(COOKIE_VER_COMO)?.value
  if (acceso && verComo && verComo !== acceso.id && puede(acceso, ACCIONES.gestionarUsuarios)) {
    const { data: otro } = await supabase.rpc('acceso_de', { p_persona: verComo })
    const ajeno = accesoDesdeRpc(otro)
    if (ajeno) return { supabase, acceso: { ...ajeno, quienMira: { id: acceso.id, nombre: acceso.nombre } } }
  }
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
  if (acceso.quienMira) return { supabase, acceso, error: NextResponse.json({ error: MENSAJE_SOLO_LECTURA }, { status: 403 }) }
  const ok = clave === 'admin' ? acceso.esAdmin : puede(acceso, clave)
  if (!ok) return { supabase, acceso, error: NextResponse.json({ error: mensajeProhibido }, { status: 403 }) }
  return { supabase, acceso, error: null }
}

export const COOKIE_SUCURSAL = 'sucursal'

export interface SucursalLocales {
  /** Id de locales_config. */
  id: string
  nombre: string
  /** La cuenta del local: pedidos, ventas y conciliaciones van con este local_id. */
  cuentaLocalId: string
}

/**
 * Locales (T4): las sucursales con las que trabaja la persona y la elegida. Solo
 * cuentan las que tienen cuenta de local (los pedidos van a su nombre). La
 * elegida sale de la cookie `sucursal` si es una de las suyas (las que la base le
 * deja leer: mis_sucursales(); Admin, todas las activas); si no, la primera.
 */
export const sucursalesDeLocales = cache(async (): Promise<{ sucursales: SucursalLocales[]; actual: SucursalLocales | null }> => {
  const { supabase, acceso } = await cargarAcceso()
  if (!acceso) return { sucursales: [], actual: null }
  let consulta = supabase.from('locales_config').select('id, sucursal, cuenta_local_id').not('cuenta_local_id', 'is', null).order('orden')
  consulta = acceso.esAdmin ? consulta.eq('activo', true) : consulta.in('id', acceso.sucursales)
  const { data, error } = await consulta
  if (error) console.error('[sucursalesDeLocales]', error.message)
  const sucursales = (data ?? []).map(l => ({ id: l.id, nombre: l.sucursal, cuentaLocalId: l.cuenta_local_id as string }))
  const elegida = (await cookies()).get(COOKIE_SUCURSAL)?.value
  return { sucursales, actual: sucursales.find(x => x.id === elegida) ?? sucursales[0] ?? null }
})
