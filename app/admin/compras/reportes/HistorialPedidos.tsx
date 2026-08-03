'use client'

import { Fragment, useState } from 'react'
import { calcularHistorialPedidos, type PedidoReporte } from '@/lib/compras/reportes'

function money(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ESTADO_BADGE: Record<PedidoReporte['estado'], string> = {
  borrador: 'bg-[#2a2a2a] text-[#ccc]',
  enviado: 'bg-yellow-900/50 text-yellow-300',
  cerrado: 'bg-green-900/50 text-green-300',
}

export default function HistorialPedidos({ pedidos }: { pedidos: PedidoReporte[] }) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularHistorialPedidos(pedidos)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        No hay pedidos en el período elegido.
      </div>
    )
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className={thClass}>Proveedor</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}>Creado</th>
              <th className={thClass}>Enviado</th>
              <th className={thClass}>Cerrado</th>
              <th className={thClass}>Remitos</th>
              <th className={thClass}>Gasto total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(p => (
              <Fragment key={p.pedidoId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === p.pedidoId ? null : p.pedidoId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === p.pedidoId ? '▼ ' : '▶ '}{p.proveedorNombre}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado]}`}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-[#888]">{new Date(p.createdAt).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3 text-[#888]">{p.enviadoEn ? new Date(p.enviadoEn).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-[#888]">{p.cerradoEn ? new Date(p.cerradoEn).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-[#888]">{p.remitosCount}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">${money(p.gastoTotal)}</td>
                </tr>
                {expandidoId === p.pedidoId && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 bg-[#0a0a0a]">
                      {p.remitos.length === 0 ? (
                        <p className="text-xs text-[#888]">Sin remitos registrados.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#888]">
                              <th className="text-left py-1 pr-3">N° Remito</th>
                              <th className="text-left py-1 pr-3">Fecha</th>
                              <th className="text-left py-1 pr-3">Líneas</th>
                              <th className="text-left py-1">Gasto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.remitos.map(r => (
                              <tr key={r.remitoId} className="text-[#ccc]">
                                <td className="py-1 pr-3">{r.numero}</td>
                                <td className="py-1 pr-3">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                                <td className="py-1 pr-3">{r.lineasCount}</td>
                                <td className="py-1">${money(r.gastoTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
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
