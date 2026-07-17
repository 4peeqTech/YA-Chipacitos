'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'

interface PerfilLite { id: string; nombre: string; rol: string; local_nombre: string | null }
interface Mensaje { role: 'user' | 'assistant'; content: string }

const SUGERENCIAS = [
  '¿Qué tareas tengo pendientes?',
  '¿Qué vence esta semana?',
  'Marcá como completada la tarea "..."',
]

export default function AgenteClient({ userNombre, perfiles }: { userNombre: string; perfiles: PerfilLite[] }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { role: 'assistant', content: `Hola ${userNombre.split(' ')[0]}, soy el asistente de Tareas. Puedo contarte el estado de tus tareas, o crear y actualizar tareas si me lo pedís.` },
  ])
  const [input, setInput] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, cargando])

  async function enviar(texto: string) {
    const contenido = texto.trim()
    if (!contenido || cargando) return

    const historial = [...mensajes, { role: 'user' as const, content: contenido }]
    setMensajes(historial)
    setInput('')
    setError('')
    setCargando(true)

    try {
      const res = await fetch('/api/tareas/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historial, perfiles }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del agente')

      setMensajes(m => [...m, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar al agente')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 lg:px-6 py-5 flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-['Syne'] text-2xl font-extrabold text-[#f0f0f0] m-0">🤖 Agente de Tareas</h1>
        <Link href="/tareas" className="text-xs text-[#888] hover:text-[#e8c547] transition-colors no-underline">← Volver</Link>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3">
        {mensajes.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-[#e8c547] text-black' : 'self-start bg-[#1a1a1a] text-[#f0f0f0]'}`}>
            {m.content}
          </div>
        ))}
        {cargando && (
          <div className="self-start bg-[#1a1a1a] text-[#888] rounded-2xl px-3.5 py-2.5 text-sm">Pensando…</div>
        )}
      </div>

      {error && <p className="text-xs text-[#e84210] mt-2 mb-0">{error}</p>}

      {mensajes.length <= 1 && (
        <div className="flex gap-1.5 flex-wrap mt-2.5">
          {SUGERENCIAS.map(s => (
            <button key={s} onClick={() => enviar(s)} className="text-xs text-[#888] bg-[#111111] border border-[#2a2a2a] rounded-full px-3 py-1.5 cursor-pointer hover:text-[#e8c547]">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); enviar(input) }}
        className="flex gap-2 mt-3"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Preguntá o pedí una acción sobre tus tareas…"
          disabled={cargando}
          className="flex-1"
        />
        <button type="submit" disabled={cargando || !input.trim()} className="bg-[#e8c547] text-black font-semibold rounded-lg px-4 py-2 border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          Enviar
        </button>
      </form>
    </div>
  )
}
