'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays } from 'lucide-react'
import Calendario from './Calendario'
import Flotante from './Flotante'
import Modal from './Modal'
import { useEsMobile } from '@/lib/hooks/useEsMobile'
import { aISO, atajosDeRango, desdeISO, etiquetaDeRango, nombreDeRango } from '@/lib/fechas'
import { formatearFecha } from '@/lib/formato'

/**
 * Selector de un período (desde–hasta) en un solo control: atajos a la izquierda
 * y dos meses para pintar el rango. Reemplaza al par de `<input type="date">`
 * sueltos, donde elegir "el mes pasado" eran dos campos y cuatro clics.
 *
 * Mientras el panel está abierto se trabaja sobre un borrador; el cambio sube
 * recién cuando el rango está completo, para no disparar una recarga de datos
 * con medio período elegido.
 */
export default function DateRangePicker({
  desde,
  hasta,
  onChange,
  max,
  placeholder = 'Todo el período',
  limpiable = true,
  atajos = true,
  className,
  ariaLabel = 'Período',
}: {
  desde: string
  hasta: string
  /** Se llama una sola vez, con el rango ya completo. */
  onChange: (desde: string, hasta: string) => void
  /** Tope superior en `YYYY-MM-DD` (normalmente hoy, para no ofrecer futuro). */
  max?: string
  placeholder?: string
  limpiable?: boolean
  /** Columna de atajos (Hoy, Últimos 7…). Se apaga donde la pantalla ya tiene
   *  sus propios chips de preset y el rango libre es el caso "personalizado". */
  atajos?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<DateRange | undefined>()
  const [clics, setClics] = useState(0)
  const esMobile = useEsMobile()
  const refBoton = useRef<HTMLButtonElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)

  const cerrar = useCallback(() => {
    setAbierto(false)
    refBoton.current?.focus({ preventScroll: true })
  }, [])

  function abrir() {
    setBorrador({ from: desdeISO(desde), to: desdeISO(hasta) })
    setClics(0)
    setAbierto(true)
  }

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

  function alSeleccionar(rango: DateRange | undefined) {
    setBorrador(rango)
    const n = clics + 1
    setClics(n)
    // El primer clic sólo fija el inicio; recién el segundo cierra el período.
    if (n >= 2 && rango?.from && rango?.to) {
      onChange(aISO(rango.from), aISO(rango.to))
      cerrar()
    }
  }

  function aplicarAtajo(d: string, h: string) {
    onChange(d, h)
    cerrar()
  }

  const nombre = nombreDeRango(desde, hasta)
  const etiqueta = nombre
    ?? (desde && hasta ? etiquetaDeRango(desde, hasta)
      : desde ? `Desde ${formatearFecha(desde)}`
      : hasta ? `Hasta ${formatearFecha(hasta)}`
      : null)

  const incompleto = clics === 1 && borrador?.from && !borrador?.to

  const cuerpo = (
    <div className={esMobile ? 'flex flex-col gap-3' : 'flex gap-3'}>
      {atajos && <div
        className={esMobile
          ? 'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1'
          : 'flex flex-col gap-1 w-40 shrink-0 border-r border-border pr-3'}
      >
        {atajosDeRango().map(a => {
          const activo = a.desde === desde && a.hasta === hasta
          return (
            <button
              key={a.etiqueta}
              type="button"
              onClick={() => aplicarAtajo(a.desde, a.hasta)}
              className={`shrink-0 whitespace-nowrap text-xs font-semibold rounded-lg transition-colors active:scale-95 duration-150 ${
                esMobile ? 'px-3 py-2 border' : 'text-left px-3 py-2'
              } ${activo
                ? 'bg-accent text-black border-accent'
                : `text-muted hover:text-text hover:bg-surface2 ${esMobile ? 'bg-surface2 border-border' : ''}`}`}
            >
              {a.etiqueta}
            </button>
          )
        })}
      </div>}

      <div className="flex flex-col items-center gap-2">
        <Calendario
          mode="range"
          selected={borrador}
          onSelect={alSeleccionar}
          numberOfMonths={esMobile ? 1 : 2}
          defaultMonth={desdeISO(desde) ?? desdeISO(max) ?? new Date()}
          endMonth={desdeISO(max)}
          disabled={desdeISO(max) ? { after: desdeISO(max)! } : undefined}
          autoFocus={!esMobile}
        />
        <div className="flex items-center gap-2 h-5">
          {incompleto && <p className="text-2xs text-muted">Ahora elegí el día de fin</p>}
          {limpiable && etiqueta && !incompleto && (
            <button
              type="button"
              onClick={() => { onChange('', ''); cerrar() }}
              className="text-xs text-muted hover:text-text transition-colors px-2 py-1 rounded-lg hover:bg-surface2"
            >
              Limpiar período
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={refBoton}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className={`${className ?? 'min-h-11 sm:min-h-9 bg-surface2 border border-border hover:border-muted text-sm rounded-xl px-3 py-2'} inline-flex items-center gap-2 transition-colors active:scale-[0.99] duration-150 ${abierto ? 'border-accent!' : ''}`}
      >
        <CalendarDays size={15} className="shrink-0 text-muted" aria-hidden />
        <span className={etiqueta ? 'text-text' : 'text-faint'}>{etiqueta ?? placeholder}</span>
      </button>

      {abierto && esMobile && (
        <Modal open onClose={() => setAbierto(false)} title={ariaLabel} size="md">
          {cuerpo}
        </Modal>
      )}

      {abierto && !esMobile && (
        <Flotante ancla={refBoton} refPanel={refPanel} ancho={atajos ? 720 : 560} altoMax={420}>
          <div className="bg-surface border border-border rounded-card shadow-modal p-3">{cuerpo}</div>
        </Flotante>
      )}
    </>
  )
}
