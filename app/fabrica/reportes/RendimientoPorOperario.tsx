'use client'

import { useMemo } from 'react'
import { Gauge } from 'lucide-react'
import Card from '@/components/ui/Card'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { calcularRendimientoPorOperario, type ProduccionFila } from '@/lib/fabrica/reportes'

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

export default function RendimientoPorOperario({ filas }: { filas: ProduccionFila[] }) {
  const resumen = useMemo(() => calcularRendimientoPorOperario(filas), [filas])
  const maxRendimiento = useMemo(() => Math.max(1, ...resumen.map(r => r.rendimiento ?? 0)), [resumen])

  if (resumen.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[#888]">No hay producción cargada en el período elegido.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center text-xs text-[#888] px-1">
        Kg de masa por kg de fécula, real por operario
        <HelpTooltip text="El dato que la planilla no permite ver: cuánto rinde cada operario al pasar de fécula a masa. Sirve para detectar desvíos frente al rendimiento configurado en Parámetros." />
      </p>
      <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
        {resumen.map(r => (
          <div key={r.operarioNombre} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#f0f0f0] font-medium truncate">{r.operarioNombre}</p>
              <p className="flex items-center gap-1 text-sm text-[#e8c547] font-semibold shrink-0">
                <Gauge size={14} />
                {r.rendimiento != null ? r.rendimiento.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            {r.rendimiento != null && (
              <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                <div className="h-full rounded-full bg-[#e8c547]" style={{ width: `${(r.rendimiento / maxRendimiento) * 100}%` }} />
              </div>
            )}
            <p className="text-[11px] text-[#666]">
              {formatKg(r.feculaKg)} fécula → {formatKg(r.masaKg)} masa · {r.cargas} carga{r.cargas !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </Card>
    </div>
  )
}
