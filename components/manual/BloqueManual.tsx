import { Lightbulb, TriangleAlert } from 'lucide-react'
import type { Bloque } from '@/lib/manual/tipos'
import { MODULO_AYUDA } from '@/lib/manual'
import { MODULOS } from '@/lib/modulos'
import TextoRico from './TextoRico'
import Pasos from './Pasos'
import QueHagoSi from './QueHagoSi'
import EstadosDelModulo from './EstadosDelModulo'

export default function BloqueManual({ bloque, modulosPermitidos }: { bloque: Bloque; modulosPermitidos: string[] }) {
  switch (bloque.tipo) {
    case 'parrafo':
      return <p><TextoRico texto={bloque.texto} /></p>
    case 'pasos':
      return <Pasos pasos={bloque.pasos} />
    case 'lista':
      return (
        <div>
          {bloque.titulo && <p className="mb-2 text-sm font-medium text-text">{bloque.titulo}</p>}
          <ul className="list-disc space-y-1.5 pl-5 marker:text-faint">
            {bloque.items.map((it, i) => <li key={i}><TextoRico texto={it} /></li>)}
          </ul>
        </div>
      )
    case 'estados':
      return <EstadosDelModulo dominio={bloque.dominio} estados={bloque.estados} />
    case 'queHagoSi':
      return <QueHagoSi casos={bloque.casos} />
    case 'tip':
      return (
        <div className="flex gap-3 rounded-xl border border-accent/25 bg-accent-bg px-4 py-3 text-sm">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-text"><TextoRico texto={bloque.texto} /></p>
        </div>
      )
    case 'alerta':
      return (
        <div role="note" className="flex gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <p className="text-text"><TextoRico texto={bloque.texto} /></p>
        </div>
      )
    case 'modulosHabilitados': {
      // Un módulo sin descripción en MODULO_AYUDA se muestra igual, con su nombre del menú.
      const modulos = modulosPermitidos
        .map(k => MODULO_AYUDA[k] ?? (MODULOS.find(m => m.key === k) && { titulo: MODULOS.find(m => m.key === k)!.label, desc: '' }))
        .filter((m): m is { titulo: string; desc: string } => !!m)
      if (modulos.length === 0) {
        return (
          <div role="note" className="flex gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <p className="text-text">No tenés módulos habilitados. Pedile al administrador que le asigne permisos a tu cuenta.</p>
          </div>
        )
      }
      return (
        <div>
          <p className="mb-2 text-sm font-medium text-text">Módulos disponibles para vos</p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {modulos.map(m => (
              <li key={m.titulo} className="px-4 py-3">
                <p className="text-sm font-medium text-text">{m.titulo}</p>
                {m.desc && <p className="mt-0.5 text-xs text-muted">{m.desc}</p>}
              </li>
            ))}
          </ul>
        </div>
      )
    }
  }
}
