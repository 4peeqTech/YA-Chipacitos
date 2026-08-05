export interface SemanaConteo {
  fecha: string        // 'YYYY-MM-DD', día en que se abre/retoma el conteo
  semanaDesde: string  // 'YYYY-MM-DD', arranca la proyección (hoy)
  semanaHasta: string  // 'YYYY-MM-DD', viernes de la semana en curso
}

// Usa los componentes locales del Date (no toISOString) para no arrastrar
// un corrimiento de huso horario al convertir a UTC — mismo criterio que
// lib/compras/rangoFechas.ts.
function formatearFecha(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Recibe `ahora` como parámetro (no usa `new Date()` internamente) para ser
// determinístico y testeable con npx tsx. La proyección de masa corre desde
// hoy hasta el viernes de la semana en curso (si `ahora` ya es viernes,
// hasta ese mismo día; si es sábado o domingo, hasta el viernes siguiente).
export function calcularSemanaConteo(ahora: Date): SemanaConteo {
  const diaSemana = ahora.getDay() // 0 = domingo ... 5 = viernes, 6 = sábado
  const diasHastaViernes = (5 - diaSemana + 7) % 7
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + diasHastaViernes)

  return {
    fecha: formatearFecha(ahora),
    semanaDesde: formatearFecha(ahora),
    semanaHasta: formatearFecha(hasta),
  }
}
