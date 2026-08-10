export type Redondeo = 'estandar' | 'siempre_arriba' | 'siempre_abajo' | 'sin_calculo'

export interface ItemCatalogo {
  cantidadPorMasa: number
  cantidadPorUnidad: number
  cantidadUnidades: number
  redondeo: Redondeo
}

export interface NecesidadSugerido {
  necesidad: number
  sugeridoUnidades: number
}

// Misma fórmula que el RPC cerrar_conteo_fabrica (supabase/migrations/*_fabrica_catalogo_unico.sql).
// necesidad = cantidad_por_masa × masas proyectadas; sugerido en unidades de
// compra a pedir, con la regla de redondeo propia del ítem (docs/analisis-motor-calculo-legacy.md):
//   'estandar'       → floor si falta menos de media unidad, ceil si falta media o más
//                       (Math.round ya lo cumple porque el faltante nunca es negativo)
//   'siempre_arriba' → ceil siempre (Polvo de Hornear)
//   'siempre_abajo'  → floor siempre (un faltante de 0,9 unidades no pide nada)
//   'sin_calculo'    → no participa del complementario (Leche/Sal/Pategrás — se
//                      reponen vía Pedido Base semanal), sugerido siempre 0
// Se duplica a propósito: acá corre en el cliente para la previsualización en vivo,
// en SQL corre atómico al cerrar el conteo.
export function calcularNecesidadYSugerido(item: ItemCatalogo, masasProyectadas: number): NecesidadSugerido {
  const necesidad = item.cantidadPorMasa * masasProyectadas

  if (item.redondeo === 'sin_calculo' || item.cantidadPorUnidad <= 0) {
    return { necesidad, sugeridoUnidades: 0 }
  }

  const contado = item.cantidadUnidades * item.cantidadPorUnidad
  const faltante = Math.max(0, necesidad - contado)
  const fraccion = faltante / item.cantidadPorUnidad
  const sugeridoUnidades =
    item.redondeo === 'siempre_arriba' ? Math.ceil(fraccion) :
    item.redondeo === 'siempre_abajo' ? Math.floor(fraccion) :
    Math.round(fraccion)

  return { necesidad, sugeridoUnidades }
}

// Bolsaplast (calculadora más simple del legacy): sin redondeo especial, faltante
// directo en la unidad nativa del ítem. metaSemanal = 0 (sin meta fija, "según
// necesidad" en el legacy) da faltante siempre 0 — no hace falta un caso especial.
export function faltanteBolsaplast(metaSemanal: number, stockActual: number): number {
  return Math.max(0, metaSemanal - stockActual)
}
