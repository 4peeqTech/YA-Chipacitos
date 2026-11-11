// Cálculos del checklist de supervisión. Funciones puras (sin imports de la
// app) para poder testearlas con `npm test` (calculos.test.mjs).
import type {
  AtributosLugar, BloqueSupervision, ItemSupervision, LugarSupervision, ResumenVisita, Respuestas, Resultado, VisitaSupervision,
} from './tipos'

const redondear1 = (n: number) => Math.round(n * 10) / 10
const DIA = 86_400_000

// ── Catálogo por lugar ─────────────────────────────────────────────────────

/**
 * Si el ítem aplica al lugar según su condición. Si falta el atributo que
 * decide (por ejemplo, un horno "a confirmar"), el ítem se muestra: el
 * supervisor puede marcarlo N/A.
 */
export function itemVisible(item: Pick<ItemSupervision, 'condicion'>, a: AtributosLugar): boolean {
  switch (item.condicion) {
    case 'horno_rotativo': return a.horno == null || a.horno === 'rotativo'
    case 'horno_convector': return a.horno == null || a.horno === 'convector'
    case 'jugo': return a.jugo !== false
    case 'cocina': return a.perfil === 'cocina'
    case 'freezer_ya': return a.freezer === 'ya'
    case 'horno_cliente': return a.perfil === 'cocina' && a.horno === 'cliente'
    case 'horno_ya': return a.perfil === 'cocina' && a.horno === 'ya'
    case 'con_equipos': return (a.equipos ?? 0) > 0
    default: return true
  }
}

const tiposDe = (b: BloqueSupervision) => b.tipos?.length ? b.tipos : ['sucursal']

/** Bloques del tipo del lugar con los ítems que le aplican; sin bloques vacíos. */
export function catalogoPara(bloques: BloqueSupervision[], lugar: Pick<LugarSupervision, 'tipo' | 'atributos'>): BloqueSupervision[] {
  return bloques
    .filter(b => tiposDe(b).includes(lugar.tipo))
    .map(b => ({ ...b, items: b.items.filter(i => itemVisible(i, lugar.atributos ?? {})) }))
    .filter(b => b.items.length > 0)
}

/** Bloques del tipo del lugar, sin filtrar condiciones (para análisis y exportar). */
export function catalogoDeTipo(bloques: BloqueSupervision[], tipo: LugarSupervision['tipo']): BloqueSupervision[] {
  return bloques.filter(b => tiposDe(b).includes(tipo))
}

export const idsDe = (bloques: BloqueSupervision[]) => bloques.flatMap(b => b.items.map(i => i.id))

/**
 * Lo que se muestra en una visita: los ítems guardados al iniciarla
 * (items_visibles) que sigan activos. Las visitas anteriores a la v2 no los
 * tienen y usan el catálogo del lugar.
 */
export function bloquesDeVisita(
  v: Pick<VisitaSupervision, 'items_visibles'>, bloques: BloqueSupervision[], lugar: LugarSupervision | undefined,
): BloqueSupervision[] {
  if (!v.items_visibles) return lugar ? catalogoPara(bloques, lugar) : bloques
  const visibles = new Set(v.items_visibles)
  return bloques
    .map(b => ({ ...b, items: b.items.filter(i => visibles.has(i.id)) }))
    .filter(b => b.items.length > 0)
}

/**
 * Cumple / (Cumple + No cumple). N/A, sin responder e ítems fuera del catálogo
 * no cuentan. Los No cumple puestos al cerrar (auto) cuentan como No cumple.
 */
export function calcularResumen(respuestas: Respuestas, bloques: BloqueSupervision[]): ResumenVisita {
  let cumple = 0, noCumple = 0, na = 0, total = 0, sinResponder = 0
  const porBloque: Record<string, number | null> = {}
  for (const b of bloques) {
    let bc = 0, bnc = 0
    for (const it of b.items) {
      total++
      const a = respuestas[it.id]
      if (a?.r === 'C') { cumple++; bc++ } else if (a?.r === 'NC') { noCumple++; bnc++; if (a.auto) sinResponder++ } else if (a?.r === 'NA') na++
    }
    porBloque[b.id] = bc + bnc ? redondear1((bc * 100) / (bc + bnc)) : null
  }
  return {
    pct: cumple + noCumple ? redondear1((cumple * 100) / (cumple + noCumple)) : null,
    cumple, noCumple, na,
    sinResp: total - cumple - noCumple - na,
    sinResponder,
    bloques: porBloque,
  }
}

/** IDs del catálogo que todavía no tienen Cumple / No cumple / N/A. */
export function idsSinResponder(respuestas: Respuestas, bloques: BloqueSupervision[]): string[] {
  return bloques.flatMap(b => b.items.map(i => i.id)).filter(id => !respuestas[id]?.r)
}

/** Al cerrar: lo que quedó sin responder pasa a No cumple, marcado como automático. */
export function completarSinResponder(respuestas: Respuestas, bloques: BloqueSupervision[]): Respuestas {
  const r = { ...respuestas }
  for (const id of idsSinResponder(respuestas, bloques)) r[id] = { ...r[id], r: 'NC', auto: true }
  return r
}

export type NivelCumplimiento = 'alto' | 'medio' | 'bajo'

export function nivelCumplimiento(pct: number | null | undefined): NivelCumplimiento | null {
  if (pct == null) return null
  return pct >= 85 ? 'alto' : pct >= 65 ? 'medio' : 'bajo'
}

export function textoPct(pct: number | null | undefined): string {
  return pct == null ? '–' : `${Math.round(pct)}%`
}

/** El porcentaje de una visita: el guardado si está cerrada, si no lo que lleva. */
export function pctVisita(v: VisitaSupervision, bloques: BloqueSupervision[]): number | null {
  return v.estado === 'cerrada' && v.resumen ? v.resumen.pct : calcularResumen(v.respuestas, bloques).pct
}

const porFechaDesc = (a: VisitaSupervision, b: VisitaSupervision) => b.fecha.localeCompare(a.fecha)

export function ultimaCerrada(visitas: VisitaSupervision[], lugarId: string, exceptoId?: string): VisitaSupervision | null {
  return visitas
    .filter(v => v.estado === 'cerrada' && v.lugar_id === lugarId && v.id !== exceptoId)
    .sort(porFechaDesc)[0] ?? null
}

export function visitaEnCurso(visitas: VisitaSupervision[], lugarId: string): VisitaSupervision | null {
  return visitas.filter(v => v.estado === 'en_curso' && v.lugar_id === lugarId).sort(porFechaDesc)[0] ?? null
}

/** La visita cerrada de la misma sucursal inmediatamente anterior a `v`. */
export function anteriorCerrada(visitas: VisitaSupervision[], v: VisitaSupervision): VisitaSupervision | null {
  return visitas
    .filter(x => x.estado === 'cerrada' && x.lugar_id === v.lugar_id && x.id !== v.id && x.fecha < v.fecha)
    .sort(porFechaDesc)[0] ?? null
}

/** Diferencia en puntos (entera) contra la anterior; null si falta alguno. */
export function diferenciaPuntos(pct: number | null | undefined, anterior: number | null | undefined): number | null {
  return pct == null || anterior == null ? null : Math.round(pct) - Math.round(anterior)
}

/**
 * Lo que quedó sin cumplir en una visita (y sigue en el catálogo), con su
 * observación. No incluye los No cumple puestos al cerrar: no se revisaron.
 */
export function pendientesDe(anterior: VisitaSupervision | null, bloques: BloqueSupervision[]) {
  if (!anterior) return { ids: [] as string[], obs: {} as Record<string, string> }
  const enCatalogo = new Set(bloques.flatMap(b => b.items.map(i => i.id)))
  const ids = Object.entries(anterior.respuestas ?? {})
    .filter(([id, a]) => a?.r === 'NC' && !a.auto && enCatalogo.has(id))
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

// ── Filtros ────────────────────────────────────────────────────────────────

export type Periodo = 'este_mes' | 'mes_pasado' | '30d' | '90d' | 'anio' | 'todo'

export const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'este_mes', texto: 'Este mes' },
  { valor: 'mes_pasado', texto: 'Mes pasado' },
  { valor: '30d', texto: 'Últimos 30 días' },
  { valor: '90d', texto: 'Últimos 90 días' },
  { valor: 'anio', texto: 'Este año' },
  { valor: 'todo', texto: 'Todo el período' },
]

export interface Rango { desde: number | null; hasta: number | null }

// Argentina es UTC-3 todo el año: los meses arrancan a las 03:00 UTC.
const inicioMesAR = (anio: number, mes: number) => Date.UTC(anio, mes, 1, 3)

export function rangoPeriodo(p: Periodo, ahora: number): Rango {
  const ar = new Date(ahora - 3 * 3_600_000)
  const anio = ar.getUTCFullYear(), mes = ar.getUTCMonth()
  switch (p) {
    case 'este_mes': return { desde: inicioMesAR(anio, mes), hasta: null }
    case 'mes_pasado': return { desde: inicioMesAR(anio, mes - 1), hasta: inicioMesAR(anio, mes) }
    case '30d': return { desde: ahora - 30 * DIA, hasta: null }
    case '90d': return { desde: ahora - 90 * DIA, hasta: null }
    case 'anio': return { desde: Date.UTC(anio, 0, 1, 3), hasta: null }
    case 'todo': return { desde: null, hasta: null }
  }
}

/** El período del mismo largo justo antes (para la tendencia). Null si es "todo". */
export function rangoAnterior(r: Rango, ahora: number): Rango | null {
  if (r.desde == null) return null
  const hasta = r.hasta ?? ahora
  return { desde: r.desde - (hasta - r.desde), hasta: r.desde }
}

export function enRango(iso: string, r: Rango): boolean {
  const t = Date.parse(iso)
  return (r.desde == null || t >= r.desde) && (r.hasta == null || t < r.hasta)
}

export interface FiltrosVisitas {
  rango: Rango
  estado?: 'todas' | 'en_curso' | 'cerrada'
  nivel?: 'todos' | NivelCumplimiento
  zona?: string
  supervisor?: string
  texto?: string
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarVisitas(
  visitas: VisitaSupervision[], f: FiltrosVisitas, sucursales: LugarSupervision[], bloques: BloqueSupervision[],
): VisitaSupervision[] {
  const suc = new Map(sucursales.map(s => [s.id, s]))
  const q = f.texto ? sinAcentos(f.texto.trim()) : ''
  return visitas.filter(v => {
    if (!enRango(v.fecha, f.rango)) return false
    if (f.estado && f.estado !== 'todas' && v.estado !== f.estado) return false
    if (f.zona && f.zona !== 'todas' && suc.get(v.lugar_id)?.zona !== f.zona) return false
    if (f.supervisor && f.supervisor !== 'todos' && v.supervisor_nombre !== f.supervisor) return false
    if (f.nivel && f.nivel !== 'todos' && nivelCumplimiento(pctVisita(v, bloques)) !== f.nivel) return false
    if (q && !sinAcentos(`${suc.get(v.lugar_id)?.nombre ?? ''} ${v.supervisor_nombre} ${v.encargado ?? ''}`).includes(q)) return false
    return true
  })
}

// ── Análisis ───────────────────────────────────────────────────────────────

const promedio = (xs: number[]) => (xs.length ? redondear1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

/**
 * Pantalla de análisis sobre las visitas ya filtradas (período, zona,
 * supervisor). Se toma la última visita cerrada de cada sucursal para el
 * promedio y el mapa; el ranking de incumplidos cuenta todas las visitas
 * cerradas y no incluye los No cumple puestos solos al cerrar.
 */
export function analizar(
  visitas: VisitaSupervision[],
  bloques: BloqueSupervision[],
  sucursales: LugarSupervision[],
  opciones: { bloqueId?: string; nivel?: 'todos' | NivelCumplimiento } = {},
) {
  const cerradas = visitas.filter(v => v.estado === 'cerrada').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultimaPorSucursal = new Map<string, VisitaSupervision>()
  for (const v of cerradas) ultimaPorSucursal.set(v.lugar_id, v)

  const resumenes = new Map([...ultimaPorSucursal.values()].map(v => [v.id, calcularResumen(v.respuestas, bloques)]))
  const nivelOk = (pct: number | null) => !opciones.nivel || opciones.nivel === 'todos' || nivelCumplimiento(pct) === opciones.nivel

  const mapa = sucursales.map(s => {
    const v = ultimaPorSucursal.get(s.id) ?? null
    const r = v ? resumenes.get(v.id)! : null
    return { sucursal: s, visita: v, total: r?.pct ?? null, bloques: r?.bloques ?? {} }
  }).filter(f => !f.visita || nivelOk(f.total))

  const conVisita = mapa.filter(f => f.visita)
  const ultimas = conVisita.map(f => f.visita!)

  const bloquesItems = opciones.bloqueId ? bloques.filter(b => b.id === opciones.bloqueId) : bloques
  const enAlcance = new Set(bloquesItems.flatMap(b => b.items.map(i => i.id)))
  const veces = new Map<string, { visitas: number; sucursales: Set<string> }>()
  for (const v of cerradas) {
    for (const [id, a] of Object.entries(v.respuestas ?? {})) {
      if (a?.r !== 'NC' || a.auto || !enAlcance.has(id)) continue
      const x = veces.get(id) ?? { visitas: 0, sucursales: new Set<string>() }
      x.visitas++
      x.sucursales.add(v.lugar_id)
      veces.set(id, x)
    }
  }
  const top = [...veces.entries()]
    .sort((a, b) => b[1].visitas - a[1].visitas || b[1].sucursales.size - a[1].sucursales.size)
    .slice(0, 10)
    .map(([itemId, x]) => ({ itemId, veces: x.visitas, sucursales: x.sucursales.size }))

  return {
    cerradas,
    ultimas,
    mapa,
    promedio: promedio(conVisita.map(f => f.total).filter((p): p is number => p != null)),
    enRojo: conVisita.filter(f => nivelCumplimiento(f.total) === 'bajo').map(f => f.sucursal),
    top,
  }
}

/** Sucursales sin una visita cerrada en los últimos `dias` días. */
export function sinVisitarDesde(visitas: VisitaSupervision[], sucursales: LugarSupervision[], ahora: number, dias = 30) {
  const limite = ahora - dias * DIA
  return sucursales.filter(s => !visitas.some(v => v.estado === 'cerrada' && v.lugar_id === s.id && Date.parse(v.fecha) >= limite))
}

export function diasDesde(iso: string, ahora: number): number {
  return Math.max(0, Math.floor((ahora - Date.parse(iso)) / DIA))
}

// ── CSV ────────────────────────────────────────────────────────────────────

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
          fecha(v.fecha), nombreSucursal(v.lugar_id), v.supervisor_nombre,
          v.estado === 'cerrada' ? 'Cerrada' : 'En curso', pct ?? '',
          b.titulo, it.texto, a.r ? ETIQUETA[a.r] + (a.auto ? ' (sin responder)' : '') : '', a.obs ?? '',
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
