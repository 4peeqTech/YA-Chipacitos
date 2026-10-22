export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { Producto } from '@/lib/types'
import LocalPedidosClient, { type Habitual, type UltimoPedido } from './LocalPedidosClient'

const DIAS_HABITUALES = 60
const MAX_HABITUALES = 4

interface ItemHistorial { producto_id: string | null; cantidad: number; origen: string | null }
interface PedidoHistorial { created_at: string; pedido_items: ItemHistorial[] }

/**
 * "Tus habituales" (R5): hasta 4 productos que este local más pidió en los
 * últimos 60 días (pedidos no cancelados), por cantidad de pedidos en los que
 * aparecen; desempata el total pedido. Con la cantidad de la última vez.
 * Sin historial: las Masas.
 */
function calcularHabituales(pedidos: PedidoHistorial[], productos: Producto[]): Habitual[] {
  const porId = new Map(productos.map(p => [p.id, p]))
  const stats = new Map<string, { veces: number; total: number; ultima: number; ultimaFecha: string }>()
  for (const ped of pedidos) {
    for (const i of ped.pedido_items ?? []) {
      if (!i.producto_id || (i.origen && i.origen !== 'pedido') || Number(i.cantidad) <= 0) continue
      if (!porId.has(i.producto_id)) continue
      const s = stats.get(i.producto_id) ?? { veces: 0, total: 0, ultima: 0, ultimaFecha: '' }
      s.veces += 1
      s.total += Number(i.cantidad)
      if (ped.created_at > s.ultimaFecha) { s.ultima = Number(i.cantidad); s.ultimaFecha = ped.created_at }
      stats.set(i.producto_id, s)
    }
  }
  if (stats.size > 0) {
    return [...stats.entries()]
      .sort(([idA, a], [idB, b]) => b.veces - a.veces || b.total - a.total
        || (porId.get(idA)?.nombre ?? '').localeCompare(porId.get(idB)?.nombre ?? '', 'es'))
      .slice(0, MAX_HABITUALES)
      .map(([id, s]) => ({ productoId: id, ultimaCantidad: s.ultima }))
  }
  return productos
    .filter(p => p.categoria === 'Masas')
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, MAX_HABITUALES)
    .map(p => ({ productoId: p.id, ultimaCantidad: null }))
}

/** Fecha (ISO) desde la que se cuentan los habituales. Es una página dinámica: se calcula en cada pedido. */
function inicioVentanaHabituales() {
  return new Date(Date.now() - DIAS_HABITUALES * 24 * 60 * 60 * 1000).toISOString()
}

export default async function LocalPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const desde = inicioVentanaHabituales()

  // Por ahora el local solo le pide al mayorista (D10): los productos de
  // depósito no se muestran. Los sin stock (activo = false) vienen igual:
  // se ven en gris y no se pueden cargar (R2).
  const [rProductos, rUltimo, rHistorial] = await Promise.all([
    supabase.from('productos').select('*').eq('destino', 'fabrica').order('nombre'),
    supabase
      .from('pedidos')
      .select('numero, pedido_items(producto_id, producto_nombre, cantidad, origen)')
      .eq('local_id', user.id)
      .eq('destino', 'fabrica')
      .neq('estado', 'cancelado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pedidos')
      .select('created_at, pedido_items(producto_id, cantidad, origen)')
      .eq('local_id', user.id)
      .eq('destino', 'fabrica')
      .neq('estado', 'cancelado')
      .gte('created_at', desde)
      .order('created_at', { ascending: false }),
  ])

  // Si una consulta falla la página sigue con lo que tenga, pero el error
  // queda en el log del servidor (no se tapa en silencio).
  if (rProductos.error) console.error('[local/pedidos] productos:', rProductos.error.message)
  if (rUltimo.error) console.error('[local/pedidos] último pedido:', rUltimo.error.message)
  if (rHistorial.error) console.error('[local/pedidos] historial de habituales:', rHistorial.error.message)
  const productos = rProductos.data
  const ultimo = rUltimo.data
  const historial = rHistorial.data

  const lista = (productos ?? []) as Producto[]
  return (
    <LocalPedidosClient
      usuarioId={user.id}
      productos={lista}
      habituales={calcularHabituales((historial ?? []) as PedidoHistorial[], lista)}
      ultimoPedido={(ultimo as UltimoPedido | null) ?? null}
      errorUltimoPedido={!!rUltimo.error}
    />
  )
}
