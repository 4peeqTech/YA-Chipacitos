import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/resumen?desde=&hasta=
// Los gastos de cada local en el período, por categoría, y si el local usa
// Fudo. Las ventas (17-11) salen de Fudo: la pantalla las pide local por local
// a /api/fudo/ventas. Antes salían de Posberry, que es lo que la fábrica le
// vende a cada local, no lo que vende el local.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const supabase = await createClient()

  let gastosQ = supabase
    .from('gastos')
    .select('local, categoria, monto, fecha, plan_cuentas(uso_gastos)')
    .not('local', 'is', null)
    // Un gasto de Fudo cancelado allá queda Anulado: no es plata gastada.
    .neq('estado', 'Anulado')

  if (desde) gastosQ = gastosQ.gte('fecha', desde)
  if (hasta) gastosQ = gastosQ.lte('fecha', hasta)

  const [{ data: gastos, error: e1 }, { data: locales, error: e2 }] = await Promise.all([
    gastosQ,
    supabase.from('locales_config').select('sucursal, tiene_fudo, orden').eq('activo', true).order('orden'),
  ])

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // Gastos agrupados: { [local]: { [categoria]: total } }
  const gastosPorLocal: Record<string, Record<string, number>> = {}
  for (const g of gastos ?? []) {
    // Lo que no es gasto (retiros, bienes de uso, capital de préstamos) no va al Resumen.
    const plan = [g.plan_cuentas].flat()[0] as { uso_gastos: string | null } | null | undefined
    if (plan?.uso_gastos === 'otro_pago') continue
    const local = g.local as string
    const cat = (g.categoria as string) || 'Sin clasificar'
    if (!gastosPorLocal[local]) gastosPorLocal[local] = {}
    gastosPorLocal[local][cat] = (gastosPorLocal[local][cat] ?? 0) + Number(g.monto ?? 0)
  }

  // Todos los locales activos (en su orden) y los que tengan gastos aunque ya no estén.
  const conFudo = new Map((locales ?? []).map(l => [l.sucursal, l.tiene_fudo]))
  const nombres = [...(locales ?? []).map(l => l.sucursal), ...Object.keys(gastosPorLocal).filter(l => !conFudo.has(l)).sort()]

  const result = nombres.map(local => ({
    local,
    tieneFudo: conFudo.get(local) === true,
    gastos: Object.entries(gastosPorLocal[local] ?? {})
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    totalGastos: Object.values(gastosPorLocal[local] ?? {}).reduce((s, v) => s + v, 0),
  }))

  return NextResponse.json(result)
}
