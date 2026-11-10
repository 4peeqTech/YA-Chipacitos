'use client'

import { useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * Props para el fondo oscuro de un modal: lo cierra solo si el clic empezó y
 * terminó sobre el fondo. Apretar adentro (por ejemplo, seleccionando el texto
 * de un campo) y soltar afuera dispara un click cuyo target es el fondo, y antes
 * eso cerraba el modal con todo lo que se estaba editando.
 *
 *   const fondo = useCierrePorFondo(onCerrar)
 *   <div className="fixed inset-0 ..." {...fondo}>
 */
export function useCierrePorFondo(onCerrar: () => void) {
  const empezoEnFondo = useRef(false)
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      empezoEnFondo.current = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const cerrar = empezoEnFondo.current && e.target === e.currentTarget
      empezoEnFondo.current = false
      if (cerrar) onCerrar()
    },
  }
}
