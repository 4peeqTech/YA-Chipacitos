'use client'

import { Fragment, useState } from 'react'
import { calcularMovimientoPorInsumo, type MovimientoReporte } from '@/lib/compras/reportes'

const TIPO_LABEL: Record<'entrada_remito' | 'ajuste_manual', string> = {
  entrada_remito: 'Entrada (remito)',
  ajuste_manual: 'Ajuste manual',
}

export default function MovimientoStock({
  movimientos,
  stockActualPorItem,
}: {
  movimientos: MovimientoReporte[]
  stockActualPorItem: Record<string, number>
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularMovimientoPorInsumo(movimientos, stockActualPorItem)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        Sin movimientos de stock en el período elegido. Los movimientos se registran desde el despliegue de esta fase — no hay historial anterior.
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Insumo</th>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Entradas (remito)</th>
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
                  <td className="px-4 py-3 text-[#888]">{f.ajustes}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">{f.balance}</td>
                  <td className="px-4 py-3 text-[#888]">{f.stockActual}</td>
                </tr>
                {expandidoId === f.itemId && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-[#0a0a0a]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#888]">
                            <th className="text-left py-1 pr-3">Fecha</th>
                            <th className="text-left py-1 pr-3">Tipo</th>
                            <th className="text-left py-1">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.movimientos.map(m => (
                            <tr key={m.movimientoId} className="text-[#ccc]">
                              <td className="py-1 pr-3">{new Date(m.fecha).toLocaleString('es-AR')}</td>
                              <td className="py-1 pr-3">{TIPO_LABEL[m.tipo]}</td>
                              <td className="py-1">{m.delta}</td>
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
  )
}
