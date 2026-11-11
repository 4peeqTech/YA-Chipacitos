import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { correrAvisos } from '@/lib/compras/avisosServidor'
import { mensajeEntorno, verificarEntornoServidor } from '@/lib/entorno'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Comparación en tiempo constante. Con largos distintos se compara igual
// (contra sí mismo) para no cortar antes y devolver false.
function secretCoincide(recibido: string | null, esperado: string): boolean {
  const a = Buffer.from(recibido ?? '')
  const b = Buffer.from(esperado)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

// GET /api/cron/avisos-compras
// Vercel Cron, una vez por día (vercel.json). Corre los 5 chequeos de avisos de
// compras (B5). A diferencia de recordatorios-tareas, rechaza si CRON_SECRET
// falta o es corto (si no, "Bearer undefined" pasaría) y no corre contra un
// entorno de Supabase mal configurado.
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
    // En producción verificarEntornoServidor tira si el entorno no verifica.
    detalle = e instanceof Error ? e.message : String(e)
  }
  if (!entornoOk) return NextResponse.json({ error: detalle }, { status: 503 })

  const resumen = await correrAvisos({ origen: 'cron' })
  console.log('[avisos-compras] cron:', resumen.texto)
  return NextResponse.json(resumen, { status: resumen.error ? 500 : 200 })
}
