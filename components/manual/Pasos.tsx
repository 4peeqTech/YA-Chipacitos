import type { Captura as CapturaTipo } from '@/lib/manual/tipos'
import TextoRico from './TextoRico'
import Captura from './Captura'

export default function Pasos({ pasos }: { pasos: { texto: string; captura?: CapturaTipo }[] }) {
  return (
    <ol className="space-y-3">
      {pasos.map((p, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold tabular-nums text-black"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p><TextoRico texto={p.texto} /></p>
            {p.captura && <Captura captura={p.captura} />}
          </div>
        </li>
      ))}
    </ol>
  )
}
