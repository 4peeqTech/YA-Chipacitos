// Chequeo de las funciones puras de la pantalla de Facturas.
// Correr con: npx tsx app/admin/compras/pedidos/facturas/_check_modelo.ts
import {
  agregarDelPedido, armarEnvio, coincideBusqueda, entraEnFiltro, estadoInicial, estaVencida, facturaDuplicada,
  faltantesDelPedido, lineaLibre, lineasIniciales, normalizarNumero, pedidosFacturables,
  resumenRecepcion, tieneRemitos, totales, validar,
  type ContextoPedido, type EstadoFactura, type FacturaVista, type LineaFactura,
} from './modelo'
import type { InsumoFactura, PedidoFactura } from './datos'
import type { LineaPendiente } from '../datos'

const FECULA = '11111111-1111-1111-1111-111111111111'
const SAL = '22222222-2222-2222-2222-222222222222'
const PROV = '33333333-3333-3333-3333-333333333333'

const insumos = new Map<string, InsumoFactura>([
  [FECULA, { id: FECULA, nombre: 'Fécula', unidad: 'Bolsa 25 kg', alicuota_iva: 21 }],
  [SAL, { id: SAL, nombre: 'Sal', unidad: 'Bolsa', alicuota_iva: 10.5 }],
])

const linea = (p: Partial<LineaPendiente> & { pedido_item_id: string }): LineaPendiente => ({
  pedido_id: 'ped-1',
  item_id: null,
  descripcion: 'Ítem',
  unidad: null,
  orden: 0,
  cantidad: 0,
  recibido: 0,
  pendiente: 0,
  excedente: 0,
  remitos: 0,
  ...p,
})

const lineasPedido: LineaPendiente[] = [
  linea({ pedido_item_id: 'pi-1', item_id: FECULA, descripcion: 'Fécula', unidad: 'Bolsa 25 kg', orden: 0, cantidad: 10, recibido: 8 }),
  linea({ pedido_item_id: 'pi-2', item_id: SAL, descripcion: 'Sal', unidad: 'Bolsa', orden: 1, cantidad: 4, recibido: 0 }),
]

const pedido = (remitos: PedidoFactura['compras_remitos']): PedidoFactura => ({
  id: 'ped-1',
  numero: 25,
  proveedor_id: PROV,
  estado_recepcion: 'parcial',
  estado_facturacion: 'sin_facturar',
  enviado_en: '2026-09-20T10:00:00Z',
  proveedores: { nombre: 'GLOBAL' },
  compras_remitos: remitos,
})

const conRemito = pedido([{
  id: 'rem-1',
  secuencia: 1,
  fecha: '2026-09-22',
  origen: 'manual',
  compras_remito_items: [
    { pedido_item_id: 'pi-1', item_id: FECULA, descripcion: 'Fécula', cantidad: 8 },
    { pedido_item_id: null, item_id: SAL, descripcion: 'Sal gruesa', cantidad: 2 },
  ],
}])
const sinRemito = pedido([])

const precios = new Map<string, number>([[FECULA, 1000]])
const ctxConRemito: ContextoPedido = { pedido: conRemito, lineas: lineasPedido, precios, insumos }
const ctxSinRemito: ContextoPedido = { pedido: sinRemito, lineas: lineasPedido, precios, insumos }

const iniConRemito = lineasIniciales(ctxConRemito)
const iniSinRemito = lineasIniciales(ctxSinRemito)

const estado = (p: Partial<EstadoFactura> = {}): EstadoFactura => ({
  numero: '0003-00012345',
  fecha: '2026-09-28',
  vencimiento: '',
  totalPapel: null,
  observaciones: '',
  actualizarPrecios: false,
  lineas: [{ ...lineaLibre(), descripcion: 'Fécula', itemId: FECULA, cantidad: 8, precioUnitario: 1000, alicuotaIva: 21 }],
  ...p,
})

const vista = (p: Partial<FacturaVista> = {}): FacturaVista => ({
  id: 'f-1', numero: '0003-00012345', estado: 'confirmada', pedidoId: 'ped-1', pedidoNumero: 25,
  codigo: 'P-0025', proveedorId: PROV, proveedor: 'GLOBAL', fecha: '2026-09-28', vencimiento: null,
  subtotal: 8000, iva: 1680, total: 9680, totalPapel: null, observaciones: '', mercaderiaLlego: null,
  confirmadaEn: null, confirmadaPor: null, anuladaEn: null, anuladaPor: null, anuladaMotivo: null,
  gastoId: null, gastoGenerado: false, gastoEstado: null, gastoLocal: null, pedidoEstadoRecepcion: 'recibido',
  diferenciasPendientes: 0, diferenciasAResolver: 0,
  ...p,
})

const sinDescripcion: LineaFactura = { ...lineaLibre(), descripcion: '  ' }

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  // Prellenado
  { nombre: 'con remitos toma lo recibido', real: iniConRemito.find(l => l.pedidoItemId === 'pi-1')?.cantidad, esperado: 8 },
  { nombre: 'con remitos deja afuera lo que no llegó', real: iniConRemito.some(l => l.pedidoItemId === 'pi-2'), esperado: false },
  { nombre: 'con remitos suma la línea suelta del remito', real: iniConRemito.some(l => l.descripcion === 'Sal gruesa'), esperado: true },
  { nombre: 'la línea suelta arrastra su insumo', real: iniConRemito.find(l => l.descripcion === 'Sal gruesa')?.itemId, esperado: SAL },
  { nombre: 'la línea suelta toma la alícuota del insumo', real: iniConRemito.find(l => l.descripcion === 'Sal gruesa')?.alicuotaIva, esperado: 10.5 },
  { nombre: 'sin remitos toma lo pedido', real: iniSinRemito.find(l => l.pedidoItemId === 'pi-1')?.cantidad, esperado: 10 },
  { nombre: 'sin remitos entran todas las líneas', real: iniSinRemito.length, esperado: 2 },
  { nombre: 'sin remitos no inventa líneas sueltas', real: iniSinRemito.some(l => l.descripcion === 'Sal gruesa'), esperado: false },
  { nombre: 'el precio de referencia prellena el precio', real: iniSinRemito.find(l => l.itemId === FECULA)?.precioUnitario, esperado: 1000 },
  { nombre: 'sin precio de referencia el precio queda vacío', real: iniSinRemito.find(l => l.itemId === SAL)?.precioUnitario, esperado: null },
  { nombre: 'la alícuota sale del insumo', real: iniSinRemito.find(l => l.itemId === SAL)?.alicuotaIva, esperado: 10.5 },
  { nombre: 'guarda qué se pidió y qué llegó', real: iniSinRemito.find(l => l.itemId === FECULA)?.recibido, esperado: 8 },

  { nombre: 'tieneRemitos con remito', real: tieneRemitos(conRemito), esperado: true },
  { nombre: 'tieneRemitos sin remito', real: tieneRemitos(sinRemito), esperado: false },
  { nombre: 'resumen sin remitos', real: resumenRecepcion(sinRemito, lineasPedido), esperado: 'Todavía no llegó ningún remito de este pedido.' },
  // La Fécula llegó 8 de 10 y la Sal 0 de 4: ninguna línea está completa.
  { nombre: 'resumen con 1 remito', real: resumenRecepcion(conRemito, lineasPedido), esperado: '1 remito · llegaron 0 de 2 líneas completas.' },
  {
    nombre: 'resumen cuenta las líneas completas',
    real: resumenRecepcion(conRemito, [linea({ pedido_item_id: 'pi-1', cantidad: 10, recibido: 10 }), linea({ pedido_item_id: 'pi-2', cantidad: 4, recibido: 1 })]),
    esperado: '1 remito · llegaron 1 de 2 líneas completas.',
  },

  // Lo que quedó afuera se puede sumar de a una
  { nombre: 'faltantes del pedido', real: faltantesDelPedido(estado({ lineas: iniConRemito }), ctxConRemito).map(l => l.pedido_item_id).join(), esperado: 'pi-2' },
  { nombre: 'sin contexto no hay faltantes', real: faltantesDelPedido(estado(), null).length, esperado: 0 },
  { nombre: 'agregar del pedido usa lo pedido si no llegó nada', real: agregarDelPedido(lineasPedido[1], ctxConRemito).cantidad, esperado: 4 },

  // Totales
  { nombre: 'total de la factura base', real: totales(estado()).total, esperado: 9680 },
  { nombre: 'una línea sin precio no suma', real: totales(estado({ lineas: [{ ...lineaLibre(), descripcion: 'Flete' }] })).total, esperado: 0 },

  // Validación
  { nombre: 'una factura completa pasa', real: validar(estado()), esperado: null },
  { nombre: 'sin número', real: validar(estado({ numero: '' }))?.tipo, esperado: 'sin_numero' },
  { nombre: 'un número sin dígitos no sirve', real: validar(estado({ numero: 'FACTURA' }))?.tipo, esperado: 'sin_numero' },
  { nombre: 'sin fecha', real: validar(estado({ fecha: '' }))?.tipo, esperado: 'sin_fecha' },
  { nombre: 'vencimiento anterior', real: validar(estado({ vencimiento: '2026-09-01' }))?.tipo, esperado: 'vencimiento_antes' },
  { nombre: 'vencimiento el mismo día vale', real: validar(estado({ vencimiento: '2026-09-28' })), esperado: null },
  { nombre: 'línea sin descripción', real: validar(estado({ lineas: [sinDescripcion] }))?.tipo, esperado: 'linea_incompleta' },
  { nombre: 'sin líneas', real: validar(estado({ lineas: [] }))?.tipo, esperado: 'sin_lineas' },
  { nombre: 'un borrador en 0 se guarda', real: validar(estado({ lineas: [{ ...lineaLibre(), descripcion: 'Flete' }] })), esperado: null },
  { nombre: 'una factura en 0 no se confirma', real: validar(estado({ lineas: [{ ...lineaLibre(), descripcion: 'Flete' }] }), true)?.tipo, esperado: 'total_cero' },

  // Envío a la RPC
  { nombre: 'el envío limpia la descripción', real: armarEnvio(estado({ lineas: [{ ...lineaLibre(), descripcion: '  Flete  ' }] }))[0].descripcion, esperado: 'Flete' },
  { nombre: 'el envío completa cantidad vacía con 0', real: armarEnvio(estado({ lineas: [{ ...lineaLibre(), descripcion: 'Flete', cantidad: null }] }))[0].cantidad, esperado: 0 },
  { nombre: 'el envío completa precio vacío con 0', real: armarEnvio(estado())[0].precioUnitario, esperado: 1000 },

  // Número repetido (FA3)
  { nombre: 'normalizar deja solo dígitos', real: normalizarNumero('0003 / 00012345'), esperado: '000300012345' },
  { nombre: 'mismo número normalizado: duplicada', real: facturaDuplicada('0003 / 00012345', PROV, null, [vista()])?.id, esperado: 'f-1' },
  { nombre: 'otro proveedor: no duplicada', real: facturaDuplicada('0003-00012345', 'otro', null, [vista()]), esperado: null },
  { nombre: 'la propia factura no se duplica a sí misma', real: facturaDuplicada('0003-00012345', PROV, 'f-1', [vista()]), esperado: null },
  { nombre: 'una anulada no bloquea el número', real: facturaDuplicada('0003-00012345', PROV, null, [vista({ estado: 'anulada' })]), esperado: null },
  { nombre: 'sin proveedor no se evalúa', real: facturaDuplicada('0003-00012345', null, null, [vista()]), esperado: null },

  // Pedidos elegibles
  { nombre: 'un pedido con factura activa no se factura de nuevo', real: pedidosFacturables([conRemito], [vista()]).length, esperado: 0 },
  { nombre: 'con la factura anulada vuelve a estar disponible', real: pedidosFacturables([conRemito], [vista({ estado: 'anulada' })]).length, esperado: 1 },
  { nombre: 'un borrador ya ocupa el pedido', real: pedidosFacturables([conRemito], [vista({ estado: 'borrador' })]).length, esperado: 0 },

  // Filtros y búsqueda
  { nombre: 'activas deja afuera las anuladas', real: entraEnFiltro(vista({ estado: 'anulada' }), 'activas'), esperado: false },
  { nombre: 'activas incluye borradores', real: entraEnFiltro(vista({ estado: 'borrador' }), 'activas'), esperado: true },
  { nombre: 'todas incluye anuladas', real: entraEnFiltro(vista({ estado: 'anulada' }), 'todas'), esperado: true },
  { nombre: 'con diferencias: solo las que se pueden resolver', real: entraEnFiltro(vista({ diferenciasPendientes: 2, diferenciasAResolver: 0 }), 'con_diferencias'), esperado: false },
  { nombre: 'con diferencias: a resolver', real: entraEnFiltro(vista({ diferenciasPendientes: 2, diferenciasAResolver: 2 }), 'con_diferencias'), esperado: true },
  { nombre: 'vencida sin gasto pagado', real: estaVencida(vista({ vencimiento: '2026-09-20' }), '2026-09-29'), esperado: true },
  { nombre: 'vencida pero pagada', real: estaVencida(vista({ vencimiento: '2026-09-20', gastoEstado: 'Pagado' }), '2026-09-29'), esperado: false },
  { nombre: 'vence hoy no está vencida', real: estaVencida(vista({ vencimiento: '2026-09-29' }), '2026-09-29'), esperado: false },
  { nombre: 'un borrador no se marca vencido', real: estaVencida(vista({ estado: 'borrador', vencimiento: '2026-09-01' }), '2026-09-29'), esperado: false },
  { nombre: 'busca por proveedor', real: coincideBusqueda(vista(), 'global'), esperado: true },
  { nombre: 'busca por número parcial', real: coincideBusqueda(vista(), '12345'), esperado: true },
  { nombre: 'busca por código de pedido', real: coincideBusqueda(vista(), 'P-0025'), esperado: true },
  { nombre: 'busca por número de pedido corto', real: coincideBusqueda(vista(), 'p25'), esperado: true },
  { nombre: 'sin búsqueda entra todo', real: coincideBusqueda(vista(), '  '), esperado: true },
  { nombre: 'una búsqueda que no matchea', real: coincideBusqueda(vista(), 'zzz'), esperado: false },

  // Estado inicial de una factura existente
  { nombre: 'estadoInicial de una nueva usa la fecha de hoy', real: estadoInicial(null, [], ctxSinRemito, '2026-09-28').fecha, esperado: '2026-09-28' },
  { nombre: 'estadoInicial de una nueva prellena líneas', real: estadoInicial(null, [], ctxSinRemito, '2026-09-28').lineas.length, esperado: 2 },
  { nombre: 'estadoInicial sin pedido no tiene líneas', real: estadoInicial(null, [], null, '2026-09-28').lineas.length, esperado: 0 },
  { nombre: 'estadoInicial de una existente respeta su número', real: estadoInicial(vista(), [], ctxSinRemito, '2026-09-28').numero, esperado: '0003-00012345' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
