// Chequeo de las funciones puras del estado del pedido.
// Correr con: npx tsx lib/compras/_check_estado.ts
import { estadoVisible, subtextoEstado, estaDemorado, proximaAccion, filtroDelPedido, pedidoAbierto, type EstadoPedidoEntrada, type EstadoRecepcion, type EstadoFacturacion } from './estadoPedido'

const ahora = new Date('2026-09-24T12:00:00Z')
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000).toISOString()
const pedido = (p: Partial<EstadoPedidoEntrada>): EstadoPedidoEntrada => ({
  estado_recepcion: 'enviado', estado_facturacion: 'sin_facturar', enviado_en: haceDias(1), lineas: 3, lineasPendientes: 3, ...p,
})

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'devuelto gana a facturado', real: estadoVisible(pedido({ estado_recepcion: 'devuelto', estado_facturacion: 'facturado' })), esperado: 'devuelto' },
  { nombre: 'facturado gana a cerrado', real: estadoVisible(pedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'facturado' })), esperado: 'facturado' },
  { nombre: 'cerrado_manual → cerrado', real: estadoVisible(pedido({ estado_recepcion: 'cerrado_manual' })), esperado: 'cerrado' },
  { nombre: 'parcial sin facturar', real: estadoVisible(pedido({ estado_recepcion: 'parcial' })), esperado: 'parcial' },
  { nombre: 'subtexto: facturado y falta recibir', real: subtextoEstado(pedido({ estado_facturacion: 'facturado', estado_recepcion: 'parcial' })), esperado: 'falta recibir' },
  { nombre: 'subtexto: recibido sin nada pendiente', real: subtextoEstado(pedido({ estado_recepcion: 'recibido' })), esperado: null },
  { nombre: 'subtexto: diferencias + devolución', real: subtextoEstado(pedido({ estado_recepcion: 'recibido', hayDiferencias: true, hayDevolucion: true })), esperado: 'diferencias por resolver · con devolución' },
  { nombre: 'demorado a los 3 días', real: estaDemorado(pedido({ enviado_en: haceDias(3) }), ahora), esperado: true },
  { nombre: 'no demorado a los 2 días', real: estaDemorado(pedido({ enviado_en: haceDias(2) }), ahora), esperado: false },
  { nombre: 'recibido nunca demorado', real: estaDemorado(pedido({ estado_recepcion: 'recibido', enviado_en: haceDias(30) }), ahora), esperado: false },
  { nombre: 'acción sin enviar', real: proximaAccion(pedido({ estado_recepcion: 'sin_enviar', enviado_en: null }), ahora).tipo, esperado: 'enviar' },
  { nombre: 'acción sin enviar y sin ítems', real: proximaAccion(pedido({ estado_recepcion: 'sin_enviar', enviado_en: null, lineas: 0 }), ahora).tipo, esperado: 'ninguna' },
  { nombre: 'acción enviado', real: proximaAccion(pedido({}), ahora).boton, esperado: 'Cargar remito' },
  { nombre: 'acción parcial menciona faltantes', real: proximaAccion(pedido({ estado_recepcion: 'parcial', lineasPendientes: 1 }), ahora).descripcion.startsWith('Faltan 1 línea '), esperado: true },
  { nombre: 'acción recibido', real: proximaAccion(pedido({ estado_recepcion: 'recibido' }), ahora).tipo, esperado: 'ninguna' },
  { nombre: 'acción recibido siendo admin', real: proximaAccion(pedido({ estado_recepcion: 'recibido', puedeFacturar: true }), ahora).boton, esperado: 'Cargar factura' },
  { nombre: 'acción recibido con borrador', real: proximaAccion(pedido({ estado_recepcion: 'recibido', puedeFacturar: true, facturaEnBorrador: true }), ahora).boton, esperado: 'Seguir con la factura' },
  { nombre: 'acción cerrado con algo recibido', real: proximaAccion(pedido({ estado_recepcion: 'cerrado_manual', puedeFacturar: true, recibioAlgo: true }), ahora).tipo, esperado: 'cargar_factura' },
  { nombre: 'acción cerrado sin nada recibido', real: proximaAccion(pedido({ estado_recepcion: 'cerrado_manual', puedeFacturar: true, recibioAlgo: false }), ahora).tipo, esperado: 'ninguna' },
  { nombre: 'acción facturado sin recibir: pide remito', real: proximaAccion(pedido({ estado_recepcion: 'enviado', estado_facturacion: 'facturado' }), ahora).boton, esperado: 'Cargar remito' },
  { nombre: 'acción facturado y recibido', real: proximaAccion(pedido({ estado_recepcion: 'recibido', estado_facturacion: 'facturado', puedeFacturar: true }), ahora).tipo, esperado: 'ninguna' },
  { nombre: 'acción facturado con diferencias (admin)', real: proximaAccion(pedido({ estado_recepcion: 'recibido', estado_facturacion: 'facturado', puedeFacturar: true, hayDiferencias: true }), ahora).boton, esperado: 'Resolver diferencias' },
  { nombre: 'acción facturado con diferencias (sin permiso)', real: proximaAccion(pedido({ estado_recepcion: 'recibido', estado_facturacion: 'facturado', hayDiferencias: true }), ahora).tipo, esperado: 'ninguna' },
  { nombre: 'acción facturado, falta recibir gana a diferencias', real: proximaAccion(pedido({ estado_recepcion: 'parcial', estado_facturacion: 'facturado', puedeFacturar: true, hayDiferencias: true }), ahora).tipo, esperado: 'cargar_remito' },
  { nombre: 'subtexto: facturado con diferencias', real: subtextoEstado(pedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'facturado', hayDiferencias: true })), esperado: 'diferencias por resolver' },
  { nombre: 'filtro: parcial → activos', real: filtroDelPedido({ estado_recepcion: 'parcial', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'activos' },
  { nombre: 'filtro: recibido → por facturar', real: filtroDelPedido({ estado_recepcion: 'recibido', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'por_facturar' },
  { nombre: 'filtro: cerrado con algo → por facturar', real: filtroDelPedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'por_facturar' },
  { nombre: 'filtro: cerrado sin nada → solo Todos', real: filtroDelPedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', recibioAlgo: false }), esperado: null },
  { nombre: 'filtro: facturado falta recibir → facturados', real: filtroDelPedido({ estado_recepcion: 'enviado', estado_facturacion: 'facturado', recibioAlgo: false }), esperado: 'facturados' },
]

// B3: pedidoAbierto en los 6 estados de recepción × 2 de facturación, y el
// cerrado a mano con y sin mercadería. La misma tabla verifica la función SQL
// _compras_pedidos_abiertos_de (escenario S6 de docs/bloque2/escenarios-B3.sql).
const TABLA_ABIERTO: { r: EstadoRecepcion; f: EstadoFacturacion; recibioAlgo: boolean; abierto: boolean }[] = [
  { r: 'sin_enviar', f: 'sin_facturar', recibioAlgo: false, abierto: true },
  { r: 'sin_enviar', f: 'facturado', recibioAlgo: false, abierto: true },
  { r: 'enviado', f: 'sin_facturar', recibioAlgo: false, abierto: true },
  { r: 'enviado', f: 'facturado', recibioAlgo: false, abierto: true },
  { r: 'parcial', f: 'sin_facturar', recibioAlgo: true, abierto: true },
  { r: 'parcial', f: 'facturado', recibioAlgo: true, abierto: true },
  { r: 'recibido', f: 'sin_facturar', recibioAlgo: true, abierto: true },
  { r: 'recibido', f: 'facturado', recibioAlgo: true, abierto: false },
  { r: 'cerrado_manual', f: 'sin_facturar', recibioAlgo: true, abierto: true },
  { r: 'cerrado_manual', f: 'sin_facturar', recibioAlgo: false, abierto: false },
  { r: 'cerrado_manual', f: 'facturado', recibioAlgo: true, abierto: false },
  { r: 'devuelto', f: 'sin_facturar', recibioAlgo: true, abierto: false },
  { r: 'devuelto', f: 'facturado', recibioAlgo: true, abierto: false },
]
for (const t of TABLA_ABIERTO) {
  casos.push({
    nombre: `abierto: ${t.r} + ${t.f}${t.r === 'cerrado_manual' ? (t.recibioAlgo ? ' con mercadería' : ' sin mercadería') : ''}`,
    real: pedidoAbierto({ estado_recepcion: t.r, estado_facturacion: t.f, recibioAlgo: t.recibioAlgo }),
    esperado: t.abierto,
  })
}

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
