import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { mensajeEntorno, verificarEntornoServidor } from '@/lib/entorno'
import { sincronizarFudo } from '@/lib/gastos/fudoSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Comparación en tiempo constante (igual que avisos-compras).
function secretCoincide(recibido: string | null, esperado: string): boolean {
  const a = Buffer.from(recibido ?? '')
  const b = Buffer.from(esperado)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

// GET /api/cron/gastos-fudo
// Vercel Cron, una vez por día (vercel.json): trae los gastos de Fudo de cada
// sucursal. Solo lee Fudo. Sin GASTOS_FUDO_SYNC=on no hace nada (así en
// producción no corre aunque el código llegue).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Cron sin configurar' }, { status: 503 })
  }
  if (!secretCoincide(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let entornoOk = false
  let detalle = ''
  try {
    const entorno = verificarEntornoServidor()
    entornoOk = entorno.ok
    detalle = mensajeEntorno(entorno)
  } catch (e) {
    detalle = e instanceof Error ? e.message : String(e)
  }
  if (!entornoOk) return NextResponse.json({ error: detalle }, { status: 503 })

  const supabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  try {
    const r = await sincronizarFudo(supabase, { origen: 'cron' })
    console.log('[gastos-fudo] cron:', JSON.stringify(r))
    return NextResponse.json(r)
  } catch (e) {
    console.error('[gastos-fudo] cron falló:', e)
    return NextResponse.json({ error: 'Falló la sincronización' }, { status: 500 })
  }
}
