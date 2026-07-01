'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PRIORIDAD_META } from './helpers'
import type { Tarea, TareaSubtarea } from '@/lib/types'

interface ModalSubtareaProps {
  tareas: Tarea[]
  userId: string
  fechaInicial: string
  onCerrar: () => void
  onCreada: (sub: TareaSubtarea) => void
}

export default function ModalSubtarea({ tareas, userId, fechaInicial, onCerrar, onCreada }: ModalSubtareaProps) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [tareaId, setTareaId] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState(fechaInicial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const misTareas = useMemo(
    () => tareas.filter(t => t.creado_por === userId || (Array.isArray(t.asignado_a) && t.asignado_a.includes(userId))),
    [tareas, userId]
  )
  const filtradas = useMemo(() => {
    const q = query.toLowerCase()
    return misTareas.filter(t => !q || t.titulo.toLowerCase().includes(q))
  }, [misTareas, query])

  const tareaElegida = tareaId ? tareas.find(t => t.id === tareaId) || null : null

  async function guardar() {
    if (!tareaId) { setError('Elegí una tarea'); return }
    if (!texto.trim()) { setError('El ítem es obligatorio'); return }
    setLoading(true); setError('')
    try {
      const { count } = await supabase.from('tarea_subtareas').select('id', { count: 'exact', head: true }).eq('tarea_id', tareaId)
      const { data, error: err } = await supabase.from('tarea_subtareas')
        .insert([{ tarea_id: tareaId, texto: texto.trim(), completada: false, orden: count || 0, fecha: fecha || null }])
        .select().single()
      if (err) throw err
      onCreada(data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-[440px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 shrink-0 border-b border-[#2a2a2a] flex justify-between items-center">
          <h2 className="m-0 text-base font-bold font-['Syne'] text-[#f0f0f0]">+ Subtarea</h2>
          <button onClick={onCerrar} className="bg-transparent border-none text-lg cursor-pointer text-[#888] p-1">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          <div>
            <label className="text-[11px] font-semibold text-[#888] block mb-1">TAREA *</label>
            {tareaElegida ? (
              <div className="flex items-center justify-between bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
                <span className="text-sm text-[#f0f0f0]">{tareaElegida.titulo}</span>
                <button onClick={() => setTareaId(null)} className="bg-transparent border-none text-[#888] cursor-pointer text-xs">Cambiar</button>
              </div>
            ) : (
              <div className="border border-[#2a2a2a] rounded-xl overflow-hidden bg-[#1a1a1a]">
                <div className="px-2.5 py-1.5 border-b border-[#2a2a2a]">
                  <input placeholder="Buscar tarea…" value={query} onChange={e => setQuery(e.target.value)} className="!py-1.5" autoFocus />
                </div>
                <div className="max-h-[180px] overflow-y-auto">
                  {filtradas.map(t => (
                    <div key={t.id} onClick={() => setTareaId(t.id)}
                      className="px-3.5 py-2 text-[13px] cursor-pointer flex items-center gap-2 border-b border-[#2a2a2a]/40 hover:bg-[rgba(232,197,71,.06)]">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: PRIORIDAD_META[t.prioridad].color, background: PRIORIDAD_META[t.prioridad].bg }}>
                        {PRIORIDAD_META[t.prioridad].label.toUpperCase()}
                      </span>
                      <span className="text-[#f0f0f0]">{t.titulo}</span>
                    </div>
                  ))}
                  {filtradas.length === 0 && <div className="px-3.5 py-3 text-xs text-[#444] text-center">Sin tareas</div>}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#888] block mb-1">ÍTEM *</label>
            <input placeholder="¿Qué hay que hacer?" value={texto} onChange={e => setTexto(e.target.value)} />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#888] block mb-1">FECHA</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {error && <div className="bg-[rgba(232,66,16,.10)] text-[#e84210] px-3 py-2 rounded-lg text-[13px]">{error}</div>}

          <button onClick={guardar} disabled={loading}
            className={`border-none rounded-xl py-3 text-sm font-bold font-['Syne'] mt-1 ${loading ? 'bg-[#2a2a2a] text-[#888] cursor-not-allowed' : 'bg-[#e8c547] text-black cursor-pointer'}`}>
            {loading ? 'Guardando…' : 'Agregar subtarea'}
          </button>
        </div>
      </div>
    </div>
  )
}
