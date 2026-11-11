// Chequeo del reporte "Por insumo" (A2c). Correr con: npx tsx lib/compras/_check_reportePorInsumo.ts
import {
  filasReporte, totalesReporte, cabecerasCsv, filasCsv, nombreCsv, filtrarReporte, categoriasReporte,
} from './reportePorInsumo'
import type { FilaTrazabilidad } from './trazabilidad'

function fila(p: Partial<Record<keyof FilaTrazabilidad, unknown>>): FilaTrazabilidad {
  return {
    item_id: 'x', item_nombre: 'X', item_estado: 'activo', categoria_nombre: 'Materia prima',
    unidad: 'Caja', unidad_base: 'kg', contenido: 16.5,
    pedido_cantidad: 0, pedidos: 0, recibido_cantidad: 0, recibido_base_real: null, recibido_sin_pesar: 0, remitos: 0,
    facturado_cantidad: 0, facturado_base: 0, facturado_neto: 0, facturado_total: 0, facturas: 0, proveedores_facturados: 0,
    precio_prom_unidad: null, precio_prom_base: null,
    ultimo_precio: null, ultimo_precio_por: null, ultimo_precio_fecha: null, ultimo_precio_factura_id: null, ultimo_precio_proveedor: null,
    stock_inicio: 0, stock_fin: 0, stock_actual: 0,
    mov_remitos: 0, mov_conteo: 0, mov_factura: 0, mov_manual: 0, mov_devolucion: 0, mov_otros: 0,
    consumido_produccion: 0, pendiente_recibir: 0,
    ...p,
  } as unknown as FilaTrazabilidad
}

const queso = fila({
  item_nombre: 'Queso Barra', recibido_cantidad: 170, recibido_base_real: 49.1, recibido_sin_pesar: 6,
  facturado_cantidad: 84, facturado_base: 1386.8, facturado_neto: 243500, facturado_total: 294635, facturas: 4,
  precio_prom_unidad: 2898.8095238095238, precio_prom_base: 175.5840784539948,
})
const fecula = fila({ item_nombre: 'Fécula de Mandioca', unidad: 'Bolsa', contenido: 25, facturado_neto: 1000, facturado_total: 1210, facturas: 1 })
// NC: el neto viene negativo de la función (signo −1).
const conNc = fila({ item_nombre: 'Margarina', categoria_nombre: 'Grasas', unidad: 'Unid.', unidad_base: 'unidades', contenido: 1,
  facturado_neto: -300, facturado_total: -363, facturas: 1 })
const bolsa = fila({ item_nombre: 'Bolsa Consorcio', unidad: 'Unid.', unidad_base: 'unidades', contenido: 1, recibido_cantidad: 10, recibido_sin_pesar: 2 })

const admin = filasReporte([queso, fecula, conNc])
const noAdmin = filasReporte([fila({ ...queso, facturado_cantidad: null, facturado_neto: null, facturado_total: null, facturas: null })])
const tot = totalesReporte(admin)
const cabNo = cabecerasCsv(false)

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  // 1. CSV no admin
  { nombre: 'CSV no admin sin "$" ni "Factur"', real: cabNo.some(c => c.includes('$') || /factur/i.test(c)), esperado: false },
  { nombre: 'CSV no admin: filas del mismo ancho', real: filasCsv(noAdmin, false)[0].length, esperado: cabNo.length },
  { nombre: 'CSV admin: 21 columnas', real: cabecerasCsv(true).length, esperado: 21 },
  { nombre: 'CSV admin: filas del mismo ancho', real: filasCsv(admin, true)[0].length, esperado: 21 },
  { nombre: 'CSV números crudos', real: filasCsv(admin, true)[0][10], esperado: 243500 },
  { nombre: 'CSV null vacío', real: filasCsv(admin, true)[1][6], esperado: null },
  // 2. totales con NC
  { nombre: 'totales: la NC resta del neto', real: tot.neto, esperado: 243500 + 1000 - 300 },
  { nombre: 'totales: la NC resta del total', real: tot.total, esperado: 294635 + 1210 - 363 },
  { nombre: 'totales: insumos', real: tot.insumos, esperado: 3 },
  // 3. filtro
  { nombre: 'buscar "fecula" encuentra Fécula', real: filtrarReporte(admin, { texto: 'fecula', categoria: null }).map(f => f.t.nombre).join(), esperado: 'Fécula de Mandioca' },
  { nombre: 'buscar "QUESO"', real: filtrarReporte(admin, { texto: 'QUESO', categoria: null }).length, esperado: 1 },
  { nombre: 'filtrar por categoría', real: filtrarReporte(admin, { texto: '', categoria: 'Grasas' }).map(f => f.t.nombre).join(), esperado: 'Margarina' },
  { nombre: 'categorías presentes', real: categoriasReporte(admin).join(), esperado: 'Grasas,Materia prima' },
  // 4. nombre
  { nombre: 'nombre del CSV', real: nombreCsv('2026-09-01', '2026-09-30'), esperado: 'compras_por_insumo_2026-09-01_2026-09-30.csv' },
  // textos
  { nombre: 'recibido con kg y sin pesar', real: admin[0].recibidoTexto, esperado: '170 Caja · 49,1 kg (6 sin pesar)' },
  { nombre: 'recibido sin conversión', real: filasReporte([bolsa])[0].recibidoTexto, esperado: '10 Unid.' },
  { nombre: 'facturado con kg', real: admin[0].facturadoTexto, esperado: '84 Caja · 1.386,8 kg' },
  { nombre: 'facturado no admin', real: noAdmin[0].facturadoTexto, esperado: null },
  { nombre: 'precio promedio', real: admin[0].precioPromTexto, esperado: '$ 2.898,81 /Caja · $ 175,58 /kg' },
  { nombre: 'precio promedio sin dato', real: admin[1].precioPromTexto, esperado: null },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
