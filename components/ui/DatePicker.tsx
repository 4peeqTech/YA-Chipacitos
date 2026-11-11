'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Matcher } from 'react-day-picker'
import { CalendarDays } from 'lucide-react'
import Calendario from './Calendario'
import Flotante from './Flotante'
import Modal from './Modal'
import { controlClass } from './Field'
import { useEsMobile } from '@/lib/hooks/useEsMobile'
import { aISO, desdeISO, hoyISO, sumarDias } from '@/lib/fechas'
import { formatearFecha } from '@/lib/formato'

/** Arma los matchers de dias deshabilitados, salteando los limites no definidos. */
function matchersDeLimite(antes?: Date, despues?: Date): Matcher[] {
  const m: Matcher[] = []
  if (antes) m.push({ before: antes })
  if (despues) m.push({ after: despues })
  return m
}

/**
 * Selector de una fecha. Reemplaza al `<input type="date">` nativo, que no se
 * podía estilar y se veía distinto en cada navegador.
 *
 * - Escritorio: popover pegado al campo (Flotante).
 * - Celular: hoja inferior (Modal, que ya entra desde abajo por debajo de `sm`).
 *
 * El valor entra y sale como `YYYY-MM-DD` (lo que guarda Supabase), así que es
 * intercambiable con el input nativo sin tocar el estado de quien lo usa.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Elegí una fecha',
  disabled = false,
  limpiable = false,
  atajos = true,
  className,
  id,
  ariaLabel,
}: {
  value: string
  onChange: (fecha: string) => void
  /** Mínimo / máximo en `YYYY-MM-DD`; los días fuera quedan deshabilitados. */
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  /** Muestra una X para vaciar el campo (filtros opcionales). */
  limpiable?: boolean
  /** Atajos Hoy / Ayer al pie del panel. */
  atajos?: boolean
  className?: string
  id?: string
  ariaLabel?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const esMobile = useEsMobile()
  const refBoton = useRef<HTMLButtonElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)

  const cerrar = useCallback(() => {
    setAbierto(false)
    refBoton.current?.focus({ preventScroll: true })
  }, [])

  // Clic afuera y Escape. En celular el Modal ya se encarga de los dos.
  useEffect(() => {
    if (!abierto || esMobile) return
    function alApuntar(e: PointerEvent) {
      const t = e.target as Node
      if (refPanel.current?.contains(t) || refBoton.current?.contains(t)) return
      setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar() }
    }
    document.addEventListener('pointerdown', alApuntar, true)
    document.addEventListener('keydown', alTeclear, true)
    return () => {
      document.removeEventListener('pointerdown', alApuntar, true)
      document.removeEventListener('keydown', alTeclear, true)
    }
  }, [abierto, esMobile, cerrar])

  const seleccionada = desdeISO(value)
  const limite = { before: desdeISO(min), after: desdeISO(max) }

  function elegir(d: Date | undefined) {
    if (!d) return
    onChange(aISO(d))
    cerrar()
  }

  function aplicarAtajo(fecha: string) {
    if ((min && fecha < min) || (max && fecha > max)) return
    onChange(fecha)
    cerrar()
  }

  const hoy = hoyISO()
  const ayer = sumarDias(hoy, -1)

  const calendario = (
    <>
      <Calendario
        mode="single"
        selected={seleccionada}
        onSelect={elegir}
        defaultMonth={seleccionada ?? desdeISO(max) ?? new Date()}
        startMonth={desdeISO(min)}
        endMonth={desdeISO(max)}
        disabled={matchersDeLimite(limite.before, limite.after)}
        autoFocus={!esMobile}
      />
      {(atajos || limpiable) && (
        <div className="flex items-center gap-2 border-t border-border pt-3 mt-1">
          {atajos && (
            <>
              <BotonAtajo onClick={() => aplicarAtajo(hoy)} activo={value === hoy}>Hoy</BotonAtajo>
              <BotonAtajo onClick={() => aplicarAtajo(ayer)} activo={value === ayer}>Ayer</BotonAtajo>
            </>
          )}
          {limpiable && value && (
            <button
              type="button"
              onClick={() => { onChange(''); cerrar() }}
              className="ml-auto text-xs text-muted hover:text-text transition-colors px-2 py-1.5 rounded-lg hover:bg-surface2"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </>
  )

  return (
    <>
      <button
        ref={refBoton}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(a => !a)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className={`${className ?? controlClass} inline-flex items-center gap-2 text-left ${abierto ? 'border-accent!' : ''} ${disabled ? '' : 'active:scale-[0.99] transition-transform duration-150'}`}
      >
        <CalendarDays size={15} className="shrink-0 text-muted" aria-hidden />
        <span className={value ? 'text-text' : 'text-faint'}>
          {value ? formatearFecha(value) : placeholder}
        </span>
      </button>

      {abierto && esMobile && (
        <Modal open onClose={() => setAbierto(false)} title={ariaLabel || 'Elegí la fecha'} size="md">
          <div className="flex flex-col items-center gap-3">{calendario}</div>
        </Modal>
      )}

      {abierto && !esMobile && (
        <Flotante ancla={refBoton} refPanel={refPanel} ancho={320} altoMax={400}>
          <div className="bg-surface border border-border rounded-card shadow-modal p-3 flex flex-col items-center gap-1">
            {calendario}
          </div>
        </Flotante>
      )}
    </>
  )
}

function BotonAtajo({ onClick, activo, children }: { onClick: () => void; activo: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors active:scale-95 duration-150 ${
        activo ? 'bg-accent text-black border-accent' : 'bg-surface2 text-muted border-border hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
