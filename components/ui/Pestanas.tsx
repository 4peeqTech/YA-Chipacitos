'use client'

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface Pestana {
  id: string
  label: string
  icon?: ReactNode
  contador?: number
}

/**
 * Pestañas de estado (no de ruta: para eso está Tabs). Quien la usa pone el
 * panel, con `{...panelDe(idBase, id)}` y el mismo `idBase`.
 */
export default function Pestanas({
  items,
  activa,
  onCambiar,
  etiqueta,
  idBase,
}: {
  items: Pestana[]
  activa: string
  onCambiar: (id: string) => void
  /** aria-label del tablist. */
  etiqueta: string
  /** Prefijo de los ids de pestaña y panel (default: uno generado). */
  idBase?: string
}) {
  const generado = useId()
  const base = idBase ?? generado
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const destino = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : paso ? (i + paso + items.length) % items.length : -1
    if (destino < 0) return
    e.preventDefault()
    onCambiar(items[destino].id)
    refs.current[destino]?.focus()
  }

  return (
    <div role="tablist" aria-label={etiqueta} className="flex flex-wrap items-center gap-2">
      {items.map((item, i) => {
        const sel = item.id === activa
        return (
          <button
            key={item.id}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-selected={sel}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={sel ? 0 : -1}
            onClick={() => onCambiar(item.id)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              sel ? 'bg-accent text-black' : 'bg-surface2 text-muted hover:text-text hover:bg-border'
            }`}
          >
            {item.icon}
            {item.label}
            {item.contador != null && (
              <span className={`ml-0.5 tabular-nums text-xs ${sel ? 'text-black/70' : 'text-faint'}`}>({item.contador})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Props de accesibilidad del panel de una pestaña. */
export function panelDe(idBase: string, id: string) {
  return { role: 'tabpanel' as const, id: `${idBase}-panel-${id}`, 'aria-labelledby': `${idBase}-tab-${id}` }
}
