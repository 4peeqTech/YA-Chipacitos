// Chequeo del espejo TS de sobrestock contra los números que dio el SQL de
// cerrar_conteo_fabrica en dev (conteo Global, 20 masas, umbral 1).
// Correr con: npx tsx lib/fabrica/_check_sobrestock.ts
import { calcularSobrestock, type ItemCatalogo } from './calculoSugerido'

const base = { meta: 0, cantidadFija: 0 }
const item = (i: Partial<ItemCatalogo>): ItemCatalogo =>
  ({ modoCalculo: 'por_masa', cantidadPorMasa: 0, cantidadPorUnidad: 1, cantidadUnidades: 0, redondeo: 'estandar', ...base, ...i })

const casos: { nombre: string; item: ItemCatalogo; tope: number | null; exceso: number | null; sobrestock: boolean; aDemanda: boolean }[] = [
  { nombre: 'Fécula (receta, +6)', item: item({ cantidadPorMasa: 30, cantidadPorUnidad: 25, cantidadUnidades: 30 }), tope: null, exceso: 6, sobrestock: true, aDemanda: false },
  { nombre: 'Queso Barra (+0,5 no marca)', item: item({ cantidadPorMasa: 16.5, cantidadPorUnidad: 16.5, cantidadUnidades: 20.5 }), tope: null, exceso: 0.5, sobrestock: false, aDemanda: false },
  { nombre: 'Margarina (falta)', item: item({ cantidadPorMasa: 6, cantidadPorUnidad: 10, cantidadUnidades: 0 }), tope: null, exceso: -12, sobrestock: false, aDemanda: false },
  { nombre: 'Polvo de hornear (receta, regla normal)', item: item({ cantidadPorMasa: 0.3, cantidadPorUnidad: 4, cantidadUnidades: 5, redondeo: 'siempre_arriba' }), tope: null, exceso: 3.5, sobrestock: true, aDemanda: false },
  { nombre: 'Pategrás sin tope (nunca avisa)', item: item({ cantidadPorMasa: 0, cantidadPorUnidad: 9, cantidadUnidades: 50, redondeo: 'sin_calculo' }), tope: null, exceso: null, sobrestock: false, aDemanda: true },
  { nombre: 'Leche sin tope', item: item({ cantidadPorMasa: 1.405, cantidadPorUnidad: 20, cantidadUnidades: 10, redondeo: 'sin_calculo' }), tope: null, exceso: null, sobrestock: false, aDemanda: true },
  { nombre: 'Sal con tope 4 y 6 contadas (+2)', item: item({ cantidadPorMasa: 0.84, cantidadPorUnidad: 20, cantidadUnidades: 6, redondeo: 'sin_calculo' }), tope: 4, exceso: 2, sobrestock: true, aDemanda: true },
  { nombre: 'Por masa sin receta = a demanda', item: item({ cantidadPorMasa: 0, cantidadPorUnidad: 9, cantidadUnidades: 3 }), tope: 2, exceso: 1, sobrestock: true, aDemanda: true },
  { nombre: 'Meta semanal +2', item: item({ modoCalculo: 'meta_semanal', meta: 5, cantidadUnidades: 7 }), tope: null, exceso: 2, sobrestock: true, aDemanda: false },
  { nombre: 'Meta semanal con meta 0', item: item({ modoCalculo: 'meta_semanal', meta: 0, cantidadUnidades: 7 }), tope: null, exceso: null, sobrestock: false, aDemanda: false },
  { nombre: 'Cantidad fija', item: item({ modoCalculo: 'cantidad_fija', cantidadFija: 3, cantidadUnidades: 9 }), tope: null, exceso: null, sobrestock: false, aDemanda: false },
]

let fallas = 0
for (const c of casos) {
  const r = calcularSobrestock(c.item, 20, 1, c.tope)
  const ok = r.exceso === c.exceso && r.sobrestock === c.sobrestock && r.aDemanda === c.aDemanda
  if (!ok) fallas++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${c.nombre} → exceso ${r.exceso}, sobrestock ${r.sobrestock}, a demanda ${r.aDemanda}`)
}
// Sin masas no se puede evaluar el por_masa.
const sinMasas = calcularSobrestock(casos[0].item, 0, 1, null)
if (sinMasas.exceso !== null) { fallas++; console.log('FALLA sin masas debería dar null') } else console.log('OK   Sin masas → null')

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo OK')
process.exit(fallas ? 1 : 0)
