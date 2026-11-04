// Cálculos del checklist de supervisión. Funciones puras (sin imports de la
// app) para poder testearlas con `npm test` (calculos.test.mjs).
import type {
  BloqueSupervision, ResumenVisita, Respuestas, Resultado, VisitaSupervision,
} from './tipos'

const redondear1 = (n: number) => Math.round(n * 10) / 10

/** Cumple / (Cumple + No cumple). N/A, sin responder e ítems fuera del catálogo no cuentan. */
export function calcularResumen(respuestas: Respuestas, bloques: BloqueSupervision[]): ResumenVisita {
  let cumple = 0, noCumple = 0, na = 0, total = 0
  const porBloque: Record<string, number | null> = {}
  for (const b of bloques) {
    let bc = 0, bnc = 0
    for (const it of b.items) {
      total++
      const r = respuestas[it.id]?.r
      if (r === 'C') { cumple++; bc++ } else if (r === 'NC') { noCumple++; bnc++ } else if (r === 'NA') na++
    }
    porBloque[b.id] = bc + bnc ? redondear1((bc * 100) / (bc + bnc)) : null
  }
  return {
    pct: cumple + noCumple ? redondear1((cumple * 100) / (cumple + noCumple)) : null,
    cumple, noCumple, na,
    sinResp: total - cumple - noCumple - na,
    bloques: porBloque,
  }
}

export type NivelCumplimiento = 'alto' | 'medio' | 'bajo'

export function nivelCumplimiento(pct: number | null | undefined): NivelCumplimiento | null {
  if (pct == null) return null
  return pct >= 85 ? 'alto' : pct >= 65 ? 'medio' : 'bajo'
}

export function textoPct(pct: number | null | undefined): string {
  return pct == null ? '–' : `${Math.round(pct)}%`
}

const porFechaDesc = (a: VisitaSupervision, b: VisitaSupervision) => b.fecha.localeCompare(a.fecha)

export function ultimaCerrada(visitas: VisitaSupervision[], sucursalId: string, exceptoId?: string): VisitaSupervision | null {
  return visitas
    .filter(v => v.estado === 'cerrada' && v.sucursal_id === sucursalId && v.id !== exceptoId)
    .sort(porFechaDesc)[0] ?? null
}

export function visitaEnCurso(visitas: VisitaSupervision[], sucursalId: string): VisitaSupervision | null {
  return visitas.filter(v => v.estado === 'en_curso' && v.sucursal_id === sucursalId).sort(porFechaDesc)[0] ?? null
}

/** Lo que quedó sin cumplir en una visita (y sigue en el catálogo), con su observación. */
export function pendientesDe(anterior: VisitaSupervision | null, bloques: BloqueSupervision[]) {
  if (!anterior) return { ids: [] as string[], obs: {} as Record<string, string> }
  const enCatalogo = new Set(bloques.flatMap(b => b.items.map(i => i.id)))
  const ids = Object.entries(anterior.respuestas ?? {})
    .filter(([id, a]) => a?.r === 'NC' && enCatalogo.has(id))
    .map(([id]) => id)
  return { ids, obs: Object.fromEntries(ids.map(id => [id, anterior.respuestas[id]?.obs ?? ''])) }
}

export function pendientesResueltos(v: VisitaSupervision) {
  const r = v.respuestas ?? {}
  return {
    corregidos: v.pendientes_previos.filter(id => r[id]?.r === 'C'),
    siguen: v.pendientes_previos.filter(id => r[id]?.r === 'NC'),
  }
}

/**
 * Pantalla de análisis. Se toma la última visita cerrada de cada sucursal
 * (promedio, ítems sin cumplir hoy, cumplimiento por bloque); el top de
 * incumplidos cuenta todas las visitas cerradas del filtro.
 */
export function analizar(visitas: VisitaSupervision[], bloques: BloqueSupervision[], sucursalId: string | 'todas') {
  const cerradasTodas = visitas.filter(v => v.estado === 'cerrada').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const cerradas = cerradasTodas.filter(v => sucursalId === 'todas' || v.sucursal_id === sucursalId)

  const ultimaPorSucursal = new Map<string, VisitaSupervision>()
  for (const v of cerradas) ultimaPorSucursal.set(v.sucursal_id, v)
  const ultimas = [...ultimaPorSucursal.values()]
  const resumenes = new Map(ultimas.map(v => [v.id, calcularResumen(v.respuestas, bloques)]))

  const pcts = ultimas.map(v => resumenes.get(v.id)!.pct).filter((p): p is number => p != null)
  const promedio = pcts.length ? redondear1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null
  const noCumplenHoy = ultimas.reduce((s, v) => s + resumenes.get(v.id)!.noCumple, 0)

  const porBloque = bloques.map(bloque => {
    const vals = ultimas.map(v => resumenes.get(v.id)!.bloques[bloque.id]).filter((x): x is number => x != null)
    return { bloque, pct: vals.length ? redondear1(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
  })

  const enCatalogo = new Set(bloques.flatMap(b => b.items.map(i => i.id)))
  const veces = new Map<string, number>()
  for (const v of cerradas) {
    for (const [id, a] of Object.entries(v.respuestas ?? {})) {
      if (a?.r === 'NC' && enCatalogo.has(id)) veces.set(id, (veces.get(id) ?? 0) + 1)
    }
  }
  const top = [...veces.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([itemId, n]) => ({ itemId, veces: n }))

  return { cerradas, ultimas, resumenes, promedio, noCumplenHoy, porBloque, top }
}

const ETIQUETA: Record<Resultado, string> = { C: 'Cumple', NC: 'No cumple', NA: 'N/A' }

/** Una fila por ítem del catálogo y por visita, con encabezado. */
export function filasCsv(
  visitas: VisitaSupervision[],
  bloques: BloqueSupervision[],
  nombreSucursal: (id: string) => string,
  fecha: (iso: string) => string,
): (string | number)[][] {
  const filas: (string | number)[][] = [
    ['Fecha', 'Sucursal', 'Supervisor', 'Estado', 'Cumplimiento %', 'Bloque', 'Ítem', 'Resultado', 'Observación'],
  ]
  for (const v of visitas) {
    const pct = calcularResumen(v.respuestas, bloques).pct
    for (const b of bloques) {
      for (const it of b.items) {
        const a = v.respuestas?.[it.id] ?? {}
        filas.push([
          fecha(v.fecha), nombreSucursal(v.sucursal_id), v.supervisor_nombre,
          v.estado === 'cerrada' ? 'Cerrada' : 'En curso', pct ?? '',
          b.titulo, it.texto, a.r ? ETIQUETA[a.r] : '', a.obs ?? '',
        ])
      }
    }
  }
  return filas
}

/** CSV con ; y BOM, para que Excel en español lo abra con acentos y columnas. */
export function aCsv(filas: (string | number)[][]): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  return '﻿' + filas.map(f => f.map(q).join(';')).join('\n')
}
