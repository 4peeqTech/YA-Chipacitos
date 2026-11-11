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

// GET /api/cron/gastos
// Vercel Cron, una vez por día (vercel.json):
//   1. crea los gastos que se repiten que ya tocan (siempre);
//   2. trae los gastos de Fudo de cada sucursal (solo lee Fudo, y solo con
//      GASTOS_FUDO_SYNC=on: en producción no corre aunque el código llegue).
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
  const { data: recurrentes, error: errorRecurrentes } = await supabase.rpc('gastos_generar_recurrentes', {})
  if (errorRecurrentes) console.error('[gastos] cron: no se generaron los que se repiten:', errorRecurrentes.message)
  try {
    const fudo = await sincronizarFudo(supabase, { origen: 'cron' })
    console.log('[gastos] cron:', JSON.stringify({ recurrentes, fudo }))
    return NextResponse.json({ recurrentes, fudo }, { status: errorRecurrentes ? 500 : 200 })
  } catch (e) {
    console.error('[gastos] cron: falló la sincronización con Fudo:', e)
    return NextResponse.json({ recurrentes, error: 'Falló la sincronización con Fudo' }, { status: 500 })
  }
}
