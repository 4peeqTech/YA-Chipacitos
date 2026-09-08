'use client'

import { Fragment, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { calcularMovimientoPorInsumo, type MovimientoReporte } from '@/lib/compras/reportes'

const TIPO_LABEL: Record<MovimientoReporte['tipo'], string> = {
  entrada_remito: 'Entrada (remito)',
  conteo_fabrica: 'Conteo de fábrica',
  ajuste_manual: 'Ajuste manual',
}

const SERIE_COLOR = { entradas: '#56d68a', conteosFabrica: '#e8c547', ajustes: '#f0a030' }

function ChartTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: { dataKey: string; value: number; color: string }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="text-text font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey === 'entradas' ? 'Entradas' : p.dataKey === 'conteosFabrica' ? 'Conteos de fábrica' : 'Ajustes'}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function MovimientoStock({
  movimientos,
  stockActualPorItem,
  proveedorPorItem,
}: {
  movimientos: MovimientoReporte[]
  stockActualPorItem: Record<string, number>
  proveedorPorItem: Record<string, string>
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularMovimientoPorInsumo(movimientos, stockActualPorItem, proveedorPorItem)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        Sin movimientos de stock en el período elegido. Los movimientos se registran desde el despliegue de esta fase — no hay historial anterior.
      </div>
    )
  }

  const datosChart = [...filas]
    .sort((a, b) => (b.entradas + b.conteosFabrica + Math.abs(b.ajustes)) - (a.entradas + a.conteosFabrica + Math.abs(a.ajustes)))
    .slice(0, 8)
    .reverse()

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Movimiento de stock (top {datosChart.length} insumos)</p>
        <ResponsiveContainer width="100%" height={Math.max(200, datosChart.length * 40)}>
          <BarChart data={datosChart} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: '#2a2a2a' }} tickLine={false} />
            <YAxis type="category" dataKey="itemNombre" width={120} tick={{ fill: '#ccc', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            <Legend
              formatter={(value: string) => value === 'entradas' ? 'Entradas' : value === 'conteosFabrica' ? 'Conteos de fábrica' : 'Ajustes'}
              wrapperStyle={{ fontSize: 12, color: '#888' }}
            />
            <Bar dataKey="entradas" stackId="mov" fill={SERIE_COLOR.entradas} />
            <Bar dataKey="conteosFabrica" stackId="mov" fill={SERIE_COLOR.conteosFabrica} />
            <Bar dataKey="ajustes" stackId="mov" fill={SERIE_COLOR.ajustes} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Entradas (remito)</th>
              <th className={thClass}>Conteos de fábrica</th>
              <th className={thClass}>Ajustes manuales</th>
              <th className={thClass}>Balance del período</th>
              <th className={thClass}>Stock actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(f => (
              <Fragment key={f.itemId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === f.itemId ? null : f.itemId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === f.itemId ? '▼ ' : '▶ '}{f.itemNombre}
                  </td>
                  <td className="px-4 py-3 text-[#888]">{f.proveedorNombre}</td>
                  <td className="px-4 py-3 text-[#888]">{f.entradas}</td>
                  <td className="px-4 py-3 text-[#888]">{f.conteosFabrica}</td>
                  <td className="px-4 py-3 text-[#888]">{f.ajustes}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">{f.balance}</td>
                  <td className="px-4 py-3 text-[#888]">{f.stockActual}</td>
                </tr>
                {expandidoId === f.itemId && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 bg-[#0a0a0a]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#888]">
                            <th className="text-left py-1 pr-3">Fecha</th>
                            <th className="text-left py-1 pr-3">Tipo</th>
                            <th className="text-left py-1 pr-3">Delta</th>
                            <th className="text-left py-1">Por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.movimientos.map(m => (
                            <tr key={m.movimientoId} className="text-[#ccc]">
                              <td className="py-1 pr-3">{new Date(m.fecha).toLocaleString('es-AR')}</td>
                              <td className="py-1 pr-3">{TIPO_LABEL[m.tipo]}</td>
                              <td className="py-1 pr-3">{m.delta}</td>
                              <td className="py-1">{m.creadoPorNombre ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
