'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enviarMensaje } from '@/lib/pedidos/acciones'
import type { PedidoMensaje } from '@/lib/types'

// Chat de un pedido. Se actualiza en vivo (realtime sobre pedido_mensajes) y
// al enviar avisa a la otra parte. El autor lo completa la base (trigger),
// así que acá solo se manda el texto.

interface Props {
  pedidoId: string
  /** Si no se pasan, se cargan al montar. */
  mensajesIniciales?: PedidoMensaje[]
  /** Usuario actual: sus mensajes van a la derecha. */
  usuarioId: string
  /** false en listas largas para no abrir un canal por pedido. */
  enVivo?: boolean
  /** Ocupa todo el alto disponible (panel del chat): la lista crece y el campo queda abajo. */
  llenar?: boolean
  /** Sin campo para escribir (el admin mira la conversación entre el local y el mayorista). */
  soloLectura?: boolean
}

const ROL_LABEL: Record<string, string> = {
  local: 'Local', mayorista: 'Mayorista', fabrica: 'Fábrica', deposito: 'Depósito', admin: 'Admin',
}

function ordenar(ms: PedidoMensaje[]) {
  return [...ms].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

function agregar(prev: PedidoMensaje[], m: PedidoMensaje) {
  return prev.some(x => x.id === m.id) ? prev : ordenar([...prev, m])
}

export default function ChatPedido({ pedidoId, mensajesIniciales, usuarioId, enVivo = true, llenar = false, soloLectura = false }: Props) {
  const [mensajes, setMensajes] = useState<PedidoMensaje[]>(() => ordenar(mensajesIniciales ?? []))
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())
  const listaRef = useRef<HTMLDivElement>(null)
  const cargarInicial = mensajesIniciales === undefined

  useEffect(() => {
    if (!cargarInicial) return
    let vigente = true
    supabase.from('pedido_mensajes').select('*').eq('pedido_id', pedidoId).order('created_at')
      .then(({ data, error: err }) => {
        if (!vigente) return
        if (err) setError('No se pudieron cargar los mensajes. Probá de nuevo más tarde.')
        else setMensajes(ordenar(data ?? []))
      })
    return () => { vigente = false }
  }, [pedidoId, cargarInicial, supabase])

  useEffect(() => {
    if (!enVivo) return
    const channel = supabase
      .channel(`chat-${pedidoId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'pedido_mensajes', filter: `pedido_id=eq.${pedidoId}`,
      }, payload => setMensajes(prev => agregar(prev, payload.new as PedidoMensaje)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pedidoId, enVivo, supabase])

  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes.length])

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    setError(null)
    const r = await enviarMensaje(pedidoId, t)
    if (r.ok) {
      setMensajes(prev => agregar(prev, r.data))
      setTexto('')
      if (r.advertencia) setError(r.advertencia)
    } else {
      setError(r.error)
    }
    setEnviando(false)
  }

  return (
    <div className={llenar ? 'flex h-full min-h-0 flex-col gap-2' : 'space-y-2'}>
      {llenar && mensajes.length === 0 && (
        <p className="flex flex-1 items-center justify-center text-center text-sm text-muted">Todavía no hay mensajes. Escribí el primero.</p>
      )}
      {soloLectura && !llenar && mensajes.length === 0 && !error && <p className="text-sm text-muted">No hubo mensajes en este pedido.</p>}
      {mensajes.length > 0 && (
        <div ref={listaRef} className={`space-y-1.5 overflow-y-auto overscroll-contain ${llenar ? 'min-h-0 flex-1' : 'max-h-48'}`}>
          {mensajes.map(m => {
            const mio = m.autor_id ? m.autor_id === usuarioId : false
            return (
              <div key={m.id} className={`flex flex-col ${mio ? 'items-end' : 'items-start'}`}>
                <span className="text-2xs text-faint px-1">
                  {mio ? 'Vos' : `${m.autor_nombre} · ${ROL_LABEL[m.autor_rol] ?? m.autor_rol}`}
                </span>
                <p className={`max-w-[85%] rounded-xl px-3 py-1.5 whitespace-pre-wrap break-words ${llenar ? 'text-sm' : 'text-xs'} ${
                  mio ? 'bg-accent-bg text-text border border-accent/30' : 'bg-surface2 text-text border border-border'
                }`}>
                  {m.texto}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-brand-red">
          <TriangleAlert size={14} className="shrink-0 mt-px" aria-hidden />
          {error}
        </p>
      )}

      {!soloLectura && <div className="flex gap-1.5">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder="Escribir un mensaje…"
          aria-label="Mensaje"
          maxLength={1000}
          className="flex-1 min-w-0 text-xs"
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          aria-label="Enviar mensaje"
          className="shrink-0 flex items-center justify-center rounded-lg bg-accent px-3 text-black disabled:opacity-30"
        >
          <Send size={14} />
        </button>
      </div>}
    </div>
  )
}
