'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PedidoMensaje } from '@/lib/types'

interface Props {
  pedidoId: string
  mensajesIniciales: PedidoMensaje[]
  autorRol: string
  autorNombre: string
}

const ROL_LABEL: Record<string, string> = {
  local: 'Local', fabrica: 'Fábrica', deposito: 'Depósito', admin: 'Admin',
}

const ROL_COLOR: Record<string, string> = {
  local:    'bg-[rgba(140,100,255,.2)] text-[#a78bfa]',
  fabrica:  'bg-[rgba(240,168,73,.2)] text-[#f0a849]',
  deposito: 'bg-[rgba(56,189,248,.2)] text-[#38bdf8]',
  admin:    'bg-[rgba(232,197,71,.2)] text-[#e8c547]',
}

export default function PedidoMensajes({ pedidoId, mensajesIniciales, autorRol, autorNombre }: Props) {
  const [mensajes, setMensajes] = useState<PedidoMensaje[]>(
    [...mensajesIniciales].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  )
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [supabase] = useState(() => createClient())

  async function enviar() {
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    const { data } = await supabase
      .from('pedido_mensajes')
      .insert({ pedido_id: pedidoId, autor_rol: autorRol, autor_nombre: autorNombre, texto: t })
      .select().single()
    if (data) setMensajes(prev => [...prev, data])
    setTexto('')
    setEnviando(false)
  }

  return (
    <div className="mt-2 pt-2 border-t border-[#2a2a2a] space-y-2">
      {mensajes.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {mensajes.map(m => (
            <div key={m.id} className={`flex items-start gap-1.5 ${m.autor_rol === autorRol ? 'flex-row-reverse' : ''}`}>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${ROL_COLOR[m.autor_rol] || ROL_COLOR.admin}`}>
                {ROL_LABEL[m.autor_rol] || m.autor_rol}
              </span>
              <p className={`text-[11px] bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1 flex-1 ${m.autor_rol === autorRol ? 'text-right' : ''}`}>
                {m.texto}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder="Escribir mensaje..."
          className="flex-1 text-[11px] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 bg-[#1a1a1a] text-[#f0f0f0] placeholder:text-[#888] focus:outline-none focus:border-[#e8c547] min-w-0"
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="bg-[#e8c547] text-black rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-30 shrink-0"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
