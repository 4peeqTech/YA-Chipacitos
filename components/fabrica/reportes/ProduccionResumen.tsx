'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Sun, User, IceCreamCone } from 'lucide-react'
import Card from '@/components/ui/Card'
import { agruparProduccion, type AgrupacionProduccion, type ProduccionFila } from '@/lib/fabrica/reportes'

const DIMENSIONES: { key: AgrupacionProduccion; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'fecha', label: 'Día', icon: CalendarDays },
  { key: 'turno', label: 'Turno', icon: Sun },
  { key: 'operarioNombre', label: 'Operario', icon: User },
  { key: 'saborNombre', label: 'Sabor', icon: IceCreamCone },
]

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

function formatClave(dimension: AgrupacionProduccion, clave: string) {
  if (dimension === 'fecha') return new Date(clave + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  if (dimension === 'turno') return clave === 'manana' ? 'Mañana' : 'Tarde'
  return clave
}

export default function ProduccionResumen({ filas }: { filas: ProduccionFila[] }) {
  const [dimension, setDimension] = useState<AgrupacionProduccion>('fecha')

  const resumen = useMemo(() => agruparProduccion(filas, dimension), [filas, dimension])
  const maxMasa = useMemo(() => Math.max(1, ...resumen.map(r => r.masaKg)), [resumen])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4">
        {DIMENSIONES.map(d => {
          const Icon = d.icon
          const activo = dimension === d.key
          return (
            <button
              key={d.key}
              onClick={() => setDimension(d.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                activo ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'
              }`}
            >
              <Icon size={13} /> {d.label}
            </button>
          )
        })}
      </div>

      {resumen.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">No hay producción cargada en el período elegido.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
          {resumen.map(r => (
            <div key={r.clave} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-[#f0f0f0] font-medium truncate">{formatClave(dimension, r.clave)}</p>
                <p className="text-sm text-[#f0f0f0] font-semibold shrink-0">{formatKg(r.masaKg)}</p>
              </div>
              <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                <div className="h-full rounded-full bg-[#e8c547]" style={{ width: `${(r.masaKg / maxMasa) * 100}%` }} />
              </div>
              <p className="text-[11px] text-[#666]">
                {formatKg(r.feculaKg)} fécula · {r.cargas} carga{r.cargas !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
