'use client'

import { useMemo } from 'react'
import Card from '@/components/ui/Card'
import { agruparEmbolsadoPorPresentacion, type EmbolsadoFila } from '@/lib/fabrica/reportes'

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

export default function EmbolsadoResumen({ filas }: { filas: EmbolsadoFila[] }) {
  const resumen = useMemo(() => agruparEmbolsadoPorPresentacion(filas), [filas])
  const total = useMemo(() => resumen.reduce((acc, r) => acc + r.cantidadKg, 0), [resumen])
  const maxKg = useMemo(() => Math.max(1, ...resumen.map(r => r.cantidadKg)), [resumen])

  if (resumen.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[#888]">No hay embolsado cargado en el período elegido.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#888] px-1">{formatKg(total)} embolsados en total</p>
      <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
        {resumen.map(r => (
          <div key={r.presentacionNombre} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#f0f0f0] font-medium truncate">{r.presentacionNombre}</p>
              <p className="text-sm text-[#f0f0f0] font-semibold shrink-0">{formatKg(r.cantidadKg)}</p>
            </div>
            <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
              <div className="h-full rounded-full bg-[#e8c547]" style={{ width: `${(r.cantidadKg / maxKg) * 100}%` }} />
            </div>
            <p className="text-[11px] text-[#666]">{r.lineas} línea{r.lineas !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
