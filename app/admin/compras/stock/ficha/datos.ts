import type { QueryData, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { FiltroMovimientos } from '@/lib/compras/trazabilidad'

// Consultas de la ficha del insumo (A2c, §6.1). Corren en el navegador con RLS,
// cada pestaña la primera vez que se abre. Todas van acotadas por insumo y con
// su límite o su período: ninguna lee sin tope.

type Cliente = SupabaseClient<Database>

export const LIMITE_DOCUMENTOS = 10
export const LIMITE_GRAFICO = 120
export const TANDA_MOVIMIENTOS = 30

/** Resumen y puente del período: una fila. Lo de facturas viene null si no es admin. */
export function consultarTrazabilidad(supabase: Cliente, itemId: string, desde: string, hasta: string) {
  return supabase.rpc('compras_trazabilidad_insumo', { p_desde: desde, p_hasta: hasta, p_item_id: itemId })
}

/** Últimos remitos o facturas del insumo (no dependen del período). */
export function consultarUltimosDocumentos(supabase: Cliente, itemId: string, tipo: 'remito' | 'factura') {
  return supabase
    .from('v_compras_insumo_documentos')
    .select('*')
    .eq('item_id', itemId)
    .eq('tipo', tipo)
    .order('fecha', { ascending: false })
    .order('cargado_en', { ascending: false })
    .limit(LIMITE_DOCUMENTOS)
}

/** Líneas de factura de los últimos 12 meses para el gráfico de precio (solo admin). */
export function consultarPuntosPrecio(supabase: Cliente, itemId: string, desde: string) {
  return supabase
    .from('v_compras_insumo_documentos')
    .select('*')
    .eq('item_id', itemId)
    .eq('tipo', 'factura')
    .eq('tipo_comprobante', 'factura')
    .gte('fecha', desde)
    .order('fecha')
    .limit(LIMITE_GRAFICO)
}

/** Proveedores del insumo (B3), el principal primero. */
export function consultarProveedoresDe(supabase: Cliente, itemId: string) {
  return supabase
    .from('v_compras_proveedor_insumos')
    .select('*, proveedores(nombre)')
    .eq('item_id', itemId)
    .order('es_principal', { ascending: false })
}

/** Pedidos abiertos del insumo (la línea "En camino" de la pestaña Stock). */
export function consultarEnCamino(supabase: Cliente, itemId: string) {
  return supabase
    .from('v_compras_insumos_resumen')
    .select('pedidos_abiertos')
    .eq('item_id', itemId)
    .maybeSingle()
}

/** Movimientos del ledger, de a tandas, con el filtro de la pestaña (§6.5). */
export function consultarMovimientos(supabase: Cliente, itemId: string, filtro: FiltroMovimientos, limite: number) {
  let q = supabase
    .from('v_compras_stock_movimientos')
    .select('*')
    .eq('item_id', itemId)
  if (filtro === 'remitos') q = q.not('remito_id', 'is', null)
  else if (filtro === 'conteos') q = q.not('conteo_id', 'is', null)
  else if (filtro === 'facturas') q = q.not('factura_id', 'is', null)
  else if (filtro === 'manuales') {
    q = q.in('tipo', ['ajuste_manual', 'reversion']).is('remito_id', null).is('conteo_id', null).is('factura_id', null)
  }
  return q.order('created_at', { ascending: false }).limit(limite + 1)
}

export type ProveedorDeInsumo = QueryData<ReturnType<typeof consultarProveedoresDe>>[number]
export type Movimiento = Database['public']['Views']['v_compras_stock_movimientos']['Row']

export interface PedidoEnCamino {
  pedido_id: string
  numero: number | null
  pendiente: number
  enviado_en: string | null
}

export function aPedidosEnCamino(v: unknown): PedidoEnCamino[] {
  if (!Array.isArray(v)) return []
  return v.filter((p): p is PedidoEnCamino =>
    typeof p === 'object' && p != null && typeof (p as PedidoEnCamino).pedido_id === 'string')
}
