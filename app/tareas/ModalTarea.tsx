'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PRIORIDAD_META, nombrePerfil, notificarTarea } from './helpers'
import type { Tarea, TareaComentario, TareaSubtarea, TareaHistorial, TareaAdjunto, PrioridadTarea, Turno } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

const CAMPO_LABELS: Record<string, string> = {
  estado: 'Estado', prioridad: 'Prioridad', fecha_limite: 'Fecha límite', asignado_a: 'Asignado a', titulo: 'Título',
}

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada',
}

function fmtRelativo(isoStr: string) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs} h`
  const dias = Math.floor(hs / 24)
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return new Date(isoStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// ── Buscador de usuarios ──────────────────────────────────────────────
export function BuscadorUsuario({ perfiles, value = [], onChange }: { perfiles: PerfilLite[]; value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('')
  const filtrados = perfiles.filter(p => {
    const q = query.toLowerCase()
    return !q || `${p.nombre} ${p.local_nombre || ''}`.toLowerCase().includes(q)
  })

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter(x => x !== id))
    else onChange([...value, id])
  }

  return (
    <div className="border border-[#2a2a2a] rounded-xl overflow-hidden bg-[#1a1a1a]">
      {value.length > 0 && (
        <div className="px-2.5 py-2 border-b border-[#2a2a2a] flex flex-wrap gap-1.5">
          {value.map(id => (
            <span key={id} className="inline-flex items-center gap-1 bg-[rgba(232,197,71,.12)] text-[#e8c547] text-xs font-semibold pl-2.5 pr-1.5 py-0.5 rounded-full">
              {nombrePerfil(id, perfiles)}
              <button onClick={() => onChange(value.filter(x => x !== id))} className="bg-transparent border-none cursor-pointer text-[#e8c547] text-[13px] p-0 leading-none">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="px-2.5 py-1.5 border-b border-[#2a2a2a]">
        <input placeholder="Buscar…" value={query} onChange={e => setQuery(e.target.value)} className="!py-1.5" />
      </div>
      <div className="max-h-[150px] overflow-y-auto">
        {filtrados.map(p => {
          const selec = value.includes(p.id)
          return (
            <div key={p.id} onClick={() => toggle(p.id)}
              className={`px-3.5 py-2 text-[13px] cursor-pointer flex items-center gap-2.5 border-b border-[#2a2a2a]/40 ${selec ? 'bg-[rgba(232,197,71,.07)]' : ''}`}>
              <div className={`w-4 h-4 rounded shrink-0 flex items-center justify-center ${selec ? 'bg-[#e8c547]' : 'border-[1.5px] border-[#555]'}`}>
                {selec && <span className="text-black text-[11px]">✓</span>}
              </div>
              <span className={selec ? 'text-[#e8c547] font-semibold' : 'text-[#f0f0f0]'}>{p.nombre}{p.local_nombre ? ` (${p.local_nombre})` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Hilo de comentarios ───────────────────────────────────────────────
function HiloComentarios({ tarea, userId, userNombre, perfiles, onNuevoComentario }: {
  tarea: Tarea; userId: string; userNombre: string; perfiles: PerfilLite[]
  onNuevoComentario: (p: { tarea: Tarea; texto: string; autorNombre: string }) => void
}) {
  const supabase = createClient()
  const [comentarios, setComentarios] = useState<(TareaComentario & { _opt?: boolean })[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const hiloRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tarea?.id) return
    supabase.from('tarea_comentarios').select('*').eq('tarea_id', tarea.id).order('created_at').then(({ data }) => {
      setComentarios(data || [])
      scrollAbajo()
    })
    const channel = supabase.channel(`comentarios:${tarea.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tarea_comentarios', filter: `tarea_id=eq.${tarea.id}` }, payload => {
        setComentarios(prev => prev.find(c => c.id === (payload.new as TareaComentario).id) ? prev : [...prev, payload.new as TareaComentario])
        scrollAbajo()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tarea?.id])

  function scrollAbajo() {
    setTimeout(() => { if (hiloRef.current) hiloRef.current.scrollTop = hiloRef.current.scrollHeight }, 50)
  }

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const temp = { id: crypto.randomUUID(), tarea_id: tarea.id, autor_id: userId, texto: t, created_at: new Date().toISOString(), _opt: true }
    setComentarios(prev => [...prev, temp])
    setTexto('')
    scrollAbajo()
    const { data, error } = await supabase.from('tarea_comentarios').insert([{ tarea_id: tarea.id, autor_id: userId, texto: t }]).select().single()
    if (error) { setComentarios(prev => prev.filter(c => c.id !== temp.id)); setTexto(t) }
    else {
      setComentarios(prev => prev.map(c => c.id === temp.id ? data : c))
      onNuevoComentario?.({ tarea, texto: t, autorNombre: userNombre })
    }
    setEnviando(false)
  }

  const participantes = [tarea.creado_por, ...(Array.isArray(tarea.asignado_a) ? tarea.asignado_a : [])].filter(Boolean)

  return (
    <div>
      <div className="text-[11px] font-semibold text-[#888] mb-2">COMENTARIOS</div>
      <div ref={hiloRef} className="max-h-[200px] overflow-y-auto flex flex-col gap-2.5 pr-0.5">
        {comentarios.length === 0 && <div className="text-xs text-[#444] text-center py-3">Sin comentarios aún</div>}
        {comentarios.map(c => {
          const esMio = c.autor_id === userId
          return (
            <div key={c.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[82%] px-2.5 py-1.5 ${esMio ? 'bg-[rgba(232,197,71,.12)] rounded-[12px_12px_3px_12px]' : 'bg-[#1a1a1a] rounded-[12px_12px_12px_3px]'}`} style={{ opacity: c._opt ? 0.6 : 1 }}>
                {!esMio && <div className="text-[10px] font-bold text-[#e8c547] mb-0.5">{nombrePerfil(c.autor_id, perfiles)}</div>}
                <div className="text-[13px] text-[#f0f0f0] whitespace-pre-wrap leading-snug">{c.texto}</div>
              </div>
              <div className="text-[10px] text-[#555] mt-0.5 px-1">{fmtRelativo(c.created_at)}</div>
            </div>
          )
        })}
      </div>
      {participantes.includes(userId) && (
        <div className="flex gap-2 mt-2.5 border-t border-[#2a2a2a] pt-2.5">
          <textarea rows={1} placeholder="Escribí un comentario… (Enter para enviar)" value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            className="!resize-none flex-1" />
          <button onClick={enviar} disabled={!texto.trim() || enviando}
            className={`border-none rounded-lg px-3.5 text-base shrink-0 ${texto.trim() ? 'bg-[#e8c547] text-black cursor-pointer' : 'bg-[#2a2a2a] text-[#555]'}`}>↑</button>
        </div>
      )}
    </div>
  )
}

// ── Subtareas / checklist ─────────────────────────────────────────────
function Subtareas({ tarea, userId }: { tarea: Tarea; userId: string }) {
  const supabase = createClient()
  const [subtareas, setSubtareas] = useState<TareaSubtarea[]>([])
  const [nueva, setNueva] = useState('')
  const [agregando, setAgregando] = useState(false)

  useEffect(() => {
    if (!tarea?.id) return
    supabase.from('tarea_subtareas').select('*').eq('tarea_id', tarea.id).order('orden').then(({ data }) => setSubtareas(data || []))
  }, [tarea?.id])

  const completadas = subtareas.filter(s => s.completada).length
  const pct = subtareas.length ? Math.round((completadas / subtareas.length) * 100) : 0

  async function toggleSubtarea(sub: TareaSubtarea) {
    const nuevoVal = !sub.completada
    setSubtareas(prev => prev.map(s => s.id === sub.id ? { ...s, completada: nuevoVal } : s))
    await supabase.from('tarea_subtareas').update({ completada: nuevoVal }).eq('id', sub.id)
  }

  async function agregar() {
    const t = nueva.trim()
    if (!t || agregando) return
    setAgregando(true)
    const orden = subtareas.length
    const { data, error } = await supabase.from('tarea_subtareas')
      .insert([{ tarea_id: tarea.id, texto: t, completada: false, orden }])
      .select().single()
    if (!error) { setSubtareas(prev => [...prev, data]); setNueva('') }
    setAgregando(false)
  }

  async function eliminar(id: string) {
    setSubtareas(prev => prev.filter(s => s.id !== id))
    await supabase.from('tarea_subtareas').delete().eq('id', id)
  }

  const esParticipante = tarea.creado_por === userId || (Array.isArray(tarea.asignado_a) && tarea.asignado_a.includes(userId))

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-[11px] font-semibold text-[#888]">CHECKLIST</div>
        {subtareas.length > 0 && <div className="text-[11px] text-[#888]">{completadas}/{subtareas.length}</div>}
      </div>

      {subtareas.length > 0 && (
        <div className="h-1 bg-[#2a2a2a] rounded-full mb-2.5 overflow-hidden">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: pct === 100 ? '#56d68a' : '#e8c547' }} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        {subtareas.map(sub => (
          <div key={sub.id} className="flex items-center gap-2 py-1 px-0.5">
            <div onClick={() => esParticipante && toggleSubtarea(sub)}
              className={`w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center transition-all ${esParticipante ? 'cursor-pointer' : ''} ${sub.completada ? 'bg-[#56d68a]' : 'border-2 border-[#555]'}`}>
              {sub.completada && <span className="text-black text-[11px] font-bold">✓</span>}
            </div>
            <span className={`text-[13px] flex-1 ${sub.completada ? 'text-[#555] line-through' : 'text-[#f0f0f0]'}`}>{sub.texto}</span>
            {esParticipante && (
              <button onClick={() => eliminar(sub.id)} className="bg-transparent border-none text-[#444] cursor-pointer text-sm px-0.5 leading-none">✕</button>
            )}
          </div>
        ))}
      </div>

      {esParticipante && (
        <div className="flex gap-1.5 mt-2">
          <input placeholder="+ Agregar ítem…" value={nueva} onChange={e => setNueva(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregar()} className="!py-1.5" />
          {nueva.trim() && <button onClick={agregar} className="bg-[#e8c547] text-black border-none rounded-lg px-3 text-sm cursor-pointer">+</button>}
        </div>
      )}
    </div>
  )
}

// ── Historial de cambios ──────────────────────────────────────────────
function Historial({ tarea, perfiles }: { tarea: Tarea; perfiles: PerfilLite[] }) {
  const supabase = createClient()
  const [historial, setHistorial] = useState<TareaHistorial[]>([])

  useEffect(() => {
    if (!tarea?.id) return
    supabase.from('tarea_historial').select('*').eq('tarea_id', tarea.id).order('created_at', { ascending: false }).then(({ data }) => setHistorial(data || []))
  }, [tarea?.id])

  if (historial.length === 0) {
    return <div className="text-xs text-[#444] text-center py-4">Sin cambios registrados</div>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-[#888] mb-1">HISTORIAL</div>
      {historial.map(h => (
        <div key={h.id} className="flex gap-2.5 items-start">
          <div className="w-1.5 h-1.5 rounded-full bg-[#e8c547] mt-1.5 shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-[#888]">
              <strong className="text-[#f0f0f0]">{nombrePerfil(h.autor_id, perfiles)}</strong>
              {' cambió '}
              <strong>{CAMPO_LABELS[h.campo] || h.campo}</strong>
              {h.valor_anterior && <> de <em>"{h.valor_anterior}"</em></>}
              {h.valor_nuevo && <> a <em>"{h.valor_nuevo}"</em></>}
            </div>
            <div className="text-[11px] text-[#555] mt-0.5">{fmtRelativo(h.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Adjuntos ──────────────────────────────────────────────────────────
function Adjuntos({ tarea, userId }: { tarea: Tarea; userId: string }) {
  const supabase = createClient()
  const [adjuntos, setAdjuntos] = useState<TareaAdjunto[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tarea?.id) return
    supabase.from('tarea_adjuntos').select('*').eq('tarea_id', tarea.id).order('created_at').then(({ data }) => setAdjuntos(data || []))
  }, [tarea?.id])

  const esParticipante = tarea.creado_por === userId || (Array.isArray(tarea.asignado_a) && tarea.asignado_a.includes(userId))

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${tarea.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('tarea-adjuntos').upload(path, file)
      if (upErr) throw upErr
      const { data, error: dbErr } = await supabase.from('tarea_adjuntos')
        .insert([{ tarea_id: tarea.id, nombre: file.name, storage_path: path, size_bytes: file.size, autor_id: userId }])
        .select().single()
      if (dbErr) throw dbErr
      setAdjuntos(prev => [...prev, data])
    } catch (err: any) {
      alert('Error al subir: ' + err.message)
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function descargar(adj: TareaAdjunto) {
    const { data } = await supabase.storage.from('tarea-adjuntos').createSignedUrl(adj.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function eliminar(adj: TareaAdjunto) {
    await supabase.storage.from('tarea-adjuntos').remove([adj.storage_path])
    await supabase.from('tarea_adjuntos').delete().eq('id', adj.id)
    setAdjuntos(prev => prev.filter(a => a.id !== adj.id))
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  function iconoArchivo(nombre: string) {
    const ext = nombre.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼'
    if (ext === 'pdf') return '📄'
    if (['doc', 'docx'].includes(ext || '')) return '📝'
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return '📊'
    return '📎'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-[11px] font-semibold text-[#888]">ADJUNTOS</div>
        {esParticipante && (
          <>
            <button onClick={() => inputRef.current?.click()} disabled={subiendo}
              className={`border-none rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${subiendo ? 'bg-[#2a2a2a] text-[#555]' : 'bg-[rgba(232,197,71,.10)] text-[#e8c547]'}`}>
              {subiendo ? 'Subiendo…' : '+ Subir'}
            </button>
            <input ref={inputRef} type="file" className="hidden" onChange={subir}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          </>
        )}
      </div>

      {adjuntos.length === 0 && <div className="text-xs text-[#444] text-center py-3">Sin adjuntos</div>}

      <div className="flex flex-col gap-1.5">
        {adjuntos.map(adj => (
          <div key={adj.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
            <span className="text-lg">{iconoArchivo(adj.nombre)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#f0f0f0] overflow-hidden text-ellipsis whitespace-nowrap">{adj.nombre}</div>
              <div className="text-[11px] text-[#555]">{fmtSize(adj.size_bytes)} · {fmtRelativo(adj.created_at)}</div>
            </div>
            <button onClick={() => descargar(adj)} className="bg-transparent border-none text-[#e8c547] cursor-pointer text-sm px-1">↓</button>
            {adj.autor_id === userId && (
              <button onClick={() => eliminar(adj)} className="bg-transparent border-none text-[#444] cursor-pointer text-sm px-0.5">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal principal ───────────────────────────────────────────────────
interface ModalTareaProps {
  tarea: Tarea | null
  perfiles: PerfilLite[]
  userId: string
  userNombre: string
  fechaInicial?: string
  turnoInicial?: Turno
  onCerrar: () => void
  onGuardado: (t: Tarea, tipo: 'nueva' | 'editada') => void
}

export default function ModalTarea({ tarea, perfiles, userId, userNombre, fechaInicial, turnoInicial, onCerrar, onGuardado }: ModalTareaProps) {
  const supabase = createClient()
  const esNueva = !tarea?.id
  const esCreador = esNueva || tarea?.creado_por === userId
  const [tab, setTab] = useState<'info' | 'checklist' | 'adjuntos' | 'historial' | 'comentarios'>('info')
  const [form, setForm] = useState({
    titulo: tarea?.titulo || '',
    descripcion: tarea?.descripcion || '',
    prioridad: tarea?.prioridad || 'media' as PrioridadTarea,
    estado: tarea?.estado || 'pendiente',
    fecha_limite: tarea?.fecha_limite || fechaInicial || '',
    turno: tarea?.turno || turnoInicial || 'manana' as Turno,
    asignado_a: tarea?.asignado_a?.length ? tarea.asignado_a : [userId],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function registrarCambios(original: Tarea, nuevo: Tarea) {
    const campos: (keyof Tarea)[] = ['estado', 'prioridad', 'fecha_limite', 'turno', 'titulo']
    const entradas = campos
      .filter(c => original[c] !== nuevo[c])
      .map(c => ({
        tarea_id: original.id, campo: c,
        valor_anterior: (original[c] as string) || null,
        valor_nuevo: (nuevo[c] as string) || null,
        autor_id: userId,
      }))

    if (original.asignado_a?.join(',') !== nuevo.asignado_a?.join(',')) {
      entradas.push({
        tarea_id: original.id, campo: 'asignado_a',
        valor_anterior: (original.asignado_a || []).map(id => nombrePerfil(id, perfiles)).join(', ') || null,
        valor_nuevo: (nuevo.asignado_a || []).map(id => nombrePerfil(id, perfiles)).join(', ') || null,
        autor_id: userId,
      })
    }

    if (entradas.length) await supabase.from('tarea_historial').insert(entradas)
  }

  async function guardar() {
    if (esCreador && !form.titulo.trim()) { setError('El título es obligatorio'); return }
    setLoading(true); setError('')
    try {
      let payload: Record<string, unknown>
      if (esCreador) {
        payload = {
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim() || null,
          prioridad: form.prioridad,
          estado: form.estado,
          fecha_limite: form.fecha_limite || null,
          turno: form.turno,
          asignado_a: form.asignado_a?.length ? form.asignado_a : null,
        }
      } else {
        payload = { fecha_limite: form.fecha_limite || null }
      }

      if (esNueva) {
        const { data, error: err } = await supabase.from('tareas').insert([{ ...payload, creado_por: userId }]).select().single()
        if (err) throw err
        const dest = (form.asignado_a || []).filter(id => id !== userId)
        if (dest.length) notificarTarea({ userIds: dest, title: '📋 Nueva tarea asignada', body: `${userNombre} te asignó: ${form.titulo.trim()}`, url: '/tareas' })
        onGuardado(data, 'nueva')
      } else if (tarea) {
        const { error: err } = await supabase.from('tareas').update(payload).eq('id', tarea.id)
        if (err) throw err
        await registrarCambios(tarea, { ...tarea, ...payload } as Tarea)

        // Avisar a todos los demás participantes (creador + asignados,
        // menos quien hizo el cambio) ante cambios de estado o fecha,
        // sin importar quién de los dos lo haya hecho.
        const destinatarios = [...new Set([tarea.creado_por, ...(tarea.asignado_a || [])])].filter(id => id !== userId)

        if (esCreador && payload.estado && payload.estado !== tarea.estado) {
          notificarTarea({ userIds: destinatarios, title: '📋 Estado actualizado', body: `${userNombre} marcó "${tarea.titulo}" como ${ESTADO_LABELS[payload.estado as string] || payload.estado}`, url: '/tareas' })
        }

        if (form.fecha_limite !== (tarea?.fecha_limite || '')) {
          const nf = form.fecha_limite ? new Date(form.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'sin fecha'
          notificarTarea({ userIds: destinatarios, title: '📅 Fecha actualizada', body: `${userNombre} cambió la fecha de "${tarea.titulo}" a ${nf}`, url: '/tareas' })
        }

        onGuardado({ ...tarea, ...payload } as Tarea, 'editada')
      }
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function handleNuevoComentario({ tarea: t, texto, autorNombre }: { tarea: Tarea; texto: string; autorNombre: string }) {
    const dest = [...new Set([t.creado_por, ...(Array.isArray(t.asignado_a) ? t.asignado_a : [])].filter(id => id && id !== userId))]
    if (dest.length) notificarTarea({ userIds: dest, title: `💬 Comentario de ${autorNombre}`, body: `En "${t.titulo}": ${texto.slice(0, 100)}`, url: '/tareas' })
  }

  const tabs: { id: typeof tab; label: string }[] = esNueva ? [] : [
    { id: 'info', label: 'Info' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'adjuntos', label: 'Adjuntos' },
    { id: 'historial', label: 'Historial' },
    { id: 'comentarios', label: 'Comentarios' },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-[540px] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 shrink-0 border-b border-[#2a2a2a]">
          <div className="flex justify-between items-center">
            <h2 className="m-0 text-base font-bold font-['Syne'] text-[#f0f0f0]">
              {esNueva ? '+ Nueva tarea' : (
                <span className="text-sm font-semibold">
                  {!esCreador && tarea && (
                    <span className="text-[11px] mr-1.5 px-1.5 py-0.5 rounded-full font-bold" style={{ background: PRIORIDAD_META[tarea.prioridad]?.bg, color: PRIORIDAD_META[tarea.prioridad]?.color }}>
                      {PRIORIDAD_META[tarea.prioridad]?.label.toUpperCase()}
                    </span>
                  )}
                  {tarea?.titulo}
                </span>
              )}
            </h2>
            <button onClick={onCerrar} className="bg-transparent border-none text-lg cursor-pointer text-[#888] p-1">✕</button>
          </div>

          {tabs.length > 0 && (
            <div className="flex gap-0.5 mt-2.5 -mb-px">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`bg-transparent border-none px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors ${tab === t.id ? 'font-bold text-[#e8c547] border-[#e8c547]' : 'text-[#888] border-transparent'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3.5">

            {(tab === 'info' || esNueva) && <>
              {!esCreador && tarea && (
                <div className="bg-[rgba(232,197,71,.06)] rounded-xl px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold text-[#e8c547] mb-1">DESCRIPCIÓN</div>
                  {tarea.descripcion
                    ? <div className="text-[13px] text-[#ccc]">{tarea.descripcion}</div>
                    : <div className="text-[13px] text-[#555]">Sin descripción</div>}
                </div>
              )}

              {esCreador && <>
                <div>
                  <label className="text-[11px] font-semibold text-[#888] block mb-1">TAREA *</label>
                  <input placeholder="¿Qué hay que hacer?" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#888] block mb-1">DESCRIPCIÓN</label>
                  <textarea className="!resize-y min-h-[56px]" placeholder="Descripción opcional…" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#888] block mb-1">PRIORIDAD</label>
                  <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as PrioridadTarea }))}>
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>
                {!esNueva && (
                  <div>
                    <label className="text-[11px] font-semibold text-[#888] block mb-1">ESTADO</label>
                    <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as Tarea['estado'] }))}>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_progreso">En progreso</option>
                      <option value="completada">Completada</option>
                    </select>
                  </div>
                )}
              </>}

              <div>
                <label className="text-[11px] font-semibold text-[#888] block mb-1">FECHA LÍMITE</label>
                <input type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
              </div>

              {esCreador && (
                <div>
                  <label className="text-[11px] font-semibold text-[#888] block mb-1">TURNO</label>
                  <select value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value as Turno }))}>
                    <option value="manana">🌅 Mañana</option>
                    <option value="tarde">🌇 Tarde</option>
                  </select>
                </div>
              )}

              {esCreador && (
                <div>
                  <label className="text-[11px] font-semibold text-[#888] block mb-1">ASIGNAR A</label>
                  <BuscadorUsuario perfiles={perfiles} value={form.asignado_a} onChange={val => setForm(f => ({ ...f, asignado_a: val }))} />
                </div>
              )}

              {error && (
                <div className="bg-[rgba(232,66,16,.10)] text-[#e84210] px-3 py-2 rounded-lg text-[13px]">{error}</div>
              )}

              <button onClick={guardar} disabled={loading}
                className={`border-none rounded-xl py-3 text-sm font-bold font-['Syne'] mt-1 ${loading ? 'bg-[#2a2a2a] text-[#888] cursor-not-allowed' : 'bg-[#e8c547] text-black cursor-pointer'}`}>
                {loading ? 'Guardando…' : esNueva ? 'Crear tarea' : 'Guardar cambios'}
              </button>
            </>}

            {tab === 'checklist' && !esNueva && tarea && <Subtareas tarea={tarea} userId={userId} />}
            {tab === 'adjuntos' && !esNueva && tarea && <Adjuntos tarea={tarea} userId={userId} />}
            {tab === 'historial' && !esNueva && tarea && <Historial tarea={tarea} perfiles={perfiles} />}
            {tab === 'comentarios' && !esNueva && tarea && (
              <HiloComentarios tarea={tarea} userId={userId} userNombre={userNombre} perfiles={perfiles} onNuevoComentario={handleNuevoComentario} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
