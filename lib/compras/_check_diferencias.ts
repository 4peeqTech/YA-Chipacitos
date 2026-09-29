// Chequeo de las funciones puras de diferencias factura/recepción.
// Correr con: npx tsx lib/compras/_check_diferencias.ts
import {
  agruparDiferencias, armarDiferencias, cantidadAResolver, explicacionResolucion, leerEventoDiferencia,
  recepcionCompleta, textoDelta, textoDiferencia, textoResuelta, type DiferenciaFila,
} from './diferencias'

const fila = (p: Partial<DiferenciaFila>): DiferenciaFila => ({
  id: 'd1', factura_id: 'f1', pedido_id: 'p1', clave: 'x', pedido_item_id: 'pi1', item_id: 'i1',
  descripcion: 'Fécula', unidad: 'Bolsa', cantidad_recibida: 19, cantidad_facturada: 21, diferencia: 2,
  resolucion: 'pendiente', movimiento_id: null, nota: null, resuelto_en: null, resuelto_por_nombre: null, ...p,
})

const difs = armarDiferencias([
  fila({}),
  fila({ id: 'd2', descripcion: 'Azúcar', cantidad_recibida: 2, cantidad_facturada: 0, diferencia: -2, resolucion: 'ignorada' }),
  fila({ id: 'd3', item_id: null }),
])

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'descarta filas sin insumo', real: difs.length, esperado: 2 },
  { nombre: 'ordena por insumo', real: difs[0].descripcion, esperado: 'Azúcar' },
  { nombre: 'recibido = completa', real: recepcionCompleta('recibido'), esperado: true },
  { nombre: 'cerrado a mano = completa', real: recepcionCompleta('cerrado_manual'), esperado: true },
  { nombre: 'parcial = incompleta', real: recepcionCompleta('parcial'), esperado: false },
  { nombre: 'incompleta: pendiente de llegar', real: agruparDiferencias(difs, 'parcial').pendientesDeLlegar.length, esperado: 1 },
  { nombre: 'incompleta: nada a resolver', real: agruparDiferencias(difs, 'parcial').aResolver.length, esperado: 0 },
  { nombre: 'completa: a resolver', real: agruparDiferencias(difs, 'recibido').aResolver.map(d => d.id).join(), esperado: 'd1' },
  { nombre: 'resueltas en los dos casos', real: agruparDiferencias(difs, 'parcial').resueltas.length, esperado: 1 },
  { nombre: 'badge solo con recepción completa', real: cantidadAResolver(3, 'enviado'), esperado: 0 },
  { nombre: 'badge con recepción completa', real: cantidadAResolver(3, 'recibido'), esperado: 3 },
  { nombre: 'texto: factura dice más', real: textoDiferencia({ diferencia: 2, facturada: 21, unidad: 'Bolsa' }), esperado: 'La factura dice 2 Bolsa más de lo que llegó' },
  { nombre: 'texto: llegó y no está facturado', real: textoDiferencia({ diferencia: -2, facturada: 0, unidad: null }), esperado: 'Llegó 2 que no está en la factura' },
  { nombre: 'texto: llegó de más', real: textoDiferencia({ diferencia: -1.5, facturada: 3, unidad: 'kg' }), esperado: 'Llegó 1,5 kg más de lo que dice la factura' },
  { nombre: 'delta positivo', real: textoDelta(2), esperado: '+2' },
  { nombre: 'delta negativo', real: textoDelta(-0.5), esperado: '−0,5' },
  { nombre: 'resuelta ajuste', real: textoResuelta('ajusta_stock', -2, 'Bolsa'), esperado: 'Se ajustó el stock (−2 Bolsa)' },
  {
    nombre: 'explicación ajuste con stock',
    real: explicacionResolucion('ajusta_stock', { diferencia: 2, unidad: 'Bolsa', descripcion: 'Fécula' }, 172).startsWith('Suma 2 Bolsa de Fécula al stock (queda en 174).'),
    esperado: true,
  },
  {
    nombre: 'explicación ajuste que resta',
    real: explicacionResolucion('ajusta_stock', { diferencia: -3, unidad: null, descripcion: 'Polvo' }, 12).startsWith('Resta 3 de Polvo al stock (queda en 9).'),
    esperado: true,
  },
  { nombre: 'evento del historial', real: JSON.stringify(leerEventoDiferencia('ajusta_stock|Queso | Sardo')), esperado: '{"resolucion":"ajusta_stock","insumo":"Queso | Sardo"}' },
  { nombre: 'evento sin separador', real: leerEventoDiferencia('raro'), esperado: null },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
