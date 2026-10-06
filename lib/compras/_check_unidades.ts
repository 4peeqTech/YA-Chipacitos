// Chequeo de las unidades de medida (A2b). Correr con: npx tsx lib/compras/_check_unidades.ts
import {
  textoEquivalencia, convertirPrecio, cantidadCobrada, avisoNominal, avisoRemito, unidadPlural,
  cantidadMensaje, desvioPct, tieneConversion, ejemploUnidades, etiquetaCobraPor, type UnidadesInsumo,
} from './unidades'
import { subtotalLinea } from './totalesFactura'

const queso: UnidadesInsumo = { unidad: 'Caja', unidadBase: 'kg', contenido: 16.5 }
const bolsa: UnidadesInsumo = { unidad: 'Unid.', unidadBase: 'unidades', contenido: 1 }
const anana: UnidadesInsumo = { unidad: null, unidadBase: 'kg', contenido: 1 }
const enKg: UnidadesInsumo = { unidad: 'kg', unidadBase: 'kg', contenido: 1 }

const vuelta = convertirPrecio(convertirPrecio(2000, 'unidad', 'base', 16.5), 'base', 'unidad', 16.5)

const casos: { nombre: string; real: unknown; esperado: unknown }[] = [
  { nombre: 'equivalencia de Queso Barra', real: textoEquivalencia(3.4, queso), esperado: '3,4 Caja ≈ 56,1 kg' },
  { nombre: 'sin conversión: Unid. de 1', real: textoEquivalencia(3, bolsa), esperado: null },
  { nombre: 'sin conversión: Ananá (kg) sin unidad', real: textoEquivalencia(3, anana), esperado: null },
  { nombre: 'sin conversión: unidad "kg"', real: tieneConversion(enKg), esperado: false },
  { nombre: 'con conversión: Pote de 1 kg', real: tieneConversion({ unidad: 'Pote', unidadBase: 'kg', contenido: 1 }), esperado: true },

  { nombre: 'precio $/Caja → $/kg', real: convertirPrecio(2000, 'unidad', 'base', 16.5), esperado: 121.2121 },
  { nombre: 'precio ida y vuelta', real: Math.abs(vuelta - 2000) <= 0.01, esperado: true },
  { nombre: 'precio en la misma unidad no cambia', real: convertirPrecio(2000, 'unidad', 'unidad', 16.5), esperado: 2000 },

  { nombre: 'cantidad cobrada por kg', real: cantidadCobrada({ cantidad: 2, cantidadBase: 33.4, precioPor: 'base' }), esperado: 33.4 },
  { nombre: 'cantidad cobrada sin precioPor', real: cantidadCobrada({ cantidad: 2, cantidadBase: 33.4 }), esperado: 2 },
  { nombre: 'subtotal por kg = columna generada (S9)',
    real: subtotalLinea({ cantidad: 2, cantidadBase: 33.4, precioPor: 'base', precioUnitario: 1250, alicuotaIva: 21 }), esperado: 41750 },
  { nombre: 'subtotal por unidad sigue igual',
    real: subtotalLinea({ cantidad: 2, cantidadBase: 33.4, precioUnitario: 1250, alicuotaIva: 21 }), esperado: 2500 },

  { nombre: 'aviso nominal: 29 kg en 2 Cajas', real: avisoNominal(29, 2, queso), esperado: 'Pesó 12 % menos que lo nominal (33 kg).' },
  { nombre: 'aviso nominal: 32,9 kg no avisa', real: avisoNominal(32.9, 2, queso), esperado: null },
  { nombre: 'aviso nominal: tipeo ×10', real: avisoNominal(330, 2, queso), esperado: 'Pesó 900 % más que lo nominal (33 kg).' },
  { nombre: 'aviso remito: +1,5 %', real: avisoRemito(33.4, 32.9, queso), esperado: 'La factura cobra 0,5 kg más que el remito (32,9 kg).' },
  { nombre: 'aviso remito: 33,4 vs 33,3 no avisa', real: avisoRemito(33.4, 33.3, queso), esperado: null },

  { nombre: 'plural Caja', real: unidadPlural('Caja', 2), esperado: 'Cajas' },
  { nombre: 'plural Cajón', real: unidadPlural('Cajón', 3), esperado: 'Cajones' },
  { nombre: 'plural Unid.', real: unidadPlural('Unid.', 5), esperado: 'Unid.' },
  { nombre: 'plural kg', real: unidadPlural('kg', 2), esperado: 'kg' },
  { nombre: 'singular con 1', real: unidadPlural('Caja', 1), esperado: 'Caja' },
  { nombre: 'plural Pote', real: unidadPlural('Pote', 2), esperado: 'Potes' },

  { nombre: 'mensaje por kg', real: cantidadMensaje(2, 'Caja', queso, 'base'), esperado: '2 CAJAS (~33 KG)' },
  { nombre: 'mensaje por unidad', real: cantidadMensaje(2, 'Caja', queso, 'unidad'), esperado: '2 CAJAS' },
  { nombre: 'mensaje de línea libre', real: cantidadMensaje(2, 'Bolsa', null, null), esperado: '2 BOLSAS' },

  { nombre: 'desvío con referencia 0', real: desvioPct(0, 0), esperado: null },
  { nombre: 'desvío redondeado', real: desvioPct(29, 33), esperado: -12 },

  { nombre: 'etiqueta cobra por unidad', real: etiquetaCobraPor('unidad', queso), esperado: 'Caja' },
  { nombre: 'etiqueta cobra por base', real: etiquetaCobraPor('base', queso), esperado: 'kg' },
  { nombre: 'ejemplo sin conversión', real: ejemploUnidades(bolsa, 'unidad', 4).join('|'), esperado: 'Se cuenta y se cobra por Unid.' },
  { nombre: 'ejemplo con stock', real: ejemploUnidades(queso, 'base', 3.4)[1], esperado: 'El stock se cuenta en Cajas: hoy 3,4 Cajas ≈ 56,1 kg' },
]

let fallas = 0
for (const c of casos) {
  const ok = c.real === c.esperado
  if (!ok) fallas++
  console.log(`${ok ? 'OK ' : 'MAL'} ${c.nombre}${ok ? '' : ` → ${JSON.stringify(c.real)} (esperado ${JSON.stringify(c.esperado)})`}`)
}
console.log(fallas ? `\n${fallas} fallas` : `\n${casos.length} casos OK`)
process.exit(fallas ? 1 : 0)
