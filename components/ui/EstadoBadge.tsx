import { ESTADOS, type Dominio, type Tono } from '@/lib/estados'
import { IconoRenderer } from './IconoPicker'

const TONO_CLASS: Record<Tono, string> = {
  neutro: 'text-muted bg-surface2',
  exito: 'text-success bg-green-bg',
  alerta: 'text-warning bg-warning-bg',
  peligro: 'text-brand-red bg-danger-bg',
  info: 'text-info bg-info-bg',
}

export default function EstadoBadge<D extends Dominio>({
  dominio,
  estado,
}: {
  dominio: D
  estado: keyof (typeof ESTADOS)[D] & string
}) {
  const def = (ESTADOS[dominio] as Record<string, { label: string; tono: Tono; icono?: string }>)[estado]
  if (!def) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${TONO_CLASS[def.tono]}`}>
      {def.icono && <IconoRenderer nombre={def.icono} size={11} />}
      {def.label}
    </span>
  )
}
