'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Barra amarilla arriba mientras se pasa de una sección a otra. Arranca al tocar un
// enlace interno que cambia de página y se apaga cuando cambia la ruta. Va dentro
// de <Suspense> en el layout raíz (usa useSearchParams).
export default function BarraNavegacion() {
  const pathname = usePathname()
  const params = useSearchParams()
  const rutaActual = `${pathname}?${params}`
  // Ruta en la que se tocó el enlace: mientras sigamos en ella, la barra se ve.
  // Cuando llega la página nueva la ruta cambia y se apaga sola.
  const [desde, setDesde] = useState<string | null>(null)
  // Al cambiar de ruta se olvida (así, volviendo atrás a la misma ruta, no reaparece).
  const [rutaPrevia, setRutaPrevia] = useState(rutaActual)
  if (rutaPrevia !== rutaActual) {
    setRutaPrevia(rutaActual)
    setDesde(null)
  }
  const activa = desde === rutaActual

  useEffect(() => {
    function alTocar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return
      const destino = new URL(a.href, location.href)
      if (destino.origin !== location.origin) return
      if (destino.pathname === location.pathname && destino.search === location.search) return
      setDesde(rutaActual)
    }
    document.addEventListener('click', alTocar)
    return () => document.removeEventListener('click', alTocar)
  }, [rutaActual])

  // Red de seguridad: si la navegación no termina (error, se canceló), se apaga sola.
  useEffect(() => {
    if (!activa) return
    const t = setTimeout(() => setDesde(null), 10000)
    return () => clearTimeout(t)
  }, [activa])

  if (!activa) return null
  return <div role="progressbar" aria-label="Cargando" className="barra-nav cargando-aparece" />
}
