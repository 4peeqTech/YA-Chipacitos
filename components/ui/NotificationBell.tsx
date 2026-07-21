'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Notificacion {
  id: string
  titulo: string
  cuerpo: string | null
  url: string | null
  tipo: string | null
  leida: boolean
  created_at: string
}

function formatearFecha(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function NotificationBell() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }, [supabase])

  useEffect(() => {
    let cancelado = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelado || !data.user) return
      setUserId(data.user.id)
      cargar(data.user.id)
    })
    return () => { cancelado = true }
  }, [supabase, cargar])

  // Topic único por intento de conexión para evitar el error "cannot add
  // callbacks after subscribe()" en reconexiones rápidas (mismo patrón que
  // PedidosOperadorClient/TareasClient).
  useEffect(() => {
    if (!userId) return
    const topic = `notificaciones-${userId}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${userId}` },
        () => cargar(userId)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, cargar])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const noLeidas = items.filter(n => !n.leida).length

  async function abrirNotificacion(n: Notificacion) {
    if (!n.leida) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, leida: true } : x)))
      await supabase.from('notificaciones').update({ leida: true }).eq('id', n.id)
    }
    setOpen(false)
    if (n.url) router.push(n.url)
  }

  async function marcarTodasLeidas() {
    if (!userId || noLeidas === 0) return
    setItems(prev => prev.map(x => ({ ...x, leida: true })))
    await supabase.from('notificaciones').update({ leida: true }).eq('user_id', userId).eq('leida', false)
  }

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-[#888] hover:text-[#e8c547] transition-colors shrink-0 flex items-center"
        title="Notificaciones"
      >
        🔔
        {noLeidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#e84210] text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto bg-[#111111] border border-[#2a2a2a] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,.6)] z-[60]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a] sticky top-0 bg-[#111111]">
            <span className="text-xs font-semibold text-[#f0f0f0]">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-[10px] text-[#e8c547] hover:underline">
                Marcar todas leídas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[#888]">Sin notificaciones</p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => abrirNotificacion(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#1a1a1a] transition-colors ${n.leida ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.leida && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#e8c547] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#f0f0f0] truncate">{n.titulo}</p>
                    {n.cuerpo && <p className="text-[11px] text-[#888] line-clamp-2">{n.cuerpo}</p>}
                    <p className="text-[10px] text-[#666] mt-0.5">{formatearFecha(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
