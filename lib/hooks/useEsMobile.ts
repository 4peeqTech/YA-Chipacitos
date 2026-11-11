'use client'

import { useEffect, useState } from 'react'

/**
 * `true` por debajo del breakpoint `sm` de Tailwind (640px). Decide si un panel
 * se dibuja como popover anclado (escritorio) o como hoja inferior (celular).
 *
 * Arranca en `false` para que el HTML del servidor y el del primer render del
 * cliente coincidan; se corrige en el efecto, antes de que haya nada abierto.
 */
export function useEsMobile(breakpoint = 640): boolean {
  const [esMobile, setEsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const sincronizar = () => setEsMobile(mq.matches)
    sincronizar()
    mq.addEventListener('change', sincronizar)
    return () => mq.removeEventListener('change', sincronizar)
  }, [breakpoint])

  return esMobile
}
