import type { QueryData, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// Consultas de la ficha del proveedor (B3). Corren en el navegador con RLS, cada
// pestaña la primera vez que se abre. Viven acá (sin 'use server') para que la
// ficha y sus tipos compartan una sola definición.

type Cliente = SupabaseClient<Database>

/** La lista (page.tsx, en el servidor). Columnas explícitas: sin la vieja `local`. */
export function consultarProveedores(supabase: Cliente) {
  return supabase
    .from('proveedores')
    .select('id, nombre, categoria, cuit, contacto_nombre, contacto_telefono, contacto_email, direccion, tiempo_entrega, periodicidad_compra, financiacion, condiciones_pago, notas, estado, maneja_stock, local_facturacion_id')
    .order('nombre')
}

export type ProveedorFila = QueryData<ReturnType<typeof consultarProveedores>>[number]

export const LIMITE_PEDIDOS = 100
export const LIMITE_REMITOS = 50
export const LIMITE_FACTURAS = 50

export function consultarPedidosDe(supabase: Cliente, proveedorId: string) {
  return supabase
    .from('compras_pedidos')
    .select('id, numero, created_at, enviado_en, estado_recepcion, estado_facturacion, compras_remitos(id)')
    .eq('proveedor_id', proveedorId)
    .order('created_at', { ascending: false })
    .limit(LIMITE_PEDIDOS)
}

/** Facturas activas de esos pedidos. Vacía si quien mira no es admin (RLS es_admin()). */
// Misma consulta que consultarFacturasDePedidos (Pedidos), acotada a estos pedidos.
export function consultarFacturasDe(supabase: Cliente, pedidoIds: string[]) {
  return supabase
    .from('compras_facturas')
    .select('id, pedido_id, numero, fecha, total, estado')
    .eq('tipo_comprobante', 'factura')
    .neq('estado', 'anulada')
    .in('pedido_id', pedidoIds)
}

export function consultarRemitosDe(supabase: Cliente, proveedorId: string) {
  return supabase
    .from('compras_remitos')
    .select('id, secuencia, fecha, origen, compras_pedidos!inner(id, numero, proveedor_id), compras_remito_items(count)')
    .eq('compras_pedidos.proveedor_id', proveedorId)
    .order('fecha', { ascending: false })
    .limit(LIMITE_REMITOS)
}

/**
 * Todas las facturas del proveedor, también las anuladas: la Cuenta usa las
 * confirmadas de todas las fechas (el pendiente total) y la lista muestra las
 * últimas. Vacía si quien mira no es admin (la vista pide es_admin()).
 */
export function consultarFacturasProveedor(supabase: Cliente, proveedorId: string) {
  return supabase
    .from('v_compras_facturas')
    .select('id, numero, fecha, pedido_id, pedido_numero, proveedor_id, proveedor_nombre, estado, tipo_comprobante, anulada_motivo, subtotal, iva, total, gasto_id, gasto_estado')
    .eq('proveedor_id', proveedorId)
    .order('fecha', { ascending: false })
}

export function consultarInsumosDe(supabase: Cliente, proveedorId: string) {
  return supabase
    .from('v_compras_proveedor_insumos')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('item_nombre')
}

export type PedidoDeProveedor = QueryData<ReturnType<typeof consultarPedidosDe>>[number]
export type FacturaDePedidoProveedor = QueryData<ReturnType<typeof consultarFacturasDe>>[number]
export type RemitoDeProveedor = QueryData<ReturnType<typeof consultarRemitosDe>>[number]
export type FacturaDeProveedor = QueryData<ReturnType<typeof consultarFacturasProveedor>>[number]
export type InsumoDeProveedor = QueryData<ReturnType<typeof consultarInsumosDe>>[number]
