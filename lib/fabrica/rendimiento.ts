// Rendimiento fécula → masa: cuántos kg de masa salen de cada kg de fécula.
// Sin React ni Supabase, testeable con `npx tsx` — mismo criterio que
// lib/fabrica/calculoSugerido.ts.

// Precarga el campo masa_kg del formulario a partir de la fécula cargada.
// El operario puede editarlo después (en la planilla el rendimiento real
// oscila entre 75 y 77 kg de masa por 30 kg de fécula, no es un número fijo).
export function masaDesdeFecula(feculaKg: number, rendimiento: number): number {
  return feculaKg * rendimiento
}

// Rendimiento real de un registro ya cargado, para los reportes de Fase 6
// (permite comparar contra `rendimiento` de config y detectar desvíos por
// operario). Devuelve null si no hay fécula cargada — no hay rendimiento
// que calcular, y dividir por cero rompería el reporte.
export function rendimientoFeculaMasa(feculaKg: number, masaKg: number): number | null {
  if (feculaKg <= 0) return null
  return masaKg / feculaKg
}
