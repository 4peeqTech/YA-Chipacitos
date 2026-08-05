export type BaseCalculo = 'kg_masa' | 'kg_embolsado' | 'meta_semanal'

export interface ItemConteo {
  baseCalculo: BaseCalculo
  coeficiente: number | null
  metaSemanal: number
  cantidad: number
}

export interface NecesidadSugerido {
  necesidad: number
  sugerido: number
}

// Misma fórmula que el RPC cerrar_conteo_fabrica (supabase/migrations/*_fabrica_fase2_conteos.sql):
// necesidad según la base de cálculo del insumo, sugerido = max(0, necesidad − cantidad contada).
// Se duplica a propósito: acá corre en el cliente para la previsualización en vivo,
// en SQL corre atómico al cerrar el conteo.
export function calcularNecesidadYSugerido(
  item: ItemConteo,
  proyeccionMasaKg: number,
  proyeccionEmbolsadoKg: number
): NecesidadSugerido {
  const coeficiente = item.coeficiente ?? 0
  const necesidad =
    item.baseCalculo === 'kg_masa' ? coeficiente * proyeccionMasaKg :
    item.baseCalculo === 'kg_embolsado' ? coeficiente * proyeccionEmbolsadoKg :
    item.metaSemanal

  return { necesidad, sugerido: Math.max(0, necesidad - item.cantidad) }
}
