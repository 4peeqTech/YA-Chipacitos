import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Vacío obligatorio de listados — pasar un mensaje distinto para "sin datos" vs
 * "sin resultados por filtros" (ver DoD #6); antes era un <p> de texto plano copiado ~20 veces. */
export default function EmptyState({
  icono: Icon,
  titulo,
  descripcion,
  accion,
}: {
  icono: LucideIcon
  titulo: string
  descripcion?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 px-6 text-center">
      <Icon size={28} className="text-faint" />
      <p className="text-text font-semibold text-sm">{titulo}</p>
      {descripcion && <p className="text-muted text-xs max-w-xs">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}
