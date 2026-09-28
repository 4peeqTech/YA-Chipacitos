// Chequeo de los totales de la factura. Los valores esperados salen de hacer la
// cuenta a mano con el mismo redondeo que la base (round a 2 decimales por línea).
// Correr con: npx tsx lib/compras/_check_totales.ts
import {
  calcularTotales, redondear2, subtotalLinea, ivaLinea, diferenciaPapel, avisaPorPapel,
  variacionPrecio, esAlicuota, etiquetaAlicuota, type LineaTotalizable,
} from './totalesFactura'

const linea = (cantidad: number | null, precioUnitario: number | null, alicuotaIva = 21): LineaTotalizable =>
  ({ cantidad, precioUnitario, alicuotaIva })

const dosAlicuotas = calcularTotales([linea(16, 1000, 21), linea(1, 5000, 10.5)])
const tresIguales = calcularTotales([linea(2, 100), linea(3, 100), linea(5, 100)])
const conCero = calcularTotales([linea(10, 250, 0), linea(1, 1000, 21)])

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  // Redondeo igual al de Postgres, incluido el caso que el punto flotante erraba.
  { nombre: 'redondear2 corta a 2 decimales', real: redondear2(1234.5678), esperado: 1234.57 },
  { nombre: 'redondear2 de 0,145 sube', real: redondear2(0.145), esperado: 0.15 },
  { nombre: 'redondear2 de 1,005 sube', real: redondear2(1.005), esperado: 1.01 },
  { nombre: 'redondear2 no toca un entero', real: redondear2(21000), esperado: 21000 },

  { nombre: 'subtotal de la línea', real: subtotalLinea(linea(2.5, 1234.44)), esperado: 3086.1 },
  { nombre: 'iva al 21 % sobre el subtotal ya redondeado', real: ivaLinea(linea(2.5, 1234.44)), esperado: 648.08 },
  { nombre: 'iva al 10,5 %', real: ivaLinea(linea(1, 5000, 10.5)), esperado: 525 },
  { nombre: 'iva al 0 %', real: ivaLinea(linea(10, 250, 0)), esperado: 0 },
  { nombre: 'línea sin cantidad no suma', real: subtotalLinea(linea(null, 1000)), esperado: 0 },
  { nombre: 'línea sin precio no suma', real: subtotalLinea(linea(3, null)), esperado: 0 },

  // 16 × 1000 = 16.000 (IVA 3.360) + 1 × 5000 = 5.000 (IVA 525)
  { nombre: 'subtotal con dos alícuotas', real: dosAlicuotas.subtotal, esperado: 21000 },
  { nombre: 'iva con dos alícuotas', real: dosAlicuotas.iva, esperado: 3885 },
  { nombre: 'total = subtotal + iva', real: dosAlicuotas.total, esperado: 24885 },
  { nombre: 'desglose: dos alícuotas', real: dosAlicuotas.porAlicuota.length, esperado: 2 },
  { nombre: 'desglose ordenado de menor a mayor', real: dosAlicuotas.porAlicuota.map(g => g.alicuota).join('/'), esperado: '10.5/21' },
  { nombre: 'desglose: base del 10,5 %', real: dosAlicuotas.porAlicuota[0].base, esperado: 5000 },
  { nombre: 'desglose: iva del 21 %', real: dosAlicuotas.porAlicuota[1].iva, esperado: 3360 },

  { nombre: 'tres líneas de la misma alícuota se agrupan', real: tresIguales.porAlicuota.length, esperado: 1 },
  { nombre: 'base agrupada', real: tresIguales.porAlicuota[0].base, esperado: 1000 },
  { nombre: 'iva agrupado', real: tresIguales.porAlicuota[0].iva, esperado: 210 },

  { nombre: 'el 0 % aparece en el desglose', real: conCero.porAlicuota.map(g => g.alicuota).join('/'), esperado: '0/21' },
  { nombre: 'el 0 % no suma iva', real: conCero.iva, esperado: 210 },
  { nombre: 'sin líneas: todo en 0', real: calcularTotales([]).total, esperado: 0 },
  { nombre: 'sin líneas: desglose vacío', real: calcularTotales([]).porAlicuota.length, esperado: 0 },
  { nombre: 'una línea en 0 no ensucia el desglose', real: calcularTotales([linea(0, 0)]).porAlicuota.length, esperado: 0 },

  // FA6: total según el papel.
  { nombre: 'sin total del papel no hay diferencia', real: diferenciaPapel(24885, null), esperado: null },
  { nombre: 'diferencia contra el papel', real: diferenciaPapel(24885, 24890), esperado: 5 },
  { nombre: 'diferencia negativa', real: diferenciaPapel(24885, 24880), esperado: -5 },
  { nombre: 'una diferencia de $ 1 no avisa', real: avisaPorPapel(24885, 24886), esperado: false },
  { nombre: 'una diferencia de $ 5 avisa', real: avisaPorPapel(24885, 24890), esperado: true },
  { nombre: 'sin papel no avisa', real: avisaPorPapel(24885, null), esperado: false },

  // FA4: variación contra el precio de referencia.
  { nombre: 'precio 8 % arriba de la referencia', real: variacionPrecio(1080, 1000), esperado: 8 },
  { nombre: 'precio abajo de la referencia', real: variacionPrecio(900, 1000), esperado: -10 },
  { nombre: 'mismo precio: sin variación', real: variacionPrecio(1000, 1000), esperado: null },
  { nombre: 'menos del 1 %: sin variación', real: variacionPrecio(1004, 1000), esperado: null },
  { nombre: 'sin referencia: sin variación', real: variacionPrecio(1000, null), esperado: null },
  { nombre: 'referencia en 0: sin variación', real: variacionPrecio(1000, 0), esperado: null },
  { nombre: 'sin precio: sin variación', real: variacionPrecio(null, 1000), esperado: null },

  { nombre: 'alícuota válida', real: esAlicuota(10.5), esperado: true },
  { nombre: 'alícuota inventada', real: esAlicuota(15), esperado: false },
  { nombre: 'etiqueta con coma', real: etiquetaAlicuota(10.5), esperado: '10,5 %' },
  { nombre: 'etiqueta sin decimales', real: etiquetaAlicuota(21), esperado: '21 %' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
