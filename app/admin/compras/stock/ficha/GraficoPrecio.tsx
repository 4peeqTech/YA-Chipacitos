'use client'

import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SegmentedControl } from '@/components/ui/Chip'
import { formatearMonedaExacta } from '@/lib/formato'
import { convertirPrecio, etiquetaCobraPor, tieneConversion, type CobraPor, type UnidadesInsumo } from '@/lib/compras/unidades'
import { puntosPrecio, seriesPrecio, type LineaDocumento, type ModoPrecio } from '@/lib/compras/trazabilidad'

// Precio en los últimos 12 meses (A2c §6.4, reglas de dataviz): un solo eje, una
// serie por proveedor con color fijo, el modo cambia la serie (nunca agrega un eje).

interface Fila {
  t: number
  fecha: string
  proveedor: string
  numero: string
  subtotal: number
  precio: number
  [serie: string]: number | string
}

function fechaCorta(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

function epoch(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`)
}

function precioCorto(n: number): string {
  if (Math.abs(n) >= 10000) return `$ ${(n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil`
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: n < 100 ? 2 : 0 })}`
}

function TooltipPrecio({ active, payload, sufijo }: { active?: boolean; payload?: { payload: Fila }[]; sufijo: string }) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-muted">{fechaCorta(f.fecha)} · {f.proveedor}</p>
      <p className="font-semibold tabular-nums text-text">{formatearMonedaExacta(f.precio)} /{sufijo}</p>
      <p className="tabular-nums text-muted">Factura {f.numero} · {formatearMonedaExacta(f.subtotal)}</p>
    </div>
  )
}

export default function GraficoPrecio({
  lineas,
  unidades,
  modo,
  onModo,
  principalId,
  precioRef,
  cobraPorPrincipal,
}: {
  lineas: LineaDocumento[]
  unidades: UnidadesInsumo
  modo: ModoPrecio
  onModo: (m: ModoPrecio) => void
  principalId: string | null
  /** precio_ref del proveedor principal, en su cobra_por. */
  precioRef: number | null
  cobraPorPrincipal: CobraPor | null
}) {
  const conversion = tieneConversion(unidades)
  const sufijo = etiquetaCobraPor(modo, unidades)

  const { series, filas, ticks } = useMemo(() => {
    const puntos = puntosPrecio(lineas, unidades, modo)
    const series = seriesPrecio(puntos, principalId)
    const filas: Fila[] = series.flatMap(s => s.puntos.map(p => ({
      t: epoch(p.fecha), fecha: p.fecha, proveedor: p.proveedor, numero: p.numero, subtotal: p.subtotal, precio: p.precio,
      [s.proveedorId]: p.precio,
    })))
    filas.sort((a, b) => a.t - b.t)
    // Un tick por fecha distinta (dos facturas el mismo día repetían la etiqueta),
    // y como mucho 6 para que no se encimen.
    const dias = [...new Set(filas.map(f => f.t))]
    const paso = Math.ceil(dias.length / 6)
    const ticks = dias.filter((_, i) => i % paso === 0 || i === dias.length - 1)
    return { series, filas, ticks }
  }, [lineas, unidades, modo, principalId])

  const ref = precioRef != null && precioRef > 0 && cobraPorPrincipal
    ? convertirPrecio(precioRef, cobraPorPrincipal, modo, unidades.contenido)
    : null

  const selector = conversion && (
    <SegmentedControl<ModoPrecio>
      opciones={[
        { value: 'unidad', label: `por ${etiquetaCobraPor('unidad', unidades)}` },
        { value: 'base', label: `por ${etiquetaCobraPor('base', unidades)}` },
      ]}
      value={modo}
      onChange={onModo}
    />
  )

  let cuerpo: React.ReactNode
  if (filas.length === 0) {
    cuerpo = <p className="py-6 text-center text-sm text-muted">Sin facturas en los últimos 12 meses.</p>
  } else if (filas.length === 1) {
    const f = filas[0]
    cuerpo = (
      <p className="py-4 text-sm text-text tabular-nums">
        Una sola factura: <strong>{formatearMonedaExacta(f.precio)} /{sufijo}</strong> el {fechaCorta(f.fecha)} ({f.proveedor}).
      </p>
    )
  } else {
    cuerpo = (
      <>
        {series.length >= 2 && (
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Proveedores del gráfico">
            {series.map(s => (
              <li key={s.proveedorId} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.proveedor}
              </li>
            ))}
          </ul>
        )}
        <div className="h-[220px] sm:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filas} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                interval={0}
                tickFormatter={(t: number) => fechaCorta(new Date(t).toISOString().slice(0, 10))}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={precioCorto}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
                domain={[0, 'auto']}
              />
              <Tooltip content={<TooltipPrecio sufijo={sufijo} />} cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }} />
              {ref != null && (
                <ReferenceLine
                  y={ref}
                  stroke="var(--color-muted)"
                  strokeDasharray="4 4"
                  label={{ value: 'Ref.', position: 'insideTopRight', fill: 'var(--color-muted)', fontSize: 11 }}
                />
              )}
              {series.map(s => (
                <Line
                  key={s.proveedorId}
                  dataKey={s.proveedorId}
                  name={s.proveedor}
                  type="linear"
                  stroke={s.color}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 4, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Precio en los últimos 12 meses</h4>
        {selector}
      </div>
      {cuerpo}
    </div>
  )
}
