'use client'

import { useState } from 'react'
import { IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import {
  CATEGORIAS_REQ, PRIORIDADES_REQ,
  type CategoriaRequerimiento, type PrioridadRequerimiento, type RequerimientoSupervision,
} from '@/lib/supervision/tipos'
import { ChipPrioridad, textoDe } from './ui'

// Requerimientos que nacen en una visita: se guardan al tocar Agregar (no
// esperan al cierre). Mientras la visita está en curso se pueden borrar; el
// seguimiento (estado, respuesta, responsable) se hace en la pestaña Requerimientos.

interface Props {
  visitaId: string
  lugarId: string
  enCurso: boolean
  iniciales: RequerimientoSupervision[]
  toast: ReturnType<typeof useToasts>
}

const CAMPO = 'min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function RequerimientosVisita({ visitaId, lugarId, enCurso, iniciales, toast }: Props) {
  const [supabase] = useState(() => createClient())
  const [lista, setLista] = useState(iniciales)
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState<CategoriaRequerimiento>('herramienta_insumo')
  const [prioridad, setPrioridad] = useState<PrioridadRequerimiento>('no_urgente')
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)

  async function agregar() {
    const texto = descripcion.trim()
    if (!texto) { toast.error('Escribí qué hace falta.'); return }
    setGuardando(true)
    const { data, error } = await supabase.from('supervision_requerimientos')
      .insert({ lugar_id: lugarId, visita_id: visitaId, descripcion: texto, categoria, prioridad })
      .select('*').single()
    setGuardando(false)
    if (error || !data) {
      toast.error(error?.code === '42501'
        ? 'Tu usuario no puede cargar requerimientos. Consultá con el administrador.'
        : 'No se pudo guardar el requerimiento. Revisá la conexión y probá de nuevo.')
      return
    }
    setLista(prev => [...prev, data as RequerimientoSupervision])
    // Si mientras se guardaba ya empezó a escribir el siguiente, no se lo borra.
    setDescripcion(actual => (actual.trim() === texto ? '' : actual))
  }

  async function borrar(r: RequerimientoSupervision) {
    setBorrando(r.id)
    const { data, error } = await supabase.from('supervision_requerimientos').delete().eq('id', r.id).select('id')
    setBorrando(null)
    if (error || !data?.length) { toast.error('No se pudo borrar. Solo se borran los que cargaste en esta visita.'); return }
    setLista(prev => prev.filter(x => x.id !== r.id))
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Requerimientos</h3>
        <p className="text-xs text-faint">Lo que falta, lo que hay que reparar o una idea del personal. No suma al cumplimiento.</p>
      </div>

      {lista.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lista.map(r => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm text-text">{r.descripcion}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <ChipPrioridad prioridad={r.prioridad} />{textoDe(CATEGORIAS_REQ, r.categoria)}
                </p>
              </div>
              {enCurso && (
                <button type="button" onClick={() => borrar(r)} disabled={borrando === r.id} aria-label={`Borrar: ${r.descripcion}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-brand-red disabled:opacity-50">
                  {borrando === r.id ? <IconLoader2 size={16} className="animate-spin" /> : <IconTrash size={16} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Qué hace falta</span>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
            placeholder="Por ejemplo: falta una balanza de precisión" className={CAMPO} />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Categoría</span>
            <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaRequerimiento)} className={CAMPO}>
              {CATEGORIAS_REQ.map(c => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Prioridad</span>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value as PrioridadRequerimiento)} className={CAMPO}>
              {PRIORIDADES_REQ.map(p => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
            </select>
          </label>
          <button type="button" onClick={agregar} disabled={guardando}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-accent px-4 text-sm font-bold text-accent hover:bg-accent-bg disabled:opacity-50">
            {guardando ? <IconLoader2 size={16} className="animate-spin" aria-hidden /> : <IconPlus size={16} aria-hidden />}
            Agregar
          </button>
        </div>
      </div>
    </section>
  )
}
