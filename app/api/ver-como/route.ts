import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cargarAcceso } from '@/lib/permisos/servidor'
import { accesoDesdeRpc, homeDe, puede } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'
import { COOKIE_VER_COMO } from '@/lib/permisos/verComo'

// "Ver como" (épica roles y permisos, T7): POST entra a ver la app como otra
// persona; DELETE sale. La cookie no es httpOnly: la lee el cliente de Supabase del
// navegador para no escribir (lib/permisos/verComo).

const OPCIONES_COOKIE = { path: '/', sameSite: 'lax' as const, maxAge: 60 * 60 * 8 }

export async function POST(req: NextRequest) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Falta la persona' }, { status: 400 })

  const { supabase, acceso } = await cargarAcceso()
  if (!acceso) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Si ya estaba viendo como alguien, quien mira es el que cuenta.
  const quienMira = acceso.quienMira ?? (puede(acceso, ACCIONES.gestionarUsuarios) ? { id: acceso.id, nombre: acceso.nombre } : null)
  if (!quienMira) return NextResponse.json({ error: 'Para ver como otra persona hace falta "Gestionar usuarios y roles"' }, { status: 403 })
  if (parsed.data.id === quienMira.id) return NextResponse.json({ error: 'Esa es tu propia cuenta' }, { status: 400 })

  const { data } = await supabase.rpc('acceso_de', { p_persona: parsed.data.id })
  const otro = accesoDesdeRpc(data)
  if (!otro) return NextResponse.json({ error: 'La persona no existe o no está activa' }, { status: 404 })
  if (otro.esAdmin) return NextResponse.json({ error: 'Admin entra a todo: no hace falta verlo como Admin' }, { status: 400 })

  const res = NextResponse.json({ destino: homeDe(otro) })
  res.cookies.set(COOKIE_VER_COMO, otro.id, OPCIONES_COOKIE)
  return res
}

export async function DELETE(req: NextRequest) {
  const persona = req.cookies.get(COOKIE_VER_COMO)?.value
  // Vuelve a la ficha de la persona que estaba mirando.
  const res = NextResponse.json({ destino: persona ? `/admin/usuarios?persona=${encodeURIComponent(persona)}` : '/' })
  res.cookies.set(COOKIE_VER_COMO, '', { ...OPCIONES_COOKIE, maxAge: 0 })
  return res
}
