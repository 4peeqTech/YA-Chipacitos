'use client'

import { CheckCircle2, TriangleAlert, XCircle, Target } from 'lucide-react'
import Card from '@/components/ui/Card'
import type { CumplimientoSemana } from '@/lib/fabrica/reportes'

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

function formatSemana(desde: string, hasta: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const d = new Date(desde + 'T00:00:00').toLocaleDateString('es-AR', opts)
  const h = new Date(hasta + 'T00:00:00').toLocaleDateString('es-AR', opts)
  return `${d} al ${h}`
}

function formatMasas(n: number) {
  return `${n} ${n === 1 ? 'masa' : 'masas'}`
}

function estadoCumplimiento(pct: number | null) {
  if (pct == null) return { label: 'Sin proyección', tone: 'text-[#666]', Icon: Target }
  if (pct >= 90) return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-[#56d68a]', Icon: CheckCircle2 }
  if (pct >= 70) return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-amber-400', Icon: TriangleAlert }
  return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-red-400', Icon: XCircle }
}

function Fila({
  titulo, proyeccion, real, pct, proyectadoLabel,
}: { titulo: string; proyeccion: string; real: string; pct: number | null; proyectadoLabel: string }) {
  const estado = estadoCumplimiento(pct)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#888]">{titulo}</p>
        <p className={`flex items-center gap-1 text-xs font-semibold ${estado.tone}`}>
          <estado.Icon size={12} /> {estado.label}
        </p>
      </div>
      <p className="text-sm text-[#f0f0f0]">
        <span className="font-semibold">{real}</span>
        <span className="text-[#666]"> de {proyeccion} {proyectadoLabel}</span>
      </p>
    </div>
  )
}

export default function CumplimientoProyeccion({ semanas }: { semanas: CumplimientoSemana[] }) {
  if (semanas.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[#888]">Todavía no hay conteos cerrados en el período elegido.</p>
      </Card>
    )
  }

  return (
    <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
      {semanas.map(s => (
        <div key={s.conteoId} className="px-4 py-3 space-y-3">
          <p className="text-sm text-[#f0f0f0] font-medium">Semana {formatSemana(s.semanaDesde, s.semanaHasta)}</p>
          <Fila
            titulo="Masa"
            proyeccion={formatMasas(s.masasProyectadas)}
            real={formatMasas(s.masasReales)}
            pct={s.cumplimientoMasaPct}
            proyectadoLabel="proyectadas"
          />
          <Fila
            titulo="Embolsado"
            proyeccion={formatKg(s.proyeccionEmbolsadoKg)}
            real={formatKg(s.embolsadoRealKg)}
            pct={s.cumplimientoEmbolsadoPct}
            proyectadoLabel="proyectados"
          />
        </div>
      ))}
    </Card>
  )
}
