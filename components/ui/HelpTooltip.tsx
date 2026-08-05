'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

const WIDTH = 224
const MARGIN = 8

export default function HelpTooltip({ text }: { text: string }) {
  const iconRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function mostrar() {
    const rect = iconRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.min(Math.max(rect.left + rect.width / 2 - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN)
    setPos({ top: rect.top - MARGIN, left })
  }

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={mostrar}
        onMouseLeave={() => setPos(null)}
        className="inline-flex items-center align-middle ml-1.5"
      >
        <HelpCircle size={13} className="text-[#666] hover:text-[#e8c547] cursor-help transition-colors" />
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="fixed z-[70] -translate-y-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-xs font-normal normal-case tracking-normal text-[#ccc] leading-snug shadow-lg pointer-events-none"
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
