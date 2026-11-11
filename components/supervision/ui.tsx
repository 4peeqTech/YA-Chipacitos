import { IconEqual, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { nivelCumplimiento, textoPct } from '@/lib/supervision/calculos'
import { COLOR_NIVEL } from '@/lib/supervision/formato'
import { PRIORIDADES_REQ, type PrioridadRequerimiento } from '@/lib/supervision/tipos'

export function Porcentaje({ pct, className = '' }: { pct: number | null | undefined; className?: string }) {
  const nivel = nivelCumplimiento(pct)
  return (
    <span className={`font-['Syne'] font-bold tabular-nums ${nivel ? COLOR_NIVEL[nivel].texto : 'text-faint'} ${className}`}>
      {textoPct(pct)}
    </span>
  )
}

export function BarraCumplimiento({ titulo, pct }: { titulo: string; pct: number | null }) {
  const nivel = nivelCumplimiento(pct)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 text-text">{titulo}</span>
        <Porcentaje pct={pct} className="shrink-0 text-sm" />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full ${nivel ? COLOR_NIVEL[nivel].fondo : ''}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )
}

/** Diferencia en puntos contra la visita anterior: ↑ verde, ↓ rojo, = gris. */
export function Tendencia({ dif, className = '' }: { dif: number | null; className?: string }) {
  if (dif == null) return null
  const Icono = dif > 0 ? IconTrendingUp : dif < 0 ? IconTrendingDown : IconEqual
  const color = dif > 0 ? 'text-success' : dif < 0 ? 'text-brand-red' : 'text-muted'
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${color} ${className}`}
      title="Diferencia con la visita anterior de la sucursal">
      <Icono size={14} aria-hidden />{dif > 0 ? `+${dif}` : dif < 0 ? `−${-dif}` : '='}
      <span className="sr-only"> puntos contra la visita anterior</span>
    </span>
  )
}

export function ChipEnCurso() {
  return (
    <span className="shrink-0 rounded-full bg-accent-bg px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-accent">
      En curso
    </span>
  )
}

export function Tarjeta({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="font-['Syne'] text-base font-bold text-text">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-xs text-muted">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

/** Clave del respaldo en el celular de la visita que se está completando. */
export const CLAVE_BORRADOR = 'supervision:borrador'
export const CLAVE_SUPERVISOR = 'supervision:supervisor'

export const textoDe = <T extends string>(opciones: { valor: T; texto: string }[], v: T) => opciones.find(o => o.valor === v)?.texto ?? v

const COLOR_PRIORIDAD: Record<PrioridadRequerimiento, string> = {
  urgente: 'bg-danger-bg text-brand-red',
  no_urgente: 'bg-accent-bg text-accent',
  cuando_se_pueda: 'bg-surface2 text-muted',
  reunion: 'bg-surface2 text-text',
}

export function ChipPrioridad({ prioridad }: { prioridad: PrioridadRequerimiento }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${COLOR_PRIORIDAD[prioridad]}`}>
      {textoDe(PRIORIDADES_REQ, prioridad)}
    </span>
  )
}
