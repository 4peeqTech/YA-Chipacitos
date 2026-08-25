import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { NextRequest, NextResponse } from 'next/server'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  return { supabase, error: null }
}

function errorResponse(message: string, code?: string) {
  const status = code === '42501' ? 403 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const { supabase, error } = await requireAuth()
  if (error) return error
  const { data, error: e } = await supabase.from('fabrica_tamanios').select('*').order('orden')
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { nombre } = await req.json()
  const { data: ultimo } = await supabase.from('fabrica_tamanios').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle()
  const orden = (ultimo?.orden ?? 0) + 1
  const { data, error: e } = await supabase.from('fabrica_tamanios').insert({ nombre, orden }).select().single()
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id, ...fields } = await req.json()
  const { data, error: e } = await supabase.from('fabrica_tamanios').update(fields).eq('id', id).select().single()
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id } = await req.json()
  const { error: e } = await supabase.from('fabrica_tamanios').delete().eq('id', id)
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json({ ok: true })
}
