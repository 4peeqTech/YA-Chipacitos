// Chequeo del espejo TS de sobrestock contra los números que dio el SQL de
// cerrar_conteo_fabrica en dev (conteo Global, 20 masas, umbral 1).
// Correr con: npx tsx lib/fabrica/_check_sobrestock.ts
import { calcularSobrestock, type ItemCatalogo } from './calculoSugerido'

const base = { meta: 0, cantidadFija: 0 }
const item = (i: Partial<ItemCatalogo>): ItemCatalogo =>
  ({ modoCalculo: 'por_masa', cantidadPorMasa: 0, cantidadPorUnidad: 1, cantidadUnidades: 0, redondeo: 'estandar', ...base, ...i })

const casos: { nombre: string; item: ItemCatalogo; aDemanda: boolean; tope: number | null; exceso: number | null; sobrestock: boolean }[] = [
  { nombre: 'Fécula (receta, +6)', item: item({ cantidadPorMasa: 30, cantidadPorUnidad: 25, cantidadUnidades: 30 }), aDemanda: false, tope: null, exceso: 6, sobrestock: true },
  { nombre: 'Queso Barra (+0,5 no marca)', item: item({ cantidadPorMasa: 16.5, cantidadPorUnidad: 16.5, cantidadUnidades: 20.5 }), aDemanda: false, tope: null, exceso: 0.5, sobrestock: false },
  { nombre: 'Margarina (falta)', item: item({ cantidadPorMasa: 6, cantidadPorUnidad: 10, cantidadUnidades: 0 }), aDemanda: false, tope: null, exceso: -12, sobrestock: false },
  { nombre: 'Polvo de hornear (receta, regla normal)', item: item({ cantidadPorMasa: 0.3, cantidadPorUnidad: 4, cantidadUnidades: 5, redondeo: 'siempre_arriba' }), aDemanda: false, tope: null, exceso: 3.5, sobrestock: true },
  { nombre: 'Pategrás a demanda sin tope (nunca avisa)', item: item({ cantidadPorMasa: 0, cantidadPorUnidad: 9, cantidadUnidades: 50, redondeo: 'sin_calculo' }), aDemanda: true, tope: null, exceso: null, sobrestock: false },
  { nombre: 'Leche a demanda sin tope (aunque tiene receta)', item: item({ cantidadPorMasa: 1.405, cantidadPorUnidad: 20, cantidadUnidades: 10, redondeo: 'sin_calculo' }), aDemanda: true, tope: null, exceso: null, sobrestock: false },
  { nombre: 'Sal a demanda con tope 4 y 6 contadas (+2)', item: item({ cantidadPorMasa: 0.84, cantidadPorUnidad: 20, cantidadUnidades: 6, redondeo: 'sin_calculo' }), aDemanda: true, tope: 4, exceso: 2, sobrestock: true },
  { nombre: 'Marca a demanda en un insumo con receta y redondeo estándar', item: item({ cantidadPorMasa: 30, cantidadPorUnidad: 25, cantidadUnidades: 30 }), aDemanda: true, tope: null, exceso: null, sobrestock: false },
  { nombre: 'Sin cálculo pero SIN la marca: regla normal por receta', item: item({ cantidadPorMasa: 0.84, cantidadPorUnidad: 20, cantidadUnidades: 6, redondeo: 'sin_calculo' }), aDemanda: false, tope: null, exceso: 5.16, sobrestock: true },
  { nombre: 'Por masa sin receta y sin marca (no avisa en falso)', item: item({ cantidadPorMasa: 0, cantidadPorUnidad: 9, cantidadUnidades: 50 }), aDemanda: false, tope: null, exceso: null, sobrestock: false },
  { nombre: 'Meta semanal +2', item: item({ modoCalculo: 'meta_semanal', meta: 5, cantidadUnidades: 7 }), aDemanda: false, tope: null, exceso: 2, sobrestock: true },
  { nombre: 'Meta semanal con meta 0', item: item({ modoCalculo: 'meta_semanal', meta: 0, cantidadUnidades: 7 }), aDemanda: false, tope: null, exceso: null, sobrestock: false },
  { nombre: 'Meta semanal a demanda con tope 3', item: item({ modoCalculo: 'meta_semanal', meta: 5, cantidadUnidades: 7 }), aDemanda: true, tope: 3, exceso: 4, sobrestock: true },
  { nombre: 'Cantidad fija', item: item({ modoCalculo: 'cantidad_fija', cantidadFija: 3, cantidadUnidades: 9 }), aDemanda: false, tope: null, exceso: null, sobrestock: false },
]

let fallas = 0
for (const c of casos) {
  const r = calcularSobrestock(c.item, 20, 1, { aDemanda: c.aDemanda, stockMaximo: c.tope })
  const ok = r.exceso === c.exceso && r.sobrestock === c.sobrestock && r.aDemanda === c.aDemanda
  if (!ok) fallas++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${c.nombre} → exceso ${r.exceso}, sobrestock ${r.sobrestock}`)
}
// Sin masas no se puede evaluar el por_masa.
const sinMasas = calcularSobrestock(casos[0].item, 0, 1, { aDemanda: false, stockMaximo: null })
if (sinMasas.exceso !== null) { fallas++; console.log('FALLA sin masas debería dar null') } else console.log('OK   Sin masas → null')

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo OK')
process.exit(fallas ? 1 : 0)
