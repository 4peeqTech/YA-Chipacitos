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
  const { data, error: dbError } = await supabase
    .from('locales_config')
    .select('id, sucursal, fudo_api_key, fudo_api_secret, activo, updated_at')
    .order('sucursal')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const body = await req.json()
  const { data, error: dbError } = await supabase
    .from('locales_config')
    .insert({ sucursal: body.sucursal, fudo_api_key: body.fudo_api_key, fudo_api_secret: body.fudo_api_secret, activo: true })
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error: dbError } = await supabase
    .from('locales_config')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { id } = await req.json()
  const { error: dbError } = await supabase.from('locales_config').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
