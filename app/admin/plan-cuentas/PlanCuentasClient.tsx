'use client'

import { useMemo, useState } from 'react'
import { IconChevronRight, IconListTree } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { ChipGroup } from '@/components/ui/Chip'
import { ETIQUETA_USO, buscarCuentas, rutaDe, type CuentaPlan } from '@/lib/gastos/plan'

type Vista = 'todo' | 'gastos'

const VISTAS: { value: Vista; label: string }[] = [
  { value: 'todo', label: 'Todo el plan' },
  { value: 'gastos', label: 'Las que se eligen en Gastos' },
]

/** Lo que no aporta en el renglón: el Excel lo repite en las cuentas que no van al resultado. */
const SIN_TABLERO = new Set(['No va al resultado', '—'])

function UsoBadge({ c }: { c: CuentaPlan }) {
  if (!c.usoGastos) return null
  const clase = c.usoGastos === 'gasto' ? 'border-accent/40 text-text' : 'border-border text-muted'
  return (
    <span className={`whitespace-nowrap rounded-md border px-1.5 text-2xs font-semibold ${clase}`}>
      {ETIQUETA_USO[c.usoGastos]}
    </span>
  )
}

function Tablero({ c }: { c: CuentaPlan }) {
  const fab = c.tableroFabrica && !SIN_TABLERO.has(c.tableroFabrica) ? c.tableroFabrica : null
  const loc = c.tableroLocales && !SIN_TABLERO.has(c.tableroLocales) ? c.tableroLocales : null
  if (!fab && !loc) return null
  if (fab === loc) return <p className="text-2xs text-muted">Tablero: {fab}</p>
  return (
    <p className="text-2xs text-muted">
      Tablero:{fab && <> fábrica y administración → {fab}</>}{fab && loc && ' ·'}{loc && <> locales → {loc}</>}
    </p>
  )
}

function Cuenta({ c, ruta }: { c: CuentaPlan; ruta?: string[] }) {
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs tabular-nums text-muted">{c.codigo}</span>
        <span className="min-w-0 font-medium text-text">{c.nombre}</span>
        <UsoBadge c={c} />
      </div>
      {ruta && ruta.length > 0 && <p className="text-xs text-muted">{ruta.join(' › ')}</p>}
      {c.incluye && <p className="text-sm text-muted">{c.incluye}</p>}
      <Tablero c={c} />
    </li>
  )
}

export default function PlanCuentasClient({ plan, error }: { plan: CuentaPlan[]; error: boolean }) {
  const [q, setQ] = useState('')
  const [vista, setVista] = useState<Vista>('todo')

  const visibles = useMemo(
    () => plan.filter(c => !c.imputable || vista === 'todo' || c.usoGastos != null),
    [plan, vista],
  )
  const hijos = useMemo(() => {
    const m = new Map<string | null, CuentaPlan[]>()
    for (const c of visibles) m.set(c.padre, [...(m.get(c.padre) ?? []), c])
    return m
  }, [visibles])

  // Cuántas cuentas imputables cuelgan de cada nodo (para esconder ramas vacías).
  const cuenta = useMemo(() => {
    const n = new Map<string, number>()
    const contar = (c: CuentaPlan): number => {
      const total = c.imputable ? 1 : (hijos.get(c.codigo) ?? []).reduce((s, h) => s + contar(h), 0)
      n.set(c.codigo, total)
      return total
    }
    for (const t of hijos.get(null) ?? []) contar(t)
    return n
  }, [hijos])

  const buscando = q.trim() !== ''
  const resultados = useMemo(
    () => (buscando ? buscarCuentas(visibles.filter(c => c.imputable), q) : []),
    [buscando, visibles, q],
  )
  const conHijos = (codigo: string) => (hijos.get(codigo) ?? []).filter(h => (cuenta.get(h.codigo) ?? 0) > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconListTree}
        titulo="Plan de cuentas"
        descripcion="Las cuentas con las que se clasifica cada gasto. Es el plan fijo del negocio: no se cambia desde acá."
      />

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar: luz, alquiler, sueldos, 5.3.01…" />
        <ChipGroup opciones={VISTAS} value={vista} onChange={setVista} />
      </div>

      {error ? (
        <EmptyState icono={IconListTree} titulo="No se pudo traer el plan de cuentas" descripcion="Recargá la página. Si sigue sin aparecer, avisanos." />
      ) : buscando ? (
        resultados.length === 0 ? (
          <EmptyState icono={IconListTree} titulo="Ninguna cuenta coincide" descripcion="Probá con otra palabra o con parte del código." />
        ) : (
          <section className="space-y-2" aria-label="Resultados de la búsqueda">
            <p className="text-sm text-muted">{resultados.length === 1 ? '1 cuenta' : `${resultados.length} cuentas`}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {resultados.map(c => <Cuenta key={c.codigo} c={c} ruta={rutaDe(plan, c.codigo)} />)}
            </ul>
          </section>
        )
      ) : (
        (hijos.get(null) ?? []).filter(t => (cuenta.get(t.codigo) ?? 0) > 0).map(tipo => (
          <section key={tipo.codigo} className="space-y-2" aria-labelledby={`tipo-${tipo.codigo}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`tipo-${tipo.codigo}`} className="text-sm font-semibold uppercase tracking-wide text-text">
                <span className="font-mono text-muted">{tipo.codigo}</span> {tipo.nombre}
              </h2>
              <span className="text-xs text-muted">{cuenta.get(tipo.codigo)} cuentas</span>
            </div>
            {tipo.incluye && <p className="text-sm text-muted">{tipo.incluye}</p>}
            <div className="space-y-2">
              {conHijos(tipo.codigo).map(rubro => (
                <details key={rubro.codigo} className="group overflow-hidden rounded-2xl border border-border bg-surface">
                  <summary className="presionable flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-surface2 [&::-webkit-details-marker]:hidden">
                    <IconChevronRight size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
                    <span className="font-mono text-xs tabular-nums text-muted">{rubro.codigo}</span>
                    <span className="min-w-0 flex-1 font-semibold text-text">{rubro.nombre}</span>
                    <span className="whitespace-nowrap text-xs text-muted">{cuenta.get(rubro.codigo)}</span>
                  </summary>
                  {rubro.incluye && <p className="border-t border-border px-4 py-2 text-sm text-muted">{rubro.incluye}</p>}
                  {conHijos(rubro.codigo).map(cat => (
                    <div key={cat.codigo} className="border-t border-border">
                      <h3 className="bg-surface2/60 px-4 py-2 text-xs font-semibold text-muted">
                        <span className="font-mono tabular-nums">{cat.codigo}</span> {cat.nombre}
                      </h3>
                      <ul className="divide-y divide-border">
                        {conHijos(cat.codigo).map(c => <Cuenta key={c.codigo} c={c} />)}
                      </ul>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
