import type { ReactNode } from 'react'

type Tono = 'neutro' | 'exito' | 'alerta' | 'peligro'

const TONO_ICONO: Record<Tono, string> = {
  neutro: 'text-accent bg-accent/10',
  exito: 'text-[#56d68a] bg-[#56d68a]/10',
  alerta: 'text-[#f0a030] bg-[#f0a030]/10',
  peligro: 'text-red-400 bg-red-400/10',
}

export default function KpiCard({
  icon,
  label,
  value,
  detalle,
  tono = 'neutro',
}: {
  icon: ReactNode
  label: string
  value: string
  detalle?: string
  tono?: Tono
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONO_ICONO[tono]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted text-xs uppercase tracking-wider truncate">{label}</p>
        <p className="text-text text-xl font-bold font-['Syne'] leading-tight">{value}</p>
        {detalle && <p className="text-muted text-xs mt-0.5 truncate">{detalle}</p>}
      </div>
    </div>
  )
}
