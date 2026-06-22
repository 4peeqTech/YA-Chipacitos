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

export async function GET() {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { data } = await supabase.from('formas_pago').select('*').order('nombre')
  return NextResponse.json(data ?? [])
}
export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { nombre } = await req.json()
  const { data, error: e } = await supabase.from('formas_pago').insert({ nombre }).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json(data)
}
export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id, ...fields } = await req.json()
  const { data, error: e } = await supabase.from('formas_pago').update(fields).eq('id', id).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json(data)
}
export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id } = await req.json()
  const { error: e } = await supabase.from('formas_pago').delete().eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
