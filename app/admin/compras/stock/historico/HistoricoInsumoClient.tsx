'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import SelectBuscador from '@/components/ui/SelectBuscador'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { grupoMovimiento, type TipoMovimiento } from '@/lib/compras/movimientos'
import { conUnidad } from '../../pedidos/modelo'

// Histórico por insumo, en simple: conteo a conteo, cuánto había, cuánto entró
// por remitos desde el conteo anterior y cuánto se usó en el medio
// (había antes + entró − hay ahora). Rehecho el 2026-09-28 a pedido del
// usuario: el gráfico anterior no se entendía.

interface CatalogoItem {
  id: string
  nombre: string
  unidad: string | null
}

interface MovimientoEntrada {
  delta: number
  tipo: TipoMovimiento
  created_at: string
}

interface FilaConteo {
  conteoId: string
  fecha: string
  cerradoEn: string
  habia: number
  /** Entró por remitos desde el conteo anterior (null en el primero: no hay "desde"). */
  entro: number | null
  /** Había antes + entró − hay ahora (null en el primero). */
  usado: number | null
}

interface Serie {
  lista: string
  filas: FilaConteo[]
}

function fechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function redondear(n: number) {
  return Math.round(n * 100) / 100
}

function armarSerie(puntos: { conteoId: string; fecha: string; cerradoEn: string; cantidad: number }[], movs: MovimientoEntrada[]): FilaConteo[] {
  return puntos.map((p, i) => {
    if (i === 0) return { conteoId: p.conteoId, fecha: p.fecha, cerradoEn: p.cerradoEn, habia: p.cantidad, entro: null, usado: null }
    const anterior = puntos[i - 1]
    const entro = redondear(movs
      .filter(m => grupoMovimiento(m.tipo) === 'entradas' && m.created_at > anterior.cerradoEn && m.created_at <= p.cerradoEn)
      .reduce((t, m) => t + m.delta, 0))
    return {
      conteoId: p.conteoId,
      fecha: p.fecha,
      cerradoEn: p.cerradoEn,
      habia: p.cantidad,
      entro,
      usado: redondear(anterior.cantidad + entro - p.cantidad),
    }
  })
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-text">{valor}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </div>
  )
}

/** Barras simples: cada una con su cantidad arriba y su fecha abajo. */
function Barras({ filas, unidad }: { filas: FilaConteo[]; unidad: string | null }) {
  const max = Math.max(...filas.map(f => f.habia), 0.0001)
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-3 px-1 pt-2" role="img" aria-label={`Cuánto había en cada conteo, en ${unidad ?? 'unidades'}`}>
        {filas.map((f, i) => {
          const ultimo = i === filas.length - 1
          return (
            <div key={f.conteoId} className="flex w-14 flex-col items-center gap-1">
              <span className={`text-xs tabular-nums ${ultimo ? 'font-bold text-text' : 'text-muted'}`}>{conUnidad(f.habia, null)}</span>
              <div className="flex h-32 w-9 items-end">
                <div
                  className={`w-full rounded-t-md ${ultimo ? 'bg-accent' : 'bg-accent/45'}`}
                  style={{ height: `${Math.max((f.habia / max) * 100, 2)}%` }}
                />
              </div>
              <span className="text-2xs whitespace-nowrap text-muted">{fechaCorta(f.fecha)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HistoricoInsumoClient({ itemsCatalogo }: { itemsCatalogo: CatalogoItem[] }) {
  const supabase = createClient()

  const [itemId, setItemId] = useState('')
  const [cargando, setCargando] = useState(false)
  const [series, setSeries] = useState<Serie[]>([])

  const unidad = itemsCatalogo.find(i => i.id === itemId)?.unidad ?? null

  async function elegirItem(id: string) {
    setItemId(id)
    setSeries([])
    if (!id) return
    setCargando(true)

    const [{ data: conteoItems }, { data: movimientos }] = await Promise.all([
      supabase
        .from('fabrica_conteo_items')
        .select('cantidad, fabrica_conteos(id, fecha, cerrado_en, estado, definicion_id, fabrica_conteo_definiciones(nombre))')
        .eq('item_id', id),
      supabase
        .from('compras_stock_movimientos')
        .select('delta, tipo, created_at')
        .eq('item_id', id)
        .in('tipo', ['entrada_remito', 'salida_remito_anulado'])
        .order('created_at'),
    ])

    type FilaConteoItem = {
      cantidad: number
      fabrica_conteos: {
        id: string
        fecha: string
        cerrado_en: string | null
        estado: string
        definicion_id: string
        fabrica_conteo_definiciones: { nombre: string } | null
      } | null
    }

    const porLista = new Map<string, { lista: string; puntos: { conteoId: string; fecha: string; cerradoEn: string; cantidad: number }[] }>()
    for (const c of (conteoItems ?? []) as unknown as FilaConteoItem[]) {
      const conteo = c.fabrica_conteos
      if (!conteo || conteo.estado !== 'cerrado') continue
      const grupo = porLista.get(conteo.definicion_id) ?? { lista: conteo.fabrica_conteo_definiciones?.nombre ?? '—', puntos: [] }
      grupo.puntos.push({ conteoId: conteo.id, fecha: conteo.fecha, cerradoEn: conteo.cerrado_en ?? conteo.fecha, cantidad: c.cantidad })
      porLista.set(conteo.definicion_id, grupo)
    }

    const movs = (movimientos ?? []) as unknown as MovimientoEntrada[]
    setSeries([...porLista.values()].map(g => ({
      lista: g.lista,
      filas: armarSerie([...g.puntos].sort((a, b) => a.fecha.localeCompare(b.fecha)), movs),
    })))
    setCargando(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icono={History}
        titulo="Histórico por insumo"
        descripcion="Elegí un insumo y mirá, conteo a conteo, cuánto había, cuánto entró por remitos y cuánto se usó entre un conteo y el siguiente."
      />

      <SelectBuscador
        value={itemId}
        onChange={elegirItem}
        opciones={itemsCatalogo.map(i => ({ value: i.id, label: i.nombre }))}
        placeholderVacio="Elegir insumo…"
        className="max-w-sm"
      />

      {!itemId ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState icono={History} titulo="Elegí un insumo" descripcion="Vas a ver cómo fue cambiando su stock en cada conteo de fábrica." />
        </div>
      ) : cargando ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : series.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState icono={History} titulo="Sin conteos cerrados" descripcion="Este insumo todavía no participó de ningún conteo cerrado de fábrica." />
        </div>
      ) : (
        <div className="space-y-10">
          {series.map(serie => {
            const ultimo = serie.filas[serie.filas.length - 1]
            const periodos = serie.filas.filter(f => f.usado != null)
            const totalEntro = redondear(periodos.reduce((t, f) => t + (f.entro ?? 0), 0))
            const usos = periodos.map(f => f.usado ?? 0).filter(u => u >= 0)
            const promedio = usos.length ? redondear(usos.reduce((t, u) => t + u, 0) / usos.length) : null
            return (
              <section key={serie.lista} className="space-y-4">
                {series.length > 1 && <h2 className="text-sm font-bold text-text">Lista {serie.lista}</h2>}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Dato titulo="Último conteo" valor={conUnidad(ultimo.habia, unidad)} detalle={fechaCorta(ultimo.fecha)} />
                  <Dato
                    titulo="Entró por remitos"
                    valor={conUnidad(totalEntro, unidad)}
                    detalle={serie.filas.length > 1 ? `entre el ${fechaCorta(serie.filas[0].fecha)} y el ${fechaCorta(ultimo.fecha)}` : 'hace falta más de un conteo'}
                  />
                  <Dato
                    titulo="Uso promedio"
                    valor={promedio == null ? '—' : conUnidad(promedio, unidad)}
                    detalle="entre un conteo y el siguiente"
                  />
                </div>

                <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-text">Cuánto había en cada conteo{unidad && <span className="font-normal text-muted"> ({unidad})</span>}</p>
                  <Barras filas={serie.filas} unidad={unidad} />
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface2">
                      <tr className="text-xs uppercase tracking-wider text-accent-fg">
                        <th scope="col" className="px-4 py-2.5 text-left font-semibold">Conteo</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Había</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Entró desde el anterior</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Se usó</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...serie.filas].reverse().map(f => (
                        <tr key={f.conteoId}>
                          <td className="px-4 py-2.5 text-text">{fechaCorta(f.fecha)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text">{conUnidad(f.habia, unidad)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted">{f.entro == null ? '—' : conUnidad(f.entro, null)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {f.usado == null
                              ? <span className="text-muted">—</span>
                              : f.usado < 0
                                ? <span className="text-warning" title="Se contó más de lo que había más lo que entró: puede faltar cargar un remito o el conteo anterior estuvo mal.">revisar</span>
                                : <span className="text-text">{conUnidad(f.usado, null)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted">
                  “Se usó” es lo que había en el conteo anterior, más lo que entró por remitos, menos lo que se contó. Si dice “revisar”, se contó más de lo esperado: puede faltar un remito o el conteo anterior estuvo mal.
                </p>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
