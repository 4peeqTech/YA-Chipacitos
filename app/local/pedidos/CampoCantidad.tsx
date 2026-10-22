'use client'

import { useState } from 'react'
import { cantidadATexto, parseCantidad } from '../cantidad'

// Cantidad que se escribe directo (Opción A): con un número > 0 el producto
// entra al pedido; con 0 o vacío sale. Decimales con coma o punto (1,5 o
// 1.5), siempre como decimales. Los atajos +5 / +10 / +25 suman.

export const ATAJOS = [5, 10, 25] as const

interface Props {
  valor: number
  onCambiar: (cantidad: number) => void
  etiqueta: string
  unidad?: string
  /** 'lg' en Tus habituales; 'md' en la lista y el carrito. */
  tamano?: 'lg' | 'md'
  conAtajos?: boolean
}

function redondear(n: number) {
  return Math.round(n * 1000) / 1000
}

export default function CampoCantidad({ valor, onCambiar, etiqueta, unidad, tamano = 'md', conAtajos = true }: Props) {
  // null = no se está editando: se muestra el valor del carrito.
  const [texto, setTexto] = useState<string | null>(null)
  const mostrado = texto ?? (valor > 0 ? cantidadATexto(valor) : '')
  const invalido = texto != null && texto.trim() !== '' && parseCantidad(texto) == null

  function escribir(v: string) {
    const limpio = v.replace(/[^\d.,]/g, '')
    setTexto(limpio)
    if (limpio.trim() === '') return onCambiar(0)
    const n = parseCantidad(limpio)
    if (n != null) onCambiar(n)
  }

  const campo = tamano === 'lg' ? 'h-11 w-24 text-lg' : 'h-10 w-20 text-base'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Cantidad de ${etiqueta}${unidad ? ` (${unidad})` : ''}`}
        aria-invalid={invalido || undefined}
        placeholder="0"
        value={mostrado}
        onFocus={e => { setTexto(mostrado); e.currentTarget.select() }}
        onChange={e => escribir(e.target.value)}
        onBlur={() => setTexto(null)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${campo} shrink-0 rounded-xl border px-2 text-center font-semibold tabular-nums focus:outline-none ${
          invalido ? 'border-brand-red text-brand-red' : valor > 0 ? 'border-accent bg-accent-bg text-accent' : 'border-border bg-bg text-text focus:border-accent'
        }`}
      />
      {conAtajos && ATAJOS.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => onCambiar(redondear(valor + k))}
          aria-label={`Sumar ${k} a ${etiqueta}`}
          className="h-10 min-w-10 shrink-0 rounded-xl border border-border bg-surface2 px-2 text-xs font-semibold tabular-nums text-muted hover:border-accent/50 hover:text-text active:opacity-70"
        >
          +{k}
        </button>
      ))}
    </div>
  )
}
