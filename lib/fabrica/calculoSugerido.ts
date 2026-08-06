export type Redondeo = 'estandar' | 'siempre_arriba' | 'sin_calculo'

export interface ItemMateriaPrima {
  kgPorMasa: number
  kgPorUnidad: number
  cantidadUnidades: number
  redondeo: Redondeo
}

export interface NecesidadSugerido {
  necesidadKg: number
  sugeridoUnidades: number
}

// Misma fórmula que el RPC cerrar_conteo_fabrica (supabase/migrations/*_fabrica_conteo_bolsaplast_huevos.sql).
// necesidad en kg de masa que requiere la materia prima; sugerido en unidades de
// compra a pedir, con la regla de redondeo propia del ítem (docs/analisis-motor-calculo-legacy.md):
//   'estandar'       → floor si falta menos de media unidad, ceil si falta media o más
//                       (Math.round ya lo cumple porque kgFaltante nunca es negativo)
//   'siempre_arriba' → ceil siempre (Polvo de Hornear)
//   'sin_calculo'     → no participa del complementario (Leche/Sal/Pategrás — se
//                       reponen vía Pedido Base semanal), sugerido siempre 0
// Se duplica a propósito: acá corre en el cliente para la previsualización en vivo,
// en SQL corre atómico al cerrar el conteo.
export function calcularNecesidadYSugerido(item: ItemMateriaPrima, masasProyectadas: number): NecesidadSugerido {
  const necesidadKg = item.kgPorMasa * masasProyectadas

  if (item.redondeo === 'sin_calculo' || item.kgPorUnidad <= 0) {
    return { necesidadKg, sugeridoUnidades: 0 }
  }

  const kgContado = item.cantidadUnidades * item.kgPorUnidad
  const kgFaltante = Math.max(0, necesidadKg - kgContado)
  const fraccion = kgFaltante / item.kgPorUnidad
  const sugeridoUnidades = item.redondeo === 'siempre_arriba' ? Math.ceil(fraccion) : Math.round(fraccion)

  return { necesidadKg, sugeridoUnidades }
}

// Bolsaplast (calculadora más simple del legacy): sin redondeo especial, faltante
// directo en la unidad nativa del ítem. metaSemanal = 0 (sin meta fija, "según
// necesidad" en el legacy) da faltante siempre 0 — no hace falta un caso especial.
export function faltanteBolsaplast(metaSemanal: number, stockActual: number): number {
  return Math.max(0, metaSemanal - stockActual)
}

const HUEVOS_POR_MASA = 90
const HUEVOS_POR_CAJON = 360 // 12 maples × 30 huevos

export interface HuevosCalculo {
  huevosNecesarios: number
  cajonesNecesarios: number
  cajonesFaltantes: number
}

// Huevos no tiene catálogo propio — son 2 campos de planificación (cajones
// disponibles + masas proyectadas, comparte el mismo campo que Global).
export function calcularHuevos(masasProyectadas: number, cajonesDisponibles: number): HuevosCalculo {
  const huevosNecesarios = masasProyectadas * HUEVOS_POR_MASA
  const cajonesNecesarios = Math.ceil(huevosNecesarios / HUEVOS_POR_CAJON)
  const cajonesFaltantes = Math.max(0, cajonesNecesarios - cajonesDisponibles)
  return { huevosNecesarios, cajonesNecesarios, cajonesFaltantes }
}
