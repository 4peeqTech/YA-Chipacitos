'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'

export interface ItemMenu { label: string; icono: LucideIcon; onClick: () => void; peligro?: boolean }

/** "Más acciones": el menú de lo secundario del pedido (y de cada devolución, B4). */
export default function MenuSecundario({ items, etiqueta = 'Más acciones', compacto = false }: { items: ItemMenu[]; etiqueta?: string; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape, true)
    }
  }, [abierto])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={compacto ? etiqueta : undefined}
        className={`presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:bg-surface2 ${compacto ? 'min-w-11 justify-center px-2' : 'px-3'}`}
      >
        <MoreHorizontal size={16} /> {!compacto && etiqueta}
      </button>
      {abierto && (
        <div role="menu" className={`popover-entrada absolute ${compacto ? 'right-0 origin-top-right' : 'left-0'} z-10 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-modal`}>
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setAbierto(false); it.onClick() }}
              className={`flex w-full min-h-11 items-center gap-2.5 px-3.5 text-left text-sm transition-colors hover:bg-surface2 ${it.peligro ? 'text-brand-red' : 'text-text'}`}
            >
              <it.icono size={15} className={it.peligro ? '' : 'text-muted'} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
