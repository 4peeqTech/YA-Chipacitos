'use client'

import { useMemo, useState } from 'react'
import { Undo2, IceCreamCone, Ruler, Package, Recycle } from 'lucide-react'
import Card from '@/components/ui/Card'
import { agruparDevoluciones, type AgrupacionDevolucion, type DevolucionFila } from '@/lib/fabrica/reportes'

const DIMENSIONES: { key: AgrupacionDevolucion; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'motivoNombre', label: 'Motivo', icon: Undo2 },
  { key: 'destino', label: 'Destino', icon: Recycle },
  { key: 'saborNombre', label: 'Sabor', icon: IceCreamCone },
  { key: 'tamanioNombre', label: 'Tamaño', icon: Ruler },
  { key: 'presentacionNombre', label: 'Presentación', icon: Package },
]

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

export default function DevolucionesResumen({ filas }: { filas: DevolucionFila[] }) {
  const [dimension, setDimension] = useState<AgrupacionDevolucion>('motivoNombre')

  const resumen = useMemo(() => agruparDevoluciones(filas, dimension), [filas, dimension])
  const total = useMemo(() => resumen.reduce((acc, r) => acc + r.cantidadKg, 0), [resumen])
  const maxKg = useMemo(() => Math.max(1, ...resumen.map(r => r.cantidadKg)), [resumen])

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
          <p className="text-sm text-[#888]">No hay devoluciones registradas en el período elegido.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#888] px-1">{formatKg(total)} devueltos en total</p>
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {resumen.map(r => (
              <div key={r.clave} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[#f0f0f0] font-medium truncate">{r.clave}</p>
                  <p className="text-sm text-[#f0f0f0] font-semibold shrink-0">{formatKg(r.cantidadKg)}</p>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div className="h-full rounded-full bg-[#e8c547]" style={{ width: `${(r.cantidadKg / maxKg) * 100}%` }} />
                </div>
                <p className="text-[11px] text-[#666]">{r.cargas} carga{r.cargas !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
