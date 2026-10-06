// Chequeo de las funciones puras de los avisos de compras (B5).
// Correr con: npx tsx lib/compras/_check_avisos.ts
import {
  armarAvisos, destinatariosDe, resumenCorrida, leerConfigAvisos, listaCorta, configAFilas,
  CONFIG_AVISOS_DEFAULT, type FilaAviso, type PerfilAviso,
} from './avisos'

const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'
const D1 = '33333333-3333-3333-3333-333333333333'
const I1 = '44444444-4444-4444-4444-444444444444'

const fila = (p: Partial<FilaAviso>): FilaAviso => ({
  tipo: 'pedido_demorado', entidad_id: P1, pedido_id: P1, numero: 75, codigo: null, proveedor_nombre: 'GLOBAL',
  insumo_nombre: null, unidad: null, cantidad: null, minimo: null, dias: 5, pendientes: null, repetido: false, ...p,
})

const perfiles: PerfilAviso[] = [
  { id: 'admin1', rol: 'admin', modulos_permitidos: null },
  { id: 'admin2', rol: 'admin', modulos_permitidos: [] },
  { id: 'pedidos', rol: 'squad', modulos_permitidos: ['compras-pedidos'] },
  { id: 'stock', rol: 'squad', modulos_permitidos: ['compras-stock'] },
  { id: 'reportes', rol: 'squad', modulos_permitidos: ['compras-reportes', 'dashboard'] },
]

const [demorado] = armarAvisos([fila({})])
const [listo] = armarAvisos([fila({ tipo: 'remito_listo', numero: 81, dias: null })])
const [dif] = armarAvisos([fila({ tipo: 'diferencias', numero: 80, dias: 4, pendientes: 2 })])
const [dif1] = armarAvisos([fila({ tipo: 'diferencias', numero: 80, dias: 1, pendientes: 1 })])
const [nc] = armarAvisos([fila({ tipo: 'nc_pendiente', entidad_id: D1, numero: 80, codigo: 'D-0080-02', dias: 8 })])
const [stock] = armarAvisos([fila({ tipo: 'stock_bajo', entidad_id: I1, pedido_id: null, numero: null, insumo_nombre: 'Queso Barra', unidad: 'Caja', cantidad: 1.5, minimo: 3, dias: null })])
const varios = armarAvisos([fila({ numero: 75 }), fila({ entidad_id: P2, pedido_id: P2, numero: 77 }), fila({ entidad_id: D1, pedido_id: D1, numero: 81 })])
const muchos = armarAvisos(Array.from({ length: 7 }, (_, i) => fila({ entidad_id: `e${i}`, pedido_id: `e${i}`, numero: 70 + i, tipo: 'remito_listo' })))
const mezcla = armarAvisos([fila({}), fila({ tipo: 'stock_bajo', entidad_id: I1, pedido_id: null, insumo_nombre: 'Fécula', cantidad: 0, minimo: 2 }), fila({ tipo: 'stock_bajo', entidad_id: 'i2', pedido_id: null, insumo_nombre: 'Queso', cantidad: 1, minimo: 2 })])
const ncVarios = armarAvisos([fila({ tipo: 'nc_pendiente', entidad_id: D1, codigo: 'D-0080-02' }), fila({ tipo: 'nc_pendiente', entidad_id: 'd2', codigo: 'D-0081-01' })])
const [sigue] = armarAvisos([fila({ repetido: true })])
const [sigueMezcla] = armarAvisos([fila({ repetido: true }), fila({ entidad_id: P2, pedido_id: P2, numero: 77 })])

const cfgVacia = leerConfigAvisos([])
const cfgRara = leerConfigAvisos([
  { clave: 'pedidos.dias_demora', valor: 'abc' },
  { clave: 'avisos.repetir_dias', valor: 99 },
  { clave: 'avisos.diferencias.dias', valor: 0 },
  { clave: 'avisos.nc_pendiente.dias', valor: 2.5 },
  { clave: 'avisos.stock_bajo.activo', valor: 'no' },
])
const cfgOk = leerConfigAvisos([
  { clave: 'pedidos.dias_demora', valor: 5 },
  { clave: 'avisos.repetir_dias', valor: '2' },
  { clave: 'avisos.pedido_demorado.activo', valor: false },
  { clave: 'avisos.stock_bajo.activo', valor: 'false' },
])

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'demorado: título', real: demorado.title, esperado: '🚚 Pedido demorado' },
  { nombre: 'demorado: cuerpo', real: demorado.body, esperado: 'P-0075 a GLOBAL se envió hace 5 días y no llegó completo.' },
  { nombre: 'demorado: url al pedido', real: demorado.url, esperado: `/admin/compras/pedidos?pedido=${P1}` },
  { nombre: 'demorado: tag fijo', real: demorado.tag, esperado: 'compras_pedido_demorado' },
  { nombre: 'listo: título', real: listo.title, esperado: '📦 Listo para facturar' },
  { nombre: 'listo: cuerpo', real: listo.body, esperado: 'P-0081 de GLOBAL: llegó todo. Cargá la factura cuando llegue.' },
  { nombre: 'diferencias: plural', real: dif.body, esperado: 'P-0080 (GLOBAL): 2 diferencias con la factura hace 4 días.' },
  { nombre: 'diferencias: singular y 1 día', real: dif1.body, esperado: 'P-0080 (GLOBAL): 1 diferencia con la factura hace 1 día.' },
  { nombre: 'nc: cuerpo', real: nc.body, esperado: 'D-0080-02 (GLOBAL) la espera hace 8 días.' },
  { nombre: 'nc: url con la devolución', real: nc.url, esperado: `/admin/compras/pedidos?pedido=${P1}&devolucion=${D1}` },
  { nombre: 'stock: cuerpo con coma decimal', real: stock.body, esperado: 'Queso Barra: 1,5 Caja (mínimo 3). No hay pedido abierto.' },
  { nombre: 'stock: url a la ficha', real: stock.url, esperado: `/admin/compras/stock?insumo=${I1}` },
  { nombre: 'varios: un solo mensaje', real: varios.length, esperado: 1 },
  { nombre: 'varios: título', real: varios[0].title, esperado: '🚚 3 pedidos demorados' },
  { nombre: 'varios: códigos', real: varios[0].body, esperado: 'P-0075, P-0077 y P-0081' },
  { nombre: 'varios: lista filtrada', real: varios[0].url, esperado: '/admin/compras/pedidos?alerta=demorados' },
  { nombre: 'muchos: y N más', real: muchos[0].body, esperado: 'P-0070, P-0071, P-0072, P-0073, P-0074 y 2 más' },
  { nombre: 'muchos listos: a Por facturar', real: muchos[0].url, esperado: '/admin/compras/pedidos?estado=por_facturar' },
  { nombre: 'mezcla: un mensaje por tipo', real: mezcla.map(m => m.tipo).join(','), esperado: 'pedido_demorado,stock_bajo' },
  { nombre: 'stock varios: a Stock bajo', real: mezcla[1].url, esperado: '/admin/compras/stock?bajo=1' },
  { nombre: 'stock varios: nombres', real: mezcla[1].body, esperado: 'Fécula y Queso' },
  { nombre: 'nc varios: título', real: ncVarios[0].title, esperado: '🧾 2 devoluciones esperan su NC' },
  { nombre: 'nc varios: lista nc', real: ncVarios[0].url, esperado: '/admin/compras/pedidos?alerta=nc' },
  { nombre: 'repetido: (sigue)', real: sigue.title, esperado: '🚚 Pedido demorado (sigue)' },
  { nombre: 'repetido mezclado con nuevo: sin (sigue)', real: sigueMezcla.title, esperado: '🚚 2 pedidos demorados' },
  { nombre: 'listaCorta de 5 sin "más"', real: listaCorta(['a', 'b', 'c', 'd', 'e']), esperado: 'a, b, c, d y e' },
  { nombre: 'destinatarios remito: solo admin', real: destinatariosDe('remito_listo', perfiles).join(','), esperado: 'admin1,admin2' },
  { nombre: 'destinatarios diferencias: solo admin', real: destinatariosDe('diferencias', perfiles).join(','), esperado: 'admin1,admin2' },
  { nombre: 'destinatarios nc: solo admin', real: destinatariosDe('nc_pendiente', perfiles).join(','), esperado: 'admin1,admin2' },
  { nombre: 'destinatarios demorado: admin + pedidos', real: destinatariosDe('pedido_demorado', perfiles).join(','), esperado: 'admin1,admin2,pedidos' },
  { nombre: 'destinatarios stock: admin + pedidos + stock', real: destinatariosDe('stock_bajo', perfiles).join(','), esperado: 'admin1,admin2,pedidos,stock' },
  { nombre: 'excluir al autor del remito', real: destinatariosDe('remito_listo', perfiles, 'admin1').join(','), esperado: 'admin2' },
  { nombre: 'resumen vacío', real: resumenCorrida({}), esperado: 'No había nada nuevo para avisar' },
  { nombre: 'resumen con dos tipos', real: resumenCorrida({ pedido_demorado: { candidatos: 2, avisados: 2, destinatarios: 3 }, stock_bajo: { candidatos: 1, avisados: 1, destinatarios: 2 } }), esperado: 'Se avisaron 2 pedidos demorados y 1 insumo bajo el mínimo' },
  { nombre: 'resumen de uno solo: singular', real: resumenCorrida({ stock_bajo: { candidatos: 1, avisados: 1, destinatarios: 2 } }), esperado: 'Se avisó 1 insumo bajo el mínimo' },
  { nombre: 'resumen ignora tipos en 0', real: resumenCorrida({ diferencias: { candidatos: 0, avisados: 0, destinatarios: 0 } }), esperado: 'No había nada nuevo para avisar' },
  { nombre: 'config vacía → defaults', real: JSON.stringify(cfgVacia), esperado: JSON.stringify(CONFIG_AVISOS_DEFAULT) },
  { nombre: 'config inválida → default demora', real: cfgRara.diasDemora, esperado: 3 },
  { nombre: 'config inválida → default repetir', real: cfgRara.repetirDias, esperado: 0 },
  { nombre: 'config 0 días → default', real: cfgRara.diasDiferencias, esperado: 3 },
  { nombre: 'config decimal → default', real: cfgRara.diasNc, esperado: 7 },
  { nombre: 'config bool raro → default', real: cfgRara.activo.stock_bajo, esperado: true },
  { nombre: 'config válida: demora', real: cfgOk.diasDemora, esperado: 5 },
  { nombre: 'config válida: repetir en texto', real: cfgOk.repetirDias, esperado: 2 },
  { nombre: 'config válida: apagado', real: cfgOk.activo.pedido_demorado, esperado: false },
  { nombre: 'config válida: "false"', real: cfgOk.activo.stock_bajo, esperado: false },
  { nombre: 'configAFilas: 9 claves', real: configAFilas(cfgOk).length, esperado: 9 },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
