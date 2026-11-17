'use client'

import { IconChevronDown, IconFilterOff } from '@tabler/icons-react'

export interface FiltroDef<K extends string> {
  key: K
  /** Nombre del campo; es también la opción "todos" (corto para que entre a 360px). */
  todos: string
  opciones: string[]
}

const selectClass = 'w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg pl-3 pr-9 py-2.5 text-sm appearance-none focus:outline-none focus:border-[#e8c547] transition-colors'

/** Selects para acotar las filas antes de agrupar (se combinan entre sí y con la agrupación). */
export default function FiltrosResumen<K extends string>({
  filtros,
  valores,
  onChange,
}: {
  filtros: FiltroDef<K>[]
  valores: Partial<Record<K, string>>
  onChange: (valores: Partial<Record<K, string>>) => void
}) {
  const hayFiltros = filtros.some(f => valores[f.key])

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
      {filtros.map(f => (
        // Flecha propia: la nativa queda pegada al borde.
        <div key={f.key} className="relative sm:w-auto">
          <select
            value={valores[f.key] ?? ''}
            onChange={e => onChange({ ...valores, [f.key]: e.target.value })}
            aria-label={`Filtrar por ${f.todos.toLowerCase()}`}
            className={`${selectClass} ${valores[f.key] ? 'border-[#e8c547]' : ''}`}
          >
            <option value="">{f.todos}</option>
            {f.opciones.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <IconChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#888]" />
        </div>
      ))}
      {hayFiltros && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="flex items-center justify-center gap-1 text-xs font-medium text-[#888] hover:text-[#f0f0f0] px-3 py-2.5 rounded-lg border border-[#2a2a2a] transition-colors"
        >
          <IconFilterOff size={13} /> Quitar filtros
        </button>
      )}
    </div>
  )
}
