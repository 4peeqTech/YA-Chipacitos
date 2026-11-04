// npm test (node --test; Node 24 corre el .ts sin compilar).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizar, calcularResumen, filasCsv, nivelCumplimiento, pendientesDe, pendientesResueltos, ultimaCerrada,
} from './calculos.ts'

const bloques = [
  { id: 'b1', titulo: 'Imagen', referencia: '', orden: 1, items: [
    { id: 'p1', bloque_id: 'b1', texto: 'Gorra', orden: 1 },
    { id: 'p2', bloque_id: 'b1', texto: 'Remera', orden: 2 },
  ] },
  { id: 'b2', titulo: 'Local', referencia: '', orden: 2, items: [
    { id: 'l1', bloque_id: 'b2', texto: 'Limpio', orden: 1 },
    { id: 'l2', bloque_id: 'b2', texto: 'Vitrina', orden: 2 },
  ] },
]

function visita(over) {
  return {
    id: 'v', sucursal_id: 'paraguay', supervisor_nombre: 'Ana', encargado: null,
    fecha: '2026-11-01T12:00:00Z', cierre: null, estado: 'cerrada', respuestas: {}, obs_general: '',
    anterior_id: null, anterior_fecha: null, pendientes_previos: [], obs_previas: {}, resumen: null,
    creado_por: null, updated_at: '2026-11-01T12:00:00Z', ...over,
  }
}

test('cumplimiento = cumple / (cumple + no cumple); N/A y sin responder no cuentan', () => {
  const r = calcularResumen({ p1: { r: 'C' }, p2: { r: 'NC' }, l1: { r: 'NA' } }, bloques)
  assert.equal(r.pct, 50)
  assert.deepEqual([r.cumple, r.noCumple, r.na, r.sinResp], [1, 1, 1, 1])
  assert.equal(r.bloques.b1, 50)
  assert.equal(r.bloques.b2, null)
})

test('redondea a un decimal', () => {
  const r = calcularResumen({ p1: { r: 'C' }, p2: { r: 'C' }, l1: { r: 'NC' } }, bloques)
  assert.equal(r.pct, 66.7)
})

test('sin respuestas computables el porcentaje es null', () => {
  assert.equal(calcularResumen({}, bloques).pct, null)
  assert.equal(calcularResumen({ p1: { r: 'NA' }, p2: { obs: 'algo' } }, bloques).pct, null)
})

test('ignora respuestas de ítems que ya no están en el catálogo', () => {
  const r = calcularResumen({ viejo: { r: 'NC' }, p1: { r: 'C' } }, bloques)
  assert.equal(r.pct, 100)
  assert.equal(r.noCumple, 0)
})

test('niveles: alto desde 85, medio desde 65', () => {
  assert.equal(nivelCumplimiento(85), 'alto')
  assert.equal(nivelCumplimiento(84.9), 'medio')
  assert.equal(nivelCumplimiento(65), 'medio')
  assert.equal(nivelCumplimiento(64.9), 'bajo')
  assert.equal(nivelCumplimiento(null), null)
})

test('última cerrada: la más reciente de la sucursal, sin contar la excluida ni las en curso', () => {
  const vs = [
    visita({ id: 'a', fecha: '2026-10-01T10:00:00Z' }),
    visita({ id: 'b', fecha: '2026-10-20T10:00:00Z' }),
    visita({ id: 'c', fecha: '2026-10-25T10:00:00Z', estado: 'en_curso' }),
    visita({ id: 'd', fecha: '2026-10-30T10:00:00Z', sucursal_id: 'goya' }),
  ]
  assert.equal(ultimaCerrada(vs, 'paraguay')?.id, 'b')
  assert.equal(ultimaCerrada(vs, 'paraguay', 'b')?.id, 'a')
  assert.equal(ultimaCerrada(vs, 'santafe'), null)
})

test('pendientes: los No cumple de la visita anterior que siguen en el catálogo, con su observación', () => {
  const anterior = visita({ respuestas: { p1: { r: 'NC', obs: 'sin gorra' }, l1: { r: 'C' }, viejo: { r: 'NC' } } })
  assert.deepEqual(pendientesDe(anterior, bloques), { ids: ['p1'], obs: { p1: 'sin gorra' } })
  assert.deepEqual(pendientesDe(null, bloques), { ids: [], obs: {} })
})

test('pendientes resueltos y que siguen', () => {
  const v = visita({ pendientes_previos: ['p1', 'p2', 'l1'], respuestas: { p1: { r: 'C' }, p2: { r: 'NC' } } })
  assert.deepEqual(pendientesResueltos(v), { corregidos: ['p1'], siguen: ['p2'] })
})

test('análisis: promedio con la última cerrada de cada sucursal y top de incumplidos', () => {
  const vs = [
    visita({ id: 'a', fecha: '2026-10-01T10:00:00Z', respuestas: { p1: { r: 'NC' }, p2: { r: 'C' } } }),
    visita({ id: 'b', fecha: '2026-10-20T10:00:00Z', respuestas: { p1: { r: 'NC' }, p2: { r: 'NC' } } }),
    visita({ id: 'c', sucursal_id: 'goya', fecha: '2026-10-21T10:00:00Z', respuestas: { p1: { r: 'C' }, l1: { r: 'C' } } }),
    visita({ id: 'd', sucursal_id: 'goya', fecha: '2026-10-22T10:00:00Z', estado: 'en_curso', respuestas: { l2: { r: 'NC' } } }),
  ]
  const a = analizar(vs, bloques, 'todas')
  assert.equal(a.cerradas.length, 3)
  assert.deepEqual(a.ultimas.map(v => v.id).sort(), ['b', 'c'])
  assert.equal(a.promedio, 50) // b = 0 %, c = 100 %
  assert.equal(a.noCumplenHoy, 2)
  assert.deepEqual(a.top[0], { itemId: 'p1', veces: 2 })
  assert.equal(a.porBloque.find(b => b.bloque.id === 'b2').pct, 100)

  const soloParaguay = analizar(vs, bloques, 'paraguay')
  assert.equal(soloParaguay.cerradas.length, 2)
  assert.equal(soloParaguay.promedio, 0)
})

test('CSV: una fila por ítem del catálogo y visita', () => {
  const v = visita({ respuestas: { p1: { r: 'NC', obs: 'sin "gorra"' } } })
  const filas = filasCsv([v], bloques, () => 'Paraguay 388', () => '01/11/2026 09:00')
  assert.equal(filas.length, 1 + 4)
  assert.deepEqual(filas[1].slice(1, 9), ['Paraguay 388', 'Ana', 'Cerrada', 0, 'Imagen', 'Gorra', 'No cumple', 'sin "gorra"'])
})
