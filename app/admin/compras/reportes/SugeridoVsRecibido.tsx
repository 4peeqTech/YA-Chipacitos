'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Scale, Truck } from 'lucide-react'
import { calcularSugeridoVsRecibido, type SolicitudItemReporte, type PedidoItemRecibidoReporte } from '@/lib/compras/reportes'
import { formatearNumero } from '@/lib/formato'
import LinkEntidad from '@/components/ui/LinkEntidad'
import EmptyState from '@/components/ui/EmptyState'

const cantidad = (n: number) => formatearNumero(n, 1)

const SERIE = { sugerido: 'Sugerido', recibido: 'Recibido' } as const

function ChartTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: { dataKey: keyof typeof SERIE; value: number; color: string }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="tabular-nums text-muted">{SERIE[p.dataKey]}: {cantidad(p.value)}</p>
      ))}
    </div>
  )
}

const th = 'px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted'
const thNum = `${th} text-right`

export default function SugeridoVsRecibido({
  solicitudItems,
  pedidoItems,
}: {
  solicitudItems: SolicitudItemReporte[]
  pedidoItems: PedidoItemRecibidoReporte[]
}) {
  const filas = calcularSugeridoVsRecibido(solicitudItems, pedidoItems)

  if (filas.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        <EmptyState icono={Scale} titulo="Todavía no hay solicitudes con sugerencia" descripcion="Aparecen cuando Fábrica cierra un conteo y la solicitud se convierte en pedidos." />
      </div>
    )
  }

  const datosChart = [...filas]
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
    .slice(0, 8)
    .reverse()

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Cuánto sugirió el cierre del conteo contra cuánto llegó de verdad en los remitos. Lo pedido queda como referencia.
        Sirve para calibrar el coeficiente de cada insumo. Lo que se recibe como línea libre del remito, o lo que se agrega
        a mano al pedido, no cuenta.
      </p>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Mayor desvío (top {datosChart.length})</p>
        <ResponsiveContainer width="100%" height={Math.max(200, datosChart.length * 40)}>
          <BarChart data={datosChart} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis type="category" dataKey="itemNombre" width={120} tick={{ fill: 'var(--color-text)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface2)' }} />
            <Legend formatter={(value: keyof typeof SERIE) => SERIE[value]} wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
            <Bar dataKey="sugerido" fill="var(--color-muted)" radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="recibido" fill="var(--color-accent)" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface2">
              <tr>
                <th className={th}>Semana / pedido</th>
                <th className={th}>Insumo</th>
                <th className={thNum}>Sugerido</th>
                <th className={thNum}>Pedido</th>
                <th className={thNum}>Recibido</th>
                <th className={thNum}>Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(f => (
                <tr key={`${f.clave}|${f.itemId}`} className="transition-colors hover:bg-surface2">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{f.clave}</td>
                  <td className="px-4 py-3 font-medium text-text">
                    <LinkEntidad entidad={{ tipo: 'insumo', id: f.itemId }} variante="texto" title="Ver el stock de este insumo">{f.itemNombre}</LinkEntidad>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{cantidad(f.sugerido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{cantidad(f.pedido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {f.enCamino && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-2xs font-semibold text-info" title="Hay un pedido de esta línea que todavía espera mercadería">
                          <Truck size={11} /> en camino
                        </span>
                      )}
                      {cantidad(f.recibido)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${f.diferencia > 0 ? 'text-warning' : f.diferencia < 0 ? 'text-brand-red' : 'text-faint'}`}>
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
