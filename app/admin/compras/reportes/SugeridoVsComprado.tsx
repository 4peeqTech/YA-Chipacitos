'use client'

import { calcularSugeridoVsComprado, type SolicitudItemReporte, type PedidoItemCompradoReporte } from '@/lib/compras/reportes'

function cantidad(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#888]">
        Cuánto sugirió el cierre del conteo semanal contra cuánto terminó comprándose — sirve para calibrar el
        coeficiente de cada insumo en Parámetros Fábrica.
      </p>
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
