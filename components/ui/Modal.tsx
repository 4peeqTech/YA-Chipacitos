'use client'

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** Reemplaza al texto del título en pantalla (ej. un código en mono); `title` sigue siendo el nombre accesible. */
  encabezado?: React.ReactNode
  accent?: 'gold' | 'red'
  /** Ancho máximo del modal. 'lg'/'xl' para formularios con varios campos, '2xl' para layouts de dos columnas. */
  size?: 'md' | 'lg' | 'xl' | '2xl'
  /** En celular ocupa toda la pantalla (detalles largos con varias secciones). */
  pantallaCompletaMobile?: boolean
  children: React.ReactNode
}

// Modales abiertos, en orden: solo el de arriba responde al Escape (antes un
// confirm encima de otro modal cerraba los dos).
const pila: string[] = []

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const MAX_WIDTH: Record<NonNullable<Props['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
}

export default function Modal({ open, onClose, title, accent = 'gold', size = 'md', pantallaCompletaMobile = false, encabezado, children }: Props) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    pila.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pila[pila.length - 1] === id) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = pila.lastIndexOf(id)
      if (i >= 0) pila.splice(i, 1)
    }
  }, [open, onClose, id])

  // Al abrir, el foco entra al modal (al contenedor, para no abrir el teclado del
  // celular sobre un input); al cerrar vuelve a donde estaba.
  useEffect(() => {
    if (!open) return
    const previo = document.activeElement as HTMLElement | null
    const dialogo = ref.current
    if (dialogo && !dialogo.contains(document.activeElement)) {
      const auto = dialogo.querySelector<HTMLElement>('[autofocus]')
      ;(auto ?? dialogo).focus({ preventScroll: true })
    }
    return () => { if (previo && document.contains(previo)) previo.focus({ preventScroll: true }) }
  }, [open])

  // Tab y Shift+Tab quedan dentro del modal.
  function atraparFoco(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLES)].filter(el => el.offsetParent !== null || el === document.activeElement)
    if (items.length === 0) { e.preventDefault(); return }
    const primero = items[0]
    const ultimo = items[items.length - 1]
    const activo = document.activeElement
    if (e.shiftKey && (activo === primero || activo === ref.current)) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus() }
  }

  if (!open) return null

  const accentBorder = accent === 'red' ? 'border-t-red-500' : 'border-t-accent'

  return (
    <div
      className={`modal-fondo fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 ${pantallaCompletaMobile ? 'p-0 sm:p-4' : 'p-4'}`}
      onClick={onClose}
    >
      <div
        className={`modal-caja bg-surface border border-border border-t-2 ${accentBorder} w-full ${MAX_WIDTH[size]} overflow-y-auto ${pantallaCompletaMobile ? 'h-dvh sm:h-auto max-h-dvh sm:max-h-[calc(100vh-2rem)] rounded-none sm:rounded-2xl p-4' : 'max-h-[calc(100vh-2rem)] rounded-2xl p-6'} sm:p-6 overflow-x-hidden space-y-4 shadow-modal outline-none`}
        ref={ref}
        tabIndex={-1}
        onKeyDown={atraparFoco}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-text">{encabezado ?? title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="-mr-2 shrink-0 text-muted hover:text-text size-11 flex items-center justify-center rounded-xl hover:bg-surface2 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
