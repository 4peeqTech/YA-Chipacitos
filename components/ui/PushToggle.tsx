'use client'

import { useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push'

interface Props {
  tituloActivar?: string
  descripcionActivar?: string
  descripcionActiva?: string
  descripcionInactiva?: string
}

export default function PushToggle({
  tituloActivar = '🔔 Activar notificaciones',
  descripcionActivar = 'Te avisamos apenas pase algo, aunque cierres la pestaña.',
  descripcionActiva = 'Este dispositivo recibe el aviso aunque cierres la pestaña.',
  descripcionInactiva = 'Hoy solo avisa si tenés la pestaña abierta. Activalo para recibir el aviso aunque la cierres.',
}: Props) {
  const [notifPermiso, setNotifPermiso] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushActivo, setPushActivo] = useState(false)

  // Detectar soporte y permiso actual. Si el navegador ya tiene una
  // suscripción push (puede ser de OTRA cuenta que usó este mismo
  // dispositivo antes), la reclamamos para el usuario logueado ahora —
  // si no, queda "activada" en la UI pero el registro server-side sigue
  // apuntando a la cuenta vieja y nunca llega el push a este usuario.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermiso(Notification.permission)
    }
    navigator.serviceWorker?.getRegistration('/sw.js').then(async reg => {
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) return
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      }).catch(() => null)
      setPushActivo(!!res?.ok)
    }).catch(() => {})
  }, [])

  // Pide permiso y, si está disponible, suscribe el dispositivo a push real
  // (vía service worker + VAPID) — así llega notificación de Windows aunque
  // la pestaña esté cerrada o el realtime se haya caído.
  async function activar() {
    if (!('Notification' in window)) return
    const permiso = await Notification.requestPermission()
    setNotifPermiso(permiso)
    if (permiso !== 'granted') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return

      // Forzar suscripción nueva: una vieja (de otra cuenta en el mismo
      // dispositivo) puede devolverse "viva" del lado del browser aunque
      // el servicio de push ya no la reconozca.
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
      if (res.ok) setPushActivo(true)
    } catch { /* best-effort */ }
  }

  // Desuscribe este dispositivo (no toca el permiso de notificaciones del
  // browser, solo deja de recibir push).
  async function desactivar() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {})
      }
    } finally {
      setPushActivo(false)
    }
  }

  if (notifPermiso === 'default') {
    return (
      <div className="bg-[rgba(232,197,71,.08)] border border-[#e8c547]/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#e8c547]">{tituloActivar}</p>
          <p className="text-xs text-[#888] mt-0.5">{descripcionActivar}</p>
        </div>
        <button
          onClick={activar}
          className="shrink-0 bg-[#e8c547] text-black text-xs font-['Syne'] font-bold px-4 py-2 rounded-lg whitespace-nowrap"
        >
          Activar
        </button>
      </div>
    )
  }

  if (notifPermiso === 'denied') {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs text-[#555]">
        🔕 Notificaciones bloqueadas en este browser. Para activarlas, hacé clic en el candado de la barra de dirección.
      </div>
    )
  }

  if (notifPermiso === 'granted') {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#f0f0f0]">
            {pushActivo ? '🔔 Aviso persistente activado' : '🔕 Aviso persistente desactivado'}
          </p>
          <p className="text-xs text-[#888] mt-0.5">{pushActivo ? descripcionActiva : descripcionInactiva}</p>
        </div>
        <button
          onClick={pushActivo ? desactivar : activar}
          className={`shrink-0 text-xs font-['Syne'] font-bold px-4 py-2 rounded-lg whitespace-nowrap ${
            pushActivo ? 'bg-[#2a2a2a] text-[#f0f0f0]' : 'bg-[#e8c547] text-black'
          }`}
        >
          {pushActivo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    )
  }

  return null
}
