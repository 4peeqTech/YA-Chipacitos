export interface ItemConteo {
  coeficiente: number
  kgPorUnidad: number
  cantidadUnidades: number
}

export interface NecesidadSugerido {
  necesidadKg: number
  sugeridoUnidades: number
}

// Misma fórmula que el RPC cerrar_conteo_fabrica (supabase/migrations/*_fabrica_correccion_materia_prima.sql):
// necesidad en kg de masa que requiere la materia prima, sugerido en unidades de
// compra a pedir (redondeo half-up, regla de la app legacy: Math.round ya la cumple
// porque kgFaltante nunca es negativo). Se duplica a propósito: acá corre en el
// cliente para la previsualización en vivo, en SQL corre atómico al cerrar el conteo.
export function calcularNecesidadYSugerido(item: ItemConteo, proyeccionMasaKg: number): NecesidadSugerido {
  const necesidadKg = item.coeficiente * proyeccionMasaKg
  const kgContado = item.cantidadUnidades * item.kgPorUnidad
  const kgFaltante = Math.max(0, necesidadKg - kgContado)
  const sugeridoUnidades = item.kgPorUnidad > 0 ? Math.round(kgFaltante / item.kgPorUnidad) : 0
  return { necesidadKg, sugeridoUnidades }
}
