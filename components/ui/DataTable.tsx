'use client'

import { useMemo, useState, type ReactNode } from 'react'

export interface Columna<T> {
  key: string
  header: ReactNode
  render: (fila: T) => ReactNode
  /** Valor comparable para ordenar por esta columna. Si se omite, la columna no es ordenable. */
  ordenar?: (fila: T) => string | number
  /** Contenido del footer para esta columna (ej. un total). */
  pie?: ReactNode
  alinear?: 'left' | 'right' | 'center'
  /** Oculta la columna por debajo de este breakpoint, para responsive sin duplicar tablas. */
  ocultarHasta?: 'sm' | 'md' | 'lg'
  className?: string
}

const OCULTAR_CLASS: Record<NonNullable<Columna<unknown>['ocultarHasta']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

const ALINEAR_CLASS: Record<NonNullable<Columna<unknown>['alinear']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/** Tabla genérica: no hace fetch, no filtra, no pagina — solo ordena (client-side)
 * y renderiza. El filtrado/paginado quedan del lado de quien la usa. */
export default function DataTable<T>({
  filas,
  columnas,
  onFilaClick,
  vacio = 'No hay datos para mostrar.',
  filaKey,
}: {
  filas: T[]
  columnas: Columna<T>[]
  onFilaClick?: (fila: T) => void
  vacio?: ReactNode
  filaKey: (fila: T) => string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const filasOrdenadas = useMemo(() => {
    const columna = columnas.find(c => c.key === sortKey)
    if (!columna?.ordenar) return filas
    const ordenar = columna.ordenar
    return [...filas].sort((a, b) => {
      const va = ordenar(a)
      const vb = ordenar(b)
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [filas, columnas, sortKey, sortDir])

  function alSortear(columna: Columna<T>) {
    if (!columna.ordenar) return
    if (columna.key === sortKey) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(columna.key); setSortDir(1) }
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        <p className="p-8 text-center text-sm text-muted">{vacio}</p>
      </div>
    )
  }

  const hayPie = columnas.some(c => c.pie != null)

  return (
    <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface2 border-b border-border">
          <tr>
            {columnas.map(c => (
              <th
                key={c.key}
                onClick={() => alSortear(c)}
                className={`px-4 py-3 text-xs font-semibold text-accent uppercase tracking-wider ${ALINEAR_CLASS[c.alinear ?? 'left']} ${c.ocultarHasta ? OCULTAR_CLASS[c.ocultarHasta] : ''} ${c.ordenar ? 'cursor-pointer select-none' : ''}`}
              >
                {c.header}
                {c.key === sortKey && (sortDir === 1 ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filasOrdenadas.map(fila => (
            <tr
              key={filaKey(fila)}
              onClick={() => onFilaClick?.(fila)}
              className={onFilaClick ? 'hover:bg-surface2 transition-colors cursor-pointer' : ''}
            >
              {columnas.map(c => (
                <td key={c.key} className={`px-4 py-3 text-text ${ALINEAR_CLASS[c.alinear ?? 'left']} ${c.ocultarHasta ? OCULTAR_CLASS[c.ocultarHasta] : ''} ${c.className ?? ''}`}>
                  {c.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hayPie && (
          <tfoot className="bg-surface2 border-t border-border">
            <tr>
              {columnas.map(c => (
                <td key={c.key} className={`px-4 py-2.5 text-xs text-muted font-semibold ${ALINEAR_CLASS[c.alinear ?? 'left']}`}>
                  {c.pie}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
