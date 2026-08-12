'use client'

import ConteoDesplegable, {
  type DefinicionConDatos,
  type ItemConteoUI,
  type ConteoBorrador,
  type ConteoHistorial,
} from './ConteoDesplegable'
import HistorialGlobal, { type HistorialGlobalItem } from './HistorialGlobal'

export type { DefinicionConDatos, ItemConteoUI, ConteoBorrador, ConteoHistorial, HistorialGlobalItem }

export default function StockClient({
  definiciones,
  historialGlobal,
  usuarioId,
}: {
  definiciones: DefinicionConDatos[]
  historialGlobal: HistorialGlobalItem[]
  usuarioId: string
}) {
  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-3 max-w-3xl mx-auto">
      <h1 className="text-xl font-['Syne'] font-bold text-[#f0f0f0]">Control de Stock</h1>

      {definiciones.length === 0 ? (
        <p className="text-sm text-[#666] px-1">
          No hay conteos configurados. Creá uno en Compras → Control de Stock.
        </p>
      ) : (
        <div className="space-y-3">
          {definiciones.map(def => (
            <ConteoDesplegable key={def.id} definicion={def} usuarioId={usuarioId} />
          ))}
        </div>
      )}

      <HistorialGlobal historial={historialGlobal} />
    </div>
  )
}
