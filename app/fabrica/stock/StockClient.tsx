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
  umbralSobrestock,
}: {
  definiciones: DefinicionConDatos[]
  historialGlobal: HistorialGlobalItem[]
  umbralSobrestock: number
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
            // key por conteo: al cerrar, el borrador nuevo arranca con estado propio (no el del cerrado).
            <ConteoDesplegable key={def.conteo.id} definicion={def} umbralSobrestock={umbralSobrestock} />
          ))}
        </div>
      )}

      <HistorialGlobal historial={historialGlobal} />
    </div>
  )
}
