'use client'

import { useCallback, useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push'

// Avisos push de este dispositivo (notificación aunque la app esté cerrada).
// Lo usan el cartel "Activar notificaciones" (solo la primera vez) y el
// interruptor del panel de la campana (siempre a mano).
//
// - 'no-soportado': el navegador no tiene notificaciones (iPhone sin instalar la app).
// - 'pedir': nunca se respondió el permiso → se muestra el cartel.
// - 'bloqueado': el permiso se negó; se cambia desde el navegador.
// - 'activo' / 'inactivo': permiso dado; push suscripto o no en este dispositivo.
export type EstadoAvisos = 'cargando' | 'no-soportado' | 'pedir' | 'bloqueado' | 'activo' | 'inactivo'

const EVENTO = 'avisos-push-cambio'

// Si el navegador ya tiene una suscripción (puede ser de OTRA cuenta que usó
// este dispositivo antes), se reclama para el usuario logueado ahora; si no,
// quedaría "activada" en pantalla pero el servidor le mandaría el push a la
// cuenta vieja. Una sola vez por carga de página aunque haya varios usuarios del hook.
let reclamo: Promise<boolean> | null = null
function reclamarSuscripcion(): Promise<boolean> {
  reclamo ??= (async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) return false
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
      return res.ok
    } catch { return false }
  })()
  return reclamo
}

async function leerEstado(): Promise<EstadoAvisos> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'no-soportado'
  if (Notification.permission === 'default') return 'pedir'
  if (Notification.permission === 'denied') return 'bloqueado'
  return (await reclamarSuscripcion()) ? 'activo' : 'inactivo'
}

export function useAvisosPush() {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    const refrescar = () => { leerEstado().then(e => { if (vigente) setEstado(e) }) }
    refrescar()
    window.addEventListener(EVENTO, refrescar)
    return () => { vigente = false; window.removeEventListener(EVENTO, refrescar) }
  }, [])

  const avisar = (nuevo: boolean) => {
    reclamo = Promise.resolve(nuevo)
    window.dispatchEvent(new Event(EVENTO))
  }

  // Pide permiso y suscribe el dispositivo a push (service worker + VAPID).
  const activar = useCallback(async () => {
    if (!('Notification' in window)) return
    setOcupado(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window)) { avisar(false); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { avisar(false); return }
      // Suscripción nueva: una vieja (de otra cuenta) puede seguir "viva" en el
      // navegador aunque el servicio de push ya no la reconozca.
      const existente = await reg.pushManager.getSubscription()
      if (existente) await existente.unsubscribe()
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
      avisar(res.ok)
    } catch {
      avisar(false)
    } finally {
      setOcupado(false)
    }
  }, [])

  // Deja de recibir push en este dispositivo (el permiso del navegador queda).
  const desactivar = useCallback(async () => {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {})
      }
    } finally {
      avisar(false)
      setOcupado(false)
    }
  }, [])

  return { estado, ocupado, activar, desactivar }
}
