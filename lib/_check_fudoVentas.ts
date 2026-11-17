// Chequeo de Ventas Fudo. Correr con: npx tsx lib/_check_fudoVentas.ts
import {
  csvCaja, csvVentas, diasDelPeriodo, fechaHoraArgentina, filtroDiasArgentina, mediosOrdenados, movimientosDePaginas,
  nombreCsv, resumirCaja, resumirVentas, validarPeriodo, ventasDePaginas, type PaginaFudo,
} from './fudoVentas'

// Una venta con dos cobros (uno cancelado) y otra en efectivo, en dos páginas.
const paginasVentas: PaginaFudo[] = [
  {
    data: [{
      id: '1', type: 'Sale', attributes: { total: 1500, createdAt: '2026-10-15T23:30:00Z', saleType: 'TAKEAWAY' },
      relationships: { cashRegister: { data: { type: 'CashRegister', id: 'c1' } }, payments: { data: [{ type: 'Payment', id: 'p1' }, { type: 'Payment', id: 'p2' }] } },
    }],
    included: [
      { id: 'c1', type: 'CashRegister', attributes: { name: 'Caja 1' } },
      { id: 'p1', type: 'Payment', attributes: { amount: 1000, canceled: false }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: 'm1' } } } },
      { id: 'p2', type: 'Payment', attributes: { amount: 999, canceled: true }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: 'm2' } } } },
      { id: 'm1', type: 'PaymentMethod', attributes: { name: 'Efectivo' } },
      { id: 'm2', type: 'PaymentMethod', attributes: { name: 'Transferencia' } },
    ],
  },
  {
    data: [
      { id: '2', type: 'Sale', attributes: { total: 500, createdAt: '2026-10-16T02:59:00Z', saleType: 'EAT-IN' },
        relationships: { payments: { data: [{ type: 'Payment', id: 'p3' }] } } },
      // Repetida entre páginas: no se cuenta dos veces.
      { id: '1', type: 'Sale', attributes: { total: 1500, createdAt: '2026-10-15T23:30:00Z' } },
    ],
    included: [
      { id: 'p3', type: 'Payment', attributes: { amount: 500 }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: 'm2' } } } },
      { id: 'm2', type: 'PaymentMethod', attributes: { name: 'Transferencia' } },
    ],
  },
]
const ventas = ventasDePaginas(paginasVentas, 'YA! CORDOBA')
const rv = resumirVentas('YA! CORDOBA', ventas)

const movs = movimientosDePaginas([{
  data: [
    { id: 'a', type: 'Payment', attributes: { amount: 1000, createdAt: '2026-10-15T23:30:00Z' }, relationships: { sale: { data: { type: 'Sale', id: '1' } }, paymentMethod: { data: { type: 'PaymentMethod', id: 'm1' } } } },
    { id: 'b', type: 'Payment', attributes: { amount: 300, createdAt: '2026-10-15T12:00:00Z' }, relationships: { expense: { data: { type: 'Expense', id: 'e' } }, paymentMethod: { data: { type: 'PaymentMethod', id: 'm1' } } } },
    { id: 'c', type: 'Payment', attributes: { amount: 50, canceled: true, createdAt: '2026-10-15T12:00:00Z' }, relationships: { sale: { data: { type: 'Sale', id: '2' } }, paymentMethod: { data: { type: 'PaymentMethod', id: 'm1' } } } },
  ],
  included: [{ id: 'm1', type: 'PaymentMethod', attributes: { name: 'Efectivo' } }],
}], 'YA! VERA')
const rc = resumirCaja('YA! VERA', movs)
const csv = csvVentas(ventas)
const lineas = csv.replace('﻿', '').trim().split('\r\n')

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'días del período: octubre', real: diasDelPeriodo('2026-10-01', '2026-10-31'), esperado: 31 },
  { nombre: 'período: hasta 62 días va', real: validarPeriodo('2026-09-01', '2026-11-01'), esperado: null },
  { nombre: 'período: 63 días no', real: validarPeriodo('2026-09-01', '2026-11-02')?.startsWith('El período puede tener hasta 62'), esperado: true },
  { nombre: 'período: al revés no', real: validarPeriodo('2026-10-31', '2026-10-01'), esperado: 'La fecha de fin no puede ser antes del inicio.' },
  { nombre: 'período: sin fecha no', real: validarPeriodo('', '2026-10-01'), esperado: 'Elegí las dos fechas del período.' },
  { nombre: 'filtro: días de Argentina en UTC', real: filtroDiasArgentina('2026-10-01', '2026-10-31'), esperado: 'and(gte.2026-10-01T03:00:00Z,lte.2026-11-01T02:59:59Z)' },
  { nombre: 'hora: 23:30 UTC son las 20:30', real: JSON.stringify(fechaHoraArgentina('2026-10-15T23:30:00Z')), esperado: '{"fecha":"15/10/2026","hora":"20:30","dia":"2026-10-15"}' },
  { nombre: 'hora: 02:59 UTC es el día anterior', real: fechaHoraArgentina('2026-10-16T02:59:00Z').fecha, esperado: '15/10/2026' },
  { nombre: 'ventas: dos, sin repetir la de las dos páginas', real: ventas.length, esperado: 2 },
  { nombre: 'venta: caja y tipo', real: `${ventas[0].caja}|${ventas[0].tipo}`, esperado: 'Caja 1|TAKEAWAY' },
  { nombre: 'venta: el cobro cancelado no cuenta', real: JSON.stringify(ventas[0].pagos), esperado: '[{"medio":"Efectivo","monto":1000}]' },
  { nombre: 'resumen: ventas, total y ticket', real: `${rv.ventas}|${rv.total}|${rv.ticket}`, esperado: '2|2000|1000' },
  { nombre: 'resumen: por medio de pago', real: JSON.stringify(rv.porMedio), esperado: '{"Efectivo":1000,"Transferencia":500}' },
  { nombre: 'resumen vacío: ticket 0', real: resumirVentas('X', []).ticket, esperado: 0 },
  { nombre: 'caja: cobro, pago de gasto y cancelado', real: movs.map(m => `${m.origen}${m.cancelado ? '-x' : ''}`).join(','), esperado: 'venta,gasto,venta-x' },
  { nombre: 'caja: totales sin el cancelado', real: `${rc.cobros}|${rc.pagos}|${rc.otros}`, esperado: '1000|300|0' },
  { nombre: 'caja: por medio', real: JSON.stringify(rc.porMedio), esperado: '{"Efectivo":{"cobros":1000,"pagos":300,"otros":0}}' },
  { nombre: 'medios: del que más movió', real: mediosOrdenados([{ A: 10, B: 50 }, { A: 60 }]).join(','), esperado: 'A,B' },
  { nombre: 'csv ventas: BOM', real: csv.startsWith('﻿'), esperado: true },
  { nombre: 'csv ventas: encabezado con los medios', real: lineas[0], esperado: 'Local;Fecha;Hora;Caja;Tipo;Total;Efectivo;Transferencia' },
  { nombre: 'csv ventas: fila con coma decimal y hora local', real: lineas[1], esperado: 'YA! CORDOBA;15/10/2026;20:30;Caja 1;Para llevar;1500,00;1000,00;' },
  { nombre: 'csv ventas: segunda fila', real: lineas[2], esperado: 'YA! CORDOBA;15/10/2026;23:59;;En el local;500,00;;500,00' },
  { nombre: 'csv caja: fila del gasto', real: csvCaja(movs).replace('﻿', '').split('\r\n')[1], esperado: 'YA! VERA;15/10/2026;09:00;Pago de gasto;Efectivo;300,00;No' },
  { nombre: 'csv: comillas si hay punto y coma', real: csvVentas([{ id: 'x', local: 'A;B', fecha: '2026-10-15T12:00:00Z', caja: null, tipo: null, total: 1, pagos: [] }]).split('\r\n')[1].split(';')[0], esperado: '"A' },
  { nombre: 'nombre del csv', real: nombreCsv('ventas', '2026-10-01', '2026-10-31', 'YA! SAENZ PEÑA'), esperado: 'ventas-fudo_ya-saenz-pena_2026-10-01_2026-10-31.csv' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
