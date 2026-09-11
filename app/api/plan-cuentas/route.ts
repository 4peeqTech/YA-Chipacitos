import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('*')
    .order('orden')
    .order('rubro')
    .order('categoria')
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo traer el plan de cuentas' }, { status: 500 }) }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('plan_cuentas').insert(body).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 500 }) }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase.from('plan_cuentas').update(updates).eq('id', id).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo actualizar la cuenta' }, { status: 500 }) }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { id } = await req.json()
  const { error } = await supabase.from('plan_cuentas').delete().eq('id', id)
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo eliminar la cuenta' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
