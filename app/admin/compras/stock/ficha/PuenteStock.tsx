import { TriangleAlert } from 'lucide-react'
import { conUnidad } from '../../pedidos/modelo'
import { textoBase, type UnidadesInsumo } from '@/lib/compras/unidades'
import type { PuenteStock as Puente } from '@/lib/compras/trazabilidad'

function fechaCorta(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

function signo(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${conUnidad(Math.abs(n), null)}`
}

/** "Cómo se movió el stock" (A2c §6.3, E7): inicio + movimientos por grupo = fin. */
export default function PuenteStock({
  puente,
  desde,
  hasta,
  unidades,
}: {
  puente: Puente
  desde: string
  hasta: string
  unidades: UnidadesInsumo
}) {
  const unidad = unidades.unidad
  const base = textoBase(puente.fin, unidades)
  return (
    <div className="space-y-2">
      <dl className="divide-y divide-border rounded-xl border border-border text-sm tabular-nums">
        <div className="flex items-baseline justify-between gap-3 px-3 py-2">
          <dt className="text-muted">Stock el {fechaCorta(desde)}</dt>
          <dd className="font-semibold text-text">{conUnidad(puente.inicio, unidad)}</dd>
        </div>
        {puente.pasos.map(p => {
          // A4: cuando el consumo sea real, mostrar 0 y el link a Fábrica.
          const consumoPendiente = p.clave === 'consumo' && p.delta === 0
          return (
            <div key={p.clave} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <dt className="text-muted">{p.label}</dt>
              <dd className={consumoPendiente ? 'text-muted' : p.delta > 0 ? 'text-success' : p.delta < 0 ? 'text-warning' : 'text-muted'}>
                {consumoPendiente ? '— (llega con la receta)' : signo(p.delta)}
              </dd>
            </div>
          )
        })}
        <div className="flex items-baseline justify-between gap-3 bg-surface2 px-3 py-2">
          <dt className="font-semibold text-text">Stock el {fechaCorta(hasta)}</dt>
          <dd className="text-right">
            <span className="font-bold text-text">{conUnidad(puente.fin, unidad)}</span>
            {base && <span className="block text-xs text-muted">{base}</span>}
          </dd>
        </div>
      </dl>
      {!puente.cuadra && (
        <p role="alert" className="flex items-center gap-2 text-sm text-warning">
          <TriangleAlert size={15} className="shrink-0" /> Los movimientos no cierran con el stock: avisá a sistemas.
        </p>
      )}
    </div>
  )
}
