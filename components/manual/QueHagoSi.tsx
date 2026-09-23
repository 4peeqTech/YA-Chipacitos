import { ChevronDown } from 'lucide-react'
import TextoRico from './TextoRico'

/** "¿Qué hago si…?": una situación por fila, desplegable. Sale del mapa de escenarios de cada fase. */
export default function QueHagoSi({ casos }: { casos: { situacion: string; camino: string }[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {casos.map((c, i) => (
        <details key={i} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-surface2 [&::-webkit-details-marker]:hidden">
            <span><TextoRico texto={c.situacion} /></span>
            <ChevronDown size={16} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 text-sm text-muted">
            <TextoRico texto={c.camino} />
          </div>
        </details>
      ))}
    </div>
  )
}
