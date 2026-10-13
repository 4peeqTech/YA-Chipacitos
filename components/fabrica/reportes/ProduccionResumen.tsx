'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Sun, User, IceCreamCone, LayoutList, Table2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { agruparProduccion, ordenarResumen, ordenInicial, type AgrupacionProduccion, type OrdenResumen, type ProduccionFila } from '@/lib/fabrica/reportes'
import OrdenSelector from './OrdenSelector'
import ProduccionTabla from './ProduccionTabla'

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
  const [vista, setVista] = useState<'resumen' | 'tabla'>('resumen')
  const [dimension, setDimension] = useState<AgrupacionProduccion>('fecha')

  const [orden, setOrden] = useState<OrdenResumen>('fecha_desc')

  const cambiarDimension = (d: AgrupacionProduccion) => {
    setDimension(d)
    setOrden(ordenInicial(d === 'fecha'))
  }

  const resumen = useMemo(
    () => ordenarResumen(agruparProduccion(filas, dimension), orden, r => r.masaKg, r => r.cargas),
    [filas, dimension, orden]
  )
  const maxMasa = useMemo(() => Math.max(1, ...resumen.map(r => r.masaKg)), [resumen])

  const switchVista = (
    <div className="flex gap-1 p-1 rounded-xl bg-[#1a1a1a] w-fit">
      {([['resumen', 'Resumen', LayoutList], ['tabla', 'Tabla', Table2]] as const).map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => setVista(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            vista === key ? 'bg-[#2a2a2a] text-[#e8c547]' : 'text-[#888] hover:text-[#f0f0f0]'
          }`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  )

  if (vista === 'tabla') {
    return (
      <div className="space-y-3">
        {switchVista}
        <ProduccionTabla filas={filas} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {switchVista}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4">
        {DIMENSIONES.map(d => {
          const Icon = d.icon
          const activo = dimension === d.key
          return (
            <button
              key={d.key}
              onClick={() => cambiarDimension(d.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                activo ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'
              }`}
            >
              <Icon size={13} /> {d.label}
            </button>
          )
        })}
      </div>

      <OrdenSelector orden={orden} onChange={setOrden} esFecha={dimension === 'fecha'} cantidadLabel="Cargas" />

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
