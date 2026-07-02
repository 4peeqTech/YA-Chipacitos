import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { supabase, error: null }
}

const KEY_REGEX = /^[a-z0-9_]+$/

function slugify(nombre: string) {
  return nombre.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function GET() {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { data } = await supabase.from('roles').select('*').order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error

  const { nombre, key: keyInput, color } = await req.json()
  if (!nombre || !nombre.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const key = (keyInput?.trim() || slugify(nombre))
  if (!key || !KEY_REGEX.test(key)) {
    return NextResponse.json({ error: 'La key solo puede tener minúsculas, números y guión bajo' }, { status: 400 })
  }

  const { data, error: e } = await supabase
    .from('roles')
    .insert({ key, nombre: nombre.trim(), color: color || '#888888' })
    .select().single()
  if (e) {
    const msg = e.code === '23505' ? `Ya existe un rol con la key "${key}"` : e.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error

  const { key, nombre, color } = await req.json()
  if (!key) return NextResponse.json({ error: 'Key requerida' }, { status: 400 })

  const fields: Record<string, string> = {}
  if (nombre !== undefined) {
    if (!nombre.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    fields.nombre = nombre.trim()
  }
  if (color !== undefined) fields.color = color

  const { data, error: e } = await supabase.from('roles').update(fields).eq('key', key).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error

  const { key } = await req.json()
  if (!key) return NextResponse.json({ error: 'Key requerida' }, { status: 400 })

  const { data: rol } = await supabase.from('roles').select('es_sistema').eq('key', key).single()
  if (!rol) return NextResponse.json({ error: 'El rol no existe' }, { status: 404 })
  if (rol.es_sistema) return NextResponse.json({ error: 'No se puede eliminar un rol del sistema' }, { status: 403 })

  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('rol', key)
  if (count && count > 0) {
    return NextResponse.json({ error: `Hay ${count} usuario${count === 1 ? '' : 's'} con este rol — reasignalos antes de eliminarlo` }, { status: 409 })
  }

  const { error: e } = await supabase.from('roles').delete().eq('key', key)
  if (e) return NextResponse.json({ error: e.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
