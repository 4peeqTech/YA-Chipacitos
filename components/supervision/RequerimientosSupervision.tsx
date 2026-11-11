'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconChevronDown, IconClipboardList, IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { diasDesde, filtrarRequerimientos } from '@/lib/supervision/calculos'
import { fechaCorta } from '@/lib/supervision/formato'
import {
  CATEGORIAS_REQ, ESTADOS_REQ, PRIORIDADES_REQ,
  type EstadoRequerimiento, type LugarSupervision, type RequerimientoSupervision,
} from '@/lib/supervision/tipos'
import { ChipFiltro } from './Filtros'
import { ChipPrioridad, textoDe } from './ui'

// Seguimiento de los requerimientos: por defecto los abiertos, urgentes
// primero. Cada uno se abre para cambiar estado, respuesta y responsable.

interface Props {
  requerimientos: RequerimientoSupervision[]
  lugares: LugarSupervision[]
  ahora: number
  onGuardado: (r: RequerimientoSupervision) => void
  toast: ReturnType<typeof useToasts>
}

const INICIAL = { lugar: 'todos', prioridad: 'todas', estado: 'abiertos' }
const CAMPO = 'min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const COLOR_ESTADO: Record<EstadoRequerimiento, string> = {
  pendiente: 'text-warning',
  en_gestion: 'text-accent',
  resuelto: 'text-success',
  descartado: 'text-faint',
}

interface Borrador { estado: EstadoRequerimiento; respuesta: string; responsable: string }

export default function RequerimientosSupervision({ requerimientos, lugares, ahora, onGuardado, toast }: Props) {
  const [supabase] = useState(() => createClient())
  const [f, setF] = useState(INICIAL)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const cambiar = (k: keyof typeof INICIAL) => (v: string) => setF(prev => ({ ...prev, [k]: v }))
  const nombre = (id: string) => lugares.find(l => l.id === id)?.nombre ?? id

  const conReq = lugares.filter(l => requerimientos.some(r => r.lugar_id === l.id))
  const lista = filtrarRequerimientos(requerimientos, f)
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(INICIAL)

  function abrir(r: RequerimientoSupervision) {
    if (abierto === r.id) { setAbierto(null); return }
    setAbierto(r.id)
    setBorrador({ estado: r.estado, respuesta: r.respuesta, responsable: r.responsable ?? '' })
  }

  async function guardar(r: RequerimientoSupervision) {
    if (!borrador) return
    setGuardando(true)
    const { data, error } = await supabase.from('supervision_requerimientos')
      .update({ estado: borrador.estado, respuesta: borrador.respuesta.trim(), responsable: borrador.responsable.trim() || null })
      .eq('id', r.id).select('*')
    setGuardando(false)
    if (error || !data?.length) { toast.error('No se pudo guardar. Revisá la conexión y probá de nuevo.'); return }
    onGuardado(data[0] as RequerimientoSupervision)
    setAbierto(null)
    toast.success('Requerimiento actualizado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ChipFiltro nombre="Estado" valor={f.estado} porDefecto="abiertos" mostrarValor
          opciones={[{ valor: 'abiertos', texto: 'Abiertos' }, ...ESTADOS_REQ.map(e => ({ valor: e.valor as string, texto: e.texto })), { valor: 'todos', texto: 'Todos' }]}
          onChange={cambiar('estado')} />
        <ChipFiltro nombre="Lugar" valor={f.lugar} porDefecto="todos"
          opciones={[{ valor: 'todos', texto: 'Todos los lugares' }, ...conReq.map(l => ({ valor: l.id, texto: l.nombre }))]} onChange={cambiar('lugar')} />
        <ChipFiltro nombre="Prioridad" valor={f.prioridad} porDefecto="todas"
          opciones={[{ valor: 'todas', texto: 'Todas' }, ...PRIORIDADES_REQ.map(p => ({ valor: p.valor as string, texto: p.texto }))]} onChange={cambiar('prioridad')} />
        {hayFiltros && <button type="button" onClick={() => setF(INICIAL)} className="px-1 text-xs font-semibold text-accent hover:underline">Limpiar</button>}
        <span className="ml-auto text-xs text-muted">{lista.length} {lista.length === 1 ? 'requerimiento' : 'requerimientos'}</span>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState icono={IconClipboardList}
            titulo={requerimientos.length === 0 ? 'Todavía no hay requerimientos' : hayFiltros ? 'No hay requerimientos con estos filtros' : 'No hay requerimientos abiertos'} />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {lista.map(r => {
            const dias = diasDesde(r.created_at, ahora)
            const esteAbierto = abierto === r.id
            return (
              <li key={r.id}>
                <button type="button" onClick={() => abrir(r)} aria-expanded={esteAbierto}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-text">{r.descripcion}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                      <ChipPrioridad prioridad={r.prioridad} />
                      <span className="font-semibold text-text">{nombre(r.lugar_id)}</span>
                      <span>
                        {textoDe(CATEGORIAS_REQ, r.categoria)} · {dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`} ·{' '}
                        <span className={`font-semibold ${COLOR_ESTADO[r.estado]}`}>{textoDe(ESTADOS_REQ, r.estado)}</span>
                      </span>
                    </p>
                    {!esteAbierto && r.respuesta && <p className="border-l-2 border-border pl-2 text-xs text-muted">{r.respuesta}</p>}
                  </div>
                  <IconChevronDown size={18} className={`mt-0.5 shrink-0 text-muted transition-transform ${esteAbierto ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {esteAbierto && borrador && (
                  <div className="grid grid-cols-1 gap-3 border-t border-border bg-surface2/40 px-4 py-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Estado</span>
                      <select value={borrador.estado} onChange={e => setBorrador({ ...borrador, estado: e.target.value as EstadoRequerimiento })} className={CAMPO}>
                        {ESTADOS_REQ.map(e => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Responsable</span>
                      <input value={borrador.responsable} onChange={e => setBorrador({ ...borrador, responsable: e.target.value })}
                        placeholder="Quién se ocupa" className={CAMPO} />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Respuesta</span>
                      <textarea value={borrador.respuesta} onChange={e => setBorrador({ ...borrador, respuesta: e.target.value })} rows={2}
                        placeholder="Qué se decidió y por qué" className={CAMPO} />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                      <p className="text-xs text-faint">
                        Cargado el {fechaCorta(r.created_at)}
                        {r.resuelto_at && ` · cerrado el ${fechaCorta(r.resuelto_at)}`}
                        {r.visita_id && <> · <Link href={`/admin/supervision/${r.visita_id}`} className="font-semibold text-accent hover:underline">ver la visita</Link></>}
                      </p>
                      <button type="button" onClick={() => guardar(r)} disabled={guardando}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
                        {guardando ? <IconLoader2 size={16} className="animate-spin" aria-hidden /> : <IconDeviceFloppy size={16} aria-hidden />}
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
