'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  accent?: 'gold' | 'red'
  children: React.ReactNode
}

export default function Modal({ open, onClose, title, accent = 'gold', children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const accentBorder = accent === 'red' ? 'border-t-red-500' : 'border-t-[#e8c547]'

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-[#111111] border border-[#2a2a2a] border-t-2 ${accentBorder} rounded-2xl w-full max-w-md p-6 space-y-4`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-[#f0f0f0]">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-[#666] hover:text-[#f0f0f0] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
