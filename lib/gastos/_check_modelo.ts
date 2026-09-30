// Chequeo del modelo de Gastos. Correr con: npx tsx lib/gastos/_check_modelo.ts
import {
  agruparPorLocal, armarGastos, bloqueoFactura, diasDesde, filtrarGastos, filtrarPendientes, formInicial,
  hayCambios, motivoNoEliminar, pendienteDeFudo, pendienteDeGasto, resumirGastos, validarGasto, type GastoFila,
} from './modelo'
import { rutaComprobante } from './comprobante'

const fila = (p: Partial<GastoFila>): GastoFila => ({
  id: 'g1', fecha: '2026-09-10', local: 'YA! FABRICA', rubro: 'MATERIA PRIMA', categoria: 'HUEVOS',
  proveedor_id: 'p1', proveedor_nombre: 'Huevo Campo', monto: 1000, forma_pago: 'Transferencia',
  estado: 'Pendiente de pago', observaciones: null, comprobante_url: null, fecha_pago: null, caja: null,
  created_at: null, creado_por_nombre: null, pagado_por_nombre: null,
  factura_id: null, factura_numero: null, factura_pedido_numero: null, ...p,
})

const gastos = armarGastos([
  fila({}),
  fila({ id: 'g2', fecha: '2026-09-20', estado: 'Pagado', fecha_pago: '2026-09-21', monto: 500.5, local: 'YA! GOYA', proveedor_nombre: null }),
  fila({ id: 'g3', fecha: '2026-08-30', monto: 200, factura_id: 'f1', factura_numero: '0007-1', factura_pedido_numero: 15 }),
  fila({ id: 'g4', fecha: '2026-08-15', estado: 'Pagado', fecha_pago: '2026-09-02', monto: 300 }),
  fila({ id: null }),
])
const sep = { desde: '2026-09-01', hasta: '2026-09-30' }
const r = resumirGastos(gastos, sep.desde, sep.hasta)
const base = { estado: 'todos' as const, local: '', busqueda: '', ...sep }
const nuevo = formInicial(null, '2026-09-30', { local: 'YA! FABRICA', formaPago: 'Transferencia' })
const completo = { ...nuevo, rubro: 'MATERIA PRIMA', categoria: 'HUEVOS', monto: 10 }

const fudo = pendienteDeFudo({ id: 77, sucursal: 'YA! CORDOBA', date: '2026-09-01T10:00:00', description: '', amount: '1500.5', provider: { name: 'Lucas envios' }, expenseCategory: { name: 'Envíos' } })

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'descarta filas sin id', real: gastos.length, esperado: 4 },
  { nombre: 'ordena del más nuevo', real: gastos.map(g => g.id).join(), esperado: 'g2,g1,g3,g4' },
  { nombre: 'factura con código de pedido', real: gastos.find(g => g.id === 'g3')?.factura?.codigoPedido, esperado: 'P-0015' },
  { nombre: 'pendiente: todo lo que se debe, sin mirar el período', real: r.pendiente, esperado: 1200 },
  { nombre: 'pendientes count', real: r.pendientesCount, esperado: 2 },
  { nombre: 'pagado en el período, por fecha de pago', real: r.pagadoPeriodo, esperado: 800.5 },
  { nombre: 'total del período, por fecha del gasto', real: r.totalPeriodo, esperado: 1500.5 },
  { nombre: 'filtro período', real: filtrarGastos(gastos, base).map(g => g.id).join(), esperado: 'g2,g1' },
  { nombre: 'filtro pendientes', real: filtrarGastos(gastos, { ...base, estado: 'pendientes', desde: '', hasta: '' }).map(g => g.id).join(), esperado: 'g1,g3' },
  { nombre: 'filtro local', real: filtrarGastos(gastos, { ...base, local: 'YA! GOYA' }).length, esperado: 1 },
  { nombre: 'busca por número de factura', real: filtrarGastos(gastos, { ...base, desde: '', hasta: '', busqueda: '0007' }).map(g => g.id).join(), esperado: 'g3' },
  { nombre: 'busca por proveedor', real: filtrarGastos(gastos, { ...base, busqueda: 'campo' }).length, esperado: 1 },
  { nombre: 'form nuevo con defaults', real: `${nuevo.local}|${nuevo.formaPago}|${nuevo.fecha}`, esperado: 'YA! FABRICA|Transferencia|2026-09-30' },
  { nombre: 'valida rubro', real: validarGasto(nuevo, true)?.campo, esperado: 'rubro' },
  { nombre: 'valida monto 0', real: validarGasto({ ...completo, monto: 0 }, true)?.campo, esperado: 'monto' },
  { nombre: 'completo es válido', real: validarGasto(completo, true), esperado: null },
  { nombre: 'ya pagado pide caja', real: validarGasto({ ...completo, yaPagado: true }, true)?.campo, esperado: 'caja' },
  { nombre: 'al editar no pide caja', real: validarGasto({ ...completo, yaPagado: true }, false), esperado: null },
  { nombre: 'sin cambios', real: hayCambios(nuevo, { ...nuevo }), esperado: false },
  { nombre: 'con cambios', real: hayCambios({ ...nuevo, monto: 5 }, nuevo), esperado: true },
  { nombre: 'bloqueo de factura', real: bloqueoFactura(gastos.find(g => g.id === 'g3') ?? null)?.startsWith('Salió de la factura 0007-1 (P-0015)'), esperado: true },
  { nombre: 'sin factura no bloquea', real: bloqueoFactura(gastos[0]), esperado: null },
  { nombre: 'no se elimina si salió de una factura', real: motivoNoEliminar(gastos.find(g => g.id === 'g3')!) != null, esperado: true },
  { nombre: 'pendiente de la app: título proveedor', real: `${pendienteDeGasto(gastos[1]).titulo}|${pendienteDeGasto(gastos[1]).detalle}`, esperado: 'Huevo Campo|HUEVOS' },
  { nombre: 'fudo sin descripción usa el proveedor', real: `${fudo.titulo}|${fudo.detalle}`, esperado: 'Lucas envios|Envíos' },
  { nombre: 'fudo monto string', real: fudo.monto, esperado: 1500.5 },
  { nombre: 'fudo fecha recortada', real: fudo.fecha, esperado: '2026-09-01' },
  { nombre: 'fudo clave con sucursal', real: fudo.clave, esperado: 'fudo:YA! CORDOBA:77' },
  {
    nombre: 'agrupa por local, lo más viejo arriba',
    real: agruparPorLocal([pendienteDeGasto(gastos[1]), fudo, pendienteDeGasto(gastos[2])]).map(g => `${g.local}:${g.items.map(i => i.fecha).join('/')}`).join(' '),
    esperado: 'YA! CORDOBA:2026-09-01 YA! FABRICA:2026-08-30/2026-09-10',
  },
  { nombre: 'total del grupo', real: agruparPorLocal([pendienteDeGasto(gastos[1]), pendienteDeGasto(gastos[2])])[0].total, esperado: 1200 },
  { nombre: 'filtra pendientes por texto', real: filtrarPendientes([fudo, pendienteDeGasto(gastos[1])], { local: '', busqueda: 'lucas', desde: '', hasta: '' }).length, esperado: 1 },
  { nombre: 'comprobante: ruta tal cual', real: rutaComprobante('gastos/app-1/1.png'), esperado: 'gastos/app-1/1.png' },
  { nombre: 'comprobante: URL pública vieja', real: rutaComprobante('https://x.supabase.co/storage/v1/object/public/comprobantes/gastos/g%201/2.pdf'), esperado: 'gastos/g 1/2.pdf' },
  { nombre: 'comprobante: URL firmada', real: rutaComprobante('https://x.supabase.co/storage/v1/object/sign/comprobantes/gastos/a.png?token=abc'), esperado: 'gastos/a.png' },
  { nombre: 'comprobante: URL de otro lado', real: rutaComprobante('https://otro.com/a.png'), esperado: null },
  { nombre: 'comprobante: vacío', real: rutaComprobante(null), esperado: null },
  { nombre: 'días desde', real: diasDesde('2026-08-31', '2026-09-30'), esperado: 30 },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
