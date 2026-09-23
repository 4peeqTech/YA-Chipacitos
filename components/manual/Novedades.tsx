import { Sparkles } from 'lucide-react'
import { formatearFecha } from '@/lib/formato'
import type { Novedad } from '@/lib/manual/tipos'
import TextoRico from './TextoRico'

export default function Novedades({ novedades }: { novedades: Novedad[] }) {
  if (novedades.length === 0) return null
  const ordenadas = [...novedades].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-bg px-5 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        <Sparkles size={16} className="text-accent" /> Novedades
      </p>
      <ul className="mt-3 space-y-2">
        {ordenadas.map((n, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
            <time dateTime={n.fecha} className="shrink-0 text-xs tabular-nums text-muted sm:w-24 sm:pt-0.5">
              {formatearFecha(n.fecha)}
            </time>
            <span><TextoRico texto={n.texto} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
