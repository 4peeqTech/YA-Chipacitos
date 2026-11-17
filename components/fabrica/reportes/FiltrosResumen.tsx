'use client'

import { IconFilterOff } from '@tabler/icons-react'

export interface FiltroDef<K extends string> {
  key: K
  /** Texto de la opción "todos", p. ej. "Todas las presentaciones". */
  todos: string
  opciones: string[]
}

const selectClass = 'w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors'

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
        <select
          key={f.key}
          value={valores[f.key] ?? ''}
          onChange={e => onChange({ ...valores, [f.key]: e.target.value })}
          aria-label={f.todos}
          className={`${selectClass} sm:w-auto ${valores[f.key] ? 'border-[#e8c547]' : ''}`}
        >
          <option value="">{f.todos}</option>
          {f.opciones.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
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
