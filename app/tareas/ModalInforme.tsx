'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BuscadorUsuario } from './ModalTarea'
import GrabadorTexto from './GrabadorTexto'
import { nombrePerfil, notificarTarea, duracionMin, fmtHoras, insertarVineta, DESTINATARIO_DEFAULT_INFORME_ID } from './helpers'
import type { InformeDiario, InformeActividad } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

function fmtFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Fila editable de actividad (informe nuevo) ─────────────────────────
function ActividadEditable({ actividad, onChange, onQuitar }: {
  actividad: InformeActividad; onChange: (p: Partial<InformeActividad>) => void; onQuitar: () => void
}) {
  const detalleRef = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="border border-[#2a2a2a] rounded-xl p-2.5 bg-[#1a1a1a] flex flex-col gap-1.5">
      <div className="flex gap-1.5 items-center">
        <input placeholder="Título corto de la actividad" value={actividad.titulo}
          onChange={e => onChange({ titulo: e.target.value })} className="flex-1 !py-1.5" />
        <button onClick={onQuitar} className="bg-transparent border-none text-[#444] cursor-pointer text-sm px-0.5">✕</button>
      </div>
      <div className="flex gap-1.5">
        <input type="time" value={actividad.hora_inicio || ''} onChange={e => onChange({ hora_inicio: e.target.value || null })} className="!py-1.5 flex-1" />
        <input type="time" value={actividad.hora_fin || ''} onChange={e => onChange({ hora_fin: e.target.value || null })} className="!py-1.5 flex-1" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#666]">Detalle</span>
        <button type="button"
          onClick={() => insertarVineta(detalleRef.current, actividad.detalle || '', v => onChange({ detalle: v }))}
          className="bg-transparent border-none text-[10px] text-[#e8c547] cursor-pointer font-semibold">+ viñeta</button>
      </div>
      <textarea ref={detalleRef} className="!resize-y min-h-[44px] !py-1.5" placeholder="Detalle de la actividad…"
        value={actividad.detalle || ''} onChange={e => onChange({ detalle: e.target.value })} />
    </div>
  )
}

// ── Ítem de acordeón (informe existente) ───────────────────────────────
function ActividadAcordeon({ actividad, expandida, onToggle }: { actividad: InformeActividad; expandida: boolean; onToggle: () => void }) {
  const dur = duracionMin(actividad.hora_inicio, actividad.hora_fin)
  return (
    <div className="border border-[#2a2a2a] rounded-xl overflow-hidden bg-[#1a1a1a]">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-transparent border-none cursor-pointer text-left">
        <span className="text-[13px] font-semibold text-[#f0f0f0]">{actividad.titulo || 'Actividad'}</span>
        <span className="flex items-center gap-2 shrink-0">
          {actividad.hora_inicio && actividad.hora_fin && (
            <span className="text-[11px] text-[#888]">{actividad.hora_inicio}–{actividad.hora_fin}{dur !== null ? ` (${fmtHoras(dur)})` : ''}</span>
          )}
          <span className="text-[#888] text-xs">{expandida ? '▲' : '▼'}</span>
        </span>
      </button>
      {expandida && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-[#2a2a2a]">
          {actividad.detalle
            ? <div className="text-[13px] text-[#ccc] whitespace-pre-wrap">{actividad.detalle}</div>
            : <div className="text-[13px] text-[#555]">Sin detalle</div>}
        </div>
      )}
    </div>
  )
}

interface ModalInformeProps {
  informe: InformeDiario | null
  fecha: string
  perfiles: PerfilLite[]
  userId: string
  userNombre: string
  onCerrar: () => void
  onCreado: (i: InformeDiario) => void
  onEliminado: (id: string) => void
}

export default function ModalInforme({ informe, fecha, perfiles, userId, userNombre, onCerrar, onCreado, onEliminado }: ModalInformeProps) {
  const [supabase] = useState(() => createClient())
  const esNuevo = !informe
  const esAutor = esNuevo || informe?.autor_id === userId
  const [destinatarios, setDestinatarios] = useState<string[]>(() => esNuevo ? [DESTINATARIO_DEFAULT_INFORME_ID] : [])
  const [comentario, setComentario] = useState('')
  const [completadas, setCompletadas] = useState<{ id: string; titulo: string; incluida: boolean }[]>([])
  const [cargando, setCargando] = useState(esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [horarioInicio, setHorarioInicio] = useState('')
  const [horarioFin, setHorarioFin] = useState('')
  const [actividades, setActividades] = useState<InformeActividad[]>([])
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  function agregarActividad() {
    setActividades(prev => [...prev, { id: crypto.randomUUID(), titulo: '', detalle: '', hora_inicio: null, hora_fin: null }])
  }
  function actualizarActividad(id: string, patch: Partial<InformeActividad>) {
    setActividades(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }
  function quitarActividad(id: string) {
    setActividades(prev => prev.filter(a => a.id !== id))
  }
  function toggleExpandida(id: string) {
    setExpandidas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const horaInicioMostrada = (esNuevo ? horarioInicio : informe?.horario_inicio)?.slice(0, 5) || null
  const horaFinMostrada = (esNuevo ? horarioFin : informe?.horario_fin)?.slice(0, 5) || null

  const totalMin = useMemo(() => {
    const actividadesParaTotal = esNuevo ? actividades : (informe?.actividades || [])
    const rango = duracionMin(horaInicioMostrada, horaFinMostrada)
    if (rango !== null) return rango
    const suma = actividadesParaTotal.reduce((acc, a) => acc + (duracionMin(a.hora_inicio, a.hora_fin) ?? 0), 0)
    return suma > 0 ? suma : null
  }, [horaInicioMostrada, horaFinMostrada, esNuevo, actividades, informe])

  useEffect(() => {
    if (!esNuevo) return
    let activo = true
    async function cargarCompletadas() {
      const { data } = await supabase.from('tarea_historial')
        .select('tarea_id, tareas(titulo)')
        .eq('campo', 'estado')
        .in('valor_nuevo', ['completada', 'Completada'])
        .eq('autor_id', userId)
        .gte('created_at', `${fecha}T00:00:00`)
        .lte('created_at', `${fecha}T23:59:59`)
      if (!activo) return
      const vistos = new Set<string>()
      const lista: { id: string; titulo: string; incluida: boolean }[] = []
      for (const row of data || []) {
        if (vistos.has(row.tarea_id)) continue
        vistos.add(row.tarea_id)
        lista.push({ id: row.tarea_id, titulo: row.tareas?.[0]?.titulo || 'Tarea', incluida: true })
      }
      setCompletadas(lista)
      setCargando(false)
    }
    cargarCompletadas()
    return () => { activo = false }
  }, [esNuevo, fecha, userId, supabase])

  function toggleIncluida(id: string) {
    setCompletadas(prev => prev.map(c => c.id === id ? { ...c, incluida: !c.incluida } : c))
  }

  async function guardar() {
    if (!destinatarios.length) { setError('Elegí al menos un destinatario'); return }
    if (!comentario.trim()) { setError('El comentario es obligatorio'); return }
    setGuardando(true); setError('')
    try {
      const tareasIncluidas = completadas.filter(c => c.incluida).map(c => ({ id: c.id, titulo: c.titulo }))
      const actividadesValidas = actividades
        .filter(a => a.titulo.trim())
        .map(a => ({ ...a, titulo: a.titulo.trim(), detalle: a.detalle?.trim() || null }))
      const { data, error: err } = await supabase.from('informes_diarios')
        .insert([{
          autor_id: userId,
          destinatarios,
          fecha,
          tareas_completadas: tareasIncluidas,
          comentario: comentario.trim() || null,
          horario_inicio: horarioInicio || null,
          horario_fin: horarioFin || null,
          actividades: actividadesValidas,
        }])
        .select().single()
      if (err) throw err
      notificarTarea({ userIds: destinatarios, title: '📨 Informe del día', body: `${userNombre} envió su informe del ${fmtFecha(fecha)}`, url: '/tareas' })
      onCreado(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar el informe') }
    finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!informe) return
    setGuardando(true)
    const { error: err } = await supabase.from('informes_diarios').delete().eq('id', informe.id)
    setGuardando(false)
    if (!err) onEliminado(informe.id)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-[500px] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 shrink-0 border-b border-[#2a2a2a] flex justify-between items-center">
          <h2 className="m-0 text-base font-bold font-['Syne'] text-[#f0f0f0]">
            📨 {esNuevo ? 'Informe del día' : `Informe de ${nombrePerfil(informe!.autor_id, perfiles)}`}
          </h2>
          <button onClick={onCerrar} className="bg-transparent border-none text-lg cursor-pointer text-[#888] p-1">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          <div>
            <div className="text-xs text-[#888]">{fmtFecha(esNuevo ? fecha : informe!.fecha)}</div>
            {(horaInicioMostrada && horaFinMostrada || totalMin !== null) && (
              <div className="text-xs text-[#e8c547] font-semibold mt-0.5">
                {horaInicioMostrada && horaFinMostrada && <>Horario: {horaInicioMostrada} a {horaFinMostrada} hs</>}
                {horaInicioMostrada && horaFinMostrada && totalMin !== null && ' · '}
                {totalMin !== null && <>Total: {fmtHoras(totalMin)}</>}
              </div>
            )}
          </div>

          {esNuevo ? (
            <div>
              <label className="text-[11px] font-semibold text-[#888] block mb-1">ENVIAR A *</label>
              <BuscadorUsuario perfiles={perfiles} value={destinatarios} onChange={setDestinatarios} />
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-semibold text-[#888] block mb-1">ENVIADO A</label>
              <div className="text-sm text-[#f0f0f0]">{informe!.destinatarios.map(id => nombrePerfil(id, perfiles)).join(', ')}</div>
            </div>
          )}

          {esNuevo && (
            <div>
              <label className="text-[11px] font-semibold text-[#888] block mb-1">HORARIO DEL TURNO (opcional)</label>
              <div className="flex gap-2">
                <input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} className="flex-1" />
                <input type="time" value={horarioFin} onChange={e => setHorarioFin(e.target.value)} className="flex-1" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-[#888] block mb-1">TAREAS COMPLETADAS</label>
            {esNuevo ? (
              cargando ? (
                <div className="text-xs text-[#555]">Buscando…</div>
              ) : completadas.length === 0 ? (
                <div className="text-xs text-[#444]">No completaste tareas registradas ese día</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {completadas.map(c => (
                    <div key={c.id} onClick={() => toggleIncluida(c.id)} className="flex items-center gap-2 py-1 px-0.5 cursor-pointer">
                      <div className={`w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center ${c.incluida ? 'bg-[#56d68a]' : 'border-2 border-[#555]'}`}>
                        {c.incluida && <span className="text-black text-[11px] font-bold">✓</span>}
                      </div>
                      <span className="text-[13px] text-[#f0f0f0]">{c.titulo}</span>
                    </div>
                  ))}
                </div>
              )
            ) : informe!.tareas_completadas.length === 0 ? (
              <div className="text-xs text-[#444]">Sin tareas completadas ese día</div>
            ) : (
              <div className="flex flex-col gap-1">
                {informe!.tareas_completadas.map(t => (
                  <div key={t.id} className="text-[13px] text-[#f0f0f0] flex items-center gap-2">
                    <span className="text-[#56d68a]">✓</span> {t.titulo}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[11px] font-semibold text-[#888]">ACTIVIDADES</label>
              {esNuevo && (
                <button type="button" onClick={agregarActividad} className="bg-transparent border-none text-[11px] text-[#e8c547] cursor-pointer font-semibold">+ Agregar actividad</button>
              )}
            </div>
            {esNuevo ? (
              actividades.length === 0 ? (
                <div className="text-xs text-[#444] text-center py-2">Sin actividades cargadas</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {actividades.map(a => (
                    <ActividadEditable key={a.id} actividad={a}
                      onChange={patch => actualizarActividad(a.id, patch)}
                      onQuitar={() => quitarActividad(a.id)} />
                  ))}
                </div>
              )
            ) : informe!.actividades.length === 0 ? (
              <div className="text-xs text-[#444]">Sin actividades cargadas</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {informe!.actividades.map(a => (
                  <ActividadAcordeon key={a.id} actividad={a} expandida={expandidas.has(a.id)} onToggle={() => toggleExpandida(a.id)} />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-[#888]">COMENTARIO {esNuevo && '*'}</label>
              {esNuevo && (
                <GrabadorTexto onTranscripcion={texto => setComentario(prev => prev.trim() ? `${prev.trim()} ${texto}` : texto)} />
              )}
            </div>
            {esNuevo ? (
              <textarea className="!resize-y min-h-[56px]" placeholder="Contá cómo estuvo el turno…" value={comentario} onChange={e => setComentario(e.target.value)} />
            ) : informe!.comentario ? (
              <div className="text-[13px] text-[#ccc] whitespace-pre-wrap">{informe!.comentario}</div>
            ) : (
              <div className="text-[13px] text-[#555]">Sin comentario</div>
            )}
          </div>

          {error && <div className="bg-[rgba(232,66,16,.10)] text-[#e84210] px-3 py-2 rounded-lg text-[13px]">{error}</div>}

          {esNuevo ? (
            <button onClick={guardar} disabled={guardando}
              className={`border-none rounded-xl py-3 text-sm font-bold font-['Syne'] mt-1 ${guardando ? 'bg-[#2a2a2a] text-[#888] cursor-not-allowed' : 'bg-[#e8c547] text-black cursor-pointer'}`}>
              {guardando ? 'Enviando…' : 'Enviar informe'}
            </button>
          ) : esAutor ? (
            <button onClick={eliminar} disabled={guardando}
              className="border-none rounded-xl py-3 text-sm font-bold bg-[rgba(232,66,16,.10)] text-[#e84210] mt-1 cursor-pointer">
              {guardando ? 'Eliminando…' : '🗑 Eliminar informe'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
