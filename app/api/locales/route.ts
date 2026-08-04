import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Solo lectura: lista las sucursales activas para el selector de
// /admin/fudo. El alta/baja/edición de sucursales y sus credenciales
// (variables de entorno FUDO_API_KEY_<SLUG> / FUDO_API_SECRET_<SLUG>,
// ver lib/fudo.ts) ya no tienen UI — se gestionan directo en la base y en Vercel.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error: dbError } = await supabase
    .from('locales_config')
    .select('sucursal, activo')
    .order('sucursal')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
