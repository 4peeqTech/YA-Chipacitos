// Chequeo de la trazabilidad por insumo (A2c). Correr con: npx tsx lib/compras/_check_trazabilidad.ts
import {
  armarPuente, aTrazabilidad, precioEfectivo, puntosPrecio, seriesPrecio, modoPrecioInicial,
  COLORES_SERIES, COLOR_OTROS, type FilaTrazabilidad, type LineaDocumento, type PuntoPrecio,
} from './trazabilidad'
import { calcularRangoUltimos } from './rangoFechas'
import type { UnidadesInsumo } from './unidades'

const queso: UnidadesInsumo = { unidad: 'Caja', unidadBase: 'kg', contenido: 16.5 }
const bolsa: UnidadesInsumo = { unidad: 'Unid.', unidadBase: 'unidades', contenido: 1 }

// Fila real de Queso Barra, 01/09–31/10, como admin (escenarios-A2c.sql T1).
const qbAdmin = {
  item_id: '7e60be56-9d6d-41dc-b2bd-30fce887ca24', item_nombre: 'Queso Barra', item_estado: 'activo',
  categoria_nombre: 'Materia prima', unidad: 'Caja', unidad_base: 'kg', contenido: 16.5,
  pedido_cantidad: 214, pedidos: 7,
  recibido_cantidad: 170, recibido_base_real: 49.1, recibido_sin_pesar: 6, remitos: 8,
  facturado_cantidad: 84, facturado_base: 1386.8, facturado_neto: 243500, facturado_total: 294635,
  facturas: 4, proveedores_facturados: 1,
  precio_prom_unidad: 2898.8095238095238, precio_prom_base: 175.5840784539948,
  ultimo_precio: 1250, ultimo_precio_por: 'base', ultimo_precio_fecha: '2026-10-06',
  ultimo_precio_factura_id: 'e1afd019-93a9-4770-8d77-15c247c69588', ultimo_precio_proveedor: 'GLOBAL',
  stock_inicio: 28, stock_fin: 182, stock_actual: 182,
  mov_remitos: 170, mov_conteo: 0, mov_factura: 0, mov_manual: 10, mov_devolucion: 0, mov_otros: -26,
  consumido_produccion: 0, pendiente_recibir: 183,
} as FilaTrazabilidad

// Lo que devuelve la función a un no admin: todo lo de facturas en null.
const qbCoord = {
  ...qbAdmin,
  facturado_cantidad: null, facturado_base: null, facturado_neto: null, facturado_total: null,
  facturas: null, proveedores_facturados: null, precio_prom_unidad: null, precio_prom_base: null,
  ultimo_precio: null, ultimo_precio_por: null, ultimo_precio_fecha: null,
  ultimo_precio_factura_id: null, ultimo_precio_proveedor: null,
} as unknown as FilaTrazabilidad

const puenteQb = armarPuente(qbAdmin)
const puenteConsumo = armarPuente({ ...qbAdmin, consumido_produccion: 12, stock_fin: 170 })

function linea(p: Partial<LineaDocumento>): LineaDocumento {
  return {
    tipo: 'factura', lineaId: 'l', documentoId: 'f', fecha: '2026-10-01', codigo: 'N', origen: null,
    tipoComprobante: 'factura', pedidoId: null, pedidoNumero: null, proveedorId: 'g', proveedor: 'GLOBAL',
    cantidad: 2, cantidadBase: 33.4, precioPor: 'base', precioUnitario: 1250, subtotal: 41750, cargadoEn: null,
    ...p,
  }
}
const lineas: LineaDocumento[] = [
  linea({ lineaId: 'a', fecha: '2026-09-10' }),
  linea({ lineaId: 'b', fecha: '2026-08-01', tipoComprobante: 'nota_credito' }),
  linea({ lineaId: 'c', fecha: '2026-08-02', subtotal: 0 }),
  linea({ lineaId: 'd', fecha: '2026-07-15', proveedorId: 'h', proveedor: 'AL SA' }),
  linea({ lineaId: 'e', tipo: 'remito', tipoComprobante: null }),
]
const pts = puntosPrecio(lineas, queso, 'base')

function punto(proveedorId: string, proveedor: string): PuntoPrecio {
  return { fecha: '2026-09-01', precio: 1, proveedorId, proveedor, facturaId: 'f', numero: 'N', subtotal: 1 }
}
const seis = [
  punto('p1', 'Zeta'), punto('p2', 'Alfa'), punto('p3', 'Beta'), punto('p4', 'Gamma'), punto('p5', 'Delta'), punto('p6', 'Épsilon'),
]
const s6 = seriesPrecio(seis, 'p1')
const s5 = seriesPrecio(seis.filter(p => p.proveedorId !== 'p4'), 'p1')  // saco Gamma (va después de Beta)
const colorDe = (s: ReturnType<typeof seriesPrecio>, id: string) => s.find(x => x.proveedorId === id)?.color

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  // 1. puente real de Queso Barra
  { nombre: 'puente QB cuadra', real: puenteQb.cuadra, esperado: true },
  { nombre: 'puente QB 7 pasos', real: puenteQb.pasos.length, esperado: 7 },
  { nombre: 'puente QB orden', real: puenteQb.pasos.map(p => p.clave).join(','), esperado: 'remitos,conteo,factura,manual,devolucion,consumo,otros' },
  { nombre: 'puente QB 28 + 170 + 10 − 26 = 182', real: `${puenteQb.inicio}→${puenteQb.fin}`, esperado: '28→182' },
  { nombre: 'puente que no cierra', real: armarPuente({ ...qbAdmin, stock_fin: 183 }).cuadra, esperado: false },
  // 2. consumo
  { nombre: 'consumo 12 → delta −12', real: puenteConsumo.pasos.find(p => p.clave === 'consumo')?.delta, esperado: -12 },
  { nombre: 'consumo 12 → cuadra', real: puenteConsumo.cuadra, esperado: true },
  // 3. no admin
  { nombre: 'no admin → facturado null', real: aTrazabilidad(qbCoord).facturado, esperado: null },
  { nombre: 'no admin → recibido igual', real: aTrazabilidad(qbCoord).recibido.cantidad, esperado: 170 },
  { nombre: 'admin → último por kg', real: aTrazabilidad(qbAdmin).facturado?.ultimo?.por, esperado: 'base' },
  { nombre: 'admin → unidades', real: JSON.stringify(aTrazabilidad(qbAdmin).unidades), esperado: JSON.stringify(queso) },
  // 4. precio efectivo
  { nombre: 'precio $/Caja', real: precioEfectivo({ cantidad: 2, cantidadBase: 33.4, subtotal: 41750 }, queso, 'unidad'), esperado: 20875 },
  { nombre: 'precio $/kg', real: precioEfectivo({ cantidad: 2, cantidadBase: 33.4, subtotal: 41750 }, queso, 'base'), esperado: 1250 },
  { nombre: 'precio sin kg: cantidad × 16,5',
    real: precioEfectivo({ cantidad: 2, cantidadBase: null, subtotal: 3300 }, queso, 'base'), esperado: 100 },
  { nombre: 'precio con cantidad 0', real: precioEfectivo({ cantidad: 0, cantidadBase: 33.4, subtotal: 41750 }, queso, 'base'), esperado: null },
  // 5. puntos
  { nombre: 'puntos sin NC, sin subtotal 0 ni remitos', real: pts.map(p => p.fecha).join(','), esperado: '2026-07-15,2026-09-10' },
  // 6. series
  { nombre: '6 proveedores → 4 series + Otros', real: s6.map(s => s.proveedor).join(','), esperado: 'Zeta,Alfa,Beta,Delta,Otros' },
  { nombre: 'principal primero con el color de acento', real: s6[0].color, esperado: COLORES_SERIES[0] },
  { nombre: 'Otros en muted', real: s6[4].color, esperado: COLOR_OTROS },
  { nombre: 'Otros junta 2 proveedores', real: s6[4].puntos.length, esperado: 2 },
  { nombre: 'sacar uno no cambia el color de los anteriores',
    real: ['p1', 'p2', 'p3'].every(id => colorDe(s5, id) === colorDe(s6, id)), esperado: true },
  // 7. modo inicial
  { nombre: 'modo inicial Bolsa Consorcio', real: modoPrecioInicial(bolsa, 'base'), esperado: 'unidad' },
  { nombre: 'modo inicial QB con principal por kg', real: modoPrecioInicial(queso, 'base'), esperado: 'base' },
  { nombre: 'modo inicial QB con principal por Caja', real: modoPrecioInicial(queso, 'unidad'), esperado: 'unidad' },
  // rango "últimos"
  { nombre: '3 meses al 06/10', real: JSON.stringify(calcularRangoUltimos(3, new Date(2026, 9, 6), 'meses')),
    esperado: JSON.stringify({ desde: '2026-07-06', hasta: '2026-10-06' }) },
  { nombre: '30 días al 06/10', real: JSON.stringify(calcularRangoUltimos(30, new Date(2026, 9, 6))),
    esperado: JSON.stringify({ desde: '2026-09-06', hasta: '2026-10-06' }) },
  { nombre: '12 meses al 06/10', real: calcularRangoUltimos(12, new Date(2026, 9, 6), 'meses').desde, esperado: '2025-10-06' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
