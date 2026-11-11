// Chequeo de la normalización de gastos de Fudo. Correr con: npx tsx lib/gastos/_check_fudo.ts
// La conciliación con la base está en docs/gastos/escenarios-f3.sql.
import { fechaFudo, normalizarGastoFudo } from './fudoSync'

const ctaCte = { id: 'p1', amount: 1000, paid_at: '2026-10-28T13:00:00Z', canceled: false, paymentMethod: { name: 'Cta. Cte.' } }
const efectivo = { id: 'p2', amount: '450.5', paidAt: '2026-10-29T02:30:00Z', canceled: false, paymentMethod: { name: 'Efectivo' } }

const impago = normalizarGastoFudo({ id: 10, amount: '1000', date: '2026-10-28', description: ' Flete ', status: 'UNPAID', canceled: false, expenseCategory: { name: 'Envíos' }, provider: { name: 'Lucas' }, payments: [ctaCte] })!
const pagado = normalizarGastoFudo({ id: 11, amount: 450.5, date: '2026-10-28', status: 'PAID', payments: [efectivo, { ...ctaCte, id: 'p3', canceled: true }] })!
const pagadoSinDetalle = normalizarGastoFudo({ id: 12, amount: 300, date: '2026-10-01', paymentDate: '2026-10-02', status: 'PAID', payments: [] })!
const pagadoEnCtaCte = normalizarGastoFudo({ id: 13, amount: 300, date: '2026-10-01', status: 'PAID', payments: [ctaCte] })!
const cancelado = normalizarGastoFudo({ id: 14, amount: 5, date: '2026-10-01', status: 'UNPAID', canceled: true, dueDate: '2026-11-15' })!

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'sin id: se descarta', real: normalizarGastoFudo({ amount: 1 }), esperado: null },
  { nombre: 'id como texto', real: impago.fudo_id, esperado: '10' },
  { nombre: 'monto de texto', real: impago.monto, esperado: 1000 },
  { nombre: 'descripción recortada', real: impago.descripcion, esperado: 'Flete' },
  { nombre: 'categoría y proveedor', real: `${impago.categoria}|${impago.proveedor}`, esperado: 'Envíos|Lucas' },
  { nombre: 'Cta. Cte. no es pago', real: impago.pagos.length, esperado: 0 },
  { nombre: 'impago en Cta. Cte. se muestra así', real: impago.forma, esperado: 'Cta. Cte.' },
  { nombre: 'pago en efectivo: uno, sin el cancelado', real: pagado.pagos.length, esperado: 1 },
  { nombre: 'pago: monto y forma', real: `${pagado.pagos[0].monto}|${pagado.pagos[0].forma}|${pagado.forma}`, esperado: '450.5|Efectivo|Efectivo' },
  { nombre: 'pago a la madrugada UTC cae el día anterior en Argentina', real: pagado.pagos[0].fecha, esperado: '2026-10-28' },
  { nombre: 'PAID sin detalle: un pago por el total', real: `${pagadoSinDetalle.pagos[0]?.id}|${pagadoSinDetalle.pagos[0]?.monto}|${pagadoSinDetalle.pagos[0]?.fecha}`, esperado: 'gasto-12|300|2026-10-02' },
  { nombre: 'PAID con Cta. Cte.: sigue siendo deuda', real: pagadoEnCtaCte.pagos.length, esperado: 0 },
  { nombre: 'cancelado y vencimiento', real: `${cancelado.cancelado}|${cancelado.vencimiento}`, esperado: 'true|2026-11-15' },
  { nombre: 'fecha: date tal cual', real: fechaFudo('2026-10-28'), esperado: '2026-10-28' },
  { nombre: 'fecha: vacía', real: fechaFudo(''), esperado: null },
  { nombre: 'fecha: basura', real: fechaFudo('ayer'), esperado: null },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
