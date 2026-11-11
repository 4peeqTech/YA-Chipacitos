'use client'

import type { ReactNode } from 'react'

const base = 'min-h-11 sm:min-h-9 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap presionable border disabled:opacity-40'

export function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${active ? 'bg-accent text-black border-accent' : 'bg-surface2 text-muted border-border hover:text-text'}`}
    >
      {children}
    </button>
  )
}

export function ChipGroup<T extends string>({
  opciones,
  value,
  onChange,
}: {
  opciones: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(o => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Chip>
      ))}
    </div>
  )
}

/** Toggle de pocas opciones excluyentes en una sola pill contenedora — a diferencia
 * de ChipGroup (chips sueltos), pensado para 2-3 opciones tipo "vista"/"modo". */
export function SegmentedControl<T extends string>({
  opciones,
  value,
  onChange,
}: {
  opciones: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface2 p-1 gap-1">
      {opciones.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-11 sm:min-h-8 px-3 py-1.5 rounded-lg text-xs font-medium presionable ${
            value === o.value ? 'bg-accent text-black' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
