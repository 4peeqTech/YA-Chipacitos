import type { QueryData } from '@supabase/supabase-js'
import type { createClientTipado } from '@/lib/supabase/server'

// Consultas de la pantalla de Facturas y los tipos que salen de ellas (sin
// 'use server', así page.tsx y los componentes cliente comparten tipos).
//
// Todo lo de factura es solo de admin: las tablas tienen RLS es_admin() y la
// vista se gatea en su WHERE, así que un no-admin recibe listas vacías.

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

export function consultarFacturas(supabase: Cliente) {
  return supabase
    .from('v_compras_facturas')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
}

export function consultarFacturaItems(supabase: Cliente) {
  return supabase
    .from('compras_factura_items')
    .select('id, factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad, precio_unitario, alicuota_iva, subtotal, iva, orden, cantidad_base, precio_por')
    .order('orden')
}

/**
 * Pedidos a los que se les puede cargar factura. Un pedido sin enviar no se
 * factura (lo rechaza la RPC), así que no entra a la lista. Traemos los remitos
 * con sus líneas: definen si hay que preguntar "¿ya llegó la mercadería?" (FA1)
 * y con qué cantidades se prellena la factura.
 */
export function consultarPedidosFactura(supabase: Cliente) {
  return supabase
    .from('compras_pedidos')
    .select(`
      id, numero, proveedor_id, estado_recepcion, estado_facturacion, enviado_en,
      proveedores(nombre),
      compras_remitos(id, secuencia, fecha, origen, compras_remito_items(pedido_item_id, item_id, descripcion, cantidad, cantidad_base))
    `)
    .neq('estado_recepcion', 'sin_enviar')
    .order('enviado_en', { ascending: false })
}

/** Diferencias con lo recibido de todas las facturas (F5). La vista pide es_admin(). */
export function consultarDiferencias(supabase: Cliente) {
  return supabase.from('v_compras_factura_diferencias').select('*')
}

/** Local con el que viene elegido el gasto al confirmar (compras_config 'gasto.local'). */
export async function consultarLocalGastoDefault(supabase: Cliente): Promise<string> {
  const { data } = await supabase.from('compras_config').select('valor').eq('clave', 'gasto.local').maybeSingle()
  return typeof data?.valor === 'string' && data.valor.trim() ? data.valor : 'YA! FABRICA'
}

/** Precio de referencia por insumo y proveedor (FA4), con la unidad en que cobra (A2b). */
export function consultarPreciosRef(supabase: Cliente) {
  return supabase
    .from('compras_item_proveedores')
    .select('item_id, proveedor_id, precio_ref, cobra_por')
    .eq('activo', true)
}

/** Alícuota y unidades de cada insumo: se copian a la línea nueva de la factura. */
export function consultarInsumosFactura(supabase: Cliente) {
  return supabase
    .from('compras_items')
    .select('id, nombre, unidad, alicuota_iva, unidad_base, cantidad_por_unidad, cobra_por_default')
    .eq('estado', 'activo')
    .order('nombre')
}

export type FacturaFila = QueryData<ReturnType<typeof consultarFacturas>>[number]
export type FacturaItemFila = QueryData<ReturnType<typeof consultarFacturaItems>>[number]
export type PedidoFactura = QueryData<ReturnType<typeof consultarPedidosFactura>>[number]
export type PrecioRef = QueryData<ReturnType<typeof consultarPreciosRef>>[number]
export type InsumoFactura = QueryData<ReturnType<typeof consultarInsumosFactura>>[number]
