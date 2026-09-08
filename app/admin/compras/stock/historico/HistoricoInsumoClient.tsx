'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { calcularMovimientoPorInsumo, type MovimientoReporte } from '@/lib/compras/reportes'

interface CatalogoItem {
  id: string
  nombre: string
  unidad: string
}

interface PuntoConteo {
  conteoId: string
  fecha: string
  cerradoEn: string
  cantidad: number
  sugerido: number
  definicionId: string
  definicionNombre: string
}

interface SerieDefinicion {
  definicionNombre: string
  puntos: PuntoConteo[]
}

function formatearFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// Suma las entradas por remito registradas entre dos conteos consecutivos —
// es lo que explica el salto de "contado" entre uno y el siguiente.
function entradasEnPeriodo(movimientos: MovimientoReporte[], desde: string | null, hasta: string) {
  return movimientos
    .filter(m => m.tipo === 'entrada_remito' && m.created_at <= hasta && (desde == null || m.created_at > desde))
    .reduce((total, m) => total + m.delta, 0)
}

function Sparkline({ puntos }: { puntos: PuntoConteo[] }) {
  const width = 560
  const height = 110
  const padding = 24
  const max = Math.max(...puntos.map(p => p.cantidad), 1)
  const step = puntos.length > 1 ? (width - padding * 2) / (puntos.length - 1) : 0
  const barWidth = Math.min(28, step * 0.6 || 28)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Evolución de la cantidad contada por conteo">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--color-border)" strokeWidth={1} />
      {puntos.map((p, i) => {
        const x = puntos.length > 1 ? padding + step * i : width / 2
        const barHeight = (p.cantidad / max) * (height - padding * 2)
        const y = height - padding - barHeight
        const esUltimo = i === puntos.length - 1
        return (
          <g key={p.conteoId}>
            <rect x={x - barWidth / 2} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx={4} fill="var(--color-accent)" opacity={esUltimo ? 1 : 0.55}>
              <title>{formatearFecha(p.fecha)}: {p.cantidad}</title>
            </rect>
            {esUltimo && (
              <text x={x} y={y - 6} textAnchor="middle" fontSize={11} fill="var(--color-text)">{p.cantidad}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function HistoricoInsumoClient({ itemsCatalogo }: { itemsCatalogo: CatalogoItem[] }) {
  const supabase = createClient()

  const [itemId, setItemId] = useState('')
  const [cargando, setCargando] = useState(false)
  const [series, setSeries] = useState<SerieDefinicion[]>([])
  const [entradasPorConteo, setEntradasPorConteo] = useState<Record<string, number>>({})
  const [totalEntradas, setTotalEntradas] = useState(0)

  const unidad = itemsCatalogo.find(i => i.id === itemId)?.unidad ?? ''

  async function elegirItem(id: string) {
    setItemId(id)
    setSeries([])
    setEntradasPorConteo({})
    setTotalEntradas(0)
    if (!id) return
    setCargando(true)

    const [{ data: conteoItems }, { data: movimientos }] = await Promise.all([
      supabase
        .from('fabrica_conteo_items')
        .select('cantidad, sugerido, fabrica_conteos(id, fecha, cerrado_en, estado, definicion_id, fabrica_conteo_definiciones(nombre))')
        .eq('item_id', id),
      supabase
        .from('compras_stock_movimientos')
        .select('id, item_id, delta, tipo, remito_id, conteo_id, created_at')
        .eq('item_id', id)
        .eq('tipo', 'entrada_remito')
        .order('created_at'),
    ])

    type FilaConteoItem = {
      cantidad: number
      sugerido: number
      fabrica_conteos: {
        id: string
        fecha: string
        cerrado_en: string | null
        estado: string
        definicion_id: string
        fabrica_conteo_definiciones: { nombre: string } | null
      } | null
    }

    const puntos = ((conteoItems ?? []) as unknown as FilaConteoItem[])
      .filter(c => c.fabrica_conteos?.estado === 'cerrado')
      .map(c => ({
        conteoId: c.fabrica_conteos!.id,
        fecha: c.fabrica_conteos!.fecha,
        cerradoEn: c.fabrica_conteos!.cerrado_en ?? c.fabrica_conteos!.fecha,
        cantidad: c.cantidad,
        sugerido: c.sugerido,
        definicionId: c.fabrica_conteos!.definicion_id,
        definicionNombre: c.fabrica_conteos!.fabrica_conteo_definiciones?.nombre ?? '—',
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    const porDefinicion = new Map<string, PuntoConteo[]>()
    for (const p of puntos) {
      if (!porDefinicion.has(p.definicionId)) porDefinicion.set(p.definicionId, [])
      porDefinicion.get(p.definicionId)!.push(p)
    }

    const movs = (movimientos ?? []) as unknown as MovimientoReporte[]
    const entradas: Record<string, number> = {}
    for (const lista of porDefinicion.values()) {
      lista.forEach((p, i) => {
        const desde = i > 0 ? lista[i - 1].cerradoEn : null
        entradas[p.conteoId] = entradasEnPeriodo(movs, desde, p.cerradoEn)
      })
    }
    setEntradasPorConteo(entradas)

    // calcularMovimientoPorInsumo espera la lista completa de movimientos
    // (ya viene filtrada a un solo insumo y a tipo='entrada_remito' arriba);
    // acá solo interesa el total agregado, no el detalle por-conteo.
    const [resumen] = calcularMovimientoPorInsumo(movs, {}, {})
    setTotalEntradas(resumen?.entradas ?? 0)

    setSeries(
      [...porDefinicion.entries()].map(([, lista]) => ({
        definicionNombre: lista[0].definicionNombre,
        puntos: lista,
      }))
    )
    setCargando(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><History size={22} className="text-accent" /> Histórico por insumo</h1>
        <p className="text-muted text-sm mt-0.5">Cómo evolucionó el stock contado, conteo a conteo. Esta serie solo existe acá — el stock actual se sobreescribe en cada carga.</p>
      </div>

      <SelectBuscador
        value={itemId}
        onChange={elegirItem}
        opciones={itemsCatalogo.map(i => ({ value: i.id, label: i.nombre }))}
        placeholder="Elegir insumo"
        placeholderVacio="Elegir insumo..."
        className="max-w-sm"
      />

      {!itemId ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-muted text-sm">Elegí un insumo para ver su historial de conteos.</p>
        </div>
      ) : cargando ? (
        <p className="text-muted text-sm">Cargando…</p>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-muted text-sm">Este insumo todavía no participó de ningún conteo cerrado.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-muted">Total de entradas por remito registradas: <span className="text-text font-medium">{totalEntradas} {unidad}</span></p>
          {series.map(serie => (
            <div key={serie.definicionNombre} className="space-y-3">
              <h2 className="text-sm font-semibold text-text">{serie.definicionNombre}</h2>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <Sparkline puntos={serie.puntos} />
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-surface2 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-accent uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-accent uppercase tracking-wider">Contado</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-accent uppercase tracking-wider">Sugerido</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-accent uppercase tracking-wider">Entradas en el período</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {serie.puntos.map(p => (
                      <tr key={p.conteoId}>
                        <td className="px-4 py-2.5 text-text text-sm">{formatearFecha(p.fecha)}</td>
                        <td className="px-4 py-2.5 text-text text-sm text-right font-medium">{p.cantidad} {unidad}</td>
                        <td className="px-4 py-2.5 text-muted text-sm text-right">{p.sugerido}</td>
                        <td className="px-4 py-2.5 text-muted text-sm text-right">{entradasPorConteo[p.conteoId] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
