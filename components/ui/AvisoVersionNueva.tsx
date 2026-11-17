'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Commit con el que se compiló este bundle (next.config.ts lo fija en el build).
// En local no hay commit: el aviso queda apagado.
const COMMIT_BUILD = process.env.COMMIT_BUILD ?? ''
const CADA_MS = 5 * 60 * 1000

/**
 * Cartel cuando hay un deploy más nuevo que el que corre esta pestaña.
 * Pregunta a /api/entorno (pasa sin sesión) al volver a la pestaña y cada 5 min.
 * Nunca recarga solo: puede haber un formulario a medio cargar.
 */
export default function AvisoVersionNueva() {
  const [hayNueva, setHayNueva] = useState(false)

  useEffect(() => {
    if (!COMMIT_BUILD || hayNueva) return
    let cancelado = false

    async function revisar() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/entorno', { cache: 'no-store' })
        const { commit } = await res.json() as { commit?: string | null }
        if (!cancelado && commit && commit !== COMMIT_BUILD) setHayNueva(true)
      } catch {
        // Sin conexión o deploy en curso: se vuelve a probar en la próxima vuelta.
      }
    }

    revisar()
    const intervalo = setInterval(revisar, CADA_MS)
    document.addEventListener('visibilitychange', revisar)
    window.addEventListener('focus', revisar)
    return () => {
      cancelado = true
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', revisar)
      window.removeEventListener('focus', revisar)
    }
  }, [hayNueva])

  if (!hayNueva) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-[100] flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-accent bg-surface px-4 py-3 shadow-lg">
        <p className="flex-1 text-sm text-text">
          Hay una versión nueva del sistema. Guardá lo que estés cargando y tocá Actualizar.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90"
        >
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>
    </div>
  )
}
