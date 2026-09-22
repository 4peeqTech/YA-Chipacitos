import type { ReactNode } from 'react'
import type { Tono } from '@/lib/estados'

const TONO_ICONO: Record<Tono, string> = {
  neutro: 'text-accent bg-accent-bg',
  exito: 'text-success bg-green-bg',
  alerta: 'text-warning bg-warning-bg',
  peligro: 'text-brand-red bg-danger-bg',
  info: 'text-info bg-info-bg',
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
