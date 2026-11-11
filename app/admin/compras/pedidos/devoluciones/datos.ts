import type { createClientTipado } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'
import type { DevolucionDev, LineaDevolucion, Motivo } from '@/lib/compras/devoluciones'

// Devoluciones al proveedor (B4): consultas y tipos compartidos por el pedido,
// la factura y las diferencias. Sin 'use server', como ../datos.ts.

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

export type DevolucionFila = Database['public']['Views']['v_compras_devoluciones']['Row']

/** Una línea de `lineas` (jsonb de la vista). precio_correcto viene null si no sos admin. */
export interface LineaDevolucionVista extends LineaDevolucion {
  id: string
  unidadBase: string | null
  precioCorrecto: number | null
}

/** La devolución ya leída: los null de la vista resueltos. */
export interface DevolucionVista extends DevolucionDev {
  pedidoId: string
  pedidoNumero: number
  secuencia: number
  codigo: string
  facturaId: string | null
  motivoNombre: string
  nota: string | null
  creadaEn: string
  creadaPor: string | null
  anuladaEn: string | null
  anuladaPor: string | null
  anuladaMotivo: string | null
  lineas: LineaDevolucionVista[]
  esperaNotaCredito: boolean
  // Solo admin (la vista los manda en null a quien no lo es).
  ncNumero: string | null
  ncFecha: string | null
  ncTotal: number | null
  ncEstado: string | null
  ncGasto: string | null
  ncGastoDescontado: number | null
  facturaNumero: string | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function leerLineas(v: unknown): LineaDevolucionVista[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x): LineaDevolucionVista[] => {
    if (!x || typeof x !== 'object') return []
    const o = x as Record<string, unknown>
    const id = texto(o.id)
    const cantidad = num(o.cantidad)
    if (!id || cantidad == null) return []
    return [{
      id,
      itemId: texto(o.item_id),
      pedidoItemId: texto(o.pedido_item_id),
      facturaItemId: texto(o.factura_item_id),
      descripcion: texto(o.descripcion) ?? 'Insumo',
      unidad: texto(o.unidad),
      cantidad,
      cantidadBase: num(o.cantidad_base),
      unidadBase: texto(o.unidad_base),
      precioCorrecto: num(o.precio_correcto),
    }]
  })
}

export function armarDevoluciones(filas: DevolucionFila[]): DevolucionVista[] {
  return filas.flatMap((f): DevolucionVista[] => {
    if (!f.id || !f.pedido_id || f.secuencia == null || f.pedido_numero == null) return []
    return [{
      id: f.id,
      pedidoId: f.pedido_id,
      pedidoNumero: f.pedido_numero,
      secuencia: f.secuencia,
      codigo: f.codigo ?? '',
      estado: f.estado ?? 'activa',
      facturaId: f.factura_id,
      devuelveMercaderia: !!f.devuelve_mercaderia,
      corrigePrecio: !!f.corrige_precio,
      repone: !!f.repone,
      motivoNombre: f.motivo_nombre ?? '',
      nota: f.nota,
      creadaEn: f.created_at ?? '',
      creadaPor: f.creado_por_nombre,
      anuladaEn: f.anulada_en,
      anuladaPor: f.anulada_por_nombre,
      anuladaMotivo: f.anulada_motivo,
      notaCreditoId: f.nota_credito_id,
      lineas: leerLineas(f.lineas),
      esperaNotaCredito: !!f.espera_nota_credito,
      ncNumero: f.nc_numero,
      ncFecha: f.nc_fecha,
      ncTotal: f.nc_total,
      ncEstado: f.nc_estado,
      ncGasto: f.nc_gasto,
      ncGastoDescontado: f.nc_gasto_descontado,
      facturaNumero: f.factura_numero,
    }]
  }).sort((a, b) => a.secuencia - b.secuencia)
}

const TANDA = 100

/** Las devoluciones de los pedidos cargados, en tandas (como B3): no toda la tabla. */
export async function consultarDevoluciones(supabase: Cliente, pedidoIds: string[]): Promise<DevolucionFila[]> {
  const res: DevolucionFila[] = []
  for (let i = 0; i < pedidoIds.length; i += TANDA) {
    const { data } = await supabase
      .from('v_compras_devoluciones')
      .select('*')
      .in('pedido_id', pedidoIds.slice(i, i + TANDA))
    res.push(...(data ?? []))
  }
  return res
}

export function armarMotivos(filas: { id: string; nombre: string; devuelve_mercaderia: boolean; corrige_precio: boolean; orden: number; activo: boolean }[]): Motivo[] {
  return [...filas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
}
