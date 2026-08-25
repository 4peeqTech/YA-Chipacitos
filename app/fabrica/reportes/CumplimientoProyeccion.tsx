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

function estadoCumplimiento(pct: number | null) {
  if (pct == null) return { label: 'Sin proyección', tone: 'text-[#666]', Icon: Target }
  if (pct >= 90) return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-[#56d68a]', Icon: CheckCircle2 }
  if (pct >= 70) return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-amber-400', Icon: TriangleAlert }
  return { label: `${pct.toFixed(0)}% cumplido`, tone: 'text-red-400', Icon: XCircle }
}

function Fila({ titulo, proyeccion, real, pct }: { titulo: string; proyeccion: number; real: number; pct: number | null }) {
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
        <span className="font-semibold">{formatKg(real)}</span>
        <span className="text-[#666]"> de {formatKg(proyeccion)} proyectados</span>
      </p>
    </div>
  )
}

export default function CumplimientoProyeccion({ semanas }: { semanas: CumplimientoSemana[] }) {
  const nota = (
    <p className="text-[11px] text-[#666] px-1">
      La proyección de masa viene de "Masas proyectadas" del conteo semanal, que es
      cantidad de masas, no kg — este cruce contra la masa real en kg queda con un
      desajuste de unidades pendiente de revisar.
    </p>
  )

  if (semanas.length === 0) {
    return (
      <div className="space-y-3">
        {nota}
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">Todavía no hay conteos cerrados en el período elegido.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {nota}
      <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
      {semanas.map(s => (
        <div key={s.conteoId} className="px-4 py-3 space-y-3">
          <p className="text-sm text-[#f0f0f0] font-medium">Semana {formatSemana(s.semanaDesde, s.semanaHasta)}</p>
          <Fila titulo="Masa" proyeccion={s.proyeccionMasaKg} real={s.masaRealKg} pct={s.cumplimientoMasaPct} />
          <Fila titulo="Embolsado" proyeccion={s.proyeccionEmbolsadoKg} real={s.embolsadoRealKg} pct={s.cumplimientoEmbolsadoPct} />
        </div>
      ))}
      </Card>
    </div>
  )
}
