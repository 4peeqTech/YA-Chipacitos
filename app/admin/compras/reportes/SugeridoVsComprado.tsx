'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { calcularSugeridoVsComprado, type SolicitudItemReporte, type PedidoItemCompradoReporte } from '@/lib/compras/reportes'

function cantidad(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function ChartTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: { dataKey: string; value: number; color: string }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="text-text font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.dataKey === 'sugerido' ? 'Sugerido' : 'Comprado'}: {cantidad(p.value)}</p>
      ))}
    </div>
  )
}

export default function SugeridoVsComprado({
  solicitudItems,
  pedidoItems,
}: {
  solicitudItems: SolicitudItemReporte[]
  pedidoItems: PedidoItemCompradoReporte[]
}) {
  const filas = calcularSugeridoVsComprado(solicitudItems, pedidoItems)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        No hay solicitudes cerradas en el período elegido.
      </div>
    )
  }

  const datosChart = [...filas]
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
    .slice(0, 8)
    .reverse()

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#888]">
        Cuánto sugirió el cierre del conteo semanal contra cuánto terminó comprándose — sirve para calibrar el
        coeficiente de cada insumo en Parámetros Fábrica.
      </p>

      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Mayor desvío (top {datosChart.length})</p>
        <ResponsiveContainer width="100%" height={Math.max(200, datosChart.length * 40)}>
          <BarChart data={datosChart} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: '#2a2a2a' }} tickLine={false} />
            <YAxis type="category" dataKey="itemNombre" width={120} tick={{ fill: '#ccc', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            <Legend
              formatter={(value: string) => value === 'sugerido' ? 'Sugerido' : 'Comprado'}
              wrapperStyle={{ fontSize: 12, color: '#888' }}
            />
            <Bar dataKey="sugerido" fill="#888888" radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="comprado" fill="#e8c547" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
              <tr>
                <th className={thClass}>Semana / pedido</th>
                <th className={thClass}>Insumo</th>
                <th className={thClass}>Sugerido</th>
                <th className={thClass}>Comprado</th>
                <th className={thClass}>Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {filas.map(f => (
                <tr key={`${f.clave}|${f.itemId}`} className="hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-4 py-3 text-[#888]">{f.clave}</td>
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">{f.itemNombre}</td>
                  <td className="px-4 py-3 text-[#888]">{cantidad(f.sugerido)}</td>
                  <td className="px-4 py-3 text-[#888]">{cantidad(f.comprado)}</td>
                  <td className={`px-4 py-3 font-medium ${f.diferencia > 0 ? 'text-amber-400' : f.diferencia < 0 ? 'text-red-400' : 'text-[#666]'}`}>
                    {f.diferencia > 0 ? '+' : ''}{cantidad(f.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
