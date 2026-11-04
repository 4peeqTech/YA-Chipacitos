'use client'

import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconX, type Icon } from '@tabler/icons-react'

export interface OpcionFiltro { valor: string; texto: string }

interface Props {
  /** Nombre del filtro ("Zona"); se muestra cuando está en el valor por defecto. */
  nombre: string
  valor: string
  porDefecto: string
  opciones: OpcionFiltro[]
  onChange: (valor: string) => void
  icono?: Icon
  /** El período siempre muestra su valor (no tiene "todos"). */
  mostrarValor?: boolean
}

// Chip con menú: en el celular se abre como hoja desde abajo, en la compu
// como menú debajo del chip. Activo (distinto del valor por defecto) va en dorado.
export function ChipFiltro({ nombre, valor, porDefecto, opciones, onChange, icono: Icono, mostrarValor }: Props) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const activo = valor !== porDefecto
  const texto = opciones.find(o => o.valor === valor)?.texto ?? valor

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  return (
    <div ref={caja} className="relative">
      <div className={`inline-flex h-9 items-center rounded-full border text-xs font-semibold transition-colors ${
        activo || mostrarValor ? 'border-accent bg-accent text-black' : 'border-border bg-surface text-text hover:border-accent/60'
      }`}>
        <button type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="listbox" aria-expanded={abierto}
          className={`inline-flex h-full items-center gap-1.5 whitespace-nowrap pl-3 ${activo && !mostrarValor ? 'pr-1' : 'pr-3'}`}>
          {Icono && <Icono size={14} aria-hidden />}
          {activo || mostrarValor ? texto : nombre}
          {!(activo && !mostrarValor) && <IconChevronDown size={14} aria-hidden />}
        </button>
        {activo && !mostrarValor && (
          <button type="button" aria-label={`Quitar filtro ${nombre}`} onClick={() => onChange(porDefecto)}
            className="mr-1.5 rounded-full p-0.5 hover:bg-black/10"><IconX size={13} /></button>
        )}
      </div>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 sm:hidden" aria-hidden />
          <div role="listbox" aria-label={nombre}
            className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1.5 sm:min-w-[200px] sm:rounded-xl">
            <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted sm:hidden">{nombre}</p>
            {opciones.map(o => (
              <button key={o.valor} type="button" role="option" aria-selected={o.valor === valor}
                onClick={() => { onChange(o.valor); setAbierto(false) }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm sm:py-2 ${
                  o.valor === valor ? 'bg-accent-bg font-semibold text-accent' : 'text-text hover:bg-surface2'
                }`}>
                {o.texto}
                {o.valor === valor && <IconCheck size={16} aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export const OPCIONES_NIVEL: OpcionFiltro[] = [
  { valor: 'todos', texto: 'Todos los niveles' },
  { valor: 'alto', texto: 'Verde (85 % o más)' },
  { valor: 'medio', texto: 'Amarillo (65 a 84 %)' },
  { valor: 'bajo', texto: 'Rojo (menos de 65 %)' },
]
