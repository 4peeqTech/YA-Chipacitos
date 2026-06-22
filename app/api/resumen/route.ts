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

  let pedidosQ = supabase
    .from('pedidos')
    .select('id, local_nombre, created_at, pedido_items(producto_nombre, cantidad, valor_total)')
    .not('local_nombre', 'is', null)

  if (desde) pedidosQ = pedidosQ.gte('created_at', `${desde}T00:00:00Z`)
  if (hasta) pedidosQ = pedidosQ.lte('created_at', `${hasta}T23:59:59Z`)

  const [{ data: gastos, error: e1 }, { data: pedidos, error: e2 }] = await Promise.all([
    gastosQ,
    pedidosQ,
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

  // Pedidos agrupados: { [local]: { [producto]: { cantidad, valor } } }
  type ProdMap = Record<string, { cantidad: number; valor: number }>
  const pedidosPorLocal: Record<string, ProdMap> = {}
  for (const p of pedidos ?? []) {
    const local = p.local_nombre as string
    if (!pedidosPorLocal[local]) pedidosPorLocal[local] = {}
    const items = (p.pedido_items ?? []) as Array<{ producto_nombre: string; cantidad: number; valor_total: number }>
    for (const item of items) {
      const prod = item.producto_nombre || 'Sin nombre'
      if (!pedidosPorLocal[local][prod]) pedidosPorLocal[local][prod] = { cantidad: 0, valor: 0 }
      pedidosPorLocal[local][prod].cantidad += Number(item.cantidad ?? 0)
      pedidosPorLocal[local][prod].valor += Number(item.valor_total ?? 0)
    }
  }

  // Unify locales from both sources
  const locales = [...new Set([...Object.keys(gastosPorLocal), ...Object.keys(pedidosPorLocal)])].sort()

  const result = locales.map(local => ({
    local,
    gastos: Object.entries(gastosPorLocal[local] ?? {})
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    pedidos: Object.entries(pedidosPorLocal[local] ?? {})
      .map(([producto, { cantidad, valor }]) => ({ producto, cantidad, valor }))
      .sort((a, b) => b.cantidad - a.cantidad),
    totalGastos: Object.values(gastosPorLocal[local] ?? {}).reduce((s, v) => s + v, 0),
    totalPedidosUnidades: Object.values(pedidosPorLocal[local] ?? {}).reduce((s, v) => s + v.cantidad, 0),
    totalPedidosValor: Object.values(pedidosPorLocal[local] ?? {}).reduce((s, v) => s + v.valor, 0),
  }))

  return NextResponse.json(result)
}
