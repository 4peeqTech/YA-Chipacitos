// Chequeo de las funciones puras del estado del pedido.
// Correr con: npx tsx lib/compras/_check_estado.ts
import { estadoVisible, subtextoEstado, estaDemorado, proximaAccion, filtroDelPedido, type EstadoPedidoEntrada } from './estadoPedido'

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
  { nombre: 'filtro: parcial → activos', real: filtroDelPedido({ estado_recepcion: 'parcial', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'activos' },
  { nombre: 'filtro: recibido → por facturar', real: filtroDelPedido({ estado_recepcion: 'recibido', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'por_facturar' },
  { nombre: 'filtro: cerrado con algo → por facturar', real: filtroDelPedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', recibioAlgo: true }), esperado: 'por_facturar' },
  { nombre: 'filtro: cerrado sin nada → solo Todos', real: filtroDelPedido({ estado_recepcion: 'cerrado_manual', estado_facturacion: 'sin_facturar', recibioAlgo: false }), esperado: null },
  { nombre: 'filtro: facturado falta recibir → facturados', real: filtroDelPedido({ estado_recepcion: 'enviado', estado_facturacion: 'facturado', recibioAlgo: false }), esperado: 'facturados' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
