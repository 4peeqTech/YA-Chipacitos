'use client'

import { useState, type KeyboardEvent } from 'react'
import { parseDecimal } from '@/lib/numeros'
import { controlClass } from './Field'

export const inputNumeroClass = controlClass

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
  /** Nombre accesible cuando no hay un <label> asociado (ej. celdas de una tabla editable). */
  ariaLabel?: string
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

/**
 * Input numérico tolerante a coma decimal. Nunca usar type="number": el
 * browser descarta un valor con coma antes de que llegue al JS.
 */
export default function InputNumero({ value, onChange, placeholder, className, disabled, min, enteros, autoFocus, ariaLabel, onKeyDown }: Props) {
  const [raw, setRaw] = useState(value == null ? '' : String(value).replace('.', ','))
  const [focused, setFocused] = useState(false)

  // Sin foco se muestra lo tipeado si todavía representa el valor (conserva "1,50");
  // si el valor cambió desde afuera, se muestra el valor nuevo. Derivado en el render,
  // sin effect que sincronice estado.
  const formateado = value == null ? '' : String(value).replace('.', ',')
  const mostrado = focused || parseDecimal(raw) === value ? raw : formateado

  return (
    <input
      type="text"
      inputMode={enteros ? 'numeric' : 'decimal'}
      value={mostrado}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onFocus={() => { if (mostrado !== raw) setRaw(mostrado); setFocused(true) }}
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
