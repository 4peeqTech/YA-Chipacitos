import { codigoRemito } from './codigos'
import { grupoMovimiento, type TipoMovimiento } from './movimientos'
import {
  estadoVisible, filtroDelPedido, pedidoAbierto, ESTADOS_VISIBLES,
  type EstadoFacturacion, type EstadoRecepcion, type EstadoVisible,
} from './estadoPedido'

// F5: el gasto sale de las facturas confirmadas, nunca del remito (el precio vive
// solo en la factura). Las notas de crédito (F6) restan.
// Chequeo: `npx tsx lib/compras/_check_reportes.ts`.

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
  /** Gasto que generó (o al que se vinculó). Null si no tiene: se borró, o nunca se generó. */
  gasto_id: string | null
  gasto_estado: string | null
}

export interface RemitoReporte {
  id: string
  secuencia: number
  fecha: string
}

// ---------------------------------------------------------------------------
// Pagos (B3, E11/E12): una sola función para la Cuenta del proveedor y para
// "Gasto por proveedor", así nunca dan números distintos.
// ---------------------------------------------------------------------------

/** Cómo está pagada una factura, según su gasto. "Parcial" no tiene monto: cuenta como pendiente. */
export type EstadoPago = 'pagado' | 'pendiente' | 'parcial' | 'sin_gasto'

export function estadoPago(f: { gasto_id: string | null; gasto_estado: string | null }): EstadoPago {
  if (!f.gasto_id) return 'sin_gasto'
  if (f.gasto_estado === 'Pagado') return 'pagado'
  if (f.gasto_estado === 'Parcial') return 'parcial'
  return 'pendiente'
}

export interface ResumenPagos {
  facturado: number
  pagado: number
  /** Incluye lo de gastos marcados Parcial (no hay montos de pago parcial). */
  pendiente: number
  /** La parte de `pendiente` que viene de gastos marcados Parcial. */
  parcial: number
  /** Facturas confirmadas sin gasto: no se pueden dar por pagadas ni por debidas. */
  sinGasto: number
  facturas: number
}

/** Con signo (las NC restan). Invariante: facturado = pagado + pendiente + sinGasto. */
export function resumirPagos(facturas: FacturaReporte[]): ResumenPagos {
  const r: ResumenPagos = { facturado: 0, pagado: 0, pendiente: 0, parcial: 0, sinGasto: 0, facturas: 0 }
  for (const f of facturas) {
    const total = signo(f) * (f.total ?? 0)
    r.facturado += total
    r.facturas++
    const pago = estadoPago(f)
    if (pago === 'pagado') r.pagado += total
    else if (pago === 'sin_gasto') r.sinGasto += total
    else {
      r.pendiente += total
      if (pago === 'parcial') r.parcial += total
    }
  }
  return r
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
  gastoId: string | null
  gastoEstado: string | null
  pago: EstadoPago
}

export interface GastoProveedor {
  proveedorId: string
  proveedorNombre: string
  facturasCount: number
  subtotal: number
  iva: number
  total: number
  pagado: number
  pendiente: number
  parcial: number
  sinGasto: number
  /** Pedidos que ya recibieron mercadería y todavía no tienen factura: su gasto falta acá. */
  recibidosSinFacturar: number
  detalle: DetalleFacturaGasto[]
}

export interface PedidoReporte {
  id: string
  numero: number
  estado_recepcion: EstadoRecepcion
  estado_facturacion: EstadoFacturacion
  proveedor_id: string
  created_at: string
  enviado_en: string | null
  proveedores: { nombre: string } | null
  compras_remitos: { id: string; secuencia: number; fecha: string; compras_remito_items: { descripcion: string; cantidad: number }[] }[]
}

type EstadosDePedido = Pick<PedidoReporte, 'estado_recepcion' | 'estado_facturacion'> & { compras_remitos: readonly unknown[] }

/** Llegó mercadería y no tiene factura: lo mismo que la pestaña "Por facturar" de Pedidos (E14). */
export function recibidoSinFacturar(p: EstadosDePedido): boolean {
  return filtroDelPedido({ ...p, recibioAlgo: p.compras_remitos.length > 0 }) === 'por_facturar'
}

/** Pedidos por estado visible, con los 7 estados presentes aunque estén en 0. */
export function contarPorEstado(pedidos: Pick<PedidoReporte, 'estado_recepcion' | 'estado_facturacion'>[]): Record<EstadoVisible, number> {
  const c = Object.fromEntries(ESTADOS_VISIBLES.map(e => [e, 0])) as Record<EstadoVisible, number>
  for (const p of pedidos) c[estadoVisible(p)]++
  return c
}

function signo(f: Pick<FacturaReporte, 'tipo_comprobante'>): number {
  return f.tipo_comprobante === 'nota_credito' ? -1 : 1
}

// Agrupa las facturas confirmadas por proveedor. Los pedidos recibidos sin
// factura se cuentan aparte: su plata todavía no está en el total, y el
// reporte lo tiene que decir en vez de mostrar un total que parece completo.
export function calcularGastoPorProveedor(facturas: FacturaReporte[], pedidos: PedidoReporte[] = []): GastoProveedor[] {
  const porProveedor = new Map<string, GastoProveedor>()
  const facturasDe = new Map<string, FacturaReporte[]>()
  const grupo = (id: string, nombre: string): GastoProveedor => {
    let g = porProveedor.get(id)
    if (!g) {
      g = {
        proveedorId: id, proveedorNombre: nombre, facturasCount: 0, subtotal: 0, iva: 0, total: 0,
        pagado: 0, pendiente: 0, parcial: 0, sinGasto: 0, recibidosSinFacturar: 0, detalle: [],
      }
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
    facturasDe.set(f.proveedor_id, [...(facturasDe.get(f.proveedor_id) ?? []), f])
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
      gastoId: f.gasto_id,
      gastoEstado: f.gasto_estado,
      pago: estadoPago(f),
    })
  }

  // E12: los montos de pago salen de resumirPagos, igual que en la Cuenta.
  for (const [id, lista] of facturasDe) {
    const r = resumirPagos(lista)
    const g = porProveedor.get(id)!
    g.pagado = r.pagado
    g.pendiente = r.pendiente
    g.parcial = r.parcial
    g.sinGasto = r.sinGasto
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
  proveedorId: string
  proveedorNombre: string
  estado: EstadoVisible
  createdAt: string
  enviadoEn: string | null
  /** Fecha del remito más reciente (B3: reemplaza a cerrado_en, que era del estado viejo). */
  ultimoRemito: string | null
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
    const ultimoRemito = remitos.reduce<string | null>((max, r) => (max == null || r.fecha > max ? r.fecha : max), null)

    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      proveedorId: pedido.proveedor_id,
      proveedorNombre: pedido.proveedores?.nombre ?? '—',
      estado: estadoVisible(pedido),
      createdAt: pedido.created_at,
      enviadoEn: pedido.enviado_en,
      ultimoRemito,
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
  id: string
  solicitud_id: string
  item_id: string | null
  descripcion: string
  cantidad_sugerida: number
  compras_solicitudes: {
    tipo: string
    fabrica_conteos: { semana_desde: string; semana_hasta: string } | null
  } | null
}

export interface PedidoItemRecibidoReporte {
  solicitud_item_id: string | null
  cantidad: number
  compras_remito_items: { cantidad: number }[]
  compras_pedidos: { estado_recepcion: EstadoRecepcion; estado_facturacion: EstadoFacturacion; compras_remitos: { id: string }[] } | null
}

export interface SugeridoVsRecibido {
  clave: string // "semana_desde al semana_hasta" o "Pedido base"
  itemId: string
  itemNombre: string
  sugerido: number
  /** Lo que se pidió: dato de referencia (D4), no entra en la diferencia. */
  pedido: number
  /** Lo que llegó en los remitos de esas líneas. */
  recibido: number
  diferencia: number // recibido - sugerido: positivo = llegó de más frente a lo sugerido
  /** Alguna de sus líneas es de un pedido que todavía espera mercadería. */
  enCamino: boolean
}

// Compara, por semana (o por el pedido base), cuánto sugirió el cierre del
// conteo contra cuánto llegó de verdad (B3, E15). El cruce es por
// solicitud_item_id: una línea agregada a mano al pedido no cuenta, y tampoco
// lo recibido como línea libre del remito (sin pedido_item_id).
export function calcularSugeridoVsRecibido(
  solicitudItems: SolicitudItemReporte[],
  pedidoItems: PedidoItemRecibidoReporte[]
): SugeridoVsRecibido[] {
  const porSolicitudItem = new Map<string, { pedido: number; recibido: number; enCamino: boolean }>()
  for (const pi of pedidoItems) {
    if (!pi.solicitud_item_id) continue
    const acc = porSolicitudItem.get(pi.solicitud_item_id) ?? { pedido: 0, recibido: 0, enCamino: false }
    acc.pedido += pi.cantidad
    acc.recibido += pi.compras_remito_items.reduce((t, r) => t + r.cantidad, 0)
    const p = pi.compras_pedidos
    if (p && (p.estado_recepcion === 'enviado' || p.estado_recepcion === 'parcial')
      && pedidoAbierto({ ...p, recibioAlgo: p.compras_remitos.length > 0 })) acc.enCamino = true
    porSolicitudItem.set(pi.solicitud_item_id, acc)
  }

  const porClaveItem = new Map<string, SugeridoVsRecibido>()
  for (const si of solicitudItems) {
    if (!si.item_id) continue
    const semana = si.compras_solicitudes?.fabrica_conteos
    const clave = semana ? `${semana.semana_desde} al ${semana.semana_hasta}` : 'Pedido base'
    const key = `${clave}|${si.item_id}`

    let grupo = porClaveItem.get(key)
    if (!grupo) {
      grupo = { clave, itemId: si.item_id, itemNombre: si.descripcion, sugerido: 0, pedido: 0, recibido: 0, diferencia: 0, enCamino: false }
      porClaveItem.set(key, grupo)
    }
    const acc = porSolicitudItem.get(si.id)
    grupo.sugerido += si.cantidad_sugerida
    grupo.pedido += acc?.pedido ?? 0
    grupo.recibido += acc?.recibido ?? 0
    grupo.enCamino ||= acc?.enCamino ?? false
  }

  const resultado = [...porClaveItem.values()]
  for (const grupo of resultado) grupo.diferencia = grupo.recibido - grupo.sugerido

  return resultado.sort((a, b) => b.clave.localeCompare(a.clave) || a.itemNombre.localeCompare(b.itemNombre))
}
