import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { mensajeError } from '@/lib/errores'
import { efectoDeMotivo, esEfecto, flagsDeEfecto } from '@/lib/compras/devoluciones'
import { NextRequest, NextResponse } from 'next/server'

// B4: motivos de devolución al proveedor, para la TablaMaestra de Proveedores.
// La pantalla piensa en "qué pasa" (efecto); la tabla guarda dos flags (E1).

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  return { supabase, error: null }
}

function errorResponse(e: { message: string; code?: string }, fallback: string) {
  const status = e.code === '42501' ? 403 : e.code === '23503' || e.code === '23505' || e.code === '23514' ? 409 : 500
  return NextResponse.json({ error: mensajeError(e, fallback) }, { status })
}

type Fila = { id: string; nombre: string; devuelve_mercaderia: boolean; corrige_precio: boolean; orden: number; activo: boolean }

const conEfecto = (f: Fila) => ({ ...f, efecto: efectoDeMotivo(f) })

export async function GET() {
  const { supabase, error } = await requireAuth()
  if (error) return error
  const { data, error: e } = await supabase.from('compras_devolucion_motivos').select('*').order('orden')
  if (e) return errorResponse(e, 'No se pudieron cargar los motivos.')
  return NextResponse.json((data ?? []).map(conEfecto))
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { nombre, efecto } = await req.json()
  if (typeof nombre !== 'string' || !nombre.trim() || !esEfecto(efecto)) {
    return NextResponse.json({ error: 'Faltan el nombre o qué pasa con el motivo.' }, { status: 400 })
  }
  const { data: ultimo } = await supabase.from('compras_devolucion_motivos').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle()
  const { data, error: e } = await supabase
    .from('compras_devolucion_motivos')
    .insert({ nombre: nombre.trim(), orden: (ultimo?.orden ?? 0) + 1, ...flagsDeEfecto(efecto) })
    .select()
    .single()
  if (e) return errorResponse(e, 'No se pudo crear el motivo.')
  return NextResponse.json(conEfecto(data))
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id, ...fields } = await req.json()
  const cambios: { nombre?: string; activo?: boolean; devuelve_mercaderia?: boolean; corrige_precio?: boolean } = {}
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'nombre' && typeof v === 'string' && v.trim()) cambios.nombre = v.trim()
    else if (k === 'activo' && typeof v === 'boolean') cambios.activo = v
    else if (k === 'efecto' && esEfecto(v)) Object.assign(cambios, flagsDeEfecto(v))
    else return NextResponse.json({ error: `Campo no permitido: ${k}` }, { status: 400 })
  }
  const { data, error: e } = await supabase.from('compras_devolucion_motivos').update(cambios).eq('id', id).select().single()
  if (e) return errorResponse(e, 'No se pudo guardar el motivo.')
  return NextResponse.json(conEfecto(data))
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id } = await req.json()
  const { error: e } = await supabase.from('compras_devolucion_motivos').delete().eq('id', id)
  if (e) return errorResponse(e, 'No se pudo eliminar el motivo.')
  return NextResponse.json({ ok: true })
}
