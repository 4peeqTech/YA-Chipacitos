'use client'

import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Panel desplegable (lista de un select, selector de ícono…) dibujado en un
 * portal con posición fija, pegado a su disparador. Así no lo recorta un
 * contenedor con overflow (el Modal tiene overflow-y-auto): antes la lista de
 * SelectBuscador quedaba cortada dentro de cualquier modal.
 *
 * - Se abre hacia abajo; si abajo no entra y arriba hay más lugar, hacia arriba.
 * - Se reubica con scroll (de cualquier contenedor) y resize.
 * - Los eventos de React siguen burbujeando por el árbol de componentes, así
 *   que un clic adentro no cierra el Modal. Quien lo usa tiene que contemplar
 *   `refPanel` en su "clic afuera".
 */
export default function Flotante({
  ancla,
  refPanel,
  altoMax = 280,
  anchoMin = 200,
  ancho,
  className = '',
  children,
}: {
  ancla: RefObject<HTMLElement | null>
  refPanel: RefObject<HTMLDivElement | null>
  /** Alto estimado del panel, para decidir si se abre hacia arriba. */
  altoMax?: number
  anchoMin?: number
  /** Ancho fijo del panel, ignorando el del disparador. Para contenido que mide
   *  lo que mide (el calendario de dos meses) y no puede encogerse al campo. */
  ancho?: number
  className?: string
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    function ubicar() {
      const el = ancla.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const margen = 8
      const abajo = window.innerHeight - r.bottom
      // Nunca más ancho que la ventana: un panel de ancho fijo (el calendario de
      // dos meses) en una ventana angosta se salía por la derecha.
      const width = Math.min(ancho ?? Math.max(r.width, anchoMin), window.innerWidth - margen * 2)
      const left = Math.min(Math.max(margen, r.left), window.innerWidth - width - margen)
      if (abajo < altoMax && r.top > abajo) setPos({ bottom: window.innerHeight - r.top + 4, left, width })
      else setPos({ top: r.bottom + 4, left, width })
    }
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [ancla, altoMax, anchoMin, ancho])

  if (!pos) return null
  return createPortal(
    <div
      ref={refPanel}
      style={{
        position: 'fixed',
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        // Crece desde el borde pegado al disparador: abierto hacia arriba, el
        // origen `top left` de la clase lo hacía nacer del lado equivocado.
        transformOrigin: pos.bottom != null ? 'bottom left' : 'top left',
      }}
      className={`popover-entrada z-[60] ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}
