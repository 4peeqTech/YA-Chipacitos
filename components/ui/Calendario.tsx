'use client'

import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * La grilla del calendario. Envuelve a react-day-picker vestido con los tokens
 * de la app: no importamos su hoja de estilos, todo sale de `classNames`, así no
 * quedan dos sistemas de color peleando.
 *
 * No se usa suelto: lo montan DatePicker y DateRangePicker dentro de un popover
 * (escritorio) o de una hoja inferior (celular).
 */

/** Clases comunes a los dos modos. Las de selección van aparte: en rango, `selected`
 *  también cae sobre los días del medio y pelearía con `range_middle`. */
const base = {
  root: 'relative w-fit select-none text-text',
  months: 'flex flex-col sm:flex-row gap-5',
  month: 'flex flex-col gap-2',
  month_caption: 'flex items-center justify-center h-9',
  caption_label: 'text-sm font-semibold text-text first-letter:uppercase',

  nav: 'absolute top-0 inset-x-0 flex items-center justify-between h-9 pointer-events-none',
  button_previous:
    'pointer-events-auto size-9 inline-flex items-center justify-center rounded-xl text-muted ' +
    'hover:text-text hover:bg-surface2 transition-[color,background-color,transform] duration-150 ' +
    'active:scale-95 disabled:opacity-25 disabled:pointer-events-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  button_next:
    'pointer-events-auto size-9 inline-flex items-center justify-center rounded-xl text-muted ' +
    'hover:text-text hover:bg-surface2 transition-[color,background-color,transform] duration-150 ' +
    'active:scale-95 disabled:opacity-25 disabled:pointer-events-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',

  month_grid: 'border-collapse',
  weekdays: 'flex',
  weekday: 'w-10 sm:w-9 text-3xs font-semibold text-muted uppercase tracking-wider',
  week: 'flex w-full mt-1',

  day: 'size-10 sm:size-9 p-0 text-center',
  day_button:
    'size-10 sm:size-9 inline-flex items-center justify-center rounded-xl text-sm text-text ' +
    'hover:bg-surface2 transition-[background-color,color,transform] duration-150 active:scale-95 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0',

  today: '[&>button]:font-bold [&>button]:text-accent-fg',
  outside: '[&>button]:text-disabled',
  disabled: '[&>button]:text-disabled [&>button]:opacity-50 [&>button]:pointer-events-none',
  hidden: 'invisible',
}

const clasesUnica = {
  ...base,
  selected: '[&>button]:bg-accent [&>button]:text-black [&>button]:font-semibold [&>button]:hover:bg-accent',
}

const clasesRango = {
  ...base,
  // El tinte del tramo vive en el <td> y los extremos redondean sólo su lado, así
  // la barra del rango se lee continua aunque cada día sea una celda suelta.
  range_middle: 'bg-accent-bg [&>button]:rounded-none [&>button]:hover:bg-accent/25',
  range_start: 'bg-accent-bg rounded-l-xl [&>button]:bg-accent [&>button]:text-black [&>button]:font-semibold [&>button]:hover:bg-accent',
  range_end: 'bg-accent-bg rounded-r-xl [&>button]:bg-accent [&>button]:text-black [&>button]:font-semibold [&>button]:hover:bg-accent',
}

/** L M M J V S D — dos letras en español se repiten (mié/mar), la posición desambigua. */
const INICIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export default function Calendario(props: DayPickerProps) {
  const esRango = props.mode === 'range'
  return (
    <DayPicker
      locale={es}
      // En rango: con un periodo ya elegido, el clic siguiente arranca uno nuevo
      // en vez de estirar el anterior (si no, el primer clic da un rango completo
      // y no se entiende que paso).
      {...(esRango ? { resetOnSelect: true } : {})}
      weekStartsOn={1}
      showOutsideDays
      classNames={esRango ? clasesRango : clasesUnica}
      formatters={{ formatWeekdayName: d => INICIALES[d.getDay()] }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? <ChevronLeft size={18} {...rest} /> : <ChevronRight size={18} {...rest} />,
      }}
      {...props}
    />
  )
}
