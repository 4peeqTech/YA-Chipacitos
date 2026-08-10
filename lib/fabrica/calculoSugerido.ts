export type Redondeo = 'estandar' | 'siempre_arriba' | 'siempre_abajo' | 'sin_calculo'
export type ModoCalculo = 'por_masa' | 'meta_semanal' | 'cantidad_fija'

export interface ItemCatalogo {
  modoCalculo: ModoCalculo
  cantidadPorMasa: number
  cantidadPorUnidad: number
  cantidadUnidades: number
  redondeo: Redondeo
  meta: number
  cantidadFija: number
}

export interface NecesidadSugerido {
  necesidad: number
  sugeridoUnidades: number
}

// Misma fórmula que el RPC cerrar_conteo_fabrica (supabase/migrations/*_fabrica_conteos_parametrizables.sql
// y su follow-up *_fabrica_meta_periodicidad_modulo.sql). necesidad = cantidad_por_masa ×
// masas proyectadas (0 si el ítem no tiene receta, como los de modo cantidad_fija/meta_semanal).
// El sugerido depende del modo de cálculo que la definición del conteo le asignó al ítem:
//   'cantidad_fija'  → siempre esa cantidad, sin importar lo contado (docs/analisis-motor-calculo-legacy.md)
//   'meta_semanal'   → max(0, meta − contado) — el faltante contra un piso fijo. El nombre del
//                      modo quedó de cuando todo conteo era semanal; el período real (semanal/
//                      quincenal/mensual) lo define la definición del conteo, no el ítem.
//   'por_masa'       → faltante = necesidad − contado×cantidad_por_unidad, redondeado por
//                      la regla del ítem, con meta (si > 0) como piso: nunca sugiere
//                      menos que el faltante contra la meta, aunque la receta pida menos
// Redondeo por ítem (independiente del modo, salvo 'sin_calculo' que corta todo a 0):
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

  if (item.redondeo === 'sin_calculo') {
    return { necesidad, sugeridoUnidades: 0 }
  }

  if (item.modoCalculo === 'cantidad_fija') {
    return { necesidad, sugeridoUnidades: item.cantidadFija }
  }

  if (item.modoCalculo === 'meta_semanal') {
    return { necesidad, sugeridoUnidades: Math.max(0, item.meta - item.cantidadUnidades) }
  }

  if (item.cantidadPorUnidad <= 0) {
    return { necesidad, sugeridoUnidades: 0 }
  }

  const contado = item.cantidadUnidades * item.cantidadPorUnidad
  const faltante = Math.max(0, necesidad - contado)
  const fraccion = faltante / item.cantidadPorUnidad
  const porMasa =
    item.redondeo === 'siempre_arriba' ? Math.ceil(fraccion) :
    item.redondeo === 'siempre_abajo' ? Math.floor(fraccion) :
    Math.round(fraccion)
  const piso = item.meta > 0 ? Math.max(0, item.meta - item.cantidadUnidades) : 0

  return { necesidad, sugeridoUnidades: Math.max(porMasa, piso) }
}
