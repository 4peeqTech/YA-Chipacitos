import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Encabezado obligatorio de pantalla — ícono + título son requeridos a propósito,
 * así ninguna pantalla nueva sale sin ícono (ver DoD #6). */
export default function PageHeader({
  icono: Icon,
  titulo,
  descripcion,
  acciones,
}: {
  icono: LucideIcon
  titulo: string
  descripcion?: string
  acciones?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text">
          <Icon size={22} className="text-accent" /> {titulo}
        </h1>
        {descripcion && <p className="text-muted text-sm mt-0.5">{descripcion}</p>}
      </div>
      {acciones && <div className="shrink-0 flex items-center gap-2">{acciones}</div>}
    </div>
  )
}
