'use client'

import { Fragment, useState } from 'react'
import { calcularGastoPorProveedor, type RemitoReporte } from '@/lib/compras/reportes'

function money(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GastoPorProveedor({ remitos }: { remitos: RemitoReporte[] }) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularGastoPorProveedor(remitos)
  const totalGeneral = filas.reduce((total, f) => total + f.gastoTotal, 0)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider"

  if (filas.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-8 text-center text-[#888]">
        No hay remitos con líneas en el período elegido.
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
              <th className={thClass}>Remitos</th>
              <th className={thClass}>Líneas con precio</th>
              <th className={thClass}>Líneas sin precio</th>
              <th className={thClass}>Gasto total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {filas.map(f => (
              <Fragment key={f.proveedorId}>
                <tr
                  className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  onClick={() => setExpandidoId(prev => (prev === f.proveedorId ? null : f.proveedorId))}
                >
                  <td className="px-4 py-3 text-[#f0f0f0] font-medium">
                    {expandidoId === f.proveedorId ? '▼ ' : '▶ '}{f.proveedorNombre}
                  </td>
                  <td className="px-4 py-3 text-[#888]">{f.remitosCount}</td>
                  <td className="px-4 py-3 text-[#888]">{f.lineasConPrecio}</td>
                  <td className="px-4 py-3 text-[#888]">{f.lineasSinPrecio}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">${money(f.gastoTotal)}</td>
                </tr>
                {expandidoId === f.proveedorId && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 bg-[#0a0a0a]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#888]">
                            <th className="text-left py-1 pr-3">Remito</th>
                            <th className="text-left py-1 pr-3">Descripción</th>
                            <th className="text-left py-1 pr-3">Cantidad</th>
                            <th className="text-left py-1 pr-3">Precio</th>
                            <th className="text-left py-1">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.detalle.map((d, idx) => (
                            <tr key={idx} className="text-[#ccc]">
                              <td className="py-1 pr-3">{d.remitoNumero}</td>
                              <td className="py-1 pr-3">{d.descripcion}</td>
                              <td className="py-1 pr-3">{d.cantidad}</td>
                              <td className="py-1 pr-3">${money(d.precio)}</td>
                              <td className="py-1">${money(d.subtotal)}</td>
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
          <tfoot className="border-t border-[#2a2a2a]">
            <tr>
              <td className="px-4 py-3 text-[#e8c547] font-semibold" colSpan={4}>Total del período</td>
              <td className="px-4 py-3 text-[#e8c547] font-semibold">${money(totalGeneral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
