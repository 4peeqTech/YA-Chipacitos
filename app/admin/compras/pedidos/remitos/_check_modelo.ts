// Chequeo del modelo del formulario de remito: npx tsx app/admin/compras/pedidos/remitos/_check_modelo.ts
import {
  armarEnvio, calcularImpacto, estadoInicial, impactoEliminar, lineasSinStock, validar,
  type LineaLibre,
} from './modelo'
import type { LineaPedido, RemitoFila } from './datos'

let fallas = 0
function igual(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${ok ? '' : `\n    real:     ${JSON.stringify(real)}\n    esperado: ${JSON.stringify(esperado)}`}`)
}

const linea = (pi: string, item: string | null, cantidad: number, recibido = 0): LineaPedido => ({
  pedido_item_id: pi, pedido_id: 'P', item_id: item, descripcion: `Línea ${pi}`, unidad: 'Bolsa', orden: 0,
  cantidad, recibido, pendiente: Math.max(cantidad - recibido, 0), excedente: Math.max(recibido - cantidad, 0), remitos: 0,
})
const lineas = [linea('a', 'FEC', 4), linea('b', 'LEC', 2), linea('c', null, 1)]
const stock = { FEC: 70, LEC: 2, SAL: 6 }
const libre = (x: Partial<LineaLibre>): LineaLibre => ({ clave: 'k', id: null, descripcion: 'Algo', cantidad: 1, corresponde: 'nada', itemId: null, manual: true, ...x })

// Remito nuevo vacío: no se puede guardar.
const vacio = estadoInicial(null, lineas)
igual('nuevo arranca sin cantidades', Object.values(vacio.porLinea).map(c => c.cantidad), [null, null, null])
igual('nuevo vacío → sin_lineas', validar(vacio)?.tipo, 'sin_lineas')

// Fécula 3 + línea libre con Sal 1 + línea libre sin insumo.
const e1 = {
  ...vacio,
  porLinea: { ...vacio.porLinea, a: { id: null, cantidad: 3 } },
  libres: [libre({ clave: 'x', itemId: 'SAL' }), libre({ clave: 'y', descripcion: 'Bolsas', cantidad: 10 })],
}
const envio1 = armarEnvio(e1, lineas)
igual('envío: 3 líneas', envio1.length, 3)
igual('impacto nuevo', calcularImpacto(envio1, null, lineas, stock), [
  { itemId: 'FEC', delta: 3, antes: 70, despues: 73 },
  { itemId: 'SAL', delta: 1, antes: 6, despues: 7 },
])
igual('una línea no mueve stock', lineasSinStock(envio1), 1)

// Libre sin decidir a qué corresponde → no se guarda en silencio (P8).
igual('libre sin destino', validar({ ...e1, libres: [libre({ clave: 'z', corresponde: '' })] })?.tipo, 'libre_sin_destino')
igual('libre sin cantidad', validar({ ...e1, libres: [libre({ clave: 'z', cantidad: null })] })?.tipo, 'libre_incompleta')
igual('libre totalmente vacía se ignora', validar({ ...e1, libres: [libre({ clave: 'z', descripcion: '', cantidad: null, corresponde: '' })] }), null)

// Libre que corresponde a una línea del pedido: suma a ese insumo.
const e2 = { ...vacio, libres: [libre({ clave: 'w', corresponde: 'b', cantidad: 2 })] }
igual('libre → línea del pedido mueve su insumo', calcularImpacto(armarEnvio(e2, lineas), null, lineas, stock), [
  { itemId: 'LEC', delta: 2, antes: 2, despues: 4 },
])

// Edición: el remito tenía Fécula 5 (dos líneas de 3 y 2) y Sal 1 libre.
const remito: RemitoFila = {
  id: 'R', pedido_id: 'P', secuencia: 1, fecha: '2026-09-25', created_at: null,
  compras_remito_items: [
    { id: 'r1', pedido_item_id: 'a', item_id: 'FEC', descripcion: 'Línea a', cantidad: 3 },
    { id: 'r2', pedido_item_id: 'a', item_id: 'FEC', descripcion: 'Línea a', cantidad: 2 },
    { id: 'r3', pedido_item_id: null, item_id: 'SAL', descripcion: 'Sal fina', cantidad: 1 },
  ],
}
const ed = estadoInicial(remito, lineas)
igual('edición: la primera línea con la descripción del pedido vuelve a su fila', ed.porLinea.a, { id: 'r1', cantidad: 3 })
igual('edición: otro nombre / repetida y la libre quedan libres', ed.libres.map(l => [l.id, l.corresponde, l.itemId, l.descripcion]), [
  ['r2', 'a', null, 'Línea a'], ['r3', 'nada', 'SAL', 'Sal fina'],
])
igual('edición sin cambios → sin impacto', calcularImpacto(armarEnvio(ed, lineas), remito, lineas, stock), [])
igual('edición sin cambios conserva textos y vínculos', armarEnvio(ed, lineas).map(l => [l.id, l.pedidoItemId, l.descripcion]), [
  ['r1', 'a', 'Línea a'], ['r2', 'a', 'Línea a'], ['r3', null, 'Sal fina'],
])
// La línea del pedido no vino en la consulta: el vínculo se conserva igual.
const sinLineas = estadoInicial(remito, [])
igual('sin líneas del pedido no desvincula', armarEnvio(sinLineas, []).map(l => l.pedidoItemId), ['a', 'a', null])
const bajar = { ...ed, porLinea: { ...ed.porLinea, a: { id: 'r1', cantidad: 3 } }, libres: [] }
igual('bajar 5 → 3 y quitar la Sal', calcularImpacto(armarEnvio(bajar, lineas), remito, lineas, stock), [
  { itemId: 'FEC', delta: -2, antes: 70, despues: 68 },
  { itemId: 'SAL', delta: -1, antes: 6, despues: 5 },
])
igual('eliminar resta todo', impactoEliminar(remito, { FEC: 1, SAL: 6 }), [
  { itemId: 'FEC', delta: -5, antes: 1, despues: -4 },
  { itemId: 'SAL', delta: -1, antes: 6, despues: 5 },
])

console.log(fallas ? `\n${fallas} casos mal` : '\nTodos los casos OK')
process.exit(fallas ? 1 : 0)
