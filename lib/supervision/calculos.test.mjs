// npm test (node --test; Node 24 corre el .ts sin compilar).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizar, anteriorCerrada, atributosEfectivos, bloquesDeVisita, calcularResumen, resultadoMq1, ultimoControl, catalogoPara, diferenciasArqueo, filtrarRequerimientos, itemVisible, requerimientosAbiertos, completarSinResponder, diferenciaPuntos, filasCsv, filtrarVisitas,
  idsSinResponder, nivelCumplimiento, pendientesDe, pendientesResueltos, rangoAnterior, rangoPeriodo, sinVisitarDesde,
  ultimaCerrada,
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
const sucursales = [
  { id: 'paraguay', nombre: 'Paraguay 388', zona: 'Corrientes Capital', orden: 1 },
  { id: 'goya', nombre: 'Goya', zona: 'Corrientes', orden: 2 },
  { id: 'santafe', nombre: 'Santa Fe', zona: 'Santa Fe', orden: 3 },
]

function visita(over) {
  return {
    id: 'v', lugar_id: 'paraguay', supervisor_nombre: 'Ana', encargado: null,
    fecha: '2026-11-01T12:00:00Z', cierre: null, estado: 'cerrada', respuestas: {}, obs_general: '',
    anterior_id: null, anterior_fecha: null, pendientes_previos: [], obs_previas: {}, resumen: null,
    creado_por: null, updated_at: '2026-11-01T12:00:00Z', ...over,
  }
}

test('cumplimiento = cumple / (cumple + no cumple); N/A y sin responder no cuentan', () => {
  const r = calcularResumen({ p1: { r: 'C' }, p2: { r: 'NC' }, l1: { r: 'NA' } }, bloques)
  assert.equal(r.pct, 50)
  assert.deepEqual([r.cumple, r.noCumple, r.na, r.sinResp, r.sinResponder], [1, 1, 1, 1, 0])
  assert.equal(r.bloques.b1, 50)
  assert.equal(r.bloques.b2, null)
})

test('redondea a un decimal', () => {
  assert.equal(calcularResumen({ p1: { r: 'C' }, p2: { r: 'C' }, l1: { r: 'NC' } }, bloques).pct, 66.7)
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

test('al cerrar, lo sin responder pasa a No cumple automático y cuenta en el porcentaje', () => {
  const resp = { p1: { r: 'C' }, p2: { obs: 'nota sin resultado' } }
  assert.deepEqual(idsSinResponder(resp, bloques), ['p2', 'l1', 'l2'])
  const cerrada = completarSinResponder(resp, bloques)
  assert.deepEqual(cerrada.p2, { obs: 'nota sin resultado', r: 'NC', auto: true })
  assert.deepEqual(cerrada.p1, { r: 'C' })
  const r = calcularResumen(cerrada, bloques)
  assert.deepEqual([r.cumple, r.noCumple, r.sinResponder, r.sinResp], [1, 3, 3, 0])
  assert.equal(r.pct, 25)
})

test('niveles: alto desde 85, medio desde 65', () => {
  assert.equal(nivelCumplimiento(85), 'alto')
  assert.equal(nivelCumplimiento(84.9), 'medio')
  assert.equal(nivelCumplimiento(65), 'medio')
  assert.equal(nivelCumplimiento(64.9), 'bajo')
  assert.equal(nivelCumplimiento(null), null)
})

test('última cerrada y anterior cerrada de la misma sucursal', () => {
  const vs = [
    visita({ id: 'a', fecha: '2026-10-01T10:00:00Z' }),
    visita({ id: 'b', fecha: '2026-10-20T10:00:00Z' }),
    visita({ id: 'c', fecha: '2026-10-25T10:00:00Z', estado: 'en_curso' }),
    visita({ id: 'd', fecha: '2026-10-30T10:00:00Z', lugar_id: 'goya' }),
  ]
  assert.equal(ultimaCerrada(vs, 'paraguay')?.id, 'b')
  assert.equal(ultimaCerrada(vs, 'paraguay', 'b')?.id, 'a')
  assert.equal(ultimaCerrada(vs, 'santafe'), null)
  assert.equal(anteriorCerrada(vs, vs[2])?.id, 'b')
  assert.equal(anteriorCerrada(vs, vs[0]), null)
  assert.equal(diferenciaPuntos(73.4, 58.2), 15)
  assert.equal(diferenciaPuntos(73, null), null)
})

test('pendientes: los No cumple de la visita anterior que siguen en el catálogo, con su observación', () => {
  const anterior = visita({ respuestas: { p1: { r: 'NC', obs: 'sin gorra' }, l1: { r: 'C' }, l2: { r: 'NC', auto: true }, viejo: { r: 'NC' } } })
  assert.deepEqual(pendientesDe(anterior, bloques), { ids: ['p1'], obs: { p1: 'sin gorra' } })
  assert.deepEqual(pendientesDe(null, bloques), { ids: [], obs: {} })
})

test('pendientes resueltos y que siguen', () => {
  const v = visita({ pendientes_previos: ['p1', 'p2', 'l1'], respuestas: { p1: { r: 'C' }, p2: { r: 'NC' } } })
  assert.deepEqual(pendientesResueltos(v), { corregidos: ['p1'], siguen: ['p2'] })
})

test('períodos con hora de Argentina', () => {
  const ahora = Date.parse('2026-11-04T15:00:00Z')
  assert.equal(new Date(rangoPeriodo('este_mes', ahora).desde).toISOString(), '2026-11-01T03:00:00.000Z')
  const pasado = rangoPeriodo('mes_pasado', ahora)
  assert.equal(new Date(pasado.desde).toISOString(), '2026-10-01T03:00:00.000Z')
  assert.equal(new Date(pasado.hasta).toISOString(), '2026-11-01T03:00:00.000Z')
  const enero = Date.parse('2027-01-01T02:00:00Z') // 31/12 23:00 en Argentina
  assert.equal(new Date(rangoPeriodo('este_mes', enero).desde).toISOString(), '2026-12-01T03:00:00.000Z')
  assert.equal(rangoPeriodo('todo', ahora).desde, null)
  const ant = rangoAnterior(rangoPeriodo('30d', ahora), ahora)
  assert.equal(ant.hasta - ant.desde, 30 * 86_400_000)
  assert.equal(rangoAnterior(rangoPeriodo('todo', ahora), ahora), null)
})

test('filtros de visitas: período, estado, nivel, zona, supervisor y texto sin acentos', () => {
  const vs = [
    visita({ id: 'a', fecha: '2026-11-02T12:00:00Z', respuestas: { p1: { r: 'C' } } }),
    visita({ id: 'b', fecha: '2026-10-10T12:00:00Z', lugar_id: 'goya', supervisor_nombre: 'Beto', respuestas: { p1: { r: 'NC' } } }),
    visita({ id: 'c', fecha: '2026-11-03T12:00:00Z', estado: 'en_curso', encargado: 'Juana Pérez' }),
  ]
  const todo = { desde: null, hasta: null }
  const ids = f => filtrarVisitas(vs, { rango: todo, ...f }, sucursales, bloques).map(v => v.id)
  assert.deepEqual(ids({ rango: rangoPeriodo('este_mes', Date.parse('2026-11-04T15:00:00Z')) }), ['a', 'c'])
  assert.deepEqual(ids({ estado: 'cerrada' }), ['a', 'b'])
  assert.deepEqual(ids({ nivel: 'bajo' }), ['b'])
  assert.deepEqual(ids({ zona: 'Corrientes' }), ['b'])
  assert.deepEqual(ids({ supervisor: 'Beto' }), ['b'])
  assert.deepEqual(ids({ texto: 'perez' }), ['c'])
  assert.deepEqual(ids({ texto: 'GOYA' }), ['b'])
})

test('análisis: mapa con la última cerrada, promedio, en rojo y top sin los automáticos', () => {
  const vs = [
    visita({ id: 'a', fecha: '2026-10-01T10:00:00Z', respuestas: { p1: { r: 'NC' }, p2: { r: 'C' } } }),
    visita({ id: 'b', fecha: '2026-10-20T10:00:00Z', respuestas: { p1: { r: 'NC' }, p2: { r: 'NC', auto: true } } }),
    visita({ id: 'c', lugar_id: 'goya', fecha: '2026-10-21T10:00:00Z', respuestas: { p1: { r: 'C' }, l1: { r: 'C' } } }),
    visita({ id: 'd', lugar_id: 'goya', fecha: '2026-10-22T10:00:00Z', estado: 'en_curso', respuestas: { l2: { r: 'NC' } } }),
  ]
  const a = analizar(vs, bloques, sucursales)
  assert.equal(a.cerradas.length, 3)
  assert.deepEqual(a.mapa.map(f => [f.sucursal.id, f.visita?.id ?? null, f.total]), [['paraguay', 'b', 0], ['goya', 'c', 100], ['santafe', null, null]])
  assert.equal(a.mapa[1].bloques.b2, 100)
  assert.equal(a.promedio, 50)
  assert.deepEqual(a.enRojo.map(s => s.id), ['paraguay'])
  assert.deepEqual(a.top, [{ itemId: 'p1', veces: 2, sucursales: 1 }])

  assert.deepEqual(analizar(vs, bloques, sucursales, { bloqueId: 'b2' }).top, [])
  assert.deepEqual(analizar(vs, bloques, sucursales, { nivel: 'alto' }).mapa.map(f => f.sucursal.id), ['goya', 'santafe'])
})

test('sucursales sin visitar en 30 días', () => {
  const ahora = Date.parse('2026-11-04T12:00:00Z')
  const vs = [
    visita({ id: 'a', fecha: '2026-10-20T10:00:00Z' }),
    visita({ id: 'b', lugar_id: 'goya', fecha: '2026-09-01T10:00:00Z' }),
    visita({ id: 'c', lugar_id: 'santafe', fecha: '2026-11-01T10:00:00Z', estado: 'en_curso' }),
  ]
  assert.deepEqual(sinVisitarDesde(vs, sucursales, ahora).map(s => s.id), ['goya', 'santafe'])
})

test('CSV: una fila por ítem del catálogo y visita; marca los sin responder', () => {
  const v = visita({ respuestas: { p1: { r: 'NC', obs: 'sin "gorra"' }, p2: { r: 'NC', auto: true } } })
  const filas = filasCsv([v], bloques, () => 'Paraguay 388', () => '01/11/2026 09:00')
  assert.equal(filas.length, 1 + 4)
  assert.deepEqual(filas[1].slice(2, 10), ['Paraguay 388', 'Ana', 'Cerrada', 0, 'Imagen', 'Gorra', 'No cumple', 'sin "gorra"'])
  assert.equal(filas[2][8], 'No cumple (sin responder)')
})

// ── Catálogo por lugar (v2) ────────────────────────────────────────────────

const catalogoV2 = [
  { id: 'b5', titulo: 'Horno', referencia: '', orden: 5, tipos: ['sucursal'], items: [
    { id: 'o1', bloque_id: 'b5', texto: '230 °C', orden: 10, condicion: null },
    { id: 'o4r', bloque_id: 'b5', texto: 'Rotativo', orden: 41, condicion: 'horno_rotativo' },
    { id: 'o4c', bloque_id: 'b5', texto: 'Convector', orden: 42, condicion: 'horno_convector' },
    { id: 'o8', bloque_id: 'b5', texto: 'Jugo', orden: 80, condicion: 'jugo' },
  ] },
  { id: 'b12', titulo: 'Baño', referencia: '', orden: 100, tipos: ['sucursal', 'fabrica', 'deposito'], items: [
    { id: 'bn1', bloque_id: 'b12', texto: 'Limpio', orden: 10, condicion: null },
  ] },
  { id: 'bf', titulo: 'Solo fábrica', referencia: '', orden: 1, tipos: ['fabrica'], items: [
    { id: 'f1', bloque_id: 'bf', texto: 'Uniforme', orden: 10, condicion: null },
  ] },
]
const lugar = (atributos, tipo = 'sucursal') => ({ id: 'x', nombre: 'X', zona: null, orden: 1, tipo, encargado: null, atributos })
const ids = bs => bs.flatMap(b => b.items.map(i => i.id))

test('horno: cada sucursal ve solo su forma de cargar; sin dato ve las dos', () => {
  assert.deepEqual(ids(catalogoPara(catalogoV2, lugar({ horno: 'rotativo' }))), ['o1', 'o4r', 'o8', 'bn1'])
  assert.deepEqual(ids(catalogoPara(catalogoV2, lugar({ horno: 'convector' }))), ['o1', 'o4c', 'o8', 'bn1'])
  assert.deepEqual(ids(catalogoPara(catalogoV2, lugar({}))), ['o1', 'o4r', 'o4c', 'o8', 'bn1'])
})

test('jugo: se oculta solo si la sucursal no trabaja con jugo preparado', () => {
  assert.equal(itemVisible({ condicion: 'jugo' }, { jugo: true }), true)
  assert.equal(itemVisible({ condicion: 'jugo' }, {}), true)
  assert.equal(itemVisible({ condicion: 'jugo' }, { jugo: false }), false)
})

test('condiciones de mayorista', () => {
  assert.equal(itemVisible({ condicion: 'cocina' }, { perfil: 'congelado' }), false)
  assert.equal(itemVisible({ condicion: 'freezer_ya' }, { freezer: 'ya' }), true)
  assert.equal(itemVisible({ condicion: 'horno_ya' }, { perfil: 'congelado', horno: 'ya' }), false)
  assert.equal(itemVisible({ condicion: 'horno_cliente' }, { perfil: 'cocina', horno: 'cliente' }), true)
  assert.equal(itemVisible({ condicion: 'con_equipos' }, {}), false)
  assert.equal(itemVisible({ condicion: 'con_equipos' }, { equipos: 2 }), true)
})

test('el catálogo se filtra por tipo y descarta bloques vacíos', () => {
  assert.deepEqual(catalogoPara(catalogoV2, lugar({}, 'fabrica')).map(b => b.id), ['b12', 'bf'])
  assert.deepEqual(catalogoPara(catalogoV2, lugar({}, 'mayorista')), [])
})

test('la visita usa los ítems guardados al iniciar, aunque cambie el horno', () => {
  const v = visita({ items_visibles: ['o1', 'o4r', 'bn1', 'h2'] })
  assert.deepEqual(ids(bloquesDeVisita(v, catalogoV2, lugar({ horno: 'convector' }))), ['o1', 'o4r', 'bn1'])
  // Visita anterior a la v2: el catálogo del lugar.
  assert.deepEqual(ids(bloquesDeVisita(visita({ items_visibles: null }), catalogoV2, lugar({ horno: 'convector', jugo: false }))), ['o1', 'o4c', 'bn1'])
})

test('pendientes: un No cumple de un ítem que ya no se muestra no vuelve', () => {
  const anterior = visita({ respuestas: { o4r: { r: 'NC', obs: 'una sola bandeja' }, o1: { r: 'NC', obs: 'frío' } } })
  const p = pendientesDe(anterior, catalogoPara(catalogoV2, lugar({ horno: 'convector' })))
  assert.deepEqual(p.ids, ['o1'])
})

// ── Diferencias de arqueo (v2) ─────────────────────────────────────────────

const conArqueo = [{ id: 'b8', titulo: 'Caja', referencia: '', orden: 8, items: [
  { id: 'c3', bloque_id: 'b8', texto: 'Arqueo', orden: 30, con_monto: true },
  { id: 'c4', bloque_id: 'b8', texto: 'Egresos', orden: 40, con_monto: false },
] }]
const lugaresArqueo = [
  { id: 'paraguay', nombre: 'Paraguay 388', zona: null, orden: 1, tipo: 'sucursal', encargado: null, atributos: {} },
  { id: 'goya', nombre: 'Goya', zona: null, orden: 2, tipo: 'sucursal', encargado: null, atributos: {} },
  { id: 'santafe', nombre: 'Santa Fe', zona: null, orden: 3, tipo: 'sucursal', encargado: null, atributos: {} },
]

test('arqueo: faltantes y sobrantes suman en valor absoluto; el mayor conserva el signo', () => {
  const vs = [
    visita({ id: '1', lugar_id: 'goya', fecha: '2026-11-01T12:00:00Z', respuestas: { c3: { r: 'NC', monto: -2500 } } }),
    visita({ id: '2', lugar_id: 'goya', fecha: '2026-11-08T12:00:00Z', respuestas: { c3: { r: 'C', monto: 120.5 } } }),
    visita({ id: '3', lugar_id: 'paraguay', respuestas: { c3: { r: 'C', monto: 0 } } }),
  ]
  const d = diferenciasArqueo(vs, conArqueo, lugaresArqueo)
  assert.deepEqual(d.map(x => x.lugar.id), ['goya', 'paraguay'])
  assert.deepEqual([d[0].visitas, d[0].total, d[0].mayor, d[0].ultima], [2, 2620.5, -2500, '2026-11-08T12:00:00Z'])
  // Un 0 cuenta como control hecho, sin sumar.
  assert.deepEqual([d[1].visitas, d[1].total], [1, 0])
})

test('arqueo: ignora visitas en curso, montos vacíos e ítems sin con_monto', () => {
  const vs = [
    visita({ lugar_id: 'goya', estado: 'en_curso', respuestas: { c3: { monto: 999 } } }),
    visita({ lugar_id: 'santafe', respuestas: { c3: { r: 'C' }, c4: { r: 'NC', monto: 50 } } }),
    visita({ lugar_id: 'paraguay', respuestas: { c3: { r: 'NC', monto: null } } }),
  ]
  assert.deepEqual(diferenciasArqueo(vs, conArqueo, lugaresArqueo), [])
})

test('arqueo: no acumula error de punto flotante', () => {
  const vs = [0.1, 0.2].map((m, i) => visita({ id: String(i), lugar_id: 'goya', respuestas: { c3: { r: 'C', monto: m } } }))
  assert.equal(diferenciasArqueo(vs, conArqueo, lugaresArqueo)[0].total, 0.3)
})

test('CSV: tipo, monto y solo los ítems que se mostraron en la visita', () => {
  const v = visita({ items_visibles: ['c3'], respuestas: { c3: { r: 'NC', obs: 'faltan', monto: -800 } } })
  const filas = filasCsv([v], conArqueo, () => 'Paraguay 388', () => '01/11/2026', {
    tipo: () => 'Sucursal', bloquesDe: x => bloquesDeVisita(x, conArqueo, undefined),
  })
  assert.equal(filas.length, 2)
  assert.deepEqual([filas[1][1], filas[1][7], filas[1][10]], ['Sucursal', 'Arqueo', -800])
})

// ── Requerimientos (v2) ────────────────────────────────────────────────────

function req(over) {
  return {
    id: 'r', lugar_id: 'cordoba', visita_id: null, descripcion: 'Falta balanza', categoria: 'herramienta_insumo',
    prioridad: 'no_urgente', estado: 'pendiente', respuesta: '', responsable: null, resuelto_at: null, creado_por: null,
    created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', ...over,
  }
}

test('requerimientos abiertos del lugar: urgentes primero, después los más viejos', () => {
  const rs = [
    req({ id: 'a', created_at: '2026-11-05T12:00:00Z' }),
    req({ id: 'b', prioridad: 'urgente', created_at: '2026-11-09T12:00:00Z' }),
    req({ id: 'c', created_at: '2026-11-02T12:00:00Z' }),
    req({ id: 'd', estado: 'resuelto' }),
    req({ id: 'e', estado: 'en_gestion', prioridad: 'reunion' }),
    req({ id: 'f', lugar_id: 'goya', prioridad: 'urgente' }),
  ]
  assert.deepEqual(requerimientosAbiertos(rs, 'cordoba').map(r => r.id), ['b', 'c', 'a', 'e'])
})

test('filtros de requerimientos: por defecto los abiertos; por estado, lugar y prioridad', () => {
  const rs = [
    req({ id: 'a' }), req({ id: 'b', estado: 'descartado' }), req({ id: 'c', lugar_id: 'goya', prioridad: 'urgente' }),
  ]
  assert.deepEqual(filtrarRequerimientos(rs, {}).map(r => r.id), ['c', 'a'])
  assert.deepEqual(filtrarRequerimientos(rs, { estado: 'todos' }).map(r => r.id), ['c', 'a', 'b'])
  assert.deepEqual(filtrarRequerimientos(rs, { estado: 'descartado' }).map(r => r.id), ['b'])
  assert.deepEqual(filtrarRequerimientos(rs, { lugar: 'goya', prioridad: 'urgente' }).map(r => r.id), ['c'])
})

// ── Equipos de Ya! en mayoristas (v2) ──────────────────────────────────────

test('un freezer u horno de Ya! en uso manda sobre la ficha; los retirados no cuentan', () => {
  const cliente = { id: 'dona', atributos: { perfil: 'cocina', freezer: 'cliente', horno: 'cliente' } }
  const equipos = [
    { tipo: 'horno', lugar_id: 'dona', situacion: 'en_uso' },
    { tipo: 'freezer', lugar_id: null, situacion: 'retirado' },
    { tipo: 'exhibidora', lugar_id: 'otro', situacion: 'en_uso' },
  ]
  assert.deepEqual(atributosEfectivos(cliente, equipos), { perfil: 'cocina', freezer: 'cliente', horno: 'ya', equipos: 1 })
  assert.deepEqual(atributosEfectivos(cliente, []), { perfil: 'cocina', freezer: 'cliente', horno: 'cliente' })
})

test('catálogo de mayorista: los equipos registrados activan sus ítems', () => {
  const bloquesM = [{ id: 'bm', titulo: 'M', referencia: '', orden: 1, tipos: ['mayorista'], items: [
    { id: 'mc1', bloque_id: 'bm', texto: '-18', orden: 10, condicion: null },
    { id: 'mc5', bloque_id: 'bm', texto: 'Freezer Ya', orden: 50, condicion: 'freezer_ya' },
    { id: 'mh2', bloque_id: 'bm', texto: 'Horno cliente', orden: 60, condicion: 'horno_cliente' },
    { id: 'mh3', bloque_id: 'bm', texto: 'Horno Ya', orden: 70, condicion: 'horno_ya' },
    { id: 'mq1', bloque_id: 'bm', texto: 'Equipos', orden: 80, condicion: 'con_equipos' },
  ] }]
  const cliente = { id: 'c', tipo: 'mayorista', atributos: { perfil: 'cocina', freezer: 'cliente', horno: 'cliente' } }
  assert.deepEqual(ids(catalogoPara(bloquesM, cliente)), ['mc1', 'mh2'])
  const conEquipos = [{ tipo: 'freezer', lugar_id: 'c', situacion: 'en_uso' }, { tipo: 'horno', lugar_id: 'c', situacion: 'en_uso' }]
  assert.deepEqual(ids(catalogoPara(bloquesM, cliente, conEquipos)), ['mc1', 'mc5', 'mh3', 'mq1'])
})

// ── Control de equipos y mq1 (v2) ──────────────────────────────────────────

test('mq1: cumple con todos controlados y bien; no cumple si uno falta, no coincide o está malo', () => {
  const ok = { presente: true, coincide: true, estado: 'bueno' }
  assert.equal(resultadoMq1({ a: ok, b: { ...ok, estado: 'regular' } }, ['a', 'b']), 'C')
  assert.equal(resultadoMq1({ a: ok }, ['a', 'b']), null)
  assert.equal(resultadoMq1({ a: ok, b: { presente: true, coincide: true } }, ['a', 'b']), null)
  assert.equal(resultadoMq1({ a: { presente: false } }, ['a', 'b']), 'NC')
  assert.equal(resultadoMq1({ a: { ...ok, coincide: false } }, ['a']), 'NC')
  assert.equal(resultadoMq1({ a: { ...ok, estado: 'malo' } }, ['a']), 'NC')
  assert.equal(resultadoMq1({}, []), null)
})

test('último control de un equipo: la visita cerrada más reciente que lo controló, de cualquier cliente', () => {
  const vs = [
    visita({ id: 'v1', lugar_id: 'a', fecha: '2026-11-01T12:00:00Z', control_equipos: { e1: { presente: true, coincide: true, estado: 'bueno' } } }),
    visita({ id: 'v2', lugar_id: 'b', fecha: '2026-11-08T12:00:00Z', control_equipos: { e1: { presente: true, coincide: true, estado: 'malo' } } }),
    visita({ id: 'v3', lugar_id: 'b', fecha: '2026-11-10T12:00:00Z', estado: 'en_curso', control_equipos: { e1: { presente: false } } }),
    visita({ id: 'v4', lugar_id: 'b', fecha: '2026-11-11T12:00:00Z', control_equipos: { e1: {} } }),
  ]
  assert.deepEqual(ultimoControl('e1', vs), { visitaId: 'v2', fecha: '2026-11-08T12:00:00Z', presente: true, estado: 'malo' })
  assert.equal(ultimoControl('otro', vs), null)
})
