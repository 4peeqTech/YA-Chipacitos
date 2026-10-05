import type { QueryData } from '@supabase/supabase-js'
import type { createClientTipado } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

// Consultas de la pantalla de Pedidos y los tipos que salen de ellas. Viven acá
// (sin 'use server') para que page.tsx y los componentes cliente compartan tipos.

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

export function consultarPedidos(supabase: Cliente) {
  return supabase
    .from('compras_pedidos')
    .select(`
      id, numero, proveedor_id, local_facturacion_id, estado_recepcion, estado_facturacion,
      mensaje, created_at, enviado_en, cierre_motivo, solicitud_id, actualizado_en,
      proveedores(id, nombre, local_facturacion_id, contacto_nombre, contacto_telefono, maneja_stock),
      compras_solicitudes(tipo),
      compras_pedido_items(id, item_id, descripcion, unidad, cantidad, orden),
      compras_remitos(id, secuencia, fecha, created_at, origen, compras_remito_items(count))
    `)
    .order('created_at', { ascending: false })
}

export function consultarCatalogo(supabase: Cliente) {
  return supabase
    .from('compras_items')
    .select('id, nombre, unidad, stock_minimo, compras_item_proveedores(proveedor_id, precio_ref, activo)')
    .eq('estado', 'activo')
    .order('nombre')
}

export function consultarProveedores(supabase: Cliente) {
  return supabase
    .from('proveedores')
    .select('id, nombre, local_facturacion_id, contacto_nombre, contacto_telefono, maneja_stock')
    .eq('estado', 'activo')
    .order('nombre')
}

/**
 * Resumen de la factura de cada pedido (F4). Las tablas de factura tienen RLS
 * es_admin(), así que un colaborador recibe una lista vacía y la columna y la
 * sección de Factura no se le muestran.
 */
export function consultarFacturasDePedidos(supabase: Cliente) {
  return supabase
    .from('compras_facturas')
    .select('id, pedido_id, numero, fecha, total, estado')
    .eq('tipo_comprobante', 'factura')
    .neq('estado', 'anulada')
}

export type PedidoFila = QueryData<ReturnType<typeof consultarPedidos>>[number]
export type FacturaDePedido = QueryData<ReturnType<typeof consultarFacturasDePedidos>>[number]
export type ItemCatalogo = QueryData<ReturnType<typeof consultarCatalogo>>[number]
export type ProveedorPedido = QueryData<ReturnType<typeof consultarProveedores>>[number]
export type LineaPendiente = Database['public']['Views']['v_compras_pedido_pendiente']['Row']
export type EventoPedido = Database['public']['Views']['v_compras_pedido_eventos']['Row']
export type PedidoEliminado = Database['public']['Views']['v_compras_pedidos_eliminados']['Row']

export interface Plantilla {
  id: string
  nombre: string
  cuerpo: string
  es_default: boolean
}

export type LocalFacturacion = Database['public']['Tables']['locales_facturacion']['Row']
