'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import ModalSubtarea from './ModalSubtarea'
import ModalInforme from './ModalInforme'
import { PRIORIDAD_META, notificarTarea } from './helpers'
import type { Tarea, TareaSubtarea, InformeDiario } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hoyISO() { return toISODate(new Date()) }

function inicioSemana(d: Date) {
  const offset = (d.getDay() + 6) % 7 // lunes = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

function generarSemana(semanaActual: Date) {
  const inicio = inicioSemana(semanaActual)
  const dias: Date[] = []
  for (let i = 0; i < 7; i++) dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  return dias
}

function fmtRangoSemana(dias: Date[]) {
  const ini = dias[0], fin = dias[6]
  if (ini.getMonth() === fin.getMonth() && ini.getFullYear() === fin.getFullYear()) {
    return `${ini.getDate()} – ${fin.getDate()} de ${fin.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
  }
  const opts = { day: 'numeric', month: 'short' } as const
  const iniStr = ini.toLocaleDateString('es-AR', opts)
  const finStr = fin.toLocaleDateString('es-AR', opts)
  return `${iniStr} – ${finStr} de ${fin.getFullYear()}`
}

// ── Chips draggables ───────────────────────────────────────────────────
function TareaChip({ tarea, isDragging, onClick }: { tarea: Tarea; isDragging: boolean; onClick: (t: Tarea) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dragging } = useDraggable({ id: `tarea:${tarea.id}` })
  const prioM = PRIORIDAD_META[tarea.prioridad]
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={e => { e.stopPropagation(); if (!dragging) onClick(tarea) }}
      className={`text-[11px] px-1.5 py-1 rounded-md mb-1 truncate cursor-grab select-none touch-none ${tarea.estado === 'completada' ? 'line-through opacity-60' : ''}`}
      style={{
        background: prioM.bg, color: prioM.color, borderLeft: `3px solid ${prioM.color}`,
        opacity: isDragging ? 0.3 : 1,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
      title={tarea.titulo}
    >
      {tarea.titulo}
    </div>
  )
}

function SubtareaChip({ sub, isDragging, onClick }: { sub: TareaSubtarea; isDragging: boolean; onClick: (s: TareaSubtarea) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dragging } = useDraggable({ id: `subtarea:${sub.id}` })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={e => { e.stopPropagation(); if (!dragging) onClick(sub) }}
      className={`text-[11px] px-1.5 py-1 rounded-md mb-1 truncate cursor-grab select-none touch-none bg-[#1a1a1a] border border-[#2a2a2a] text-[#ccc] ${sub.completada ? 'line-through opacity-60' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
      title={sub.texto}
    >
      ☑ {sub.texto}
    </div>
  )
}

function InformeChip({ informe, onClick }: { informe: InformeDiario; onClick: () => void }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      className="text-[11px] px-1.5 py-1 rounded-md mb-1 truncate cursor-pointer bg-[rgba(167,139,250,.12)] text-[#a78bfa]"
      style={{ borderLeft: '3px solid #a78bfa' }}
    >
      📨 Informe
    </div>
  )
}

// ── Celda de día droppable ──────────────────────────────────────────────
function DiaCelda({
  iso, numero, esHoy, tareasDia, subtareasDia, informesDia, activeId,
  pickerAbierto, onAbrirPicker, onCerrarPicker, onNuevaTarea, onNuevaSubtarea, onNuevoInforme,
  onClickTarea, onClickSubtarea, onClickInforme,
}: {
  iso: string; numero: number; esHoy: boolean
  tareasDia: Tarea[]; subtareasDia: TareaSubtarea[]; informesDia: InformeDiario[]
  activeId: string | null
  pickerAbierto: boolean; onAbrirPicker: () => void; onCerrarPicker: () => void
  onNuevaTarea: () => void; onNuevaSubtarea: () => void; onNuevoInforme: () => void
  onClickTarea: (t: Tarea) => void; onClickSubtarea: (s: TareaSubtarea) => void; onClickInforme: (i: InformeDiario) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `dia:${iso}` })

  return (
    <div
      ref={setNodeRef}
      onClick={onAbrirPicker}
      className="relative h-[440px] rounded-lg border border-[#2a2a2a] p-1.5 flex flex-col cursor-pointer"
      style={{ background: isOver ? 'rgba(232,197,71,.08)' : '#111111' }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className={`text-[11px] font-bold leading-none ${esHoy ? 'bg-[#e8c547] text-black rounded-full w-5 h-5 flex items-center justify-center' : 'text-[#888] px-0.5'}`}>{numero}</span>
        <button onClick={e => { e.stopPropagation(); onAbrirPicker() }} className="bg-transparent border-none text-[#555] cursor-pointer text-xs leading-none px-0.5">+</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tareasDia.map(t => <TareaChip key={t.id} tarea={t} isDragging={activeId === `tarea:${t.id}`} onClick={onClickTarea} />)}
        {subtareasDia.map(s => <SubtareaChip key={s.id} sub={s} isDragging={activeId === `subtarea:${s.id}`} onClick={onClickSubtarea} />)}
        {informesDia.map(i => <InformeChip key={i.id} informe={i} onClick={() => onClickInforme(i)} />)}
      </div>

      {pickerAbierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); onCerrarPicker() }} />
          <div onClick={e => e.stopPropagation()} className="absolute left-0 top-full mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg z-20 min-w-[170px] overflow-hidden">
            <button onClick={onNuevaTarea} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">+ Tarea</button>
            <button onClick={onNuevaSubtarea} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">+ Subtarea</button>
            <button onClick={onNuevoInforme} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">📨 Informe del día</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Vista calendario ─────────────────────────────────────────────────────
interface VistaCalendarioProps {
  tareas: Tarea[]
  perfiles: PerfilLite[]
  userId: string
  userNombre: string
  onEditarTarea: (t: Tarea) => void
  onNuevaTarea: (fecha: string) => void
}

export default function VistaCalendario({ tareas, perfiles, userId, userNombre, onEditarTarea, onNuevaTarea }: VistaCalendarioProps) {
  const supabase = createClient()
  const [semanaActual, setSemanaActual] = useState(() => inicioSemana(new Date()))
  const [subtareas, setSubtareas] = useState<TareaSubtarea[]>([])
  const [informes, setInformes] = useState<InformeDiario[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [diaPicker, setDiaPicker] = useState<string | null>(null)
  const [modalSubtarea, setModalSubtarea] = useState<string | null>(null)
  const [modalInforme, setModalInforme] = useState<{ fecha: string; informe: InformeDiario | null } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const dias = useMemo(() => generarSemana(semanaActual), [semanaActual])

  useEffect(() => {
    let activo = true
    async function cargar() {
      const desde = toISODate(dias[0])
      const hasta = toISODate(dias[dias.length - 1])
      const [{ data: subs }, { data: infs }] = await Promise.all([
        supabase.from('tarea_subtareas').select('*').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('informes_diarios').select('*').gte('fecha', desde).lte('fecha', hasta),
      ])
      if (!activo) return
      setSubtareas(subs || [])
      setInformes(infs || [])
    }
    cargar()
    return () => { activo = false }
  }, [semanaActual])

  useEffect(() => {
    const canal = supabase.channel('calendario-tareas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea_subtareas' }, payload => {
        if (payload.eventType === 'DELETE') {
          setSubtareas(prev => prev.filter(s => s.id !== (payload.old as { id: string }).id))
          return
        }
        const s = payload.new as TareaSubtarea
        if (!s.fecha) { setSubtareas(prev => prev.filter(x => x.id !== s.id)); return }
        setSubtareas(prev => prev.find(x => x.id === s.id) ? prev.map(x => x.id === s.id ? { ...x, ...s } : x) : [...prev, s])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_diarios' }, payload => {
        if (payload.eventType === 'DELETE') {
          setInformes(prev => prev.filter(i => i.id !== (payload.old as { id: string }).id))
          return
        }
        const i = payload.new as InformeDiario
        setInformes(prev => prev.find(x => x.id === i.id) ? prev.map(x => x.id === i.id ? i : x) : [...prev, i])
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  const tareasPorDia = useMemo(() => {
    const m = new Map<string, Tarea[]>()
    for (const t of tareas) {
      if (!t.fecha_limite) continue
      const arr = m.get(t.fecha_limite) || []
      arr.push(t)
      m.set(t.fecha_limite, arr)
    }
    return m
  }, [tareas])

  const subtareasPorDia = useMemo(() => {
    const m = new Map<string, TareaSubtarea[]>()
    for (const s of subtareas) {
      if (!s.fecha) continue
      const arr = m.get(s.fecha) || []
      arr.push(s)
      m.set(s.fecha, arr)
    }
    return m
  }, [subtareas])

  const informesPorDia = useMemo(() => {
    const m = new Map<string, InformeDiario[]>()
    for (const i of informes) {
      const arr = m.get(i.fecha) || []
      arr.push(i)
      m.set(i.fecha, arr)
    }
    return m
  }, [informes])

  async function moverTarea(tareaId: string, nuevaFecha: string) {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea || tarea.fecha_limite === nuevaFecha) return
    const anterior = tarea.fecha_limite
    const { error } = await supabase.from('tareas').update({ fecha_limite: nuevaFecha }).eq('id', tareaId)
    if (error) { alert('No se pudo mover la tarea: ' + error.message); return }
    await supabase.from('tarea_historial').insert([{
      tarea_id: tareaId, campo: 'fecha_limite',
      valor_anterior: anterior, valor_nuevo: nuevaFecha, autor_id: userId,
    }])
    const destinatarios = [...new Set([tarea.creado_por, ...(tarea.asignado_a || [])])].filter(id => id !== userId)
    if (destinatarios.length) {
      notificarTarea({ userIds: destinatarios, title: '📅 Fecha actualizada', body: `${userNombre} movió "${tarea.titulo}" al ${nuevaFecha}`, url: '/tareas' })
    }
  }

  async function moverSubtarea(subId: string, nuevaFecha: string) {
    setSubtareas(prev => prev.map(s => s.id === subId ? { ...s, fecha: nuevaFecha } : s))
    await supabase.from('tarea_subtareas').update({ fecha: nuevaFecha }).eq('id', subId)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const overId = String(over.id)
    if (!overId.startsWith('dia:')) return
    const nuevaFecha = overId.slice(4)
    const activeIdStr = String(active.id)
    if (activeIdStr.startsWith('tarea:')) moverTarea(activeIdStr.slice(6), nuevaFecha)
    else if (activeIdStr.startsWith('subtarea:')) moverSubtarea(activeIdStr.slice(9), nuevaFecha)
  }

  return (
    <div className="pt-3 pb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSemanaActual(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="w-8 h-8 rounded-full bg-[#111111] border border-[#2a2a2a] text-[#888] cursor-pointer">‹</button>
          <div className="text-sm font-bold text-[#f0f0f0] font-['Syne'] capitalize min-w-[180px] text-center">
            {fmtRangoSemana(dias)}
          </div>
          <button onClick={() => setSemanaActual(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="w-8 h-8 rounded-full bg-[#111111] border border-[#2a2a2a] text-[#888] cursor-pointer">›</button>
        </div>
        <button onClick={() => setSemanaActual(inicioSemana(new Date()))}
          className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-[#888] border border-[#2a2a2a] cursor-pointer">Hoy</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_SEMANA.map(d => <div key={d} className="text-center text-[11px] font-bold text-[#666] py-1">{d}</div>)}
      </div>

      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="grid grid-cols-7 gap-1">
          {dias.map(dia => {
            const iso = toISODate(dia)
            return (
              <DiaCelda
                key={iso}
                iso={iso}
                numero={dia.getDate()}
                esHoy={iso === hoyISO()}
                tareasDia={tareasPorDia.get(iso) || []}
                subtareasDia={subtareasPorDia.get(iso) || []}
                informesDia={informesPorDia.get(iso) || []}
                activeId={activeId}
                pickerAbierto={diaPicker === iso}
                onAbrirPicker={() => setDiaPicker(iso)}
                onCerrarPicker={() => setDiaPicker(null)}
                onNuevaTarea={() => { setDiaPicker(null); onNuevaTarea(iso) }}
                onNuevaSubtarea={() => { setDiaPicker(null); setModalSubtarea(iso) }}
                onNuevoInforme={() => { setDiaPicker(null); setModalInforme({ fecha: iso, informe: null }) }}
                onClickTarea={onEditarTarea}
                onClickSubtarea={s => { const t = tareas.find(x => x.id === s.tarea_id); if (t) onEditarTarea(t) }}
                onClickInforme={inf => setModalInforme({ fecha: inf.fecha, informe: inf })}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeId && (
            <div className="opacity-90 rotate-1 pointer-events-none rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#f0f0f0] shadow-lg">
              Moviendo…
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {modalSubtarea && (
        <ModalSubtarea
          tareas={tareas}
          userId={userId}
          fechaInicial={modalSubtarea}
          onCerrar={() => setModalSubtarea(null)}
          onCreada={sub => { setSubtareas(prev => [...prev, sub]); setModalSubtarea(null) }}
        />
      )}

      {modalInforme && (
        <ModalInforme
          informe={modalInforme.informe}
          fecha={modalInforme.fecha}
          perfiles={perfiles}
          userId={userId}
          userNombre={userNombre}
          onCerrar={() => setModalInforme(null)}
          onCreado={inf => { setInformes(prev => [...prev, inf]); setModalInforme(null) }}
          onEliminado={id => { setInformes(prev => prev.filter(i => i.id !== id)); setModalInforme(null) }}
        />
      )}
    </div>
  )
}
