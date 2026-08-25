'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { parseDecimal } from '@/lib/numeros'

export const inputNumeroClass =
  "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  min?: number
  /** Rechaza el separador decimal — para cantidades que solo admiten enteros. */
  enteros?: boolean
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

/**
 * Input numérico tolerante a coma decimal. Nunca usar type="number": el
 * browser descarta un valor con coma antes de que llegue al JS.
 */
export default function InputNumero({ value, onChange, placeholder, className, disabled, min, enteros, autoFocus, onKeyDown }: Props) {
  const [raw, setRaw] = useState(value == null ? '' : String(value).replace('.', ','))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    const parsed = parseDecimal(raw)
    if (value !== parsed) {
      setRaw(value == null ? '' : String(value).replace('.', ','))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      type="text"
      inputMode={enteros ? 'numeric' : 'decimal'}
      value={raw}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={className ?? inputNumeroClass}
      onChange={e => {
        let next = e.target.value
        if (enteros) next = next.replace(/[.,]/g, '')
        setRaw(next)
        const parsed = parseDecimal(next)
        if (parsed !== null && min !== undefined && parsed < min) return
        onChange(parsed)
      }}
    />
  )
}
