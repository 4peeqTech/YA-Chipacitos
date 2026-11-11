// Chequeo de las funciones puras del comprobante y el mensaje de factura (B2).
// Correr con: npx tsx lib/compras/_check_comprobante.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALTO, TOPE_LINEAS, altoComprobante, armarComprobante, fechaHoraNumerica, fechaNumerica, nombreArchivoComprobante,
  type DatosComprobante, type FilasComprobante, type LineaComprobante,
} from './comprobanteFactura'
import { CUERPO_FACTURA_FALLBACK, EJEMPLO_FACTURA, renderPlantillaFactura } from './facturaMensaje'

let ok = 0
const casos: [string, () => void][] = []
const caso = (nombre: string, fn: () => void) => casos.push([nombre, fn])

const filas = (extra: Partial<FilasComprobante> = {}): FilasComprobante => ({
  factura: {
    id: 'f1', numero: '0001-00000777', fecha: '2026-10-05', fecha_vencimiento: '2026-10-20',
    subtotal: 125000, iva: 25200, total: 150200, gasto_estado: 'Pendiente de pago',
    confirmada_en: '2026-10-05T17:10:00Z', confirmada_por_nombre: 'Marcos',
  },
  pedidoNumero: 16,
  items: [
    { descripcion: 'Queso barra', cantidad: 2, unidad: 'caja', precio_unitario: 60000, alicuota_iva: 21, subtotal: 120000 },
    { descripcion: 'Flete', cantidad: 1, unidad: null, precio_unitario: 5000, alicuota_iva: 0, subtotal: 5000 },
  ],
  remitos: [{ secuencia: 2 }, { secuencia: 1 }],
  local: null,
  proveedor: { nombre: 'Montecarlo', cuit: '30-71234567-8' },
  generadoPor: 'Santiago',
  ahora: '2026-10-05T17:32:00Z',
  ...extra,
})

const linea = (descripcion: string, alicuota = 21): LineaComprobante =>
  ({ descripcion, cantidad: 1, unidad: 'kg', precioUnitario: 100, alicuota, subtotal: 100, cantidadBase: null, precioPor: 'unidad', unidadBase: null })
const conLineas = (lineas: LineaComprobante[]): DatosComprobante => ({ ...EJEMPLO_FACTURA, lineas })

caso('1. fechas', () => {
  assert.equal(fechaNumerica('2026-10-05'), '05/10/2026')
  assert.equal(fechaHoraNumerica('2026-10-05T02:30:00Z'), '04/10/2026 23:30')
})

caso('2. nombre de archivo', () => {
  assert.equal(nombreArchivoComprobante({ numero: '0001-00000777', proveedor: { nombre: 'Montecarlo S.A.', cuit: null } }),
    'Factura-0001-00000777-MONTECARLO-S-A.png')
  const raro = nombreArchivoComprobante({ numero: 'A 0001/ 777', proveedor: { nombre: 'Lácteos Ñandú', cuit: null } })
  assert.match(raro, /^[A-Za-z0-9-]+\.png$/)
  assert.ok(!raro.includes('--'), raro)
})

caso('3. armarComprobante: remitos ordenados, sin el 0 %', () => {
  const d = armarComprobante(filas())
  assert.deepEqual(d.remitos, ['R-0016-01', 'R-0016-02'])
  assert.equal(d.pedido, 'P-0016')
  assert.deepEqual(d.porAlicuota.map(g => g.alicuota), [21])
  assert.equal(d.porAlicuota[0].iva, 25200)
})

caso('4. mensaje estándar', () => {
  const t = renderPlantillaFactura(CUERPO_FACTURA_FALLBACK, EJEMPLO_FACTURA)
  assert.ok(t.includes('*FACTURA 0001-00001234*'), t)
  assert.match(t, /\*TOTAL: \$\s247\.000,00\*/)
  assert.ok(t.includes('IVA 21 %'), t)
  assert.ok(t.includes('Facturado a'), t)
})

caso('5. sin IVA', () => {
  const d = armarComprobante(filas({
    factura: { ...filas().factura, iva: 0, total: 125000 },
    items: [{ descripcion: 'Flete', cantidad: 1, unidad: null, precio_unitario: 125000, alicuota_iva: 0, subtotal: 125000 }],
  }))
  assert.equal(renderPlantillaFactura('{{iva_detalle}}', d), '')
  assert.ok(!renderPlantillaFactura(CUERPO_FACTURA_FALLBACK, d).includes('IVA'))
})

caso('6. sin vencimiento ni local', () => {
  const d = armarComprobante(filas({ factura: { ...filas().factura, fecha_vencimiento: null } }))
  const t = renderPlantillaFactura(CUERPO_FACTURA_FALLBACK, d)
  assert.ok(t.includes('Vence: sin vencimiento'), t)
  assert.ok(!t.includes('Facturado a'), t)
})

caso('7. línea libre sin unidad', () => {
  const t = renderPlantillaFactura('{{detalle}}', armarComprobante(filas()))
  assert.match(t, /^ {3}— 1 FLETE: \$\s5\.000,00$/m)
  assert.ok(!t.includes('  FLETE'), t)
})

caso('8. variable desconocida', () => {
  assert.equal(renderPlantillaFactura('a{{xyz}}b', EJEMPLO_FACTURA), 'ab')
})

caso('9. alto', () => {
  const cortas = (n: number) => Array.from({ length: n }, (_, i) => linea(`Item ${i}`))
  const largas = (n: number) => Array.from({ length: n }, () => linea('Descripción bastante larga de un insumo de prueba'))
  assert.ok(altoComprobante(conLineas(cortas(1))) < altoComprobante(conLineas(cortas(10))))
  assert.ok(altoComprobante(conLineas(cortas(10))) < altoComprobante(conLineas(largas(10))))
  assert.equal(altoComprobante(conLineas(cortas(130))), altoComprobante(conLineas(cortas(TOPE_LINEAS))) + ALTO.linea)
  assert.ok(altoComprobante(conLineas(cortas(1))) >= ALTO.minimo)
})

caso('11. A2b: línea por kg (el IVA sale de kg × precio)', () => {
  const d = armarComprobante(filas({
    factura: { ...filas().factura, subtotal: 41750, iva: 8767.5, total: 50517.5 },
    items: [{
      descripcion: 'Queso Barra', cantidad: 2, unidad: 'Caja', precio_unitario: 1250, alicuota_iva: 21, subtotal: 41750,
      cantidad_base: 33.4, precio_por: 'base', compras_items: { unidad_base: 'kg' },
    }],
  }))
  assert.equal(d.porAlicuota[0].base, 41750)
  assert.equal(d.porAlicuota[0].iva, 8767.5)
  assert.equal(d.lineas[0].unidadBase, 'kg')
  const t = renderPlantillaFactura('{{detalle}}', d)
  assert.ok(t.includes('2 CAJA (33,4 KG) QUESO BARRA'), t)
  assert.match(t, /41\.750,00/)
})

caso('10. fallback = seed de la migración', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261005170000_compras_plantillas_tipo.sql'), 'utf8')
  const m = sql.match(/'Factura estándar',\s*E'([^']*)'/)
  assert.ok(m, 'no encontré el seed')
  assert.equal(m[1].replace(/\\n/g, '\n'), CUERPO_FACTURA_FALLBACK)
})

for (const [nombre, fn] of casos) {
  try { fn(); ok++ } catch (e) { console.error(`FALLA ${nombre}:`, (e as Error).message) }
}
console.log(`${ok === casos.length ? 'OK' : 'FALLA'} ${ok}/${casos.length}`)
if (ok !== casos.length) process.exit(1)
