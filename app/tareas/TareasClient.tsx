'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import ModalTarea from './ModalTarea'
import VistaCalendario from './VistaCalendario'
import { PRIORIDAD_META, ESTADO_META, fmtRelativoFecha, isVencida, esMiaTarea, nombrePerfil, notificarTarea } from './helpers'
import type { Tarea, Profile, PrioridadTarea, EstadoTarea } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

const COLUMNAS = [
  { id: 'vencidas',    label: 'Vencidas',    border: '#e84210', bg: 'rgba(232,66,16,.07)',   text: '#e84210' },
  { id: 'pendiente',   label: 'Pendientes',  border: '#f0a849', bg: 'rgba(240,168,73,.07)',  text: '#f0a849' },
  { id: 'en_progreso', label: 'En progreso', border: '#f0a030', bg: 'rgba(240,160,48,.07)',  text: '#f0a030' },
  { id: 'completada',  label: 'Completadas', border: '#56d68a', bg: 'rgba(86,214,138,.07)',  text: '#56d68a' },
] as const

function fmtCreated(isoStr: string) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ── Métricas del header ───────────────────────────────────────────────
function Metricas({ tareas, userId }: { tareas: Tarea[]; userId: string }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7)

  const completadasSemana = tareas.filter(t => {
    if (t.estado !== 'completada') return false
    const upd = new Date(t.updated_at || t.created_at)
    return upd >= hace7
  }).length

  const vencidasTotal = tareas.filter(t => isVencida(t.fecha_limite, t.estado)).length
  const misVencidas = tareas.filter(t => isVencida(t.fecha_limite, t.estado) && esMiaTarea(t, userId)).length
  const enProgreso = tareas.filter(t => t.estado === 'en_progreso').length

  const stats = [
    { label: 'Completadas esta semana', value: completadasSemana, color: '#56d68a' },
    { label: 'En progreso',             value: enProgreso,        color: '#f0a030' },
    { label: 'Vencidas (equipo)',       value: vencidasTotal,     color: vencidasTotal ? '#e84210' : '#888' },
    { label: 'Mis vencidas',            value: misVencidas,       color: misVencidas ? '#e84210' : '#888' },
  ]

  return (
    <div className="flex gap-2.5 flex-wrap my-2">
      {stats.map(s => (
        <div key={s.label} className="bg-[#111111] border border-[#2a2a2a] rounded-xl px-3.5 py-2 min-w-[110px] flex-1">
          <div className="text-[22px] font-extrabold leading-none" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[11px] text-[#888] mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Vista tabla ───────────────────────────────────────────────────────
function VistaTabla({ tareas, userId, perfiles, puedeCrear, onEditar, onCambiarEstado, onEliminar }: {
  tareas: Tarea[]; userId: string; perfiles: PerfilLite[]; puedeCrear: boolean
  onEditar: (t: Tarea) => void; onCambiarEstado: (t: Tarea, e: EstadoTarea) => void; onEliminar: (t: Tarea) => void
}) {
  const [sortCol, setSortCol] = useState<keyof Tarea>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: keyof Tarea) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = [...tareas].sort((a, b) => {
    let va: any = a[sortCol] ?? ''; let vb: any = b[sortCol] ?? ''
    if (sortCol === 'prioridad') { const o = { alta: 0, media: 1, baja: 2 }; va = o[va as PrioridadTarea] ?? 1; vb = o[vb as PrioridadTarea] ?? 1 }
    if (sortCol === 'estado') { const o = { pendiente: 0, en_progreso: 1, completada: 2 }; va = o[va as EstadoTarea] ?? 0; vb = o[vb as EstadoTarea] ?? 0 }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const arr = sortDir === 'asc' ? ' ↑' : ' ↓'
  const th = 'px-3 py-2.5 text-left text-[11px] font-bold text-[#888] bg-[#1a1a1a] border-b border-[#2a2a2a] cursor-pointer select-none whitespace-nowrap'

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2a2a2a] bg-[#111111]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className={th} onClick={() => toggleSort('titulo')}>Tarea{sortCol === 'titulo' ? arr : ''}</th>
            <th className={th} onClick={() => toggleSort('prioridad')}>Prioridad{sortCol === 'prioridad' ? arr : ''}</th>
            <th className={th} onClick={() => toggleSort('estado')}>Estado{sortCol === 'estado' ? arr : ''}</th>
            <th className={th} onClick={() => toggleSort('fecha_limite')}>Fecha{sortCol === 'fecha_limite' ? arr : ''}</th>
            <th className={th + ' cursor-default'}>Asignado a</th>
            <th className={th + ' cursor-default'}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const vencida = isVencida(t.fecha_limite, t.estado)
            const esMia = esMiaTarea(t, userId)
            const prioM = PRIORIDAD_META[t.prioridad]
            const estadoM = ESTADO_META[t.estado]
            return (
              <tr key={t.id} onClick={() => onEditar(t)}
                className={`cursor-pointer border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${esMia ? 'bg-[rgba(232,197,71,.05)]' : i % 2 === 1 ? 'bg-[#0d0d0d]' : ''}`}
              >
                <td className={`px-3 py-2.5 max-w-[280px] text-[#f0f0f0] ${esMia ? 'font-semibold' : ''} ${t.estado === 'completada' ? 'line-through text-[#888]' : ''}`}>
                  {t.titulo}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: prioM.bg, color: prioM.color }}>{prioM.label.toUpperCase()}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: estadoM.bg, color: estadoM.color }}>{estadoM.label}</span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: vencida ? '#e84210' : '#888', fontWeight: vencida ? 700 : 400 }}>
                  {t.fecha_limite ? fmtRelativoFecha(t.fecha_limite) : '—'}
                  {vencida && <span className="ml-1 text-[10px] bg-[rgba(232,66,16,.12)] text-[#e84210] px-1.5 py-0.5 rounded-lg">VENCIDA</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-[#888]">
                  {Array.isArray(t.asignado_a) && t.asignado_a.length ? t.asignado_a.map(id => nombrePerfil(id, perfiles)).join(', ') : '—'}
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  {puedeCrear && esMiaTarea(t, userId) && (
                    <div className="flex gap-1">
                      {t.estado !== 'completada' && (
                        <button onClick={() => onCambiarEstado(t, 'completada')}
                          className="bg-[rgba(86,214,138,.12)] text-[#56d68a] border-none rounded-md px-2 py-0.5 text-[11px] font-bold cursor-pointer">✓</button>
                      )}
                      {t.creado_por === userId && (
                        <button onClick={() => onEliminar(t)}
                          className="bg-[rgba(232,66,16,.08)] text-[#e84210] border-none rounded-md px-2 py-0.5 text-[11px] cursor-pointer">🗑</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={6} className="px-6 py-6 text-center text-[#444] text-sm">Sin tareas</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Card draggable ────────────────────────────────────────────────────
function TareaCard({ tarea, userId, perfiles, puedeCrear, onEditar, onCambiarEstado, onEliminar, isDragging = false }: {
  tarea: Tarea; userId: string; perfiles: PerfilLite[]; puedeCrear: boolean
  onEditar: (t: Tarea) => void; onCambiarEstado: (t: Tarea, e: EstadoTarea) => void; onEliminar: (t: Tarea) => void
  isDragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dragging } = useDraggable({ id: tarea.id, data: { tarea } })
  const [menuOpen, setMenuOpen] = useState(false)

  const esMia = esMiaTarea(tarea, userId)
  const esPropia = tarea.creado_por === userId
  const vencida = isVencida(tarea.fecha_limite, tarea.estado)
  const prioMeta = PRIORIDAD_META[tarea.prioridad]
  const asignados = Array.isArray(tarea.asignado_a) && tarea.asignado_a.length > 0
    ? tarea.asignado_a.map(id => nombrePerfil(id, perfiles)).join(', ')
    : null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`relative rounded-xl border border-[#2a2a2a] bg-[#111111] px-3.5 py-3 mb-2 select-none touch-none ${esMia ? 'ring-1 ring-[rgba(232,197,71,.4)] bg-[rgba(232,197,71,.04)]' : ''}`}
      style={{
        borderLeft: `4px solid ${prioMeta.color}`,
        cursor: dragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.35 : 1,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
      onClick={() => !menuOpen && !dragging && onEditar(tarea)}
    >
      <div className="flex justify-between items-start gap-1.5">
        <div className={`text-sm leading-snug flex-1 text-[#f0f0f0] ${esMia ? 'font-bold' : 'font-medium'} ${tarea.estado === 'completada' ? 'line-through text-[#888]' : ''}`}>
          {tarea.titulo}
        </div>

        {puedeCrear && (esPropia || esMia) && (
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(o => !o)} className="bg-transparent border-none text-lg cursor-pointer text-[#666] px-0.5 leading-none">⋯</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg z-20 min-w-[160px] overflow-hidden">
                  {tarea.estado !== 'pendiente' && <button onClick={() => { onCambiarEstado(tarea, 'pendiente'); setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">↩ Pendiente</button>}
                  {tarea.estado !== 'en_progreso' && <button onClick={() => { onCambiarEstado(tarea, 'en_progreso'); setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">▶ En progreso</button>}
                  {tarea.estado !== 'completada' && <button onClick={() => { onCambiarEstado(tarea, 'completada'); setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">✓ Completar</button>}
                  <div className="h-px bg-[#2a2a2a]" />
                  <button onClick={() => { onEditar(tarea); setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#f0f0f0] hover:bg-[#2a2a2a]">✏️ Editar</button>
                  {esPropia && <button onClick={() => { onEliminar(tarea); setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 bg-transparent border-none text-sm cursor-pointer text-[#e84210] hover:bg-[#2a2a2a]">🗑 Eliminar</button>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-1.5">
        <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full" style={{ color: prioMeta.color, background: prioMeta.bg }}>
          {prioMeta.label.toUpperCase()}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {asignados && (
          <div className="text-xs text-[#888] flex items-center gap-1">
            <span className="text-[11px]">👤</span> {asignados}
          </div>
        )}
        {tarea.fecha_limite && (
          <div className="text-xs flex items-center gap-1" style={{ color: vencida ? '#e84210' : '#888', fontWeight: vencida ? 700 : 400 }}>
            <span className="text-[11px]">📅</span> {fmtRelativoFecha(tarea.fecha_limite)}
            {vencida && <span className="text-[10px] bg-[rgba(232,66,16,.12)] text-[#e84210] px-1.5 py-0.5 rounded-lg font-bold">VENCIDA</span>}
          </div>
        )}
        <div className="text-[11px] text-[#555] mt-0.5">{fmtCreated(tarea.created_at)}</div>
      </div>
    </div>
  )
}

// ── Columna droppable ─────────────────────────────────────────────────
function Columna({ colId, titulo, color, tareas, activeId, ...accionesProps }: {
  colId: string; titulo: string; color: { bg: string; border: string; text: string }; tareas: Tarea[]; activeId: string | null
  userId: string; perfiles: PerfilLite[]; puedeCrear: boolean
  onEditar: (t: Tarea) => void; onCambiarEstado: (t: Tarea, e: EstadoTarea) => void; onEliminar: (t: Tarea) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl font-['Syne'] font-bold text-sm" style={{ background: color.bg, borderBottom: `3px solid ${color.border}` }}>
        <span style={{ color: color.text }}>{titulo}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white ml-auto" style={{ background: color.border }}>{tareas.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className="min-h-[80px] rounded-b-xl p-1.5 transition-colors"
        style={{ background: isOver ? 'rgba(232,197,71,.05)' : 'transparent' }}
      >
        {tareas.length === 0
          ? <div className="text-center py-6 px-2 text-[#444] text-xs">Sin tareas</div>
          : tareas.map(t => (
            <TareaCard key={t.id} tarea={t} isDragging={activeId === t.id} {...accionesProps} />
          ))
        }
      </div>
    </div>
  )
}

interface TareasClientProps {
  userId: string
  userNombre: string
  tareas: Tarea[]
  perfiles: PerfilLite[]
}

export default function TareasClient({ userId, userNombre, tareas: initial, perfiles }: TareasClientProps) {
  const supabase = createClient()
  const [tareas, setTareas] = useState<Tarea[]>(initial)
  const [filtroPrioridad, setFiltroPrioridad] = useState<'todas' | PrioridadTarea>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<'board' | 'lista' | 'calendario'>('board')
  const [modal, setModal] = useState<Tarea | 'nueva' | null>(null)
  const [fechaNuevaTarea, setFechaNuevaTarea] = useState<string | undefined>(undefined)
  const [confirmEliminar, setConfirmEliminar] = useState<Tarea | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const [grabando, setGrabando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [procesandoAudio, setProcesandoAudio] = useState(false)
  const [errorAudio, setErrorAudio] = useState('')
  const [toastAudio, setToastAudio] = useState('')
  const [pushActivo, setPushActivo] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startXRef = useRef(0)
  const cancelarRef = useRef(false)

  const puedeCrear = true
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    navigator.serviceWorker?.getRegistration('/sw.js').then(reg => {
      reg?.pushManager.getSubscription().then(sub => setPushActivo(!!sub))
    }).catch(() => {})
  }, [])

  // ── Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('tareas-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tareas' }, payload => {
        const t = payload.new as Tarea
        const relevante = t.creado_por === userId || (Array.isArray(t.asignado_a) && t.asignado_a.includes(userId))
        if (!relevante) return
        setTareas(prev => prev.find(x => x.id === t.id) ? prev : [t, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tareas' }, payload => {
        const t = payload.new as Tarea
        setTareas(prev => prev.map(x => x.id === t.id ? { ...x, ...t } : x))
        setModal(prev => (prev && prev !== 'nueva' && prev.id === t.id) ? { ...prev, ...t } : prev)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tareas' }, payload => {
        setTareas(prev => prev.filter(x => x.id !== payload.old.id))
        setModal(prev => (prev && prev !== 'nueva' && prev.id === payload.old.id) ? null : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // En mobile, el navegador suele cortar el websocket cuando la pestaña
  // pasa a segundo plano (pantalla apagada, cambio de app), y al volver
  // no recupera los eventos perdidos mientras estuvo desconectado. Como
  // respaldo, al volver a primer plano se vuelve a traer la lista
  // completa del servidor en vez de confiar solo en el realtime.
  useEffect(() => {
    async function refetch() {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase
        .from('tareas')
        .select('*')
        .or(`creado_por.eq.${userId},asignado_a.cs.{${userId}}`)
        .order('created_at', { ascending: false })
      if (data) setTareas(data)
    }
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('focus', refetch)
    return () => {
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('focus', refetch)
    }
  }, [userId])

  // ── Filtros ────────────────────────────────────────────────────────
  function ordenar(lista: Tarea[]) {
    return [...lista].sort((a, b) => {
      const aMia = esMiaTarea(a, userId) ? 0 : 1
      const bMia = esMiaTarea(b, userId) ? 0 : 1
      if (aMia !== bMia) return aMia - bMia
      const prio = { alta: 0, media: 1, baja: 2 }
      return (prio[a.prioridad] ?? 1) - (prio[b.prioridad] ?? 1)
    })
  }

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return tareas.filter(t =>
      (filtroPrioridad === 'todas' || t.prioridad === filtroPrioridad) &&
      (!q || t.titulo.toLowerCase().includes(q) || (t.descripcion || '').toLowerCase().includes(q))
    )
  }, [tareas, filtroPrioridad, busqueda])

  const vencidas    = useMemo(() => ordenar(filtradas.filter(t => isVencida(t.fecha_limite, t.estado))), [filtradas])
  const pendientes  = useMemo(() => ordenar(filtradas.filter(t => t.estado === 'pendiente' && !isVencida(t.fecha_limite, t.estado))), [filtradas])
  const enProgreso  = useMemo(() => ordenar(filtradas.filter(t => t.estado === 'en_progreso' && !isVencida(t.fecha_limite, t.estado))), [filtradas])
  const completadas = useMemo(() => ordenar(filtradas.filter(t => t.estado === 'completada')), [filtradas])

  const totalActivas = vencidas.length + pendientes.length + enProgreso.length

  // ── Acciones ────────────────────────────────────────────────────────
  async function cambiarEstado(tarea: Tarea, nuevoEstado: EstadoTarea) {
    setTareas(prev => prev.map(t => t.id === tarea.id ? { ...t, estado: nuevoEstado } : t))
    const { error } = await supabase.from('tareas').update({ estado: nuevoEstado }).eq('id', tarea.id)
    if (error) {
      setTareas(prev => prev.map(t => t.id === tarea.id ? { ...t, estado: tarea.estado } : t))
      alert('No se pudo cambiar el estado: ' + error.message)
      return
    }
    await supabase.from('tarea_historial').insert([{
      tarea_id: tarea.id, campo: 'estado',
      valor_anterior: ESTADO_META[tarea.estado]?.label || tarea.estado,
      valor_nuevo: ESTADO_META[nuevoEstado]?.label || nuevoEstado,
      autor_id: userId,
    }])
    const destinatarios = [...new Set([tarea.creado_por, ...(tarea.asignado_a || [])])].filter(id => id !== userId)
    if (destinatarios.length) {
      notificarTarea({ userIds: destinatarios, title: '📋 Estado actualizado', body: `${userNombre} marcó "${tarea.titulo}" como ${ESTADO_META[nuevoEstado]?.label}`, url: '/tareas' })
    }
  }

  async function eliminar(tarea: Tarea) {
    const { error } = await supabase.from('tareas').delete().eq('id', tarea.id)
    if (!error) { setTareas(prev => prev.filter(t => t.id !== tarea.id)); setConfirmEliminar(null) }
  }

  function onGuardado(tarea: Tarea, tipo: 'nueva' | 'editada') {
    if (tipo === 'nueva') setTareas(prev => prev.find(t => t.id === tarea.id) ? prev : [tarea, ...prev])
    else setTareas(prev => prev.map(t => t.id === tarea.id ? tarea : t))
    setModal(null)
  }

  // ── Drag & drop ─────────────────────────────────────────────────────
  function columnaDestino(dropId: string): EstadoTarea | null {
    if (dropId === 'vencidas') return null
    return dropId as EstadoTarea
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const tarea = tareas.find(t => t.id === active.id)
    if (!tarea) return
    const nuevoEstado = columnaDestino(String(over.id))
    if (!nuevoEstado || nuevoEstado === tarea.estado) return
    if (!esMiaTarea(tarea, userId) && !puedeCrear) return
    await cambiarEstado(tarea, nuevoEstado)
  }

  const activeTarea = activeId ? tareas.find(t => t.id === activeId) : null

  // ── Grabación de audio ──────────────────────────────────────────────
  async function iniciarGrabacion() {
    setErrorAudio('')
    cancelarRef.current = false
    setCancelando(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (cancelarRef.current) { setProcesandoAudio(false); return }
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await procesarAudio(blob)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setGrabando(true)
    } catch {
      setErrorAudio('No se pudo acceder al micrófono')
    }
  }

  function detenerGrabacion(cancelar = false) {
    cancelarRef.current = cancelar
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setGrabando(false)
    setCancelando(false)
    if (!cancelar) setProcesandoAudio(true)
  }

  function onMicPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    if (grabando) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startXRef.current = e.clientX
    iniciarGrabacion()
  }

  function onMicPointerMove(e: React.PointerEvent) {
    if (!grabando) return
    const dx = e.clientX - startXRef.current
    setCancelando(dx < -60)
  }

  function onMicPointerUp(e: React.PointerEvent) {
    if (!grabando) return
    const dx = e.clientX - startXRef.current
    detenerGrabacion(dx < -60)
  }

  async function procesarAudio(blob: Blob) {
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'audio.webm')
      fd.append('perfiles', JSON.stringify(perfiles))
      const res = await fetch('/api/tareas/audio', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al procesar audio')
      await crearTareaDesdeAudio(data.campos)
    } catch (e: any) {
      setErrorAudio(e.message)
    } finally {
      setProcesandoAudio(false)
    }
  }

  async function crearTareaDesdeAudio(campos: { titulo?: string; descripcion?: string | null; prioridad?: PrioridadTarea; fecha_limite?: string | null; asignado_a?: string[] }) {
    const asignados = campos.asignado_a?.length ? campos.asignado_a : [userId]
    const nueva = {
      titulo: campos.titulo || 'Nueva tarea',
      descripcion: campos.descripcion || null,
      prioridad: campos.prioridad || 'media',
      estado: 'pendiente' as EstadoTarea,
      fecha_limite: campos.fecha_limite || null,
      asignado_a: asignados,
      creado_por: userId,
    }
    const { data, error } = await supabase.from('tareas').insert(nueva).select().single()
    if (error) throw new Error('No se pudo crear la tarea')
    setTareas(prev => [data, ...prev])
    setToastAudio(`✅ Tarea creada: "${nueva.titulo}"`)
    setTimeout(() => setToastAudio(''), 4000)

    const destinatarios = asignados.filter(id => id !== userId)
    if (destinatarios.length) {
      notificarTarea({ userIds: destinatarios, title: '📋 Nueva tarea asignada', body: nueva.titulo, url: '/tareas' })
    }
  }

  // ── Notificaciones push ──────────────────────────────────────────────
  async function activarNotificaciones() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setErrorAudio('Este navegador no soporta notificaciones push'); return
      }
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') return
      const reg = await navigator.serviceWorker.register('/sw.js')
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setErrorAudio('Notificaciones push no configuradas'); return }

      // Forzar una suscripción nueva: si ya había una en el navegador
      // (por ej. de otra cuenta que usó este mismo dispositivo antes),
      // el browser la devuelve tal cual aunque esté muerta del lado del
      // servicio de push, y eso queda guardado como "activado" sin
      // funcionar nunca.
      const existente = await reg.pushManager.getSubscription()
      if (existente) await existente.unsubscribe()

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorAudio(data.error || 'No se pudo guardar la suscripción')
        return
      }
      setPushActivo(true)
      setToastAudio('🔔 Notificaciones activadas')
      setTimeout(() => setToastAudio(''), 3000)
    } catch {
      setErrorAudio('No se pudieron activar las notificaciones')
    }
  }

  const accionesProps = {
    userId, perfiles, puedeCrear,
    onEditar: (t: Tarea) => setModal(t),
    onCambiarEstado: cambiarEstado,
    onEliminar: (t: Tarea) => setConfirmEliminar(t),
  }

  const chipClass = (activo: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-none transition-colors ${
      activo ? 'bg-[#e8c547] text-black' : 'bg-[#111111] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'
    }`

  return (
    <div className="px-4 lg:px-6 pb-28">
      {/* Header */}
      <div className="pt-2">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h1 className="font-['Syne'] text-2xl font-extrabold text-[#f0f0f0] m-0">Tareas</h1>
          {totalActivas > 0 && (
            <p className="text-sm text-[#e8c547] font-semibold m-0">
              {totalActivas} {totalActivas === 1 ? 'tarea activa' : 'tareas activas'}
            </p>
          )}
        </div>

        <Metricas tareas={tareas} userId={userId} />

        <div className="flex gap-2 mt-2.5 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555] text-sm">🔍</span>
            <input
              placeholder="Buscar tareas…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="!pl-8"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-[#555] cursor-pointer text-sm">✕</button>
            )}
          </div>

          <div className="flex gap-1.5">
            {(['todas', 'alta', 'media', 'baja'] as const).map(p => (
              <button key={p} className={chipClass(filtroPrioridad === p)} onClick={() => setFiltroPrioridad(p)}>
                {p === 'todas' ? 'Todas' : PRIORIDAD_META[p]?.label}
              </button>
            ))}
          </div>

          <div className="flex bg-[#111111] border border-[#2a2a2a] rounded-full overflow-hidden">
            <button onClick={() => setVista('board')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${vista === 'board' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>⊞ Board</button>
            <button onClick={() => setVista('lista')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${vista === 'lista' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>☰ Lista</button>
            <button onClick={() => setVista('calendario')} className={`px-3 py-1.5 text-xs font-semibold border-none cursor-pointer ${vista === 'calendario' ? 'bg-[#e8c547] text-black' : 'bg-transparent text-[#888]'}`}>📅 Calendario</button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-3 h-3 rounded-[3px]" style={{ background: 'rgba(232,197,71,.18)', border: '1px solid rgba(232,197,71,.4)' }} />
          <span className="text-[11px] text-[#666]">Mis tareas</span>
        </div>
      </div>

      {/* Vista lista */}
      {vista === 'lista' && (
        <div className="pb-6 pt-3">
          <VistaTabla tareas={filtradas} {...accionesProps} />
        </div>
      )}

      {/* Vista calendario */}
      {vista === 'calendario' && (
        <VistaCalendario
          tareas={tareas}
          perfiles={perfiles}
          userId={userId}
          userNombre={userNombre}
          onEditarTarea={t => setModal(t)}
          onNuevaTarea={fecha => { setFechaNuevaTarea(fecha); setModal('nueva') }}
        />
      )}

      {/* Vista board */}
      {vista === 'board' && (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveId(String(active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 pb-6">
            <Columna colId="vencidas"    titulo="Vencidas"    color={COLUMNAS[0]} tareas={vencidas}    activeId={activeId} {...accionesProps} />
            <Columna colId="pendiente"   titulo="Pendientes"  color={COLUMNAS[1]} tareas={pendientes}  activeId={activeId} {...accionesProps} />
            <Columna colId="en_progreso" titulo="En progreso" color={COLUMNAS[2]} tareas={enProgreso}  activeId={activeId} {...accionesProps} />
            <Columna colId="completada"  titulo="Completadas" color={COLUMNAS[3]} tareas={completadas} activeId={activeId} {...accionesProps} />
          </div>

          <DragOverlay>
            {activeTarea && (
              <div className="opacity-90 rotate-2 pointer-events-none rounded-xl border border-[#2a2a2a] bg-[#111111] px-3.5 py-3" style={{ borderLeft: `4px solid ${PRIORIDAD_META[activeTarea.prioridad].color}` }}>
                <div className="text-sm font-bold text-[#f0f0f0]">{activeTarea.titulo}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* FABs */}
      {!procesandoAudio && (
        <div className="fixed bottom-6 right-5 flex flex-col gap-3 items-center z-[100]">
          {!grabando && (
            <button
              onClick={activarNotificaciones}
              title={pushActivo ? 'Notificaciones activadas' : 'Activar notificaciones'}
              className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-base cursor-pointer"
              style={{ background: '#111111', borderColor: pushActivo ? '#56d68a' : '#2a2a2a', color: pushActivo ? '#56d68a' : '#888' }}
            >🔔</button>
          )}

          <button
            onPointerDown={onMicPointerDown}
            onPointerMove={onMicPointerMove}
            onPointerUp={onMicPointerUp}
            onPointerCancel={() => detenerGrabacion(true)}
            title="Mantené presionado para grabar"
            className="w-[46px] h-[46px] rounded-full touch-none select-none flex items-center justify-center text-xl cursor-pointer border-2 transition-shadow"
            style={{
              background: grabando ? '#e84210' : '#111111',
              color: grabando ? '#fff' : '#e8c547',
              borderColor: grabando ? '#e84210' : '#e8c547',
              boxShadow: grabando ? '0 0 0 10px rgba(232,66,16,.18)' : '0 2px 10px rgba(0,0,0,.4)',
            }}
          >🎙</button>

          {!grabando && (
            <button
              onClick={() => { setFechaNuevaTarea(undefined); setModal('nueva') }}
              className="w-14 h-14 rounded-full bg-[#e8c547] text-black border-none text-3xl cursor-pointer flex items-center justify-center shadow-[0_4px_16px_rgba(232,197,71,.45)]"
            >+</button>
          )}
        </div>
      )}

      {/* Overlay grabando */}
      {grabando && (
        <div className="fixed inset-0 z-[200] bg-[rgba(10,10,10,.92)] flex flex-col items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-3.5">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl animate-pulse" style={{ background: '#e84210', boxShadow: '0 0 0 18px rgba(232,66,16,.18)' }}>🎙</div>
            <div className="text-xl font-bold text-[#f0f0f0]">Grabando…</div>
            <div className="text-sm text-[#888]">Hablá la tarea</div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => detenerGrabacion(true)} className="px-8 py-4 rounded-2xl border-2 border-[#2a2a2a] bg-transparent text-[#f0f0f0] text-base font-semibold cursor-pointer">✕ Cancelar</button>
            <button onClick={() => detenerGrabacion(false)} className="px-9 py-4 rounded-2xl border-none bg-[#e8c547] text-black text-base font-bold cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,.3)]">✓ Enviar</button>
          </div>
        </div>
      )}

      {/* Overlay procesando */}
      {procesandoAudio && (
        <div className="fixed inset-0 z-[300] bg-[rgba(10,10,10,.85)] flex flex-col items-center justify-center gap-4">
          <div className="text-4xl">⏳</div>
          <div className="text-[17px] font-bold text-[#f0f0f0]">Procesando con IA…</div>
          <div className="text-[13px] text-[#888]">Whisper + Llama 3</div>
        </div>
      )}

      {/* Error audio */}
      {errorAudio && (
        <div className="fixed bottom-24 right-5 z-[200] bg-[#111111] border border-[#e84210]/40 rounded-xl px-3.5 py-2.5 text-[13px] text-[#e84210] shadow-lg max-w-[260px] flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{errorAudio}</span>
          <button onClick={() => setErrorAudio('')} className="bg-transparent border-none text-[#e84210] cursor-pointer text-sm p-0">✕</button>
        </div>
      )}

      {/* Toast */}
      {toastAudio && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[400] bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg whitespace-nowrap max-w-[90vw] overflow-hidden text-ellipsis">
          {toastAudio}
        </div>
      )}

      {modal && (
        <ModalTarea
          tarea={modal === 'nueva' ? null : modal}
          perfiles={perfiles}
          userId={userId}
          userNombre={userNombre}
          fechaInicial={fechaNuevaTarea}
          onCerrar={() => { setModal(null); setFechaNuevaTarea(undefined) }}
          onGuardado={onGuardado}
        />
      )}

      {confirmEliminar && (
        <div className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-5"
          onClick={e => e.target === e.currentTarget && setConfirmEliminar(null)}>
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e84210] rounded-2xl p-6 max-w-[340px] w-full">
            <h3 className="m-0 mb-2 text-base font-['Syne'] font-bold text-[#f0f0f0]">Eliminar tarea</h3>
            <p className="m-0 mb-5 text-[13px] text-[#888]">
              ¿Eliminás "<strong className="text-[#f0f0f0]">{confirmEliminar.titulo}</strong>"? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmEliminar(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] bg-transparent text-[#888] hover:text-[#f0f0f0] text-sm cursor-pointer">Cancelar</button>
              <button onClick={() => eliminar(confirmEliminar)}
                className="flex-1 py-2.5 rounded-xl border-none bg-[#e84210] text-white text-sm font-bold cursor-pointer">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
