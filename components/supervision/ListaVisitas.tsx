'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { IconCalendar, IconChevronRight, IconClipboardList, IconFilterOff } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import {
  PERIODOS, anteriorCerrada, diferenciaPuntos, filtrarVisitas, idsSinResponder, pctVisita, rangoPeriodo,
  type NivelCumplimiento, type Periodo,
} from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { ChipFiltro, OPCIONES_NIVEL } from './Filtros'
import { ChipEnCurso, Porcentaje, Tendencia } from './ui'

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
  ahora: number
}

const ESTADOS = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'en_curso', texto: 'En curso' },
  { valor: 'cerrada', texto: 'Cerradas' },
]

const INICIAL = { periodo: 'todo' as Periodo, estado: 'todas', nivel: 'todos', zona: 'todas', supervisor: 'todos', texto: '' }

/** "Esta semana", "Semana pasada" o el mes ("octubre de 2026"), en hora de Argentina. */
function grupoDe(iso: string, ahora: number): string {
  const ar = (t: number) => new Date(t - 3 * 3_600_000)
  const hoy = ar(ahora)
  const lunes = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7)) + 3 * 3_600_000
  const t = Date.parse(iso)
  if (t >= lunes) return 'Esta semana'
  if (t >= lunes - 7 * 86_400_000) return 'Semana pasada'
  return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', month: 'long', year: 'numeric' })
}

export default function ListaVisitas({ sucursales, bloques, visitas, ahora }: Props) {
  const [f, setF] = useState(INICIAL)
  const cambiar = (k: keyof typeof INICIAL) => (v: string) => setF(prev => ({ ...prev, [k]: v }))
  const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? id
  const total = bloques.reduce((n, b) => n + b.items.length, 0)

  const zonas = useMemo(() => [...new Set(sucursales.map(s => s.zona))], [sucursales])
  const supervisores = useMemo(() => [...new Set(visitas.map(v => v.supervisor_nombre))].sort((a, b) => a.localeCompare(b, 'es')), [visitas])

  const lista = useMemo(() => filtrarVisitas(visitas, {
    rango: rangoPeriodo(f.periodo, ahora),
    estado: f.estado as 'todas',
    nivel: f.nivel as 'todos' | NivelCumplimiento,
    zona: f.zona, supervisor: f.supervisor, texto: f.texto,
  }, sucursales, bloques).sort((a, b) => b.fecha.localeCompare(a.fecha)), [visitas, f, ahora, sucursales, bloques])

  const grupos = useMemo(() => {
    const m = new Map<string, VisitaSupervision[]>()
    for (const v of lista) { const g = grupoDe(v.fecha, ahora); m.set(g, [...(m.get(g) ?? []), v]) }
    return [...m.entries()]
  }, [lista, ahora])

  const hayFiltros = JSON.stringify(f) !== JSON.stringify(INICIAL)

  return (
    <div className="space-y-3">
      <SearchInput value={f.texto} onChange={cambiar('texto')} placeholder="Buscar sucursal, supervisor o encargado" className="w-full sm:max-w-md" />

      <div className="flex flex-wrap items-center gap-2">
        <ChipFiltro nombre="Período" valor={f.periodo} porDefecto="todo" mostrarValor icono={IconCalendar}
          opciones={PERIODOS.map(p => ({ valor: p.valor, texto: p.texto }))} onChange={cambiar('periodo')} />
        <ChipFiltro nombre="Estado" valor={f.estado} porDefecto="todas" opciones={ESTADOS} onChange={cambiar('estado')} />
        <ChipFiltro nombre="Nivel" valor={f.nivel} porDefecto="todos" opciones={OPCIONES_NIVEL} onChange={cambiar('nivel')} />
        <ChipFiltro nombre="Zona" valor={f.zona} porDefecto="todas"
          opciones={[{ valor: 'todas', texto: 'Todas las zonas' }, ...zonas.map(z => ({ valor: z, texto: z }))]} onChange={cambiar('zona')} />
        {supervisores.length > 1 && (
          <ChipFiltro nombre="Supervisor" valor={f.supervisor} porDefecto="todos"
            opciones={[{ valor: 'todos', texto: 'Todos' }, ...supervisores.map(s => ({ valor: s, texto: s }))]} onChange={cambiar('supervisor')} />
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{lista.length} visita{lista.length === 1 ? '' : 's'}</span>
        {hayFiltros && <button type="button" onClick={() => setF(INICIAL)} className="font-semibold text-accent hover:underline">Limpiar filtros</button>}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          {hayFiltros
            ? <EmptyState icono={IconFilterOff} titulo="No hay visitas con estos filtros" />
            : <EmptyState icono={IconClipboardList} titulo="Todavía no hay visitas" descripcion="Empezá una desde Nueva visita." />}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {grupos.map(([grupo, vs]) => (
            <section key={grupo}>
              <h3 className="bg-surface2 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-faint">{grupo}</h3>
              <ul className="divide-y divide-border">
                {vs.map(v => {
                  const pct = pctVisita(v, bloques)
                  const ant = v.estado === 'cerrada' ? anteriorCerrada(visitas, v) : null
                  const dif = ant ? diferenciaPuntos(pct, pctVisita(ant, bloques)) : null
                  return (
                    <li key={v.id}>
                      <Link href={`/admin/supervision/${v.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-semibold text-text">
                            <span className="truncate">{nombre(v.sucursal_id)}</span>
                            {v.estado === 'en_curso' && <ChipEnCurso />}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {fechaHora(v.fecha)} · {v.estado === 'en_curso'
                              ? `${total - idsSinResponder(v.respuestas, bloques).length} de ${total} respondidos`
                              : v.supervisor_nombre}
                            <span className="hidden sm:inline">{v.encargado ? ` · con ${v.encargado}` : ''}</span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Porcentaje pct={pct} className="block text-lg leading-tight" />
                          {v.estado === 'en_curso' ? <span className="text-2xs text-faint">parcial</span> : <Tendencia dif={dif} />}
                        </div>
                        <IconChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
