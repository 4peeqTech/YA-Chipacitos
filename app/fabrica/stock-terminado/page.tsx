export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import StockTerminadoClient, { ProductoTerminado, Movimiento } from './StockTerminadoClient'

export default async function FabricaStockTerminadoPage() {
  const supabase = await createClient()

  const [{ data: productos }, { data: stock }, { data: movimientos }] = await Promise.all([
    supabase
      .from('productos')
      .select(`
        id, nombre, activo,
        presentacion:fabrica_presentaciones(nombre, peso_kg),
        sabor:fabrica_sabores(nombre),
        tamanio:fabrica_tamanios(nombre)
      `)
      .not('presentacion_id', 'is', null)
      .order('nombre'),
    supabase.from('fabrica_stock_terminado').select('producto_id, cantidad_kg, actualizado_en'),
    supabase
      .from('fabrica_stock_terminado_mov')
      .select('id, producto_id, delta_kg, tipo, created_at, productos(nombre)')
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  const stockPorProducto = new Map((stock ?? []).map(s => [s.producto_id, s]))

  const items: ProductoTerminado[] = ((productos ?? []) as any[]).map(p => ({
    id: p.id,
    nombre: p.nombre,
    activo: p.activo,
    pesoKg: p.presentacion?.peso_kg ?? 0,
    presentacionNombre: p.presentacion?.nombre ?? '—',
    saborNombre: p.sabor?.nombre ?? '—',
    tamanioNombre: p.tamanio?.nombre ?? '—',
    cantidadKg: stockPorProducto.get(p.id)?.cantidad_kg ?? 0,
    actualizadoEn: stockPorProducto.get(p.id)?.actualizado_en ?? null,
  }))

  const movimientosIniciales: Movimiento[] = ((movimientos ?? []) as any[]).map(m => ({
    id: m.id,
    productoId: m.producto_id,
    productoNombre: m.productos?.nombre ?? '—',
    deltaKg: m.delta_kg,
    tipo: m.tipo,
    createdAt: m.created_at,
  }))

  return <StockTerminadoClient itemsIniciales={items} movimientosIniciales={movimientosIniciales} />
}
