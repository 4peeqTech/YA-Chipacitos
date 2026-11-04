import { NextRequest, NextResponse } from 'next/server'
import { createClientTipado } from '@/lib/supabase/server'
import { sincronizarFudo } from '@/lib/gastos/fudoSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/gastos/fudo/sincronizar
// Lo llama la pantalla de Gastos: al abrirla ({ alAbrir: true }: solo las
// sucursales sin sincronizar en los últimos 10 minutos) o con "Actualizar".
// Solo lee Fudo; escribe en esta base con el usuario (la RPC pide admin).
export async function POST(req: NextRequest) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const cuerpo = await req.json().catch(() => ({})) as { alAbrir?: unknown }
  const alAbrir = cuerpo.alAbrir === true
  try {
    const r = await sincronizarFudo(supabase, { origen: alAbrir ? 'pantalla' : 'boton', vencidoMinutos: alAbrir ? 10 : undefined })
    return NextResponse.json(r)
  } catch {
    return NextResponse.json({ error: 'No pudimos actualizar los gastos de Fudo. Probá de nuevo en un rato.' }, { status: 500 })
  }
}
