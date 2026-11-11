'use client'

import { Fragment, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react'
import { calcularHistorialPedidos, contarPorEstado, type FacturaReporte, type PedidoReporte } from '@/lib/compras/reportes'
import { ESTADOS_VISIBLES, type EstadoVisible } from '@/lib/compras/estadoPedido'
import { ESTADOS } from '@/lib/estados'
import { codigoPedido } from '@/lib/compras/codigos'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import LinkEntidad from '@/components/ui/LinkEntidad'
import EstadoBadge from '@/components/ui/EstadoBadge'
import EmptyState from '@/components/ui/EmptyState'

// Color de cada barra por token del tono del estado (claro y oscuro).
const COLOR: Record<EstadoVisible, string> = {
  sin_enviar: 'var(--color-muted)',
  enviado: 'var(--color-info)',
  parcial: 'var(--color-warning)',
  recibido: 'var(--color-success)',
  cerrado: 'var(--color-faint)',
  facturado: 'var(--color-accent)',
  devuelto: 'var(--color-brand-red)',
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { estado: string; cantidad: number } }[] }) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-text font-medium">{f.estado}: {f.cantidad}</p>
    </div>
  )
}

const th = 'px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted'

/** Fecha 'YYYY-MM-DD' o timestamp, en corto; vacía → "—". */
const fecha = (v: string | null) => (v ? formatearFecha(v) : '—')

export default function HistorialPedidos({
  pedidos,
  facturas,
  esAdmin,
}: {
  pedidos: PedidoReporte[]
  facturas: FacturaReporte[]
  /** El total facturado es dato de admin (P1): para el resto la columna no se muestra. */
  esAdmin: boolean
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const filas = calcularHistorialPedidos(pedidos, facturas)
  const columnas = esAdmin ? 8 : 7

  if (filas.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        <EmptyState icono={ClipboardList} titulo="No hay pedidos en el período elegido" />
      </div>
    )
  }

  // Los 7 estados en el orden del flujo, también los que están en 0.
  const conteo = contarPorEstado(pedidos)
  const datosChart = ESTADOS_VISIBLES.map(estado => ({
    estado: ESTADOS.compras_pedido[estado].label,
    cantidad: conteo[estado],
    color: COLOR[estado],
  }))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Pedidos por estado</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={datosChart} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis type="category" dataKey="estado" width={150} tick={{ fill: 'var(--color-text)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface2)' }} />
            <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {datosChart.map(d => <Cell key={d.estado} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface2">
              <tr>
                <th className={th}>N°</th>
                <th className={th}>Proveedor</th>
                <th className={th}>Estado</th>
                <th className={th}>Creado</th>
                <th className={th}>Enviado</th>
                <th className={th}>Último remito</th>
                <th className={`${th} text-right`}>Remitos</th>
                {esAdmin && <th className={`${th} text-right`}>Facturado</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(p => {
                const abierto = expandidoId === p.pedidoId
                return (
                  <Fragment key={p.pedidoId}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-surface2"
                      onClick={() => setExpandidoId(abierto ? null : p.pedidoId)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-text">
                        <span className="inline-flex items-center gap-1.5">
                          {abierto ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                          <LinkEntidad entidad={{ tipo: 'pedido', id: p.pedidoId }}>{codigoPedido(p.numero)}</LinkEntidad>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-text">
                        <LinkEntidad entidad={{ tipo: 'proveedor', id: p.proveedorId }} variante="texto" title="Ver la ficha del proveedor">{p.proveedorNombre}</LinkEntidad>
                      </td>
                      <td className="px-4 py-3"><EstadoBadge dominio="compras_pedido" estado={p.estado} /></td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{fecha(p.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{fecha(p.enviadoEn)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{fecha(p.ultimoRemito)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{p.remitosCount}</td>
                      {esAdmin && (
                        <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${p.facturado == null ? 'text-muted' : 'text-text'}`}>
                          {p.facturado == null ? 'Sin facturar' : formatearMonedaExacta(p.facturado)}
                        </td>
                      )}
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={columnas} className="bg-surface2 px-4 py-3">
                          {p.remitos.length === 0 ? (
                            <p className="text-xs text-muted">Sin remitos registrados.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted">
                                  <th className="py-1 pr-3 text-left font-semibold">Remito</th>
                                  <th className="py-1 pr-3 text-left font-semibold">Fecha</th>
                                  <th className="py-1 text-left font-semibold">Líneas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.remitos.map(r => (
                                  <tr key={r.remitoId} className="text-text">
                                    <td className="py-1 pr-3"><LinkEntidad entidad={{ tipo: 'remito', id: r.remitoId }}>{r.numero}</LinkEntidad></td>
                                    <td className="py-1 pr-3 tabular-nums">{fecha(r.fecha)}</td>
                                    <td className="py-1 tabular-nums">{r.lineasCount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
