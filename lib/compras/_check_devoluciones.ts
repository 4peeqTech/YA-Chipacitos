// Chequeo de las funciones puras de devoluciones y notas de crédito (B4).
// Correr con: npx tsx lib/compras/_check_devoluciones.ts
// Los números de la NC son los mismos que da la RPC en docs/bloque2/escenarios-B4.sql.
import {
  armarNotaCredito, bloqueoAnularNc, efectoDeMotivo, estadoRecepcionConDevolucion, flagsDeEfecto, impactoGasto,
  kgFueraDeRango, lineasDevolvibles, lineasPrecio, recepcionDespues, sugerenciaDesdeDiferencia, textoImpactoEstado,
  textoLineaDevolucion, topeNotaCredito,
  type DevolucionDev, type FacturaDev, type LineaPedidoDev, type Motivo,
} from './devoluciones'
import { codigoDevolucion } from './codigos'
import { formatearMonedaExacta } from '@/lib/formato'

const casos: { nombre: string; real: unknown; esperado: unknown }[] = []
const caso = (nombre: string, real: unknown, esperado: unknown) => casos.push({ nombre, real, esperado })

// --- Motivos
caso('efecto: mercadería', efectoDeMotivo({ devuelve_mercaderia: true, corrige_precio: false }), 'mercaderia')
caso('efecto: no entregado', efectoDeMotivo({ devuelve_mercaderia: false, corrige_precio: false }), 'no_entregado')
caso('efecto: precio', efectoDeMotivo({ devuelve_mercaderia: false, corrige_precio: true }), 'precio')
caso('flags de precio', JSON.stringify(flagsDeEfecto('precio')), '{"devuelve_mercaderia":false,"corrige_precio":true}')
caso('código', codigoDevolucion(37, 1), 'D-0037-01')

// --- Datos: P-0037 de juguete (Queso Barra 2 Caja por kg + Fécula 3 Bolsa)
const QB = 'qb'
const FEC = 'fec'
const pedido: LineaPedidoDev[] = [
  { pedidoItemId: 'pq', itemId: QB, descripcion: 'Queso Barra', unidad: 'Caja', cantidad: 2, recibido: 2, devuelto: 0, devueltoSinRepone: 0, cobraPor: 'base' },
  { pedidoItemId: 'pf', itemId: FEC, descripcion: 'Fécula', unidad: 'Bolsa', cantidad: 3, recibido: 3, devuelto: 0, devueltoSinRepone: 0, cobraPor: 'unidad' },
]
const recibidos = [
  { itemId: QB, descripcion: 'Queso Barra', unidad: 'Caja', cantidad: 2 },
  { itemId: FEC, descripcion: 'Fécula', unidad: 'Bolsa', cantidad: 3 },
]
const factura: FacturaDev = {
  id: 'f1', numero: 'A2B-QA-0001', total: 59411,
  lineas: [
    { id: 'fq', itemId: QB, pedidoItemId: 'pq', descripcion: 'Queso Barra', unidad: 'Caja', cantidad: 2, cantidadBase: 33.4, precioUnitario: 1250, precioPor: 'base', alicuotaIva: 21, orden: 0 },
    { id: 'ff', itemId: FEC, pedidoItemId: 'pf', descripcion: 'Fécula', unidad: 'Bolsa', cantidad: 3, cantidadBase: null, precioUnitario: 2450, precioPor: 'unidad', alicuotaIva: 21, orden: 1 },
  ],
  acreditado: [],
  notasCreditoTotal: 0,
}
const dev = (p: Partial<DevolucionDev> & { lineas: DevolucionDev['lineas'] }): DevolucionDev => ({
  id: 'd', estado: 'activa', devuelveMercaderia: true, corrigePrecio: false, repone: false, notaCreditoId: null, ...p,
})
const linea = (itemId: string, cantidad: number, cantidadBase: number | null = null) =>
  ({ itemId, pedidoItemId: null, facturaItemId: null, descripcion: itemId, unidad: null, cantidad, cantidadBase })

// --- Máximos
const filas0 = lineasDevolvibles(pedido, recibidos, [], factura)
const qb0 = filas0.find(f => f.itemId === QB)!
caso('máx: lo que llegó', qb0.maximo, 2)
caso('máx: una sola línea del insumo → la usa', qb0.pedidoItemId, 'pq')
caso('máx: cobra por kg sale de la factura', qb0.cobraPorBase, true)
caso('máx: fécula no cobra por kg', filas0.find(f => f.itemId === FEC)!.cobraPorBase, false)
const filas1 = lineasDevolvibles(pedido, recibidos, [dev({ lineas: [linea(QB, 1.5)] }), dev({ estado: 'anulada', lineas: [linea(QB, 0.5)] })], factura)
caso('máx: resta lo devuelto activo (no lo anulado)', filas1.find(f => f.itemId === QB)!.maximo, 0.5)
const filasNoEnt = lineasDevolvibles(pedido, recibidos, [
  dev({ devuelveMercaderia: false, lineas: [linea(FEC, 1)] }),                    // reclamo sin NC
  dev({ devuelveMercaderia: false, notaCreditoId: 'nc', lineas: [linea(FEC, 1)] }), // con NC: cuenta en acreditado
], { ...factura, acreditado: [{ itemId: FEC, cantidad: 1 }] })
caso('no entregado: facturado − acreditado − reclamado', filasNoEnt.find(f => f.itemId === FEC)!.maximoNoEntregado, 1)
caso('no entregado: la NC no cuenta dos veces', filasNoEnt.find(f => f.itemId === FEC)!.reclamado, 1)
caso('sin factura: facturado 0', lineasDevolvibles(pedido, recibidos, [], null).find(f => f.itemId === QB)!.facturado, 0)
caso('sin factura: cobra por kg sale del par', lineasDevolvibles(pedido, recibidos, [], null).find(f => f.itemId === QB)!.cobraPorBase, true)

// --- Líneas de precio
const precio = lineasPrecio(factura)
caso('precio: cantidad cobrada en kg', `${precio[0].cantidadCobrada} ${precio[0].unidadCobro}`, '33.4 kg')
caso('precio: por unidad', `${precio[1].cantidadCobrada} ${precio[1].unidadCobro}`, '3 Bolsa')

// --- NC (los mismos números que la RPC)
const ncKg = armarNotaCredito([{ itemId: QB, facturaItemId: null, descripcion: 'Queso Barra', cantidad: 1, cantidadBase: 16.4, precioCorrecto: null }], factura, 'mercaderia')
caso('NC por kg: subtotal (S5)', ncKg.totales.subtotal, 20500)
caso('NC por kg: total (S5)', ncKg.totales.total, 24805)
const ncKgSpec = armarNotaCredito([{ itemId: QB, facturaItemId: null, descripcion: 'Queso Barra', cantidad: 2, cantidadBase: 33.4, precioCorrecto: null }], factura, 'mercaderia')
caso('NC 33,4 kg × $ 1.250: subtotal', ncKgSpec.totales.subtotal, 41750)
caso('NC 33,4 kg × $ 1.250: IVA 21 %', ncKgSpec.totales.iva, 8767.5)
const ncSinKg = armarNotaCredito([{ itemId: QB, facturaItemId: null, descripcion: 'Queso Barra', cantidad: 1, cantidadBase: null, precioCorrecto: null }], factura, 'mercaderia')
caso('NC por kg sin kg → error (D7)', ncSinKg.lineas[0].error, 'Cargá los kg devueltos de Queso Barra: la factura lo cobra por kg.')
caso('NC por kg sin kg → incompleta', ncSinKg.incompleta, true)
const ncUnidad = armarNotaCredito([{ itemId: FEC, facturaItemId: null, descripcion: 'Fécula', cantidad: 2, cantidadBase: null, precioCorrecto: null }], factura, 'no_entregado')
caso('NC no entregado por unidad (S6)', ncUnidad.totales.total, 5929)
const ncEditada = armarNotaCredito([{ itemId: FEC, facturaItemId: null, descripcion: 'Fécula', cantidad: 1, cantidadBase: null, precioCorrecto: null }], factura, 'mercaderia', [{ precioUnitario: 2000, alicuotaIva: 10.5 }])
caso('NC con precio y alícuota editados', `${ncEditada.totales.subtotal}|${ncEditada.totales.iva}`, '2000|210')
const ncPrecio = armarNotaCredito([{ itemId: QB, facturaItemId: 'fq', descripcion: 'Queso Barra', cantidad: 33.4, cantidadBase: null, precioCorrecto: 1200 }], factura, 'precio', [{ precioUnitario: 99999 }])
caso('NC precio: 33,4 × $ 50 (S7)', ncPrecio.totales.subtotal, 1670)
caso('NC precio: total con IVA (S7)', ncPrecio.totales.total, 2020.7)
caso('NC precio: el precio del cliente se ignora', ncPrecio.lineas[0].precioUnitario, 50)
caso('NC precio: descripción', ncPrecio.lineas[0].descripcion, 'Diferencia de precio · Queso Barra: de $ 1.250 a $ 1.200 por kg')
caso('NC precio: correcto ≥ cobrado → error', armarNotaCredito([{ itemId: QB, facturaItemId: 'fq', descripcion: 'Queso Barra', cantidad: 1, cantidadBase: null, precioCorrecto: 1250 }], factura, 'precio').incompleta, true)
caso('NC: insumo que no está en la factura', armarNotaCredito([{ itemId: 'otro', facturaItemId: null, descripcion: 'Sal', cantidad: 1, cantidadBase: null, precioCorrecto: null }], factura, 'mercaderia').lineas[0].error, 'Sal no está en la factura: no se puede acreditar.')
caso('tope: lo que queda de la factura', topeNotaCredito({ total: 59411, notasCreditoTotal: 24805 }), 34606)

// --- Gasto (E10)
caso('gasto: descontado', impactoGasto({ gastoId: 'g', gastoEstado: 'Pendiente de pago', gastoMonto: 59411, totalNc: 24805, facturaNumero: 'A-1' }).montoDespues, 34606)
caso('gasto: texto descontado', impactoGasto({ gastoId: 'g', gastoEstado: 'Pendiente de pago', gastoMonto: 59411, totalNc: 24805, facturaNumero: 'A-1' }).texto,
  `El gasto pendiente de la factura A-1 baja de ${formatearMonedaExacta(59411)} a ${formatearMonedaExacta(34606)}.`)
caso('gasto: cubre todo (D4)', impactoGasto({ gastoId: 'g', gastoEstado: 'Pendiente de pago', gastoMonto: 100, totalNc: 100, facturaNumero: 'A-1' }).caso, 'cancelo_gasto')
caso('gasto: a favor (D5)', impactoGasto({ gastoId: 'g', gastoEstado: 'Pagado', gastoMonto: 100, totalNc: 20, facturaNumero: 'A-1' }).caso, 'a_favor')
caso('gasto: parcial también a favor', impactoGasto({ gastoId: 'g', gastoEstado: 'Parcial', gastoMonto: 100, totalNc: 20, facturaNumero: 'A-1' }).caso, 'a_favor')
caso('gasto: sin gasto', impactoGasto({ gastoId: null, gastoEstado: null, gastoMonto: null, totalNc: 20, facturaNumero: 'A-1' }).caso, 'sin_gasto')
caso('gasto: vinculado a mano por menos (FA10)', impactoGasto({ gastoId: 'g', gastoEstado: 'Pendiente de pago', gastoMonto: 99, totalNc: 100, facturaNumero: 'A-1' }).caso, 'cancelo_gasto')

// --- Estado (E8): los mismos casos que el escenario SQL
const base = { actual: 'recibido' as const, hayRemitos: true, haySinRepone: false }
caso('E8: repone → parcial (S2)', estadoRecepcionConDevolucion({ ...base, lineas: [{ cantidad: 2, recibido: 2, devuelto: 1, devueltoSinRepone: 0 }, { cantidad: 3, recibido: 3, devuelto: 0, devueltoSinRepone: 0 }], netoTotal: 4 }), 'parcial')
caso('E8: llega la reposición → recibido (S3)', estadoRecepcionConDevolucion({ ...base, lineas: [{ cantidad: 2, recibido: 3, devuelto: 1, devueltoSinRepone: 0 }], netoTotal: 2 }), 'recibido')
caso('E8: todo devuelto sin reposición → devuelto (S4)', estadoRecepcionConDevolucion({ ...base, haySinRepone: true, lineas: [{ cantidad: 2, recibido: 2, devuelto: 2, devueltoSinRepone: 2 }], netoTotal: 0 }), 'devuelto')
caso('E8: devolver una parte sin reposición → recibido (S5)', estadoRecepcionConDevolucion({ ...base, haySinRepone: true, lineas: [{ cantidad: 2, recibido: 2, devuelto: 1, devueltoSinRepone: 1 }], netoTotal: 1 }), 'recibido')
caso('E8: una línea que nunca llegó → parcial, no devuelto', estadoRecepcionConDevolucion({ ...base, haySinRepone: true, lineas: [{ cantidad: 2, recibido: 2, devuelto: 2, devueltoSinRepone: 2 }, { cantidad: 1, recibido: 0, devuelto: 0, devueltoSinRepone: 0 }], netoTotal: 0 }), 'parcial')
caso('E8: cerrado a mano no se toca (E9)', estadoRecepcionConDevolucion({ ...base, actual: 'cerrado_manual', haySinRepone: true, lineas: [{ cantidad: 2, recibido: 2, devuelto: 2, devueltoSinRepone: 2 }], netoTotal: 0 }), 'cerrado_manual')
caso('E8: todo devuelto con reposición → parcial', estadoRecepcionConDevolucion({ ...base, lineas: [{ cantidad: 2, recibido: 2, devuelto: 2, devueltoSinRepone: 0 }], netoTotal: 0 }), 'parcial')
const despuesDev = recepcionDespues({
  actual: 'recibido', lineas: pedido, recibidoTotal: 5, devueltoTotal: 0, hayRemitos: true, haySinRepone: false,
  nuevas: [{ itemId: QB, cantidad: 1 }], repone: true,
})
caso('impacto: devolución con reposición', textoImpactoEstado({ estado_recepcion: 'recibido', estado_facturacion: 'sin_facturar' }, despuesDev, true), 'Vuelve a Parcialmente recibido: espera la reposición.')
const despuesTodo = recepcionDespues({
  actual: 'recibido', lineas: pedido, recibidoTotal: 5, devueltoTotal: 0, hayRemitos: true, haySinRepone: false,
  nuevas: [{ itemId: QB, cantidad: 2 }, { itemId: FEC, cantidad: 3 }], repone: false,
})
caso('impacto: devolver todo → Queda Devuelto', textoImpactoEstado({ estado_recepcion: 'recibido', estado_facturacion: 'facturado' }, despuesTodo, false), 'Queda Devuelto.')
// Revisión B4 (AnularModal): al anular la única devolución sin reposición, con una línea libre del
// remito que nunca se devolvió, el neto usa todos los remitos: queda Recibido, no Devuelto.
caso('anular: con línea libre en el remito → recibido', recepcionDespues({
  actual: 'devuelto',
  lineas: [{ ...pedido[0], recibido: 2, devuelto: 0, devueltoSinRepone: 0 }],
  recibidoTotal: 3, devueltoTotal: 0, hayRemitos: true, haySinRepone: false, nuevas: [], repone: false,
}), 'recibido')
caso('anular: otra devolución sin reposición que vacía todo → sigue devuelto', recepcionDespues({
  actual: 'devuelto',
  lineas: [{ ...pedido[0], recibido: 2, devuelto: 2, devueltoSinRepone: 2 }],
  recibidoTotal: 2, devueltoTotal: 2, hayRemitos: true, haySinRepone: true, nuevas: [], repone: false,
}), 'devuelto')
caso('impacto: facturado sigue facturado', textoImpactoEstado({ estado_recepcion: 'recibido', estado_facturacion: 'facturado' }, 'recibido', false), 'Sigue Facturado.')

// --- Textos y avisos
caso('línea con kg reales', textoLineaDevolucion({ descripcion: 'Queso Barra', unidad: 'Caja', cantidad: 2, cantidadBase: 33.4, unidadBase: 'kg' }), 'Queso Barra 2 Caja (33,4 kg)')
caso('línea sin kg con conversión', textoLineaDevolucion({ descripcion: 'Queso Barra', unidad: 'Caja', cantidad: 2, cantidadBase: null }, { unidad: 'Caja', unidad_base: 'kg', cantidad_por_unidad: 16.5 }), 'Queso Barra 2 Caja (≈ 33 kg)')
caso('kg fuera del 10 %', kgFueraDeRango(1, 20, 16.5), true)
caso('kg dentro del 10 %', kgFueraDeRango(1, 16.4, 16.5), false)

// --- Desde una diferencia (por flags, nunca por nombre)
const motivos: Motivo[] = [
  { id: 'm-precio', nombre: 'Precio', devuelve_mercaderia: false, corrige_precio: true, orden: 6, activo: true },
  { id: 'm-noent', nombre: 'Otro nombre cualquiera', devuelve_mercaderia: false, corrige_precio: false, orden: 5, activo: true },
  { id: 'm-mal-inactivo', nombre: 'Mal estado', devuelve_mercaderia: true, corrige_precio: false, orden: 1, activo: false },
  { id: 'm-mal', nombre: 'Cantidad de más', devuelve_mercaderia: true, corrige_precio: false, orden: 3, activo: true },
]
const sugMas = sugerenciaDesdeDiferencia({ itemId: QB, diferencia: 2 }, motivos)
caso('diferencia +2 → no entregado con NC', `${sugMas?.motivoId}|${sugMas?.cantidad}|${sugMas?.notaCredito}`, 'm-noent|2|true')
const sugMenos = sugerenciaDesdeDiferencia({ itemId: QB, diferencia: -1.5 }, motivos)
caso('diferencia −1,5 → mercadería activa, no repone, sin NC', `${sugMenos?.motivoId}|${sugMenos?.cantidad}|${sugMenos?.notaCredito}|${sugMenos?.repone}`, 'm-mal|1.5|false|false')
caso('sin motivo de ese efecto → motivoId null', sugerenciaDesdeDiferencia({ itemId: QB, diferencia: 2 }, motivos.filter(m => m.id !== 'm-noent'))?.motivoId, null)

// --- Bloqueos conocidos
caso('anular NC: gasto pagado después del descuento', bloqueoAnularNc({ ncGasto: 'descontado', gastoEstado: 'Pagado', facturaNumero: 'A-1' })?.startsWith('El gasto de la factura A-1 ya se pagó'), true)
caso('anular NC: a favor se puede', bloqueoAnularNc({ ncGasto: 'a_favor', gastoEstado: 'Pagado', facturaNumero: 'A-1' }), null)
caso('anular NC: descontada y pendiente se puede', bloqueoAnularNc({ ncGasto: 'descontado', gastoEstado: 'Pendiente de pago', facturaNumero: 'A-1' }), null)

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
