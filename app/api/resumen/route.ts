import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const supabase = await createClient()

  let gastosQ = supabase
    .from('gastos')
    .select('local, categoria, monto, fecha')
    .not('local', 'is', null)

  if (desde) gastosQ = gastosQ.gte('fecha', desde)
  if (hasta) gastosQ = gastosQ.lte('fecha', hasta)

  let ventasQ = supabase
    .from('ventas_posberry')
    .select('local_id, producto_nombre, vendido, pedido, monto_vendido, monto_remito, fecha, profiles(local_nombre)')
    .not('local_id', 'is', null)

  if (desde) ventasQ = ventasQ.gte('fecha', desde)
  if (hasta) ventasQ = ventasQ.lte('fecha', hasta)

  const [{ data: gastos, error: e1 }, { data: ventas, error: e2 }] = await Promise.all([
    gastosQ,
    ventasQ,
  ])

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // Gastos agrupados: { [local]: { [categoria]: total } }
  type CatMap = Record<string, number>
  const gastosPorLocal: Record<string, CatMap> = {}
  for (const g of gastos ?? []) {
    const local = g.local as string
    const cat = (g.categoria as string) || 'Sin categoría'
    if (!gastosPorLocal[local]) gastosPorLocal[local] = {}
    gastosPorLocal[local][cat] = (gastosPorLocal[local][cat] ?? 0) + Number(g.monto ?? 0)
  }

  // Ventas posberry agrupadas: { [local_nombre]: { [producto]: { vendido, remito, montoVendido, montoRemito } } }
  type VentaMap = Record<string, { vendido: number; remito: number; montoVendido: number; montoRemito: number }>
  const ventasPorLocal: Record<string, VentaMap> = {}
  for (const v of ventas ?? []) {
    const prof = (Array.isArray(v.profiles) ? v.profiles[0] : v.profiles) as { local_nombre: string } | null
    const local = prof?.local_nombre ?? 'Sin local'
    const prod = (v.producto_nombre as string) || 'Sin nombre'
    if (!ventasPorLocal[local]) ventasPorLocal[local] = {}
    if (!ventasPorLocal[local][prod]) ventasPorLocal[local][prod] = { vendido: 0, remito: 0, montoVendido: 0, montoRemito: 0 }
    ventasPorLocal[local][prod].vendido += Number(v.vendido ?? 0)
    ventasPorLocal[local][prod].remito += Number(v.pedido ?? 0)
    ventasPorLocal[local][prod].montoVendido += Number(v.monto_vendido ?? 0)
    ventasPorLocal[local][prod].montoRemito += Number(v.monto_remito ?? 0)
  }

  // Unify locales from both sources
  const locales = [...new Set([...Object.keys(gastosPorLocal), ...Object.keys(ventasPorLocal)])].sort()

  const result = locales.map(local => ({
    local,
    gastos: Object.entries(gastosPorLocal[local] ?? {})
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    ventas: Object.entries(ventasPorLocal[local] ?? {})
      .map(([producto, stats]) => ({ producto, ...stats }))
      .sort((a, b) => b.vendido - a.vendido),
    totalGastos: Object.values(gastosPorLocal[local] ?? {}).reduce((s, v) => s + v, 0),
    totalVendido: Object.values(ventasPorLocal[local] ?? {}).reduce((s, v) => s + v.vendido, 0),
    totalRemito: Object.values(ventasPorLocal[local] ?? {}).reduce((s, v) => s + v.remito, 0),
    totalMontoVendido: Object.values(ventasPorLocal[local] ?? {}).reduce((s, v) => s + v.montoVendido, 0),
  }))

  return NextResponse.json(result)
}
