'use client'

import DateRangePicker from './DateRangePicker'

/**
 * Filtro de período. Mantiene la firma del par de inputs nativos que había antes
 * (dos callbacks sueltos) para no tocar el estado de quien ya lo usaba, pero por
 * dentro es un solo control con atajos y calendario de dos meses.
 *
 * En código nuevo conviene ir directo a DateRangePicker, que avisa el rango
 * completo de una sola vez.
 */
export default function DateRangeInputs({
  desde,
  hasta,
  onChangeDesde,
  onChangeHasta,
  className = '',
  max,
  ariaLabel,
}: {
  desde: string
  hasta: string
  onChangeDesde: (value: string) => void
  onChangeHasta: (value: string) => void
  className?: string
  max?: string
  ariaLabel?: string
}) {
  return (
    <div className={`flex items-center ${className}`}>
      <DateRangePicker
        desde={desde}
        hasta={hasta}
        max={max}
        ariaLabel={ariaLabel}
        onChange={(d, h) => { onChangeDesde(d); onChangeHasta(h) }}
      />
    </div>
  )
}
