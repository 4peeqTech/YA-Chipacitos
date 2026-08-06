import { rendimientoFeculaMasa } from './rendimiento'

export interface ProduccionFila {
  fecha: string
  turno: 'manana' | 'tarde'
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
  presentacionNombre: string
  cantidadKg: number
}

export interface ResumenEmbolsado {
  presentacionNombre: string
  cantidadKg: number
  lineas: number
}

export function agruparEmbolsadoPorPresentacion(filas: EmbolsadoFila[]): ResumenEmbolsado[] {
  const porPresentacion = new Map<string, ResumenEmbolsado>()
  for (const f of filas) {
    let grupo = porPresentacion.get(f.presentacionNombre)
    if (!grupo) {
      grupo = { presentacionNombre: f.presentacionNombre, cantidadKg: 0, lineas: 0 }
      porPresentacion.set(f.presentacionNombre, grupo)
    }
    grupo.cantidadKg += f.cantidadKg
    grupo.lineas += 1
  }
  return [...porPresentacion.values()].sort((a, b) => b.cantidadKg - a.cantidadKg)
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
  proyeccionMasaKg: number
  proyeccionEmbolsadoKg: number
}

export interface CumplimientoSemana {
  conteoId: string
  semanaDesde: string
  semanaHasta: string
  proyeccionMasaKg: number
  masaRealKg: number
  cumplimientoMasaPct: number | null
  proyeccionEmbolsadoKg: number
  embolsadoRealKg: number
  cumplimientoEmbolsadoPct: number | null
}

// Cruza cada conteo cerrado con lo realmente producido dentro de su ventana
// semana_desde–semana_hasta. No hay FK entre fabrica_producciones/fabrica_embolsados
// y fabrica_conteos — la única relación es la fecha, así que el cruce es por rango.
// cumplimientoPct queda en null (no 0 ni Infinity) cuando la proyección fue cero:
// no hubo meta contra la que medir, distinto de "cumplió 0%".
export function calcularCumplimientoProyeccion(
  conteos: ConteoSemana[],
  produccionesPorFecha: { fecha: string; masaKg: number }[],
  embolsadosPorFecha: { fecha: string; cantidadKg: number }[]
): CumplimientoSemana[] {
  return conteos
    .map(c => {
      const masaReal = produccionesPorFecha
        .filter(p => p.fecha >= c.semanaDesde && p.fecha <= c.semanaHasta)
        .reduce((acc, p) => acc + p.masaKg, 0)
      const embolsadoReal = embolsadosPorFecha
        .filter(e => e.fecha >= c.semanaDesde && e.fecha <= c.semanaHasta)
        .reduce((acc, e) => acc + e.cantidadKg, 0)

      return {
        conteoId: c.id,
        semanaDesde: c.semanaDesde,
        semanaHasta: c.semanaHasta,
        proyeccionMasaKg: c.proyeccionMasaKg,
        masaRealKg: masaReal,
        cumplimientoMasaPct: c.proyeccionMasaKg > 0 ? (masaReal / c.proyeccionMasaKg) * 100 : null,
        proyeccionEmbolsadoKg: c.proyeccionEmbolsadoKg,
        embolsadoRealKg: embolsadoReal,
        cumplimientoEmbolsadoPct: c.proyeccionEmbolsadoKg > 0 ? (embolsadoReal / c.proyeccionEmbolsadoKg) * 100 : null,
      }
    })
    .sort((a, b) => b.semanaDesde.localeCompare(a.semanaDesde))
}
