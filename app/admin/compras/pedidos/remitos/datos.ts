import type { QueryData } from '@supabase/supabase-js'
import type { createClientTipado } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

// Consultas de la pantalla de Remitos y los tipos que salen de ellas (sin
// 'use server', así page.tsx y los componentes cliente comparten tipos).

type Cliente = Awaited<ReturnType<typeof createClientTipado>>

export function consultarRemitos(supabase: Cliente) {
  return supabase
    .from('compras_remitos')
    .select('id, pedido_id, secuencia, fecha, numero, created_at, compras_remito_items(id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
}

// Solo pedidos enviados: a un pedido sin enviar no se le carga remito.
export function consultarPedidosRemito(supabase: Cliente) {
  return supabase
    .from('compras_pedidos')
    .select('id, numero, proveedor_id, estado_recepcion, estado_facturacion, enviado_en, ultima_secuencia_remito, solicitud_id, proveedores(nombre), compras_solicitudes(tipo)')
    .neq('estado_recepcion', 'sin_enviar')
    .order('enviado_en', { ascending: false })
}

export function consultarInsumos(supabase: Cliente) {
  return supabase
    .from('compras_items')
    // A2b: unidades y cómo cobra cada proveedor, para pedir los kg reales.
    .select('id, nombre, unidad, unidad_base, cantidad_por_unidad, cobra_por_default, compras_item_proveedores(proveedor_id, cobra_por)')
    .eq('estado', 'activo')
    .order('nombre')
}

export type RemitoFila = QueryData<ReturnType<typeof consultarRemitos>>[number]
export type PedidoRemito = QueryData<ReturnType<typeof consultarPedidosRemito>>[number]
export type InsumoRemito = QueryData<ReturnType<typeof consultarInsumos>>[number]
export type LineaPedido = Database['public']['Views']['v_compras_pedido_pendiente']['Row']
