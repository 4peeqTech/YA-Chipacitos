export interface LineaRemitoReporte {
  descripcion: string
  cantidad: number
  precio: number | null
}

export interface RemitoReporte {
  id: string
  numero: string
  fecha: string
  compras_pedidos: { proveedor_id: string; proveedores: { nombre: string } | null } | null
  compras_remito_items: LineaRemitoReporte[]
}

export interface DetalleLineaGasto {
  remitoId: string
  remitoNumero: string
  descripcion: string
  cantidad: number
  precio: number
  subtotal: number
}

export interface GastoProveedor {
  proveedorId: string
  proveedorNombre: string
  remitosCount: number
  lineasConPrecio: number
  lineasSinPrecio: number
  gastoTotal: number
  detalle: DetalleLineaGasto[]
}

// Agrupa remitos por proveedor y suma cantidad × precio de sus líneas.
// Líneas sin precio (precio es opcional al registrar el remito) se
// cuentan en `lineasSinPrecio` pero no entran en `gastoTotal` — evita
// que el total se lea como exacto cuando en realidad es parcial.
export function calcularGastoPorProveedor(remitos: RemitoReporte[]): GastoProveedor[] {
  const porProveedor = new Map<string, GastoProveedor>()

  for (const remito of remitos) {
    const proveedorId = remito.compras_pedidos?.proveedor_id
    if (!proveedorId) continue
    const proveedorNombre = remito.compras_pedidos?.proveedores?.nombre ?? '—'

    let grupo = porProveedor.get(proveedorId)
    if (!grupo) {
      grupo = { proveedorId, proveedorNombre, remitosCount: 0, lineasConPrecio: 0, lineasSinPrecio: 0, gastoTotal: 0, detalle: [] }
      porProveedor.set(proveedorId, grupo)
    }
    grupo.remitosCount++

    for (const linea of remito.compras_remito_items) {
      if (linea.precio == null) {
        grupo.lineasSinPrecio++
        continue
      }
      const subtotal = linea.cantidad * linea.precio
      grupo.lineasConPrecio++
      grupo.gastoTotal += subtotal
      grupo.detalle.push({
        remitoId: remito.id,
        remitoNumero: remito.numero,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precio: linea.precio,
        subtotal,
      })
    }
  }

  return [...porProveedor.values()].sort((a, b) => b.gastoTotal - a.gastoTotal)
}

export interface PedidoReporte {
  id: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  created_at: string
  enviado_en: string | null
  cerrado_en: string | null
  proveedores: { nombre: string } | null
  compras_remitos: { id: string; numero: string; fecha: string; compras_remito_items: LineaRemitoReporte[] }[]
}

export interface RemitoResumen {
  remitoId: string
  numero: string
  fecha: string
  lineasCount: number
  gastoTotal: number
}

export interface HistorialPedido {
  pedidoId: string
  proveedorNombre: string
  estado: 'borrador' | 'enviado' | 'cerrado'
  createdAt: string
  enviadoEn: string | null
  cerradoEn: string | null
  remitosCount: number
  gastoTotal: number
  remitos: RemitoResumen[]
}

// Mismo cálculo que calcularGastoPorProveedor (cantidad × precio,
// ignorando líneas sin precio), a nivel de un solo remito.
function calcularGastoRemito(items: LineaRemitoReporte[]): number {
  return items.reduce((total, linea) => total + (linea.precio != null ? linea.cantidad * linea.precio : 0), 0)
}

export function calcularHistorialPedidos(pedidos: PedidoReporte[]): HistorialPedido[] {
  return pedidos.map(pedido => {
    const remitos = pedido.compras_remitos.map(remito => ({
      remitoId: remito.id,
      numero: remito.numero,
      fecha: remito.fecha,
      lineasCount: remito.compras_remito_items.length,
      gastoTotal: calcularGastoRemito(remito.compras_remito_items),
    }))

    return {
      pedidoId: pedido.id,
      proveedorNombre: pedido.proveedores?.nombre ?? '—',
      estado: pedido.estado,
      createdAt: pedido.created_at,
      enviadoEn: pedido.enviado_en,
      cerradoEn: pedido.cerrado_en,
      remitosCount: remitos.length,
      gastoTotal: remitos.reduce((total, r) => total + r.gastoTotal, 0),
      remitos,
    }
  })
}

export interface MovimientoReporte {
  id: string
  item_id: string
  delta: number
  tipo: 'entrada_remito' | 'ajuste_manual'
  remito_id: string | null
  created_at: string
  compras_items: { nombre: string; proveedores: { nombre: string } | null } | null
}

export interface MovimientoDetalle {
  movimientoId: string
  fecha: string
  tipo: 'entrada_remito' | 'ajuste_manual'
  delta: number
  remitoId: string | null
}

export interface MovimientoInsumo {
  itemId: string
  itemNombre: string
  proveedorNombre: string
  entradas: number
  ajustes: number
  balance: number
  stockActual: number
  movimientos: MovimientoDetalle[]
}

// Agrupa movimientos por insumo. Insumos sin ningún movimiento en la
// lista recibida no aparecen — el caller filtra `movimientos` por rango
// de fecha antes de llamar a esta función, así que "sin movimientos en
// la lista" ya significa "sin movimientos en el período elegido".
export function calcularMovimientoPorInsumo(
  movimientos: MovimientoReporte[],
  stockActualPorItem: Record<string, number>
): MovimientoInsumo[] {
  const porItem = new Map<string, MovimientoInsumo>()

  for (const mov of movimientos) {
    let grupo = porItem.get(mov.item_id)
    if (!grupo) {
      grupo = {
        itemId: mov.item_id,
        itemNombre: mov.compras_items?.nombre ?? '—',
        proveedorNombre: mov.compras_items?.proveedores?.nombre ?? '—',
        entradas: 0,
        ajustes: 0,
        balance: 0,
        stockActual: stockActualPorItem[mov.item_id] ?? 0,
        movimientos: [],
      }
      porItem.set(mov.item_id, grupo)
    }

    if (mov.tipo === 'entrada_remito') grupo.entradas += mov.delta
    else grupo.ajustes += mov.delta
    grupo.balance += mov.delta

    grupo.movimientos.push({
      movimientoId: mov.id,
      fecha: mov.created_at,
      tipo: mov.tipo,
      delta: mov.delta,
      remitoId: mov.remito_id,
    })
  }

  return [...porItem.values()].sort((a, b) => a.itemNombre.localeCompare(b.itemNombre))
}
