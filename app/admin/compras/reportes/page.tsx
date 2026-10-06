import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { aEstadoFacturacion, aEstadoRecepcion } from '@/lib/compras/estadoPedido'
import { esTipoMovimiento } from '@/lib/compras/movimientos'
import type { MovimientoReporte, PedidoItemRecibidoReporte, PedidoReporte } from '@/lib/compras/reportes'
import ReportesClient from './ReportesClient'

export const metadata = { title: 'Reportes | YA! Chipacitos' }

export default async function ReportesPage() {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El gasto sale de las facturas (F5), que solo ve un administrador (P1).
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esAdmin = perfil?.rol === 'admin'

  const [
    { data: remitos },
    { data: pedidos },
    { data: movimientos },
    { data: stock },
    { data: solicitudItems },
    { data: pedidoItems },
    { data: vItems },
    { data: facturas },
  ] = await Promise.all([
    supabase
      .from('compras_remitos')
      .select('id, secuencia, fecha')
      .order('fecha', { ascending: false }),
    // B3: columnas explícitas; el estado sale de estado_recepcion + estado_facturacion.
    supabase
      .from('compras_pedidos')
      .select('id, numero, proveedor_id, created_at, enviado_en, estado_recepcion, estado_facturacion, proveedores(nombre), compras_remitos(id, secuencia, fecha, compras_remito_items(descripcion, cantidad))')
      .order('created_at', { ascending: false }),
    supabase
      .from('v_compras_stock_movimientos')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('compras_stock_actual').select('item_id, cantidad'),
    supabase
      .from('compras_solicitud_items')
      .select('id, solicitud_id, item_id, descripcion, cantidad_sugerida, compras_solicitudes(tipo, fabrica_conteos(semana_desde, semana_hasta))'),
    // Sugerido vs. recibido (E15): las líneas que nacieron de una solicitud, con lo que llegó en sus remitos.
    supabase
      .from('compras_pedido_items')
      .select('solicitud_item_id, cantidad, compras_remito_items(cantidad), compras_pedidos(estado_recepcion, estado_facturacion, compras_remitos(id))')
      .not('solicitud_item_id', 'is', null),
    // v_compras_items evita depender de compras_items.proveedor_id (1:N, en desuso
    // desde que existe compras_item_proveedores) solo para mostrar el proveedor principal acá.
    supabase.from('v_compras_items').select('id, proveedor_principal_nombre, stock_minimo').eq('estado', 'activo'),
    // Vacía para quien no es admin (la vista pide es_admin()).
    supabase
      .from('v_compras_facturas')
      .select('id, pedido_id, proveedor_id, proveedor_nombre, pedido_numero, numero, fecha, tipo_comprobante, subtotal, iva, total, gasto_id, gasto_estado')
      .eq('estado', 'confirmada'),
  ])

  const proveedorPorItem: Record<string, string> = {}
  const stockMinimoPorItem: Record<string, number> = {}
  for (const v of vItems ?? []) {
    if (!v.id) continue
    proveedorPorItem[v.id] = v.proveedor_principal_nombre ?? '—'
    stockMinimoPorItem[v.id] = v.stock_minimo ?? 0
  }

  const pedidosReporte: PedidoReporte[] = (pedidos ?? []).map(p => ({
    ...p,
    created_at: p.created_at ?? '',
    estado_recepcion: aEstadoRecepcion(p.estado_recepcion),
    estado_facturacion: aEstadoFacturacion(p.estado_facturacion),
  }))

  // La vista tiene todas las columnas nullable en los tipos generados.
  const movimientosReporte: MovimientoReporte[] = (movimientos ?? []).flatMap(m =>
    m.id && m.item_id && m.created_at && esTipoMovimiento(m.tipo)
      ? [{
          id: m.id, item_id: m.item_id, delta: m.delta ?? 0, tipo: m.tipo, remito_id: m.remito_id, conteo_id: m.conteo_id,
          created_at: m.created_at, item_nombre: m.item_nombre, creado_por_nombre: m.creado_por_nombre,
        }]
      : [])

  const pedidoItemsReporte: PedidoItemRecibidoReporte[] = (pedidoItems ?? []).map(pi => ({
    ...pi,
    compras_pedidos: pi.compras_pedidos && {
      ...pi.compras_pedidos,
      estado_recepcion: aEstadoRecepcion(pi.compras_pedidos.estado_recepcion),
      estado_facturacion: aEstadoFacturacion(pi.compras_pedidos.estado_facturacion),
    },
  }))

  return (
    <ReportesClient
      remitosIniciales={remitos ?? []}
      pedidosIniciales={pedidosReporte}
      movimientosIniciales={movimientosReporte}
      stockInicial={stock ?? []}
      solicitudItemsIniciales={solicitudItems ?? []}
      pedidoItemsIniciales={pedidoItemsReporte}
      proveedorPorItem={proveedorPorItem}
      stockMinimoPorItem={stockMinimoPorItem}
      facturasIniciales={facturas ?? []}
      esAdmin={esAdmin}
    />
  )
}
