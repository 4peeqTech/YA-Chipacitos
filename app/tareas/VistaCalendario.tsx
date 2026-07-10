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
import { PRIORIDAD_META, TURNO_META, notificarTarea, truncarTexto } from './helpers'
import type { Tarea, TareaSubtarea, InformeDiario, Turno } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

type ModoVista = 'dia' | 'semana' | 'mes'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hoyISO() { return toISODate(new Date()) }

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function inicioSemana(d: Date) {
  const offset = (d.getDay() + 6) % 7 // lunes = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

function generarSemana(fecha: Date) {
  const inicio = inicioSemana(fecha)
  const dias: Date[] = []
  for (let i = 0; i < 7; i++) dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  return dias
}

function generarMes(fecha: Date) {
  const primerDia = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
  const inicio = inicioSemana(primerDia)
  const dias: Date[] = []
  for (let i = 0; i < 42; i++) dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
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

function fmtDia(fecha: Date) {
  return cap(fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
}

function fmtMes(fecha: Date) {
  return cap(fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))
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
  const preview = informe.comentario ? truncarTexto(informe.comentario, 35) : 'Informe'
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      title={informe.comentario || undefined}
      className="text-[10px] px-1.5 py-0.5 rounded-md truncate cursor-pointer bg-[rgba(167,139,250,.12)] text-[#a78bfa]"
      style={{ borderLeft: '3px solid #a78bfa' }}
    >
      📨 {preview}
    </div>
  )
}

// ── Zona de un turno dentro del día (droppable) ──────────────────────────
interface ZonaData {
  tareasDia: Tarea[]
  subtareasDia: TareaSubtarea[]
  pickerAbierto: boolean
  onAbrirPicker: () => void
  onCerrarPicker: () => void
  onNuevaTarea: () => void
  onNuevaSubtarea: () => void
  onNuevoInforme: () => void
}

function TurnoZona({
  iso, turno, activeId, onClickTarea, onClickSubtarea,
  tareasDia, subtareasDia, pickerAbierto, onAbrirPicker, onCerrarPicker, onNuevaTarea, onNuevaSubtarea, onNuevoInforme,
}: ZonaData & {
  iso: string; turno: Turno; activeId: string | null
  onClickTarea: (t: Tarea) => void; onClickSubtarea: (s: TareaSubtarea) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `dia:${iso}:${turno}` })

  return (
    <div
      ref={setNodeRef}
      onClick={onAbrirPicker}
      className={`relative flex-1 min-h-0 p-1.5 flex flex-col cursor-pointer ${isOver ? 'bg-[rgba(232,197,71,.08)]' : 'bg-[#111111]'}`}
    >
      <div className="flex justify-between items-center mb-1 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wide text-[#666]">{TURNO_META[turno].icon} {turno === 'manana' ? 'Mañana' : 'Tarde'}</span>
        <button onClick={e => { e.stopPropagation(); onAbrirPicker() }} className="bg-transparent border-none text-[#555] cursor-pointer text-xs leading-none px-0.5">+</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tareasDia.map(t => <TareaChip key={t.id} tarea={t} isDragging={activeId === `tarea:${t.id}`} onClick={onClickTarea} />)}
        {subtareasDia.map(s => <SubtareaChip key={s.id} sub={s} isDragging={activeId === `subtarea:${s.id}`} onClick={onClickSubtarea} />)}
      </div>

      {pickerAbierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); onCerrarPicker() }} />
          <div onClick={e => e.stopPropagation()} className={`absolute left-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg z-20 min-w-[170px] overflow-hidden ${turno === 'tarde' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            <button onClick={onNuevaTarea} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">+ Tarea</button>
            <button onClick={onNuevaSubtarea} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">+ Subtarea</button>
            <button onClick={onNuevoInforme} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">📨 Informe del día</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Celda de día (header + 2 turnos) ─────────────────────────────────────
function DiaCelda({
  iso, numero, esHoy, informesDia, activeId, manana, tarde, alto, onClickTarea, onClickSubtarea, onClickInforme,
}: {
  iso: string; numero: number; esHoy: boolean
  informesDia: InformeDiario[]
  activeId: string | null
  manana: ZonaData; tarde: ZonaData
  alto?: string
  onClickTarea: (t: Tarea) => void; onClickSubtarea: (s: TareaSubtarea) => void; onClickInforme: (i: InformeDiario) => void
}) {
  return (
    <div className={`${alto || 'h-[460px]'} rounded-lg border border-[#2a2a2a] flex flex-col overflow-hidden`}>
      <div className="flex flex-col items-center gap-1 py-1.5 bg-[#111111] shrink-0">
        <span className={`text-[11px] font-bold leading-none ${esHoy ? 'bg-[#e8c547] text-black rounded-full w-5 h-5 flex items-center justify-center' : 'text-[#888] px-0.5'}`}>{numero}</span>
        {informesDia.length > 0 && (
          <div className="w-full px-1 flex flex-col gap-0.5">
            {informesDia.map(i => <InformeChip key={i.id} informe={i} onClick={() => onClickInforme(i)} />)}
          </div>
        )}
      </div>
      <TurnoZona iso={iso} turno="manana" activeId={activeId} onClickTarea={onClickTarea} onClickSubtarea={onClickSubtarea} {...manana} />
      <div className="h-px bg-[#2a2a2a] shrink-0" />
      <TurnoZona iso={iso} turno="tarde" activeId={activeId} onClickTarea={onClickTarea} onClickSubtarea={onClickSubtarea} {...tarde} />
    </div>
  )
}

// ── Chips compactos para la vista mes (sin drag) ─────────────────────────
function MesChipTarea({ tarea }: { tarea: Tarea }) {
  const prioM = PRIORIDAD_META[tarea.prioridad]
  return (
    <div
      className={`text-[9px] px-1 py-0.5 rounded truncate ${tarea.estado === 'completada' ? 'line-through opacity-60' : ''}`}
      style={{ background: prioM.bg, color: prioM.color, borderLeft: `2px solid ${prioM.color}` }}
      title={tarea.titulo}
    >
      {tarea.titulo}
    </div>
  )
}

function MesChipSubtarea({ sub }: { sub: TareaSubtarea }) {
  return (
    <div
      className={`text-[9px] px-1 py-0.5 rounded truncate bg-[#1a1a1a] border border-[#2a2a2a] text-[#ccc] ${sub.completada ? 'line-through opacity-60' : ''}`}
      title={sub.texto}
    >
      ☑ {sub.texto}
    </div>
  )
}

// ── Celda de día dentro de la vista mes ──────────────────────────────────
function MesCelda({
  dia, esMesActual, esHoy, tareasDia, subtareasDia, informesDia, onClick,
}: {
  dia: Date; esMesActual: boolean; esHoy: boolean
  tareasDia: Tarea[]; subtareasDia: TareaSubtarea[]; informesDia: InformeDiario[]
  onClick: () => void
}) {
  const MAX = 3
  const tareasMostradas = tareasDia.slice(0, MAX)
  const restantes = MAX - tareasMostradas.length
  const subtareasMostradas = restantes > 0 ? subtareasDia.slice(0, restantes) : []
  const totalItems = tareasDia.length + subtareasDia.length
  const ocultos = totalItems - tareasMostradas.length - subtareasMostradas.length

  return (
    <div
      onClick={onClick}
      className={`h-20 sm:h-24 rounded-lg border border-[#2a2a2a] p-1 flex flex-col cursor-pointer overflow-hidden ${esMesActual ? 'bg-[#111111]' : 'bg-[#0a0a0a] opacity-40'}`}
    >
      <div className="flex items-center justify-between shrink-0 mb-0.5">
        <span className={`text-[11px] font-bold leading-none ${esHoy ? 'bg-[#e8c547] text-black rounded-full w-5 h-5 flex items-center justify-center' : 'text-[#888] px-0.5'}`}>{dia.getDate()}</span>
        {informesDia.length > 0 && (
          <span className="text-[9px]" title={informesDia.map(i => i.comentario || 'Informe').join(' · ')}>📨</span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-0.5 overflow-hidden">
        {tareasMostradas.map(t => <MesChipTarea key={t.id} tarea={t} />)}
        {subtareasMostradas.map(s => <MesChipSubtarea key={s.id} sub={s} />)}
        {ocultos > 0 && <span className="text-[9px] text-[#666]">+{ocultos} más</span>}
      </div>
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
  onNuevaTarea: (fecha: string, turno: Turno) => void
}

export default function VistaCalendario({ tareas, perfiles, userId, userNombre, onEditarTarea, onNuevaTarea }: VistaCalendarioProps) {
  const [supabase] = useState(() => createClient())
  const [modoVista, setModoVista] = useState<ModoVista>('semana')
  const [fechaActual, setFechaActual] = useState(() => new Date())
  const [subtareas, setSubtareas] = useState<TareaSubtarea[]>([])
  const [informes, setInformes] = useState<InformeDiario[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [diaPicker, setDiaPicker] = useState<{ iso: string; turno: Turno } | null>(null)
  const [modalSubtarea, setModalSubtarea] = useState<{ iso: string; turno: Turno } | null>(null)
  const [modalInforme, setModalInforme] = useState<{ fecha: string; informe: InformeDiario | null } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    // Ajusta la vista inicial en mobile recién después de montar: el
    // render inicial debe coincidir con el del server (sin `window`) para
    // no generar un mismatch de hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof window !== 'undefined' && window.innerWidth < 640) setModoVista('dia')
  }, [])

  const dias = useMemo(() => {
    if (modoVista === 'dia') return [fechaActual]
    if (modoVista === 'semana') return generarSemana(fechaActual)
    return generarMes(fechaActual)
  }, [fechaActual, modoVista])

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
  }, [dias, supabase])

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
  }, [supabase])

  const tareasPorDiaTurno = useMemo(() => {
    const m = new Map<string, Tarea[]>()
    for (const t of tareas) {
      if (!t.fecha_limite) continue
      const key = `${t.fecha_limite}|${t.turno}`
      const arr = m.get(key) || []
      arr.push(t)
      m.set(key, arr)
    }
    return m
  }, [tareas])

  const subtareasPorDiaTurno = useMemo(() => {
    const m = new Map<string, TareaSubtarea[]>()
    for (const s of subtareas) {
      if (!s.fecha) continue
      const key = `${s.fecha}|${s.turno}`
      const arr = m.get(key) || []
      arr.push(s)
      m.set(key, arr)
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

  function tareasDelDia(iso: string) {
    return [...(tareasPorDiaTurno.get(`${iso}|manana`) || []), ...(tareasPorDiaTurno.get(`${iso}|tarde`) || [])]
  }

  function subtareasDelDia(iso: string) {
    return [...(subtareasPorDiaTurno.get(`${iso}|manana`) || []), ...(subtareasPorDiaTurno.get(`${iso}|tarde`) || [])]
  }

  async function moverTarea(tareaId: string, nuevaFecha: string, nuevoTurno: Turno) {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea || (tarea.fecha_limite === nuevaFecha && tarea.turno === nuevoTurno)) return
    const anterior = tarea.fecha_limite
    const { error } = await supabase.from('tareas').update({ fecha_limite: nuevaFecha, turno: nuevoTurno }).eq('id', tareaId)
    if (error) { alert('No se pudo mover la tarea: ' + error.message); return }
    await supabase.from('tarea_historial').insert([{
      tarea_id: tareaId, campo: 'fecha_limite',
      valor_anterior: anterior, valor_nuevo: nuevaFecha, autor_id: userId,
    }])
    const destinatarios = [...new Set([tarea.creado_por, ...(tarea.asignado_a || [])])].filter(id => id !== userId)
    if (destinatarios.length) {
      notificarTarea({ userIds: destinatarios, title: '📅 Fecha actualizada', body: `${userNombre} movió "${tarea.titulo}" al ${nuevaFecha} (${TURNO_META[nuevoTurno].label})`, url: '/tareas' })
    }
  }

  async function moverSubtarea(subId: string, nuevaFecha: string, nuevoTurno: Turno) {
    setSubtareas(prev => prev.map(s => s.id === subId ? { ...s, fecha: nuevaFecha, turno: nuevoTurno } : s))
    await supabase.from('tarea_subtareas').update({ fecha: nuevaFecha, turno: nuevoTurno }).eq('id', subId)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const overId = String(over.id)
    if (!overId.startsWith('dia:')) return
    const [nuevaFecha, nuevoTurno] = overId.slice(4).split(':') as [string, Turno]
    const activeIdStr = String(active.id)
    if (activeIdStr.startsWith('tarea:')) moverTarea(activeIdStr.slice(6), nuevaFecha, nuevoTurno)
    else if (activeIdStr.startsWith('subtarea:')) moverSubtarea(activeIdStr.slice(9), nuevaFecha, nuevoTurno)
  }

  function zonaFor(iso: string, turno: Turno): ZonaData {
    return {
      tareasDia: tareasPorDiaTurno.get(`${iso}|${turno}`) || [],
      subtareasDia: subtareasPorDiaTurno.get(`${iso}|${turno}`) || [],
      pickerAbierto: diaPicker?.iso === iso && diaPicker?.turno === turno,
      onAbrirPicker: () => setDiaPicker({ iso, turno }),
      onCerrarPicker: () => setDiaPicker(null),
      onNuevaTarea: () => { setDiaPicker(null); onNuevaTarea(iso, turno) },
      onNuevaSubtarea: () => { setDiaPicker(null); setModalSubtarea({ iso, turno }) },
      onNuevoInforme: () => { setDiaPicker(null); setModalInforme({ fecha: iso, informe: null }) },
    }
  }

  function irAnterior() {
    setFechaActual(d => {
      const n = new Date(d)
      if (modoVista === 'dia') n.setDate(n.getDate() - 1)
      else if (modoVista === 'semana') n.setDate(n.getDate() - 7)
      else n.setMonth(n.getMonth() - 1)
      return n
    })
  }

  function irSiguiente() {
    setFechaActual(d => {
      const n = new Date(d)
      if (modoVista === 'dia') n.setDate(n.getDate() + 1)
      else if (modoVista === 'semana') n.setDate(n.getDate() + 7)
      else n.setMonth(n.getMonth() + 1)
      return n
    })
  }

  const tituloRango = modoVista === 'dia' ? fmtDia(fechaActual)
    : modoVista === 'semana' ? fmtRangoSemana(dias)
    : fmtMes(fechaActual)

  return (
    <div className="pt-3 pb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={irAnterior}
            className="w-8 h-8 rounded-full bg-[#111111] border border-[#2a2a2a] text-[#888] cursor-pointer">‹</button>
          <div className="text-sm font-bold text-[#f0f0f0] font-['Syne'] capitalize min-w-[140px] text-center">
            {tituloRango}
          </div>
          <button onClick={irSiguiente}
            className="w-8 h-8 rounded-full bg-[#111111] border border-[#2a2a2a] text-[#888] cursor-pointer">›</button>
          <button onClick={() => setFechaActual(new Date())}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#111111] text-[#888] border border-[#2a2a2a] cursor-pointer">Hoy</button>
        </div>

        <div className="flex bg-[#111111] border border-[#2a2a2a] rounded-full overflow-hidden">
          <button onClick={() => setModoVista('dia')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${modoVista === 'dia' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>Día</button>
          <button onClick={() => setModoVista('semana')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${modoVista === 'semana' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>Semana</button>
          <button onClick={() => setModoVista('mes')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${modoVista === 'mes' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>Mes</button>
        </div>
      </div>

      {modoVista === 'mes' ? (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map(d => <div key={d} className="text-center text-[11px] font-bold text-[#666] py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map(dia => {
              const iso = toISODate(dia)
              return (
                <MesCelda
                  key={iso}
                  dia={dia}
                  esMesActual={dia.getMonth() === fechaActual.getMonth()}
                  esHoy={iso === hoyISO()}
                  tareasDia={tareasDelDia(iso)}
                  subtareasDia={subtareasDelDia(iso)}
                  informesDia={informesPorDia.get(iso) || []}
                  onClick={() => { setFechaActual(dia); setModoVista('dia') }}
                />
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {modoVista === 'semana' && (
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS_SEMANA.map(d => <div key={d} className="text-center text-[11px] font-bold text-[#666] py-1">{d}</div>)}
            </div>
          )}

          <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
            <div className={modoVista === 'dia' ? 'max-w-sm mx-auto' : 'grid grid-cols-7 gap-1'}>
              {dias.map(dia => {
                const iso = toISODate(dia)
                return (
                  <DiaCelda
                    key={iso}
                    iso={iso}
                    numero={dia.getDate()}
                    esHoy={iso === hoyISO()}
                    informesDia={informesPorDia.get(iso) || []}
                    activeId={activeId}
                    alto={modoVista === 'dia' ? 'h-[600px]' : undefined}
                    manana={zonaFor(iso, 'manana')}
                    tarde={zonaFor(iso, 'tarde')}
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
        </>
      )}

      {modalSubtarea && (
        <ModalSubtarea
          tareas={tareas}
          userId={userId}
          fechaInicial={modalSubtarea.iso}
          turnoInicial={modalSubtarea.turno}
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
