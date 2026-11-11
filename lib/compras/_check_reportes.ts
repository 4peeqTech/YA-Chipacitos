// Chequeo de las funciones puras de Reportes y de la Cuenta del proveedor (B3).
// Correr con: npx tsx lib/compras/_check_reportes.ts
import {
  estadoPago, resumirPagos, recibidoSinFacturar, contarPorEstado, calcularHistorialPedidos,
  calcularSugeridoVsRecibido, calcularGastoPorProveedor,
  type FacturaReporte, type PedidoReporte, type SolicitudItemReporte, type PedidoItemRecibidoReporte,
} from './reportes'
import { filtroDelPedido, type EstadoFacturacion, type EstadoRecepcion } from './estadoPedido'

const casos: { nombre: string; real: unknown; esperado: unknown }[] = []
const caso = (nombre: string, real: unknown, esperado: unknown) => casos.push({ nombre, real, esperado })

// 1. estadoPago: los 4 caminos.
caso('pago: sin gasto', estadoPago({ gasto_id: null, gasto_estado: null }), 'sin_gasto')
caso('pago: pagado', estadoPago({ gasto_id: 'g', gasto_estado: 'Pagado' }), 'pagado')
caso('pago: parcial', estadoPago({ gasto_id: 'g', gasto_estado: 'Parcial' }), 'parcial')
caso('pago: pendiente', estadoPago({ gasto_id: 'g', gasto_estado: 'Pendiente de pago' }), 'pendiente')

// 2. resumirPagos: 1 pagada + 1 pendiente + 1 parcial + 1 sin gasto + 1 NC pagada.
let n = 0
const factura = (p: Partial<FacturaReporte>): FacturaReporte => ({
  id: `f${++n}`, pedido_id: null, proveedor_id: 'A', proveedor_nombre: 'Prov A', pedido_numero: null, numero: `000${n}`,
  fecha: '2026-10-01', tipo_comprobante: 'factura', subtotal: 0, iva: 0, total: 0, gasto_id: null, gasto_estado: null, ...p,
})
const facturas = [
  factura({ total: 1000, gasto_id: 'g1', gasto_estado: 'Pagado' }),
  factura({ total: 500, gasto_id: 'g2', gasto_estado: 'Pendiente de pago' }),
  factura({ total: 300, gasto_id: 'g3', gasto_estado: 'Parcial' }),
  factura({ total: 200 }),
  factura({ total: 100, tipo_comprobante: 'nota_credito', gasto_id: 'g4', gasto_estado: 'Pagado' }),
]
const r = resumirPagos(facturas)
caso('resumen: facturado', r.facturado, 1900)
caso('resumen: la NC resta de pagado', r.pagado, 900)
caso('resumen: pendiente incluye parcial', r.pendiente, 800)
caso('resumen: parcial aparte', r.parcial, 300)
caso('resumen: sin gasto', r.sinGasto, 200)
caso('resumen: invariante', r.facturado === r.pagado + r.pendiente + r.sinGasto, true)
caso('resumen: cuenta las facturas', r.facturas, 5)

// 3. recibidoSinFacturar = filtroDelPedido === 'por_facturar' en todos los cruces.
const RECEPCION: EstadoRecepcion[] = ['sin_enviar', 'enviado', 'parcial', 'recibido', 'cerrado_manual', 'devuelto']
const FACTURACION: EstadoFacturacion[] = ['sin_facturar', 'facturado']
let coinciden = 0
let cruces = 0
for (const er of RECEPCION) for (const ef of FACTURACION) for (const remitos of [[], [{ id: 'r' }]]) {
  cruces++
  const a = recibidoSinFacturar({ estado_recepcion: er, estado_facturacion: ef, compras_remitos: remitos })
  const b = filtroDelPedido({ estado_recepcion: er, estado_facturacion: ef, recibioAlgo: remitos.length > 0 }) === 'por_facturar'
  if (a === b) coinciden++
}
caso(`recibidoSinFacturar = Por facturar (${cruces} cruces)`, coinciden, cruces)
caso('cerrado a mano con remito → sin factura', recibidoSinFacturar({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', compras_remitos: [{}] }), true)
caso('cerrado a mano sin remito → no', recibidoSinFacturar({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', compras_remitos: [] }), false)

// 4. contarPorEstado en un set con los 7 estados.
const conteo = contarPorEstado([
  { estado_recepcion: 'sin_enviar', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'enviado', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'enviado', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'parcial', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'recibido', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar' },
  { estado_recepcion: 'recibido', estado_facturacion: 'facturado' },
  { estado_recepcion: 'devuelto', estado_facturacion: 'facturado' },
])
caso('conteo por estado', JSON.stringify(conteo), JSON.stringify({ sin_enviar: 1, enviado: 2, parcial: 1, recibido: 1, cerrado: 1, facturado: 1, devuelto: 1 }))
caso('conteo vacío tiene los 7 en 0', Object.values(contarPorEstado([])).join(','), '0,0,0,0,0,0,0')

// 5. Historial: último remito.
const pedido = (p: Partial<PedidoReporte>): PedidoReporte => ({
  id: 'p1', numero: 7, estado_recepcion: 'parcial', estado_facturacion: 'sin_facturar', proveedor_id: 'A',
  created_at: '2026-10-01T10:00:00Z', enviado_en: null, proveedores: { nombre: 'Prov A' }, compras_remitos: [], ...p,
})
const remito = (id: string, fecha: string) => ({ id, secuencia: 1, fecha, compras_remito_items: [] })
const [conRemitos] = calcularHistorialPedidos([pedido({ compras_remitos: [remito('r1', '2026-10-02'), remito('r2', '2026-10-04'), remito('r3', '2026-10-03')] })])
caso('historial: último remito es el más nuevo', conRemitos.ultimoRemito, '2026-10-04')
caso('historial: estado visible', conRemitos.estado, 'parcial')
caso('historial: sin remitos → null', calcularHistorialPedidos([pedido({})])[0].ultimoRemito, null)

// 6. Sugerido vs. recibido.
const solicitud = { tipo: 'complementario', fabrica_conteos: { semana_desde: '2026-09-28', semana_hasta: '2026-10-04' } }
const si = (id: string, item: string, sugerida: number): SolicitudItemReporte => ({
  id, solicitud_id: 's1', item_id: item, descripcion: `Insumo ${item}`, cantidad_sugerida: sugerida, compras_solicitudes: solicitud,
})
const pi = (sid: string | null, cantidad: number, recibidos: number[], er: EstadoRecepcion = 'recibido'): PedidoItemRecibidoReporte => ({
  solicitud_item_id: sid, cantidad,
  compras_remito_items: recibidos.map(c => ({ cantidad: c })),
  compras_pedidos: { estado_recepcion: er, estado_facturacion: 'sin_facturar', compras_remitos: recibidos.map((_, i) => ({ id: `r${i}` })) },
})
const svr = calcularSugeridoVsRecibido(
  [si('a', 'X', 10), si('b', 'Y', 5), si('c', 'Z', 4)],
  [
    pi('a', 12, [5, 4]),             // sugerido 10, pedido 12, recibido 9
    pi(null, 3, [3]),                // agregada a mano: no suma
    pi('b', 2, [2], 'parcial'),      // dos líneas de pedido para la misma de solicitud
    pi('b', 3, [], 'enviado'),
  ],
)
const fila = (item: string) => svr.find(f => f.itemId === item)!
caso('svr: diferencia = recibido − sugerido', fila('X').diferencia, -1)
caso('svr: pedido como dato', fila('X').pedido, 12)
caso('svr: recibido', fila('X').recibido, 9)
caso('svr: recibido no está en camino', fila('X').enCamino, false)
caso('svr: dos líneas se suman (pedido)', fila('Y').pedido, 5)
caso('svr: dos líneas se suman (recibido)', fila('Y').recibido, 2)
caso('svr: parcial → en camino', fila('Y').enCamino, true)
caso('svr: sin pedido → 0 y 0', `${fila('Z').pedido}/${fila('Z').recibido}`, '0/0')
caso('svr: la línea a mano no aparece', svr.length, 3)

// 7. Gasto por proveedor y resumirPagos dan lo mismo por proveedor (E12).
const otras = [factura({ proveedor_id: 'B', proveedor_nombre: 'Prov B', total: 700, gasto_id: 'g9', gasto_estado: 'Pagado' }), factura({ proveedor_id: 'B', proveedor_nombre: 'Prov B', total: 50 })]
const gasto = calcularGastoPorProveedor([...facturas, ...otras])
for (const g of gasto) {
  const propio = resumirPagos([...facturas, ...otras].filter(f => f.proveedor_id === g.proveedorId))
  caso(`gasto ${g.proveedorNombre} = cuenta`, `${g.total}|${g.pagado}|${g.pendiente}|${g.parcial}|${g.sinGasto}|${g.aFavor}`,
    `${propio.facturado}|${propio.pagado}|${propio.pendiente}|${propio.parcial}|${propio.sinGasto}|${propio.aFavor}`)
}

// 8. B4 (E10/E11): la NC hereda el gasto de su factura origen; "a favor" si llegó con el gasto pagado.
const nc = (p: Partial<FacturaReporte>) => factura({ tipo_comprobante: 'nota_credito', proveedor_id: 'C', ...p })
caso('B4 pago: NC a favor', estadoPago({ gasto_id: 'g', gasto_estado: 'Pagado', tipo_comprobante: 'nota_credito', nc_gasto: 'a_favor' }), 'a_favor')
caso('B4 pago: NC descontada de un pendiente', estadoPago({ gasto_id: 'g', gasto_estado: 'Pendiente de pago', tipo_comprobante: 'nota_credito', nc_gasto: 'descontado' }), 'pendiente')
caso('B4 pago: NC que canceló el gasto', estadoPago({ gasto_id: 'g', gasto_estado: 'Pagado', tipo_comprobante: 'nota_credito', nc_gasto: 'cancelo_gasto' }), 'pagado')
caso('B4 pago: NC de factura sin gasto', estadoPago({ gasto_id: null, gasto_estado: null, tipo_comprobante: 'nota_credito', nc_gasto: 'sin_gasto' }), 'sin_gasto')
caso('B4 pago: a_favor solo aplica a NC', estadoPago({ gasto_id: 'g', gasto_estado: 'Pagado', tipo_comprobante: 'factura', nc_gasto: 'a_favor' }), 'pagado')
// Factura 100 pendiente + NC 20 descontada → Pendiente 80 (= el monto del gasto).
const pendNc = resumirPagos([
  factura({ proveedor_id: 'C', total: 100, gasto_id: 'gC', gasto_estado: 'Pendiente de pago' }),
  nc({ total: 20, gasto_id: 'gC', gasto_estado: 'Pendiente de pago', nc_gasto: 'descontado' }),
])
caso('B4 resumen: pendiente con NC descontada = 80', pendNc.pendiente, 80)
// … y después se paga: Pagado 80.
const pagadaNc = resumirPagos([
  factura({ proveedor_id: 'C', total: 100, gasto_id: 'gC', gasto_estado: 'Pagado' }),
  nc({ total: 20, gasto_id: 'gC', gasto_estado: 'Pagado', nc_gasto: 'descontado' }),
])
caso('B4 resumen: se paga después → pagado 80', `${pagadaNc.pagado}|${pagadaNc.pendiente}|${pagadaNc.aFavor}`, '80|0|0')
// Se pagó antes (D5): Pagado 100 y A favor −20.
const aFavor = resumirPagos([
  factura({ proveedor_id: 'C', total: 100, gasto_id: 'gC', gasto_estado: 'Pagado' }),
  nc({ total: 20, gasto_id: 'gC', gasto_estado: 'Pagado', nc_gasto: 'a_favor' }),
])
caso('B4 resumen: a favor', `${aFavor.pagado}|${aFavor.aFavor}|${aFavor.facturado}`, '100|-20|80')
caso('B4 resumen: invariante con a favor', aFavor.facturado === aFavor.pagado + aFavor.pendiente + aFavor.sinGasto + aFavor.aFavor, true)
// D4: la NC canceló el gasto (queda Pagado en $ 0): factura 100 pagada − NC 100 = 0.
const cancelo = resumirPagos([
  factura({ proveedor_id: 'C', total: 100, gasto_id: 'gC', gasto_estado: 'Pagado' }),
  nc({ total: 100, gasto_id: 'gC', gasto_estado: 'Pagado', nc_gasto: 'cancelo_gasto' }),
])
caso('B4 resumen: NC canceló el gasto', `${cancelo.pagado}|${cancelo.facturado}`, '0|0')
// Revisión B4: factura 1000 con NC 200 sin gasto; después se vincula un gasto de 1000 a la factura.
// La NC hereda ese gasto en la vista, pero no lo descontó: queda "sin gasto" y el pendiente es 1000, como en Gastos.
caso('B4 pago: NC sin gasto con gasto heredado', estadoPago({ gasto_id: 'gD', gasto_estado: 'Pendiente de pago', tipo_comprobante: 'nota_credito', nc_gasto: 'sin_gasto' }), 'sin_gasto')
const sinGastoNc = resumirPagos([
  factura({ proveedor_id: 'D', total: 1000, gasto_id: 'gD', gasto_estado: 'Pendiente de pago' }),
  nc({ proveedor_id: 'D', total: 200, gasto_id: 'gD', gasto_estado: 'Pendiente de pago', nc_gasto: 'sin_gasto' }),
])
caso('B4 resumen: NC sin gasto no baja el pendiente del gasto', `${sinGastoNc.pendiente}|${sinGastoNc.sinGasto}|${sinGastoNc.facturado}`, '1000|-200|800')
const gastoC = calcularGastoPorProveedor([
  factura({ proveedor_id: 'C', proveedor_nombre: 'Prov C', total: 100, gasto_id: 'gC', gasto_estado: 'Pagado' }),
  nc({ proveedor_nombre: 'Prov C', total: 20, gasto_id: 'gC', gasto_estado: 'Pagado', nc_gasto: 'a_favor' }),
])[0]
caso('B4 gasto por proveedor: a favor', `${gastoC.total}|${gastoC.pagado}|${gastoC.aFavor}`, '80|100|-20')
caso('B4 gasto por proveedor: detalle de la NC a favor', gastoC.detalle.find(d => d.esNotaCredito)?.pago, 'a_favor')

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
