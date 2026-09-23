'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, SearchX } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import type { EntradaBusqueda } from '@/lib/manual'

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Fragmento de ~140 caracteres alrededor de la primera coincidencia. */
function fragmento(texto: string, termino: string): { antes: string; match: string; despues: string } | null {
  const i = normalizar(texto).indexOf(termino)
  if (i < 0) return null
  const desde = Math.max(0, i - 60)
  const hasta = Math.min(texto.length, i + termino.length + 80)
  return {
    antes: (desde > 0 ? '…' : '') + texto.slice(desde, i),
    match: texto.slice(i, i + termino.length),
    despues: texto.slice(i + termino.length, hasta) + (hasta < texto.length ? '…' : ''),
  }
}

export default function BuscadorManual({ indice, pieSinResultados, children }: {
  indice: EntradaBusqueda[]
  pieSinResultados: ReactNode
  children: ReactNode
}) {
  const [query, setQuery] = useState('')
  const terminos = useMemo(() => normalizar(query).split(/\s+/).filter(t => t.length >= 2), [query])

  const resultados = useMemo(() => {
    if (terminos.length === 0) return []
    return indice
      .map(e => {
        const titulo = normalizar(`${e.seccion} ${e.titulo}`)
        const cuerpo = normalizar(e.texto)
        if (!terminos.every(t => titulo.includes(t) || cuerpo.includes(t))) return null
        // Coincidir en el título pesa más que en el cuerpo.
        const puntaje = terminos.reduce((acc, t) => acc + (titulo.includes(t) ? 3 : 0) + (cuerpo.includes(t) ? 1 : 0), 0)
        return { ...e, puntaje, frag: fragmento(e.texto, terminos[0]) }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, 20)
  }, [indice, terminos])

  const buscando = terminos.length > 0

  return (
    <div className="space-y-8">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscá en el manual: remito, conteo, factura…"
        className="[&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-sm"
      />

      {!buscando && children}

      {buscando && (
        <section aria-live="polite">
          {resultados.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState
                icono={SearchX}
                titulo={`No encontramos "${query.trim()}"`}
                descripcion="Probá con otra palabra, por ejemplo remito, conteo o pedido. Si no está en el manual, avisanos y lo sumamos."
                accion={pieSinResultados}
              />
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {resultados.length === 1 ? '1 resultado' : `${resultados.length} resultados`}
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {resultados.map(r => (
                  <li key={`${r.slug}#${r.ancla}`}>
                    <Link
                      href={`/ayuda/${r.slug}#${r.ancla}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">{r.seccion}</p>
                        <p className="text-sm font-medium text-text">{r.titulo}</p>
                        {r.frag && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted">
                            {r.frag.antes}
                            <mark className="rounded bg-accent-bg px-0.5 text-text">{r.frag.match}</mark>
                            {r.frag.despues}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
