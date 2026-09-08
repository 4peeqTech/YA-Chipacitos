'use client'

export default function DateRangeInputs({
  desde,
  hasta,
  onChangeDesde,
  onChangeHasta,
  className = '',
}: {
  desde: string
  hasta: string
  onChangeDesde: (value: string) => void
  onChangeHasta: (value: string) => void
  className?: string
}) {
  const inputClass = "bg-surface2 border border-border text-text rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors [color-scheme:dark]"

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input type="date" value={desde} onChange={e => onChangeDesde(e.target.value)} max={hasta || undefined} className={inputClass} aria-label="Desde" />
      <span className="text-muted text-sm">a</span>
      <input type="date" value={hasta} onChange={e => onChangeHasta(e.target.value)} min={desde || undefined} className={inputClass} aria-label="Hasta" />
    </div>
  )
}
