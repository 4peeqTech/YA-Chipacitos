'use client'

import { useEffect } from 'react'
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

const MAX_WIDTH: Record<NonNullable<Props['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
}

export default function Modal({ open, onClose, title, accent = 'gold', size = 'md', pantallaCompletaMobile = false, encabezado, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const accentBorder = accent === 'red' ? 'border-t-red-500' : 'border-t-accent'

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 ${pantallaCompletaMobile ? 'p-0 sm:p-4' : 'p-4'}`}
      onClick={onClose}
    >
      <div
        className={`bg-surface border border-border border-t-2 ${accentBorder} w-full ${MAX_WIDTH[size]} overflow-y-auto ${pantallaCompletaMobile ? 'h-dvh sm:h-auto max-h-dvh sm:max-h-[calc(100vh-2rem)] rounded-none sm:rounded-2xl p-4' : 'max-h-[calc(100vh-2rem)] rounded-2xl p-6'} sm:p-6 overflow-x-hidden space-y-4 shadow-modal`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-text">{encabezado ?? title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-faint hover:text-text w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface2 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
