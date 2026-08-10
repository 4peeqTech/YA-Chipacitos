'use client'

import ConteoDesplegable, {
  type DefinicionConDatos,
  type ItemConteoUI,
  type ConteoBorrador,
  type ConteoHistorial,
} from './ConteoDesplegable'

export type { DefinicionConDatos, ItemConteoUI, ConteoBorrador, ConteoHistorial }

export default function StockClient({
  definiciones,
  usuarioId,
}: {
  definiciones: DefinicionConDatos[]
  usuarioId: string
}) {
  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-3 max-w-3xl mx-auto">
      <h1 className="text-xl font-['Syne'] font-bold text-[#f0f0f0]">Conteo semanal</h1>

      {definiciones.length === 0 ? (
        <p className="text-sm text-[#666] px-1">
          No hay conteos configurados. Creá uno en Compras → Conteos.
        </p>
      ) : (
        <div className="space-y-3">
          {definiciones.map(def => (
            <ConteoDesplegable key={def.id} definicion={def} usuarioId={usuarioId} />
          ))}
        </div>
      )}
    </div>
  )
}
