import { rendimientoFeculaMasa } from './rendimiento'

export interface ProduccionFila {
  fecha: string
  turno: 'manana' | 'tarde'
  operarioId: string | null
  operarioNombre: string
  saborNombre: string
  feculaKg: number
  masaKg: number
}

export type AgrupacionProduccion = 'fecha' | 'turno' | 'operarioNombre' | 'saborNombre'

export interface ResumenProduccion {
  clave: string
  feculaKg: number
  masaKg: number
  cargas: number
}

// Agrupa producción por la dimensión elegida (día, turno, operario o sabor) y
// suma fécula/masa — la misma lista de filas alimenta las cuatro vistas del
// reporte, solo cambia la clave de agrupación.
export function agruparProduccion(filas: ProduccionFila[], dimension: AgrupacionProduccion): ResumenProduccion[] {
  const porClave = new Map<string, ResumenProduccion>()
  for (const f of filas) {
    const clave = f[dimension]
    let grupo = porClave.get(clave)
    if (!grupo) {
      grupo = { clave, feculaKg: 0, masaKg: 0, cargas: 0 }
      porClave.set(clave, grupo)
    }
    grupo.feculaKg += f.feculaKg
    grupo.masaKg += f.masaKg
    grupo.cargas += 1
  }
  return [...porClave.values()].sort((a, b) => b.masaKg - a.masaKg)
}

export interface EmbolsadoFila {
  fecha: string
  presentacionNombre: string
  saborNombre: string
  tamanioNombre: string
  operarioId: string | null
  operarioNombre: string
  cantidadKg: number
}

export type AgrupacionEmbolsado = 'presentacionNombre' | 'saborNombre' | 'tamanioNombre' | 'operarioNombre'

export interface ResumenEmbolsado {
  clave: string
  cantidadKg: number
  lineas: number
}

export function agruparEmbolsado(filas: EmbolsadoFila[], dimension: AgrupacionEmbolsado): ResumenEmbolsado[] {
  const porClave = new Map<string, ResumenEmbolsado>()
  for (const f of filas) {
    const clave = f[dimension]
    let grupo = porClave.get(clave)
    if (!grupo) {
      grupo = { clave, cantidadKg: 0, lineas: 0 }
      porClave.set(clave, grupo)
    }
    grupo.cantidadKg += f.cantidadKg
    grupo.lineas += 1
  }
  return [...porClave.values()].sort((a, b) => b.cantidadKg - a.cantidadKg)
}

export interface DevolucionFila {
  fecha: string
  motivoNombre: string
  saborNombre: string
  tamanioNombre: string
  presentacionNombre: string
  destino: 'reinsercion' | 'perdida'
  cantidadKg: number
}

export type AgrupacionDevolucion = 'motivoNombre' | 'saborNombre' | 'tamanioNombre' | 'presentacionNombre' | 'destino'

export interface ResumenDevolucion {
  clave: string
  cantidadKg: number
  cargas: number
}

// Mismo molde que agruparEmbolsado — solo cambia el nombre del contador
// (cargas en vez de líneas, más natural para un registro de devolución).
export function agruparDevoluciones(filas: DevolucionFila[], dimension: AgrupacionDevolucion): ResumenDevolucion[] {
  const porClave = new Map<string, ResumenDevolucion>()
  for (const f of filas) {
    const clave = dimension === 'destino' ? (f.destino === 'reinsercion' ? 'Reinserción' : 'Pérdida') : f[dimension]
    let grupo = porClave.get(clave)
    if (!grupo) {
      grupo = { clave, cantidadKg: 0, cargas: 0 }
      porClave.set(clave, grupo)
    }
    grupo.cantidadKg += f.cantidadKg
    grupo.cargas += 1
  }
  return [...porClave.values()].sort((a, b) => b.cantidadKg - a.cantidadKg)
}

export interface RendimientoOperario {
  operarioNombre: string
  feculaKg: number
  masaKg: number
  rendimiento: number | null
  cargas: number
}

// Rendimiento real por operario: rendimientoFeculaMasa() (lib/fabrica/rendimiento.ts)
// sobre los totales acumulados, no el promedio de los rendimientos de cada carga —
// así una carga de 2 kg no pesa igual que una de 200 en el resultado.
export function calcularRendimientoPorOperario(filas: ProduccionFila[]): RendimientoOperario[] {
  const porOperario = new Map<string, RendimientoOperario>()
  for (const f of filas) {
    let grupo = porOperario.get(f.operarioNombre)
    if (!grupo) {
      grupo = { operarioNombre: f.operarioNombre, feculaKg: 0, masaKg: 0, rendimiento: null, cargas: 0 }
      porOperario.set(f.operarioNombre, grupo)
    }
    grupo.feculaKg += f.feculaKg
    grupo.masaKg += f.masaKg
    grupo.cargas += 1
  }
  const resultado = [...porOperario.values()]
  for (const grupo of resultado) {
    grupo.rendimiento = rendimientoFeculaMasa(grupo.feculaKg, grupo.masaKg)
  }
  return resultado.sort((a, b) => b.masaKg - a.masaKg)
}

export interface ConteoSemana {
  id: string
  semanaDesde: string
  semanaHasta: string
  masasProyectadas: number
  proyeccionEmbolsadoKg: number
}

export interface CumplimientoSemana {
  conteoId: string
  semanaDesde: string
  semanaHasta: string
  masasProyectadas: number
  masasReales: number
  cumplimientoMasaPct: number | null
  proyeccionEmbolsadoKg: number
  embolsadoRealKg: number
  cumplimientoEmbolsadoPct: number | null
}

// El martes a la mañana es cuando se cuenta, no cuando se produce contra la
// proyección; el viernes a la tarde ya cae fuera de la ventana.
function dentroDeVentana(fecha: string, turno: 'manana' | 'tarde', desde: string, hasta: string): boolean {
  if (fecha < desde || fecha > hasta) return false
  if (desde === hasta) return true          // conteos viejos con ventana de un día
  if (fecha === desde) return turno === 'tarde'
  if (fecha === hasta) return turno === 'manana'
  return true
}

// Cruza cada conteo cerrado con lo realmente producido dentro de su ventana
// semana_desde–semana_hasta. No hay FK entre fabrica_producciones/fabrica_embolsados
// y fabrica_conteos — la única relación es la fecha, así que el cruce es por rango.
// cumplimientoPct queda en null (no 0 ni Infinity) cuando la proyección fue cero:
// no hubo meta contra la que medir, distinto de "cumplió 0%". Los embolsados siguen
// con rango de días completos — el pool es por día y no tiene turno.
// La masa se compara en cantidad de cargas, no en kg: "masas proyectadas" del conteo
// es un conteo de masas (una por receta/lote, ver lib/fabrica/calculoSugerido.ts), y
// cada fila de fabrica_producciones ("carga guardada" en el formulario) es una masa —
// mezclar eso con masaKg real daba porcentajes sin sentido (ej. 2234%).
export function calcularCumplimientoProyeccion(
  conteos: ConteoSemana[],
  produccionesPorFecha: { fecha: string; turno: 'manana' | 'tarde' }[],
  embolsadosPorFecha: { fecha: string; cantidadKg: number }[]
): CumplimientoSemana[] {
  return conteos
    .map(c => {
      const masasReales = produccionesPorFecha
        .filter(p => dentroDeVentana(p.fecha, p.turno, c.semanaDesde, c.semanaHasta))
        .length
      const embolsadoReal = embolsadosPorFecha
        .filter(e => e.fecha >= c.semanaDesde && e.fecha <= c.semanaHasta)
        .reduce((acc, e) => acc + e.cantidadKg, 0)

      return {
        conteoId: c.id,
        semanaDesde: c.semanaDesde,
        semanaHasta: c.semanaHasta,
        masasProyectadas: c.masasProyectadas,
        masasReales,
        cumplimientoMasaPct: c.masasProyectadas > 0 ? (masasReales / c.masasProyectadas) * 100 : null,
        proyeccionEmbolsadoKg: c.proyeccionEmbolsadoKg,
        embolsadoRealKg: embolsadoReal,
        cumplimientoEmbolsadoPct: c.proyeccionEmbolsadoKg > 0 ? (embolsadoReal / c.proyeccionEmbolsadoKg) * 100 : null,
      }
    })
    .sort((a, b) => b.semanaDesde.localeCompare(a.semanaDesde))
}

export interface KpisFabrica {
  masaKg: number
  feculaKg: number
  rendimiento: number | null
  congeladosKg: number
  devueltoKg: number
  pctDevolucionSobreProducido: number | null
}

// KPIs de la fila superior de Reportes — recalculados sobre las filas ya
// filtradas por rango de fechas y operario.
export function calcularKpisFabrica(
  producciones: { feculaKg: number; masaKg: number }[],
  embolsados: { cantidadKg: number }[],
  devoluciones: { cantidadKg: number }[]
): KpisFabrica {
  const masaKg = producciones.reduce((acc, p) => acc + p.masaKg, 0)
  const feculaKg = producciones.reduce((acc, p) => acc + p.feculaKg, 0)
  const congeladosKg = embolsados.reduce((acc, e) => acc + e.cantidadKg, 0)
  const devueltoKg = devoluciones.reduce((acc, d) => acc + d.cantidadKg, 0)
  return {
    masaKg,
    feculaKg,
    rendimiento: rendimientoFeculaMasa(feculaKg, masaKg),
    congeladosKg,
    devueltoKg,
    pctDevolucionSobreProducido: masaKg > 0 ? (devueltoKg / masaKg) * 100 : null,
  }
}
