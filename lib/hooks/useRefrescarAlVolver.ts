'use client'

import { useCallback, useEffect, useRef } from 'react'

// Dispara `callback` cuando la pestaña vuelve a ser visible (visibilitychange),
// cuando vuelve la red (online), o cuando el caller lo invoca manualmente
// (ej: al reconectar un canal de realtime). Debounced para no encadenar
// refrescos cuando varias señales llegan juntas (volver de background suele
// disparar visibility + online casi al mismo tiempo).
//
// Cubre el caso en que el WebSocket de realtime se cae en silencio (PWA en
// background, pantalla apagada, red intermitente): sin esto, los cambios de
// esa ventana se pierden hasta un reload manual completo.
export function useRefrescarAlVolver(callback: () => void, debounceMs = 500) {
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disparar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => callbackRef.current(), debounceMs)
  }, [debounceMs])

  useEffect(() => {
    function alVolverVisible() {
      if (document.visibilityState === 'visible') disparar()
    }
    document.addEventListener('visibilitychange', alVolverVisible)
    window.addEventListener('online', disparar)
    return () => {
      document.removeEventListener('visibilitychange', alVolverVisible)
      window.removeEventListener('online', disparar)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [disparar])

  return disparar
}
