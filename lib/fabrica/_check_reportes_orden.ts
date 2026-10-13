// Chequeo del orden de los reportes de fábrica.
// Correr con: npx tsx lib/fabrica/_check_reportes_orden.ts
import {
  agruparProduccion, agruparEmbolsado, agruparDevoluciones, ordenarResumen, ordenarProduccionFilas,
  type ProduccionFila, type EmbolsadoFila, type DevolucionFila, type OrdenResumen,
} from './reportes'

let fallos = 0
function eq(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) {
    fallos++
    console.error(`FALLA ${nombre}\n  real: ${JSON.stringify(real)}\n  esperado: ${JSON.stringify(esperado)}`)
  } else {
    console.log(`ok ${nombre}`)
  }
}

const fila = (fecha: string, op: string, fecula: number, masa: number): ProduccionFila =>
  ({ fecha, turno: 'manana', operarioId: op, operarioNombre: op, saborNombre: 'Queso', feculaKg: fecula, masaKg: masa })
const prod = [fila('2026-10-01', 'Ana', 30, 76), fila('2026-10-03', 'Beto', 30, 75), fila('2026-10-02', 'Ana', 0, 10)]

const porDia = agruparProduccion(prod, 'fecha')
const claves = (o: OrdenResumen) => ordenarResumen(porDia, o, r => r.masaKg, r => r.cargas).map(r => r.clave)
eq('fecha_desc', claves('fecha_desc'), ['2026-10-03', '2026-10-02', '2026-10-01'])
eq('fecha_asc', claves('fecha_asc'), ['2026-10-01', '2026-10-02', '2026-10-03'])
eq('kg_desc', claves('kg_desc'), ['2026-10-01', '2026-10-03', '2026-10-02'])
eq('no muta el original', porDia.length, 3)

const emb: EmbolsadoFila[] = [
  { fecha: '2026-10-02', presentacionNombre: 'Bolsa', saborNombre: 'Queso', tamanioNombre: 'x1', operarioId: null, operarioNombre: 'Ana', cantidadKg: 5 },
  { fecha: '2026-10-02', presentacionNombre: 'Bolsa', saborNombre: 'Queso', tamanioNombre: 'x1', operarioId: null, operarioNombre: 'Ana', cantidadKg: 3 },
  { fecha: '2026-10-05', presentacionNombre: 'Bolsa', saborNombre: 'Queso', tamanioNombre: 'x1', operarioId: null, operarioNombre: 'Ana', cantidadKg: 1 },
]
eq(
  'embolsado por día',
  ordenarResumen(agruparEmbolsado(emb, 'fecha'), 'fecha_desc', r => r.cantidadKg, r => r.lineas).map(r => [r.clave, r.cantidadKg, r.lineas]),
  [['2026-10-05', 1, 1], ['2026-10-02', 8, 2]]
)

const dev: DevolucionFila[] = [
  { fecha: '2026-10-04', motivoNombre: 'Roto', saborNombre: 'Queso', tamanioNombre: 'x1', presentacionNombre: 'Bolsa', destino: 'perdida', cantidadKg: 2 },
  { fecha: '2026-10-01', motivoNombre: 'Roto', saborNombre: 'Queso', tamanioNombre: 'x1', presentacionNombre: 'Bolsa', destino: 'perdida', cantidadKg: 9 },
]
eq(
  'devoluciones por día asc',
  ordenarResumen(agruparDevoluciones(dev, 'fecha'), 'fecha_asc', r => r.cantidadKg, r => r.cargas).map(r => r.clave),
  ['2026-10-01', '2026-10-04']
)

eq('tabla fecha desc', ordenarProduccionFilas(prod, 'fecha', false).map(f => f.fecha), ['2026-10-03', '2026-10-02', '2026-10-01'])
eq('tabla masa asc', ordenarProduccionFilas(prod, 'masaKg', true).map(f => f.masaKg), [10, 75, 76])
eq('tabla rendimiento desc (sin fécula al final)', ordenarProduccionFilas(prod, 'rendimiento', false).map(f => f.masaKg), [76, 75, 10])
eq('tabla operario asc', ordenarProduccionFilas(prod, 'operarioNombre', true).map(f => f.operarioNombre), ['Ana', 'Ana', 'Beto'])

if (fallos) {
  console.error(`${fallos} fallos`)
  process.exit(1)
}
console.log('todo ok')
