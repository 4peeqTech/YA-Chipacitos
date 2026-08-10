'use client'

import { useState, type ReactNode } from 'react'

interface Props {
  titulo: string
  subtitulo?: string
  badge?: ReactNode
  defaultOpen?: boolean
  icono?: string
  children: ReactNode
}

export default function Collapsible({ titulo, subtitulo, badge, defaultOpen = false, icono, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icono && <span className="text-base shrink-0">{icono}</span>}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#f0f0f0] truncate">{titulo}</p>
            {subtitulo && <p className="text-xs text-[#666] truncate">{subtitulo}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <span className={`text-xs text-[#666] transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}>▼</span>
        </div>
      </button>

      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}
