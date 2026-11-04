// Chequeo del modelo de Gastos. Correr con: npx tsx lib/gastos/_check_modelo.ts
// Los filtros y los totales los calcula la base (docs/gastos/escenarios-f2.sql).
import {
  armarGastos, armarPagos, atraso, bloqueoFactura, leerFiltrosPendientes, paramsDePendientes, diasDesde, formInicial,
  hayCambios, hayFiltros, leerFiltros, leerResumen, mesDe, motivoNoEliminar, paramsDeFiltros,
  pendienteDeGasto, validarGasto, formRecurrenteInicial, textoDia, validarRecurrente,
  type GastoFila, type PagoFila,
} from './modelo'
import { rutaComprobante } from './comprobante'

const fila = (p: Partial<GastoFila>): GastoFila => ({
  id: 'g1', fecha: '2026-09-10', local: 'YA! FABRICA', rubro: 'MATERIA PRIMA', categoria: 'HUEVOS',
  proveedor_id: 'p1', proveedor_nombre: 'Huevo Campo', monto: 1000, forma_pago: 'Transferencia',
  estado: 'Pendiente de pago', observaciones: null, comprobante_url: null, fecha_pago: null, caja: null,
  created_at: null, creado_por_nombre: null, pagado_por_nombre: null,
  factura_id: null, factura_numero: null, factura_pedido_numero: null,
  origen: 'manual', fecha_vencimiento: null, vencido: false, pagado: 0, saldo: null, pagos: 0, adjuntos: 0,
  ultimo_pago_forma: null, fudo_id: null, fudo_categoria: null, fudo_proveedor: null, fudo_estado: null,
  fudo_revisar: false, fudo_sincronizado_en: null, fudo_descripcion: null, recurrente_id: null, periodo: null, a_confirmar: false, ...p,
})

const gastos = armarGastos([
  fila({}),
  fila({ id: 'g2', fecha: '2026-09-20', estado: 'Pagado', fecha_pago: '2026-09-21', monto: 500.5, pagado: 500.5, pagos: 1, local: 'YA! GOYA', proveedor_nombre: null }),
  fila({ id: 'g3', fecha: '2026-08-30', monto: 200, factura_id: 'f1', factura_numero: '0007-1', factura_pedido_numero: 15 }),
  fila({ id: 'g5', estado: 'Parcial', monto: 1000, pagado: 400, saldo: 600, pagos: 1 }),
  fila({ id: 'g6', origen: 'fudo', rubro: null, categoria: null }),
  fila({ id: null }),
])
const g = (id: string) => gastos.find(x => x.id === id)!
const hoy = '2026-11-03'
const nuevo = formInicial(null, '2026-09-30', { local: 'YA! FABRICA', formaPago: 'Transferencia' })
const completo = { ...nuevo, rubro: 'MATERIA PRIMA', categoria: 'HUEVOS', monto: 10 }

const porDefecto = leerFiltros({}, hoy)
const conTodo = leerFiltros({ desde: '2026-10-01', hasta: '2026-10-31', estado: 'pendientes', local: 'YA! GOYA', q: ' huevos ', origen: 'fudo', pagina: '3' }, hoy)
const pagos = armarPagos([
  { id: 'p1', gasto_id: 'g5', fecha: '2026-10-01', monto: 100, forma_pago: 'Efectivo', caja: 'Goya', comprobante_url: null, origen: 'app', fudo_payment_id: null, registrado_por: null, registrado_por_nombre: 'Ana', created_at: null, anulado_en: '2026-10-02T10:00:00Z', anulado_por: null, anulado_por_nombre: 'Ana', anulado_motivo: 'duplicado' },
  { id: 'p2', gasto_id: 'g5', fecha: '2026-10-01', monto: 400, forma_pago: 'Efectivo', caja: 'Goya', comprobante_url: null, origen: 'app', fudo_payment_id: null, registrado_por: null, registrado_por_nombre: 'Ana', created_at: null, anulado_en: null, anulado_por: null, anulado_por_nombre: null, anulado_motivo: null },
  { id: 'p3', gasto_id: 'g5', fecha: '2026-10-05', monto: 50, forma_pago: 'Efectivo', caja: null, comprobante_url: null, origen: 'fudo', fudo_payment_id: '9', registrado_por: null, registrado_por_nombre: null, created_at: null, anulado_en: null, anulado_por: null, anulado_por_nombre: null, anulado_motivo: null },
] as PagoFila[])

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'descarta filas sin id', real: gastos.length, esperado: 5 },
  { nombre: 'factura con código de pedido', real: g('g3').factura?.codigoPedido, esperado: 'P-0015' },
  { nombre: 'saldo sin dato de la vista: monto - pagado', real: g('g1').saldo, esperado: 1000 },
  { nombre: 'parcial: se paga por el saldo', real: pendienteDeGasto(g('g5')).monto, esperado: 600 },
  // Filtros en la URL
  { nombre: 'mes de hoy', real: `${mesDe(hoy).desde}|${mesDe(hoy).hasta}`, esperado: '2026-11-01|2026-11-30' },
  { nombre: 'mes con 29 días', real: mesDe('2028-02-10').hasta, esperado: '2028-02-29' },
  { nombre: 'sin parámetros: el mes de hoy, todo', real: `${porDefecto.desde}|${porDefecto.hasta}|${porDefecto.estado}|${porDefecto.pagina}`, esperado: '2026-11-01|2026-11-30|todos|1' },
  { nombre: 'sin parámetros no cuenta como filtro', real: hayFiltros(porDefecto, hoy), esperado: false },
  { nombre: 'sin parámetros: URL vacía', real: paramsDeFiltros(porDefecto, hoy), esperado: '' },
  { nombre: 'periodo=todo: sin fechas', real: `${leerFiltros({ periodo: 'todo' }, hoy).desde}|${leerFiltros({ periodo: 'todo' }, hoy).hasta}`, esperado: '|' },
  { nombre: 'todo el período se escribe en la URL', real: paramsDeFiltros({ ...porDefecto, desde: '', hasta: '' }, hoy), esperado: 'periodo=todo' },
  { nombre: 'lee todos los filtros', real: `${conTodo.estado}|${conTodo.local}|${conTodo.q}|${conTodo.origen}|${conTodo.pagina}`, esperado: 'pendientes|YA! GOYA|huevos|fudo|3' },
  { nombre: 'ida y vuelta', real: paramsDeFiltros(leerFiltros(Object.fromEntries(new URLSearchParams(paramsDeFiltros(conTodo, hoy))), hoy), hoy), esperado: paramsDeFiltros(conTodo, hoy) },
  { nombre: 'valores inválidos caen al defecto', real: JSON.stringify(leerFiltros({ estado: 'x', origen: 'y', pagina: '-2', desde: '2026-13' }, hoy)), esperado: JSON.stringify(porDefecto) },
  { nombre: 'solo "hasta" no completa el desde', real: leerFiltros({ hasta: '2026-10-31' }, hoy).desde, esperado: '' },
  // Resumen
  { nombre: 'resumen desde el jsonb', real: JSON.stringify(leerResumen({ pendiente: '10.005', pendientes_count: 2, filtrado_total: null })), esperado: JSON.stringify({ pendiente: 10.01, pendientesCount: 2, pagadoPeriodo: 0, totalPeriodo: 0, gastosPeriodo: 0, filtradoTotal: 0 }) },
  { nombre: 'resumen vacío', real: leerResumen(null).pendiente, esperado: 0 },
  // Pagos
  { nombre: 'pagos: vigentes primero, el más reciente arriba', real: pagos.map(p => p.id).join(), esperado: 'p3,p2,p1' },
  { nombre: 'pago anulado con motivo', real: pagos.find(p => p.id === 'p1')?.anulado?.motivo, esperado: 'duplicado' },
  { nombre: 'pago de Fudo', real: pagos[0].origen, esperado: 'fudo' },
  // Formulario
  { nombre: 'form nuevo con defaults', real: `${nuevo.local}|${nuevo.formaPago}|${nuevo.fecha}|${nuevo.fechaVencimiento}`, esperado: 'YA! FABRICA|Transferencia|2026-09-30|' },
  { nombre: 'valida rubro', real: validarGasto(nuevo, true)?.campo, esperado: 'rubro' },
  { nombre: 'valida monto 0', real: validarGasto({ ...completo, monto: 0 }, true)?.campo, esperado: 'monto' },
  { nombre: 'completo es válido', real: validarGasto(completo, true), esperado: null },
  { nombre: 'vencimiento antes de la fecha', real: validarGasto({ ...completo, fechaVencimiento: '2026-09-01' }, true)?.campo, esperado: 'fechaVencimiento' },
  { nombre: 'vencimiento el mismo día vale', real: validarGasto({ ...completo, fechaVencimiento: '2026-09-30' }, true), esperado: null },
  { nombre: 'ya pagado pide caja', real: validarGasto({ ...completo, yaPagado: true }, true)?.campo, esperado: 'caja' },
  { nombre: 'al editar no pide caja', real: validarGasto({ ...completo, yaPagado: true }, false), esperado: null },
  { nombre: 'sin cambios', real: hayCambios(nuevo, { ...nuevo }), esperado: false },
  { nombre: 'con cambios', real: hayCambios({ ...nuevo, monto: 5 }, nuevo), esperado: true },
  { nombre: 'editar trae el vencimiento', real: formInicial({ ...g('g1'), fechaVencimiento: '2026-10-10' }, hoy).fechaVencimiento, esperado: '2026-10-10' },
  // Candados
  { nombre: 'bloqueo de factura', real: bloqueoFactura(g('g3'))?.startsWith('Salió de la factura 0007-1 (P-0015)'), esperado: true },
  { nombre: 'sin factura no bloquea', real: bloqueoFactura(g('g1')), esperado: null },
  { nombre: 'no se elimina si salió de una factura', real: motivoNoEliminar(g('g3'))?.startsWith('Este gasto salió de la factura'), esperado: true },
  { nombre: 'no se elimina si viene de Fudo', real: motivoNoEliminar(g('g6'))?.startsWith('Este gasto viene de Fudo'), esperado: true },
  { nombre: 'no se elimina con pagos', real: motivoNoEliminar(g('g5'))?.startsWith('Este gasto tiene pagos'), esperado: true },
  { nombre: 'sin pagos se elimina', real: motivoNoEliminar(g('g1')), esperado: null },
  // Pendientes (todo es un gasto de la base)
  { nombre: 'pendiente: título proveedor', real: `${pendienteDeGasto(g('g1')).titulo}|${pendienteDeGasto(g('g1')).detalle}`, esperado: 'Huevo Campo|HUEVOS' },
  { nombre: 'pendiente de Fudo: detalle con lo de Fudo', real: pendienteDeGasto(g('g6')).detalle, esperado: 'Sin clasificar' },
  // Comprobantes
  { nombre: 'comprobante: ruta tal cual', real: rutaComprobante('gastos/app-1/1.png'), esperado: 'gastos/app-1/1.png' },
  { nombre: 'comprobante: URL pública vieja', real: rutaComprobante('https://x.supabase.co/storage/v1/object/public/comprobantes/gastos/g%201/2.pdf'), esperado: 'gastos/g 1/2.pdf' },
  { nombre: 'comprobante: URL firmada', real: rutaComprobante('https://x.supabase.co/storage/v1/object/sign/comprobantes/gastos/a.png?token=abc'), esperado: 'gastos/a.png' },
  { nombre: 'comprobante: URL de otro lado', real: rutaComprobante('https://otro.com/a.png'), esperado: null },
  { nombre: 'comprobante: vacío', real: rutaComprobante(null), esperado: null },
  { nombre: 'días desde', real: diasDesde('2026-08-31', '2026-09-30'), esperado: 30 },
  // Gastos de Fudo
  {
    nombre: 'Fudo: título con la descripción, abajo "Sin clasificar" y lo de Fudo',
    real: (() => { const x = armarGastos([fila({ id: 'f1', origen: 'fudo', rubro: null, categoria: null, proveedor_nombre: null, fudo_descripcion: 'Flete', fudo_proveedor: 'Lucas', fudo_categoria: 'Envíos' })])[0]; return `${x.titulo}|${x.subtitulo}` })(),
    esperado: 'Flete|Sin clasificar · Lucas · Envíos',
  },
  {
    nombre: 'Fudo clasificado: abajo la categoría de la app',
    real: armarGastos([fila({ id: 'f2', origen: 'fudo', rubro: 'PERSONAL', categoria: 'PERSONAL', proveedor_nombre: null, fudo_descripcion: null, fudo_proveedor: 'Lucas', fudo_categoria: null })])[0].subtitulo,
    esperado: 'PERSONAL',
  },
  { nombre: 'Fudo: se guarda sin clasificar', real: validarGasto({ ...completo, rubro: '', categoria: '' }, false, true), esperado: null },
  { nombre: 'Fudo: con rubro pide categoría', real: validarGasto({ ...completo, categoria: '' }, false, true)?.campo, esperado: 'categoria' },
  // Gastos que se repiten
  {
    nombre: 'recurrente: el título es el nombre de la plantilla',
    real: (() => { const x = armarGastos([fila({ id: 'r1', origen: 'recurrente', recurrente_id: 'p1', periodo: '2026-10', a_confirmar: true, observaciones: 'Luz Córdoba\nmedidor 2', proveedor_nombre: 'EPEC' })])[0]; return `${x.titulo}|${x.subtitulo}|${x.recurrente?.aConfirmar}` })(),
    esperado: 'Luz Córdoba|EPEC · HUEVOS|true',
  },
  { nombre: 'textoDia: el 31 es el último', real: textoDia(31), esperado: 'el último día de cada mes' },
  { nombre: 'textoDia: el 30 avisa', real: textoDia(30), esperado: 'el 30 de cada mes (o el último, si el mes es más corto)' },
  { nombre: 'textoDia: el 10', real: textoDia(10), esperado: 'el 10 de cada mes' },
  { nombre: 'plantilla nueva: el día de hoy y desde hoy', real: `${formRecurrenteInicial(null, '2026-11-04', 'Transferencia').diaDelMes}|${formRecurrenteInicial(null, '2026-11-04').desde}`, esperado: '4|2026-11-04' },
  { nombre: 'plantilla: pide nombre', real: validarRecurrente(formRecurrenteInicial(null, '2026-11-04', 'Transferencia'))?.campo, esperado: 'nombre' },
  {
    nombre: 'plantilla completa es válida',
    real: validarRecurrente({ ...formRecurrenteInicial(null, '2026-11-04', 'Transferencia'), nombre: 'Alquiler', local: 'YA! GOYA', rubro: 'SERVICIOS Y ESTRUCTURA', categoria: 'ALQUILER', monto: 100 }),
    esperado: null,
  },
  {
    nombre: 'plantilla: fin antes del inicio',
    real: validarRecurrente({ ...formRecurrenteInicial(null, '2026-11-04', 'Transferencia'), nombre: 'A', local: 'L', rubro: 'R', categoria: 'C', monto: 1, hasta: '2026-01-01' })?.campo,
    esperado: 'hasta',
  },
  {
    nombre: 'plantilla: día 0 inválido',
    real: validarRecurrente({ ...formRecurrenteInicial(null, '2026-11-04', 'Transferencia'), nombre: 'A', local: 'L', rubro: 'R', categoria: 'C', monto: 1, diaDelMes: 0 })?.campo,
    esperado: 'diaDelMes',
  },
  // Atraso y filtros de Pendientes
  { nombre: 'atraso sin vencimiento: a los 30 días', real: atraso({ fecha: '2026-09-01', vencimiento: null, vencido: false }, '2026-10-05'), esperado: 'hace 34 días' },
  { nombre: 'atraso sin vencimiento: antes de 30, nada', real: atraso({ fecha: '2026-10-01', vencimiento: null, vencido: false }, '2026-10-05'), esperado: null },
  { nombre: 'atraso con vencimiento: manda el vencimiento', real: atraso({ fecha: '2026-01-01', vencimiento: '2026-12-10', vencido: false }, '2026-10-05'), esperado: null },
  { nombre: 'atraso vencido', real: atraso({ fecha: '2026-10-01', vencimiento: '2026-10-03', vencido: true }, '2026-10-05'), esperado: 'venció el 03/10' },
  { nombre: 'pendientes: orden por defecto, más viejos', real: leerFiltrosPendientes({}).orden, esperado: 'viejos' },
  { nombre: 'pendientes: ida y vuelta', real: paramsDePendientes(leerFiltrosPendientes({ local: 'YA! GOYA', q: 'luz', orden: 'nuevos', desde: '2026-10-01', hasta: 'x' })), esperado: 'desde=2026-10-01&local=YA%21+GOYA&q=luz&orden=nuevos' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
