import EstadoBadge from '@/components/ui/EstadoBadge'
import type { Dominio } from '@/lib/estados'
import TextoRico from './TextoRico'

/** Qué significa cada estado, con el mismo badge (label y color) que usa la app. */
export default function EstadosDelModulo({ dominio, estados }: { dominio: Dominio; estados: { estado: string; texto: string }[] }) {
  return (
    <dl className="space-y-3">
      {estados.map(e => (
        <div key={e.estado} className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
          <dt className="shrink-0 sm:w-44">
            {/* El tipo del bloque ya garantiza que el estado existe en el dominio. */}
            <EstadoBadge dominio={dominio} estado={e.estado as never} />
          </dt>
          <dd className="text-sm"><TextoRico texto={e.texto} /></dd>
        </div>
      ))}
    </dl>
  )
}
