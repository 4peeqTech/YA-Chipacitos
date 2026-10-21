'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cantidadATexto as aTexto, parseCantidad } from '../cantidad'

// − / número / +. Acepta decimales con coma o punto (1,5 o 1.5). Si se borra
// el número y se sale del campo, vuelve al valor anterior; para sacar el
// producto está el −, o escribir 0.

interface Props {
  valor: number
  onCambiar: (cantidad: number) => void
  etiqueta: string
  /** Sin cantidad muestra el botón "Agregar" en lugar del control. */
  conBotonAgregar?: boolean
  tamano?: 'md' | 'sm'
}

export default function ControlCantidad({ valor, onCambiar, etiqueta, conBotonAgregar = true, tamano = 'md' }: Props) {
  // null = no se está editando: se muestra el valor del carrito.
  const [texto, setTexto] = useState<string | null>(null)
  const boton = tamano === 'md' ? 'h-10 w-10' : 'h-8 w-8'
  const campo = tamano === 'md' ? 'h-10 w-14 text-base' : 'h-8 w-12 text-sm'

  if (conBotonAgregar && valor <= 0 && texto == null) {
    return (
      <button
        type="button"
        onClick={() => onCambiar(1)}
        aria-label={`Agregar ${etiqueta}`}
        className={`${tamano === 'md' ? 'h-10' : 'h-8'} inline-flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent-bg px-3 text-sm font-semibold text-accent active:opacity-70`}
      >
        <Plus size={16} aria-hidden />
        Agregar
      </button>
    )
  }

  function confirmarTexto() {
    if (texto == null) return
    const n = parseCantidad(texto)
    if (n != null) onCambiar(n)
    setTexto(null)
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onCambiar(Math.max(0, Math.round((valor - 1) * 1000) / 1000))}
        aria-label={`Restar ${etiqueta}`}
        className={`${boton} inline-flex items-center justify-center rounded-xl border border-border bg-surface2 text-text active:opacity-70`}
      >
        <Minus size={16} aria-hidden />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Cantidad de ${etiqueta}`}
        value={texto ?? aTexto(valor)}
        onFocus={e => { setTexto(aTexto(valor)); e.currentTarget.select() }}
        onChange={e => setTexto(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={confirmarTexto}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${campo} rounded-xl border border-border bg-bg px-1 text-center font-semibold tabular-nums text-accent focus:border-accent focus:outline-none`}
      />
      <button
        type="button"
        onClick={() => onCambiar(Math.round((valor + 1) * 1000) / 1000)}
        aria-label={`Sumar ${etiqueta}`}
        className={`${boton} inline-flex items-center justify-center rounded-xl border border-border bg-surface2 text-text active:opacity-70`}
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  )
}
