'use client'

import { useEffect, useState } from 'react'
import { IconMessageCircle, IconX } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import type { PedidoMensaje } from '@/lib/types'
import ChatPedido from './ChatPedido'

// El chat de un pedido, fuera del detalle (una conversación larga lo alargaba
// muchísimo). Botón con la cantidad de mensajes, resaltado si hay sin leer; al
// tocarlo, el chat se abre en su propio panel encima del detalle.
//
// Dos modos:
// - controlado (mayorista): el tablero ya tiene los mensajes en vivo y sabe
//   cuántos hay sin leer; pasa `mensajes`, `sinLeer` y `onVisto`.
// - solo (local): carga los mensajes, los escucha en vivo y recuerda en este
//   dispositivo hasta cuándo los vio.

interface Props {
  pedidoId: string
  usuarioId: string
  /** "Chat con el mayorista", "Chat con Local Centro"… */
  titulo: string
  mensajes?: PedidoMensaje[]
  sinLeer?: number
  /** Se abrió el chat: lo que había quedó leído. */
  onVisto?: () => void
  enVivo?: boolean
}

const CLAVE_VISTOS = 'pedidos-chat-vistos'

function leerVisto(pedidoId: string): number {
  try { return (JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '{}') as Record<string, number>)[pedidoId] ?? 0 } catch { return 0 }
}

function guardarVisto(pedidoId: string) {
  try {
    const vistos = JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '{}') as Record<string, number>
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify({ ...vistos, [pedidoId]: Date.now() }))
  } catch {}
}

/** Mensajes de la otra parte posteriores a la última vez que se vio el chat o a mi último mensaje. */
function contarSinLeer(mensajes: PedidoMensaje[], usuarioId: string, vistoEn: number): number {
  let desde = vistoEn
  for (const m of mensajes) if (m.autor_id === usuarioId) desde = Math.max(desde, new Date(m.created_at).getTime())
  return mensajes.filter(m => m.autor_id !== usuarioId && new Date(m.created_at).getTime() > desde).length
}

export default function BotonChat({ pedidoId, usuarioId, titulo, mensajes: mensajesControlados, sinLeer: sinLeerControlado, onVisto, enVivo = true }: Props) {
  const controlado = mensajesControlados !== undefined
  const [supabase] = useState(() => createClient())
  const [propios, setPropios] = useState<PedidoMensaje[]>([])
  const [vistoEn, setVistoEn] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const mensajes = controlado ? mensajesControlados : propios

  // Modo solo: cargar, escuchar en vivo y leer hasta cuándo se vio.
  useEffect(() => {
    if (controlado) return
    let vigente = true
    setVistoEn(leerVisto(pedidoId)) // eslint-disable-line react-hooks/set-state-in-effect -- localStorage: solo en el navegador
    supabase.from('pedido_mensajes').select('*').eq('pedido_id', pedidoId).order('created_at')
      .then(({ data }) => { if (vigente && data) setPropios(data as PedidoMensaje[]) })
    if (!enVivo) return () => { vigente = false }
    const canal = supabase
      .channel(`chat-boton-${pedidoId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedido_mensajes', filter: `pedido_id=eq.${pedidoId}` }, payload => {
        const m = payload.new as PedidoMensaje
        if (vigente) setPropios(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
      })
      .subscribe()
    return () => { vigente = false; supabase.removeChannel(canal) }
  }, [controlado, pedidoId, enVivo, supabase])

  const sinLeer = controlado ? (sinLeerControlado ?? 0) : contarSinLeer(propios, usuarioId, vistoEn)

  function marcarVisto() {
    if (controlado) { onVisto?.(); return }
    guardarVisto(pedidoId)
    setVistoEn(Date.now())
  }

  function abrir() { marcarVisto(); setAbierto(true) }
  function cerrar() { marcarVisto(); setAbierto(false) }

  // Escape cierra solo el chat, no el detalle que está debajo.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); cerrar() } }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  })

  const total = mensajes.length
  return (
    <>
      <button type="button" onClick={abrir}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
          sinLeer > 0 ? 'border-brand-red/60 bg-danger-bg hover:border-brand-red' : total > 0 ? 'border-accent/50 bg-accent-bg hover:border-accent' : 'border-border hover:border-accent/50'
        }`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sinLeer > 0 ? 'bg-brand-red/15 text-brand-red' : 'bg-accent/15 text-accent'}`}>
          <IconMessageCircle size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{titulo}</span>
          <span className="block text-2xs text-muted">
            {total === 0 ? 'Sin mensajes. Tocá para escribir.' : `${total} mensaje${total === 1 ? '' : 's'}`}
          </span>
        </span>
        {sinLeer > 0 && (
          <span className="shrink-0 rounded-full bg-brand-red px-2 py-0.5 text-2xs font-bold text-white">
            {sinLeer} sin leer
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={cerrar}>
          <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}
            className="flex h-[85dvh] w-full max-w-lg flex-col gap-3 rounded-t-2xl border border-border border-t-2 border-t-accent bg-surface p-4 shadow-modal sm:h-[70vh] sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text">{titulo}</h3>
              <button type="button" onClick={cerrar} aria-label="Cerrar chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface2 hover:text-text">
                <IconX size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatPedido pedidoId={pedidoId} mensajesIniciales={mensajes} usuarioId={usuarioId} enVivo={enVivo} llenar />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
