import { codigoRemito } from './codigos'
import { grupoMovimiento, type TipoMovimiento } from './movimientos'

// F5: el gasto sale de las facturas confirmadas, nunca del remito (el precio vive
// solo en la factura). Las notas de crédito (F6) restan.

export interface FacturaReporte {
  id: string | null
  pedido_id: string | null
  proveedor_id: string | null
  proveedor_nombre: string | null
  pedido_numero: number | null
  numero: string | null
  fecha: string | null
  tipo_comprobante: string | null
  subtotal: number | null
  iva: number | null
  total: number | null
}

export interface RemitoReporte {
  id: string
  secuencia: number
  fecha: string
}

export interface DetalleFacturaGasto {
  facturaId: string
  numero: string
  pedidoId: string | null
  pedidoNumero: number | null
  fecha: string
  esNotaCredito: boolean
  subtotal: number
  iva: number
  total: number
}

export interface GastoProveedor {
  proveedorId: string
  proveedorNombre: string
  facturasCount: number
  subtotal: number
  iva: number
  total: number
  /** Pedidos que ya recibieron mercadería y todavía no tienen factura: su gasto falta acá. */
  recibidosSinFacturar: number
  detalle: DetalleFacturaGasto[]
}

export interface PedidoReporte {
  id: string
  numero: number
  estado: 'borrador' | 'enviado' | 'cerrado'
  estado_recepcion: string
  estado_facturacion: string
  proveedor_id: string
  created_at: string
  enviado_en: string | null
  cerrado_en: string | null
  proveedores: { nombre: string } | null
  compras_remitos: { id: string; secuencia: number; fecha: string; compras_remito_items: { descripcion: string; cantidad: number }[] }[]
}

/** Llegó mercadería y no tiene factura: recibido completo, o cerrado a mano con algún remito. */
export function recibidoSinFacturar(p: Pick<PedidoReporte, 'estado_recepcion' | 'estado_facturacion' | 'compras_remitos'>): boolean {
  if (p.estado_facturacion === 'facturado') return false
  return p.estado_recepcion === 'recibido' || (p.estado_recepcion === 'cerrado_manual' && p.compras_remitos.length > 0)
}

function signo(f: Pick<FacturaReporte, 'tipo_comprobante'>): number {
  return f.tipo_comprobante === 'nota_credito' ? -1 : 1
}

// Agrupa las facturas confirmadas por proveedor. Los pedidos recibidos sin
// factura se cuentan aparte: su plata todavía no está en el total, y el
// reporte lo tiene que decir en vez de mostrar un total que parece completo.
export function calcularGastoPorProveedor(facturas: FacturaReporte[], pedidos: PedidoReporte[] = []): GastoProveedor[] {
  const porProveedor = new Map<string, GastoProveedor>()
  const grupo = (id: string, nombre: string): GastoProveedor => {
    let g = porProveedor.get(id)
    if (!g) {
      g = { proveedorId: id, proveedorNombre: nombre, facturasCount: 0, subtotal: 0, iva: 0, total: 0, recibidosSinFacturar: 0, detalle: [] }
      porProveedor.set(id, g)
    }
    return g
  }

  for (const f of facturas) {
    if (!f.id || !f.proveedor_id) continue
    const g = grupo(f.proveedor_id, f.proveedor_nombre ?? '—')
    const s = signo(f)
    const subtotal = s * (f.subtotal ?? 0)
    const iva = s * (f.iva ?? 0)
    const total = s * (f.total ?? 0)
    g.facturasCount++
    g.subtotal += subtotal
    g.iva += iva
    g.total += total
    g.detalle.push({
      facturaId: f.id,
      numero: f.numero ?? '—',
      pedidoId: f.pedido_id,
      pedidoNumero: f.pedido_numero,
      fecha: f.fecha ?? '',
      esNotaCredito: s < 0,
      subtotal,
      iva,
      total,
    })
  }

  for (const p of pedidos) {
    if (!recibidoSinFacturar(p)) continue
    grupo(p.proveedor_id, p.proveedores?.nombre ?? '—').recibidosSinFacturar++
  }

  for (const g of porProveedor.values()) g.detalle.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return [...porProveedor.values()].sort((a, b) => b.total - a.total || a.proveedorNombre.localeCompare(b.proveedorNombre))
}

export interface RemitoResumen {
  remitoId: string
  /** Código R-0001-01. */
  numero: string
  fecha: string
  lineasCount: number
}

export interface HistorialPedido {
  pedidoId: string
  numero: number
  proveedorNombre: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  createdAt: string
  enviadoEn: string | null
  cerradoEn: string | null
  remitosCount: number
  /** Total de su factura confirmada; null si todavía no se facturó (o si quien mira no ve facturas). */
  facturado: number | null
  remitos: RemitoResumen[]
}

export function calcularHistorialPedidos(pedidos: PedidoReporte[], facturas: FacturaReporte[] = []): HistorialPedido[] {
  const facturadoPorPedido = new Map<string, number>()
  for (const f of facturas) {
    if (!f.pedido_id) continue
    facturadoPorPedido.set(f.pedido_id, (facturadoPorPedido.get(f.pedido_id) ?? 0) + signo(f) * (f.total ?? 0))
  }

  return pedidos.map(pedido => {
    const remitos = pedido.compras_remitos.map(remito => ({
      remitoId: remito.id,
      numero: codigoRemito(pedido.numero, remito.secuencia),
      fecha: remito.fecha,
      lineasCount: remito.compras_remito_items.length,
    }))

    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      proveedorNombre: pedido.proveedores?.nombre ?? '—',
      estado: pedido.estado,
      createdAt: pedido.created_at,
      enviadoEn: pedido.enviado_en,
      cerradoEn: pedido.cerrado_en,
      remitosCount: remitos.length,
      facturado: facturadoPorPedido.get(pedido.id) ?? null,
      remitos,
    }
  })
}

export type { TipoMovimiento }

export interface MovimientoReporte {
  id: string
  item_id: string
  delta: number
  tipo: TipoMovimiento
  remito_id: string | null
  conteo_id: string | null
  created_at: string
  item_nombre: string | null
  creado_por_nombre: string | null
}

export interface MovimientoDetalle {
  movimientoId: string
  fecha: string
  tipo: TipoMovimiento
  delta: number
  remitoId: string | null
  creadoPorNombre: string | null
}

export interface MovimientoInsumo {
  itemId: string
  itemNombre: string
  proveedorNombre: string
  entradas: number
  conteosFabrica: number
  ajustes: number
  devoluciones: number
  apertura: number
  balance: number
  stockActual: number
  movimientos: MovimientoDetalle[]
}

// Agrupa movimientos por insumo. Insumos sin ningún movimiento en la
// lista recibida no aparecen — el caller filtra `movimientos` por rango
// de fecha antes de llamar a esta función, así que "sin movimientos en
// la lista" ya significa "sin movimientos en el período elegido".
// proveedorPorItem viene de v_compras_items (proveedor_principal_nombre) —
// el insumo puede tener varios proveedores desde que existe compras_item_proveedores,
// acá se muestra el principal.
export function calcularMovimientoPorInsumo(
  movimientos: MovimientoReporte[],
  stockActualPorItem: Record<string, number>,
  proveedorPorItem: Record<string, string>
): MovimientoInsumo[] {
  const porItem = new Map<string, MovimientoInsumo>()

  for (const mov of movimientos) {
    let grupo = porItem.get(mov.item_id)
    if (!grupo) {
      grupo = {
        itemId: mov.item_id,
        itemNombre: mov.item_nombre ?? '—',
        proveedorNombre: proveedorPorItem[mov.item_id] ?? '—',
        entradas: 0,
        conteosFabrica: 0,
        ajustes: 0,
        devoluciones: 0,
        apertura: 0,
        balance: 0,
        stockActual: stockActualPorItem[mov.item_id] ?? 0,
        movimientos: [],
      }
      porItem.set(mov.item_id, grupo)
    }

    grupo[grupoMovimiento(mov.tipo)] += mov.delta
    grupo.balance += mov.delta

    grupo.movimientos.push({
      movimientoId: mov.id,
      fecha: mov.created_at,
      tipo: mov.tipo,
      delta: mov.delta,
      remitoId: mov.remito_id,
      creadoPorNombre: mov.creado_por_nombre,
    })
  }

  return [...porItem.values()].sort((a, b) => a.itemNombre.localeCompare(b.itemNombre))
}

export interface SolicitudItemReporte {
  solicitud_id: string
  item_id: string | null
  descripcion: string
  cantidad_sugerida: number
  compras_solicitudes: {
    tipo: 'complementario' | 'base'
    fabrica_conteos: { semana_desde: string; semana_hasta: string } | null
  } | null
}

export interface PedidoItemCompradoReporte {
  item_id: string | null
  cantidad: number
  compras_pedidos: { solicitud_id: string | null } | null
}

export interface SugeridoVsComprado {
  clave: string // "semana_desde al semana_hasta" o "Pedido base"
  itemId: string
  itemNombre: string
  sugerido: number
  comprado: number
  diferencia: number // comprado - sugerido: positivo = se compró de más frente a lo sugerido
}

// Compara, por semana (o por el pedido base), cuánto sugirió el cierre del
// conteo contra cuánto terminó comprándose realmente — la calibración de
// `compras_items.coeficiente` se hace mirando este desvío, no adivinando.
// El cruce es por (solicitud_id, item_id): cada línea de compras_pedido_items
// solo cuenta si su pedido nació de una solicitud (compras_pedidos.solicitud_id),
// los pedidos armados a mano fuera del circuito de solicitudes no entran acá.
export function calcularSugeridoVsComprado(
  solicitudItems: SolicitudItemReporte[],
  pedidoItems: PedidoItemCompradoReporte[]
): SugeridoVsComprado[] {
  const compradoPorSolicitudItem = new Map<string, number>()
  for (const pi of pedidoItems) {
    const solicitudId = pi.compras_pedidos?.solicitud_id
    if (!solicitudId || !pi.item_id) continue
    const clave = `${solicitudId}|${pi.item_id}`
    compradoPorSolicitudItem.set(clave, (compradoPorSolicitudItem.get(clave) ?? 0) + pi.cantidad)
  }

  const porClaveItem = new Map<string, SugeridoVsComprado>()
  for (const si of solicitudItems) {
    if (!si.item_id) continue
    const semana = si.compras_solicitudes?.fabrica_conteos
    const clave = semana ? `${semana.semana_desde} al ${semana.semana_hasta}` : 'Pedido base'
    const key = `${clave}|${si.item_id}`

    let grupo = porClaveItem.get(key)
    if (!grupo) {
      grupo = { clave, itemId: si.item_id, itemNombre: si.descripcion, sugerido: 0, comprado: 0, diferencia: 0 }
      porClaveItem.set(key, grupo)
    }
    grupo.sugerido += si.cantidad_sugerida
    grupo.comprado += compradoPorSolicitudItem.get(`${si.solicitud_id}|${si.item_id}`) ?? 0
  }

  const resultado = [...porClaveItem.values()]
  for (const grupo of resultado) grupo.diferencia = grupo.comprado - grupo.sugerido

  return resultado.sort((a, b) => b.clave.localeCompare(a.clave) || a.itemNombre.localeCompare(b.itemNombre))
}
