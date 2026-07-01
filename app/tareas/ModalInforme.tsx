'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BuscadorUsuario } from './ModalTarea'
import { nombrePerfil, notificarTarea } from './helpers'
import type { InformeDiario } from '@/lib/types'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }

function fmtFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
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
  const supabase = createClient()
  const esNuevo = !informe
  const esAutor = esNuevo || informe?.autor_id === userId
  const [destinatarios, setDestinatarios] = useState<string[]>([])
  const [comentario, setComentario] = useState('')
  const [completadas, setCompletadas] = useState<{ id: string; titulo: string; incluida: boolean }[]>([])
  const [cargando, setCargando] = useState(esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

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
        lista.push({ id: row.tarea_id, titulo: (row as any).tareas?.titulo || 'Tarea', incluida: true })
      }
      setCompletadas(lista)
      setCargando(false)
    }
    cargarCompletadas()
    return () => { activo = false }
  }, [esNuevo, fecha, userId])

  function toggleIncluida(id: string) {
    setCompletadas(prev => prev.map(c => c.id === id ? { ...c, incluida: !c.incluida } : c))
  }

  async function guardar() {
    if (!destinatarios.length) { setError('Elegí al menos un destinatario'); return }
    setGuardando(true); setError('')
    try {
      const tareasIncluidas = completadas.filter(c => c.incluida).map(c => ({ id: c.id, titulo: c.titulo }))
      const { data, error: err } = await supabase.from('informes_diarios')
        .insert([{
          autor_id: userId,
          destinatarios,
          fecha,
          tareas_completadas: tareasIncluidas,
          comentario: comentario.trim() || null,
        }])
        .select().single()
      if (err) throw err
      notificarTarea({ userIds: destinatarios, title: '📨 Informe del día', body: `${userNombre} envió su informe del ${fmtFecha(fecha)}`, url: '/tareas' })
      onCreado(data)
    } catch (e: any) { setError(e.message) }
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
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-[460px] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 shrink-0 border-b border-[#2a2a2a] flex justify-between items-center">
          <h2 className="m-0 text-base font-bold font-['Syne'] text-[#f0f0f0]">
            📨 {esNuevo ? 'Informe del día' : `Informe de ${nombrePerfil(informe!.autor_id, perfiles)}`}
          </h2>
          <button onClick={onCerrar} className="bg-transparent border-none text-lg cursor-pointer text-[#888] p-1">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          <div className="text-xs text-[#888]">{fmtFecha(esNuevo ? fecha : informe!.fecha)}</div>

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
            <label className="text-[11px] font-semibold text-[#888] block mb-1">COMENTARIO</label>
            {esNuevo ? (
              <textarea className="!resize-y min-h-[56px]" placeholder="Comentario opcional…" value={comentario} onChange={e => setComentario(e.target.value)} />
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
