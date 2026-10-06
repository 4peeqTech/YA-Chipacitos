import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { aEstadoFacturacion, aEstadoRecepcion } from '@/lib/compras/estadoPedido'
import { esTipoMovimiento } from '@/lib/compras/movimientos'
import { diaSiguiente, rangoDeParams } from '@/lib/compras/rangoFechas'
import type { FacturaReporte, MovimientoReporte, PedidoItemRecibidoReporte, PedidoReporte } from '@/lib/compras/reportes'
import ReportesClient from './ReportesClient'

export const metadata = { title: 'Reportes | YA! Chipacitos' }

const COLUMNAS_PEDIDO = 'id, numero, proveedor_id, created_at, enviado_en, estado_recepcion, estado_facturacion, proveedores(nombre), compras_remitos(id, secuencia, fecha, compras_remito_items(descripcion, cantidad))'
const COLUMNAS_FACTURA = 'id, pedido_id, proveedor_id, proveedor_nombre, pedido_numero, numero, fecha, tipo_comprobante, subtotal, iva, total, gasto_id, gasto_estado, nc_gasto'
// Los ids viajan en la URL de PostgREST: en tandas para no pasarse de largo.
const TANDA = 100

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El gasto sale de las facturas (F5), que solo ve un administrador (P1).
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const esAdmin = perfil?.rol === 'admin'

  // B3: el período se filtra en la base, no en el navegador (los movimientos
  // crecen rápido). Los timestamptz se cortan por día UTC, como hacía el
  // filtro del cliente (created_at.slice(0, 10)).
  const { desde, hasta } = await searchParams
  const rango = rangoDeParams(desde, hasta, new Date())
  const hastaExclusivo = diaSiguiente(rango.hasta)

  const [
    { data: remitos },
    { data: pedidos },
    { data: porFacturar },
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
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta)
      .order('fecha', { ascending: false }),
    supabase
      .from('compras_pedidos')
      .select(COLUMNAS_PEDIDO)
      .gte('created_at', rango.desde)
      .lt('created_at', hastaExclusivo)
      .order('created_at', { ascending: false }),
    // "Recibidos sin facturar" es cómo está hoy, de cualquier fecha: solo los candidatos.
    supabase
      .from('compras_pedidos')
      .select(COLUMNAS_PEDIDO)
      .eq('estado_facturacion', 'sin_facturar')
      .in('estado_recepcion', ['recibido', 'cerrado_manual']),
    supabase
      .from('v_compras_stock_movimientos')
      .select('*')
      .gte('created_at', rango.desde)
      .lt('created_at', hastaExclusivo)
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
    // Las del período (Gasto por proveedor). Vacía para quien no es admin (la vista pide es_admin()).
    supabase
      .from('v_compras_facturas')
      .select(COLUMNAS_FACTURA)
      .eq('estado', 'confirmada')
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta),
  ])

  // El Historial muestra lo facturado de cada pedido del período, aunque la
  // factura sea de otra fecha.
  const pedidoIds = (pedidos ?? []).map(p => p.id)
  const facturasDePedidos: FacturaReporte[] = esAdmin
    ? (await Promise.all(
        Array.from({ length: Math.ceil(pedidoIds.length / TANDA) }, (_, i) =>
          supabase.from('v_compras_facturas').select(COLUMNAS_FACTURA).eq('estado', 'confirmada')
            .in('pedido_id', pedidoIds.slice(i * TANDA, (i + 1) * TANDA))),
      )).flatMap(t => t.data ?? [])
    : []

  const proveedorPorItem: Record<string, string> = {}
  const stockMinimoPorItem: Record<string, number> = {}
  for (const v of vItems ?? []) {
    if (!v.id) continue
    proveedorPorItem[v.id] = v.proveedor_principal_nombre ?? '—'
    stockMinimoPorItem[v.id] = v.stock_minimo ?? 0
  }

  const aPedidoReporte = (p: NonNullable<typeof pedidos>[number]): PedidoReporte => ({
    ...p,
    created_at: p.created_at ?? '',
    estado_recepcion: aEstadoRecepcion(p.estado_recepcion),
    estado_facturacion: aEstadoFacturacion(p.estado_facturacion),
  })

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
      rango={rango}
      remitos={remitos ?? []}
      pedidos={(pedidos ?? []).map(aPedidoReporte)}
      pedidosPorFacturar={(porFacturar ?? []).map(aPedidoReporte)}
      movimientos={movimientosReporte}
      stockInicial={stock ?? []}
      solicitudItemsIniciales={solicitudItems ?? []}
      pedidoItemsIniciales={pedidoItemsReporte}
      proveedorPorItem={proveedorPorItem}
      stockMinimoPorItem={stockMinimoPorItem}
      facturas={facturas ?? []}
      facturasDePedidos={facturasDePedidos}
      esAdmin={esAdmin}
    />
  )
}
