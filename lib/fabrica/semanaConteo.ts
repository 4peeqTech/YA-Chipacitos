import { diaFabrica, sumarDias } from './diaFabrica'

export interface SemanaConteo {
  fecha: string            // día en que se abre/retoma el conteo (ART)
  semanaDesde: string      // martes ancla de la ventana
  semanaHasta: string      // viernes de esa misma semana
  desdeTurno: 'tarde'      // el conteo se hace el martes a la mañana
  hastaTurno: 'manana'
}

// Recibe `ahora` como parámetro (no usa `new Date()` internamente) para ser
// determinístico y testeable con npx tsx. El conteo se hace SIEMPRE el
// martes a la mañana y la proyección cubre martes tarde → viernes mañana —
// una ventana fija de 3 días que no depende de qué día se abrió la pantalla.
export function calcularSemanaConteo(ahora: Date): SemanaConteo {
  const fecha = diaFabrica(ahora)
  const diaSemana = new Date(`${fecha}T00:00:00`).getDay() // 0=dom ... 6=sáb

  let offsetAlMartes: number
  if (diaSemana >= 2 && diaSemana <= 5) {
    offsetAlMartes = 2 - diaSemana       // martes de la semana en curso
  } else if (diaSemana === 6) {
    offsetAlMartes = 3                   // sábado → martes que viene
  } else if (diaSemana === 0) {
    offsetAlMartes = 2                   // domingo → martes que viene
  } else {
    offsetAlMartes = 1                   // lunes → martes que viene
  }

  const semanaDesde = sumarDias(fecha, offsetAlMartes)
  const semanaHasta = sumarDias(semanaDesde, 3)

  return {
    fecha,
    semanaDesde,
    semanaHasta,
    desdeTurno: 'tarde',
    hastaTurno: 'manana',
  }
}
