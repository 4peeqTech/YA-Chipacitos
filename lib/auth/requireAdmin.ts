import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Copiado antes en ~10 API routes (ver ARQUITECTURA.md §8, Q4) — extraído acá. */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return { supabase, error: NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 }) }
  return { supabase, error: null }
}
