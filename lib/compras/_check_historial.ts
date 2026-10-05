// Chequeo de las funciones puras del historial del pedido (B1).
// Correr con: npx tsx lib/compras/_check_historial.ts
import {
  agruparEventos, etiquetaEvento, leerEvento, partesDiff, textoDiff, type DiffLineas, type EventoCrudo,
} from './historialPedido'

const linea = (id: string, descripcion: string, cantidad: number, unidad: string | null = null, item_id: string | null = null) =>
  ({ id, item_id, descripcion, unidad, cantidad })
const cambio = (
  id: string, descripcion: string, de: number, a: number,
  unidad: string | null = null, antesUnidad: string | null = unidad, antesDescripcion = descripcion,
) => ({ ...linea(id, descripcion, a, unidad), antes: { cantidad: de, unidad: antesUnidad, descripcion: antesDescripcion, item_id: null } })

let n = 0
const ev = (tipo: string, minuto: number, detalle: unknown, persona = 'ana'): EventoCrudo => ({
  id: `e${++n}`, pedido_id: 'p1', tipo, detalle,
  fecha: new Date(Date.UTC(2026, 9, 5, 17, 0) + minuto * 60_000).toISOString(),
  persona_id: persona, persona: persona === 'ana' ? 'Ana' : 'Beto',
})
const textoEntrada = (d: unknown) => {
  const diff = d as DiffLineas
  return textoDiff(diff)
}

const queso = (de: number, a: number) => ({ cambiados: [cambio('l1', 'Queso', de, a, 'kg')] })

// 6
const g6 = agruparEventos([ev('items_editados', 0, queso(40, 45)), ev('items_editados', 3, queso(45, 50))])
// 7
const g7 = agruparEventos([ev('items_editados', 0, queso(40, 45)), ev('items_editados', 6, queso(45, 50))])
// 8
const g8 = agruparEventos([
  ev('items_editados', 0, queso(40, 45)),
  ev('items_editados', 1, { agregados: [linea('l9', 'Sal', 1)] }, 'beto'),
  ev('items_editados', 2, queso(45, 50)),
])
// 9
const g9 = agruparEventos([ev('items_editados', 0, queso(40, 45)), ev('items_editados', 2, queso(45, 40))])
// 10
const g10 = agruparEventos([
  ev('items_editados', 0, { agregados: [linea('l2', 'Sal', 2, 'Bolsa')] }),
  ev('items_editados', 1, { quitados: [linea('l2', 'Sal', 2, 'Bolsa')] }),
  ev('mensaje', 2, { accion: 'generado' }),
])
// 11
const g11 = agruparEventos([ev('items_editados', 0, queso(40, 45)), ev('mensaje', 1, { accion: 'regenerado' })])
// 12
const g12 = agruparEventos([
  ev('items_editados', 0, queso(40, 45)), ev('enviado', 1, { mensaje: 'hola' }), ev('items_editados', 2, queso(45, 50)),
])
// 13
const malo = leerEvento(ev('items_editados', 0, { cambiados: 'no' }))
// 15: creado y enviado en el mismo instante, enviado primero en la lista
const g15 = agruparEventos([ev('enviado', 0, {}), ev('creado', 0, { origen: 'manual' })])

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: '1 cantidad con unidad', real: partesDiff(queso(40, 45))[0].texto, esperado: 'Queso 40 → 45 kg' },
  { nombre: '2a unidad null → kg', real: partesDiff({ cambiados: [cambio('l1', 'Queso', 40, 40, 'kg', null)] })[0].texto, esperado: 'Queso 40 → 40 kg' },
  { nombre: '2b unidad kg → Caja', real: partesDiff({ cambiados: [cambio('l1', 'Queso', 40, 40, 'Caja', 'kg')] })[0].texto, esperado: 'Queso 40 kg → 40 Caja' },
  { nombre: '3a agregó', real: partesDiff({ agregados: [linea('l2', 'Sal', 2, 'Bolsa')] })[0].texto, esperado: 'agregó Sal 2 Bolsa' },
  { nombre: '3b quitó', real: partesDiff({ quitados: [linea('l3', 'Huevos', 90, 'unidades')] })[0].texto, esperado: 'quitó Huevos 90 unidades' },
  {
    nombre: '4 textoDiff completo',
    real: textoDiff({ cambiados: [cambio('l1', 'Queso', 40, 45, 'kg')], agregados: [linea('l2', 'Sal', 2, 'Bolsa')] }),
    esperado: 'Editó ítems: Queso 40 → 45 kg; agregó Sal 2 Bolsa',
  },
  { nombre: '5 decimales', real: partesDiff({ cambiados: [cambio('l1', 'Harina', 1.5, 2.25, 'kg')] })[0].texto, esperado: 'Harina 1,5 → 2,25 kg' },
  { nombre: '5b descripción + cantidad', real: partesDiff({ cambiados: [cambio('l1', 'Bolsas 20x30', 10, 12, null, null, 'Bolsas chicas')] })[0].texto, esperado: 'Bolsas chicas → Bolsas 20x30: 10 → 12' },
  { nombre: '5c solo descripción', real: partesDiff({ cambiados: [cambio('l1', 'Bolsas 20x30', 10, 10, null, null, 'Bolsas chicas')] })[0].texto, esperado: 'Bolsas chicas → Bolsas 20x30' },
  { nombre: '6 mismo usuario a 3 min: una entrada', real: g6.length, esperado: 1 },
  { nombre: '6 combinado 40 → 50', real: textoEntrada(g6[0]?.eventos[0]?.d), esperado: 'Editó ítems: Queso 40 → 50 kg' },
  { nombre: '6 rango desde/hasta', real: g6[0]?.desde !== g6[0]?.hasta, esperado: true },
  { nombre: '7 a 6 min: dos entradas', real: g7.length, esperado: 2 },
  { nombre: '8 otro usuario en el medio: tres entradas', real: g8.length, esperado: 3 },
  { nombre: '9 vuelve al valor original: sin entrada', real: g9.length, esperado: 0 },
  { nombre: '10 agregado y quitado desaparece, queda el mensaje', real: g10.map(e => e.etiqueta).join(','), esperado: 'Generó el mensaje' },
  { nombre: '11 ítems + mensaje: una entrada "Editó el pedido"', real: `${g11.length}|${g11[0]?.etiqueta}|${g11[0]?.eventos.length}`, esperado: '1|Editó el pedido|2' },
  { nombre: '12 enviado corta el grupo', real: g12.length, esperado: 3 },
  { nombre: '13 detalle mal formado', real: `${malo.d}|${etiquetaEvento(malo)}`, esperado: 'null|Editó ítems' },
  { nombre: '13b tipo desconocido no tira', real: agruparEventos([ev('otro', 0, null)])[0]?.etiqueta, esperado: 'otro' },
  { nombre: '14 local con de null', real: etiquetaEvento(leerEvento(ev('local_cambiado', 0, { de: null, a: { id: 'x', nombre: 'Paraguay 388' } }))), esperado: 'Asignó el local de facturación' },
  { nombre: '14b local con de', real: etiquetaEvento(leerEvento(ev('local_cambiado', 0, { de: { id: 'y', nombre: 'A' }, a: { id: 'x', nombre: 'B' } }))), esperado: 'Cambió el local de facturación' },
  { nombre: '15 empate creado / enviado', real: g15.map(e => e.tipo).join(','), esperado: 'creado,enviado' },
  { nombre: 'creado desde solicitud', real: etiquetaEvento(leerEvento(ev('creado', 0, { origen: 'solicitud', solicitud_id: 's1' }))), esperado: 'Creado desde una solicitud' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
