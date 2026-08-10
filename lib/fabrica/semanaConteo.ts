import { diaFabrica, sumarDias } from './diaFabrica'

export interface SemanaConteo {
  fecha: string            // día en que se abre/retoma el conteo (ART)
  semanaDesde: string      // ancla de la ventana (el dia_semana de la definición)
  semanaHasta: string      // fin de la ventana, semanaDesde + diasVentana
  desdeTurno: 'manana' | 'tarde'
  hastaTurno: 'manana' | 'tarde'
}

export interface VentanaConteo {
  diaSemana: number    // ISO: 1 = lunes ... 7 = domingo (fabrica_conteo_definiciones.dia_semana)
  diasVentana: number
  turnoDesde?: 'manana' | 'tarde'
  turnoHasta?: 'manana' | 'tarde'
}

// Generaliza el ancla semanal de un conteo a partir de los parámetros de su
// definición (antes hardcodeado al martes). Recibe `ahora` como parámetro
// (no usa `new Date()` internamente) para ser determinístico y testeable con
// npx tsx.
//
// Regla: se calcula cuántos días pasaron desde la última vez que cayó
// dia_semana (0 si hoy es ese día). Si esa distancia todavía entra en la
// ventana (<= diasVentana) el conteo de esta semana sigue vigente y el
// ancla es esa fecha pasada; si no, el conteo ya venció y el ancla salta al
// próximo dia_semana. Con diasVentana >= 6 el ancla simplemente rota cada
// dia_semana sin importar cuánto dure la ventana mostrada (caso Bolsaplast/
// Huevos).
export function calcularSemanaConteo(ahora: Date, { diaSemana, diasVentana, turnoDesde = 'tarde', turnoHasta = 'manana' }: VentanaConteo): SemanaConteo {
  const fecha = diaFabrica(ahora)
  const hoyIso = new Date(`${fecha}T00:00:00`).getDay() || 7 // getDay(): 0=dom...6=sáb → ISO 1=lun...7=dom
  const diasDesdeAncla = ((hoyIso - diaSemana) % 7 + 7) % 7

  const semanaDesde = diasDesdeAncla <= diasVentana
    ? sumarDias(fecha, -diasDesdeAncla)
    : sumarDias(fecha, 7 - diasDesdeAncla)
  const semanaHasta = sumarDias(semanaDesde, diasVentana)

  return {
    fecha,
    semanaDesde,
    semanaHasta,
    desdeTurno: turnoDesde,
    hastaTurno: turnoHasta,
  }
}
