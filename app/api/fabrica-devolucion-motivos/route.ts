import { createClient } from '@/lib/supabase/server'
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
  const { data, error: e } = await supabase.from('fabrica_devolucion_motivos').select('*').order('orden')
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAuth()
  if (error) return error
  const { nombre } = await req.json()
  const { data, error: e } = await supabase.from('fabrica_devolucion_motivos').insert({ nombre }).select().single()
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAuth()
  if (error) return error
  const { id, ...fields } = await req.json()
  const { data, error: e } = await supabase.from('fabrica_devolucion_motivos').update(fields).eq('id', id).select().single()
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAuth()
  if (error) return error
  const { id } = await req.json()
  const { error: e } = await supabase.from('fabrica_devolucion_motivos').delete().eq('id', id)
  if (e) return errorResponse(e.message, e.code)
  return NextResponse.json({ ok: true })
}
