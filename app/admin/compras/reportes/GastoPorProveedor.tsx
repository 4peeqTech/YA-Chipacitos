'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, ChevronDown, ChevronRight, Lock, ReceiptText } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { calcularGastoPorProveedor, type FacturaReporte, type PedidoReporte } from '@/lib/compras/reportes'
import { codigoPedido } from '@/lib/compras/codigos'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { proveedorNombre: string; total: number } }[] }) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text">{f.proveedorNombre}</p>
      <p className="font-semibold tabular-nums text-accent-fg">{formatearMonedaExacta(f.total)}</p>
    </div>
  )
}

const th = 'px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted'
const thNum = `${th} text-right`

/**
 * Gasto por proveedor desde las facturas confirmadas del período (F5): subtotal
 * sin IVA, IVA y total. Los pedidos que ya recibieron mercadería y no tienen
 * factura se cuentan aparte, porque su plata todavía no está en el total.
 */
export default function GastoPorProveedor({
  facturas,
  pedidos,
  esAdmin,
}: {
  facturas: FacturaReporte[]
  /** Todos (no solo los del período): "recibido sin facturar" es cómo está hoy. */
  pedidos: PedidoReporte[]
  esAdmin: boolean
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  if (!esAdmin) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        <EmptyState
          icono={Lock}
          titulo="El gasto lo ve un administrador"
          descripcion="Sale de las facturas de los proveedores, que solo carga y ve un administrador."
        />
      </div>
    )
  }

  const filas = calcularGastoPorProveedor(facturas, pedidos)
  const conFacturas = filas.filter(f => f.facturasCount > 0)
  const subtotal = filas.reduce((t, f) => t + f.subtotal, 0)
  const iva = filas.reduce((t, f) => t + f.iva, 0)
  const total = filas.reduce((t, f) => t + f.total, 0)
  const sinFacturar = filas.reduce((t, f) => t + f.recibidosSinFacturar, 0)

  const avisoSinFacturar = sinFacturar > 0 && (
    <Link
      href="/admin/compras/pedidos"
      className="flex min-h-11 items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning transition-opacity hover:opacity-90"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      {sinFacturar === 1
        ? '1 pedido ya recibió mercadería y no tiene factura: su gasto todavía no está en este reporte.'
        : `${sinFacturar} pedidos ya recibieron mercadería y no tienen factura: su gasto todavía no está en este reporte.`}
      {' '}Cargalas desde Pedidos › Por facturar.
    </Link>
  )

  if (conFacturas.length === 0) {
    return (
      <div className="space-y-4">
        {avisoSinFacturar}
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState
            icono={ReceiptText}
            titulo="No hay facturas confirmadas en el período"
            descripcion="El gasto sale de las facturas de los proveedores: cuando confirmes una, aparece acá."
          />
        </div>
      </div>
    )
  }

  const datosChart = [...conFacturas].sort((a, b) => b.total - a.total).slice(0, 8).reverse()

  return (
    <div className="space-y-4">
      {avisoSinFacturar}

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Total facturado por proveedor (top {datosChart.length})</p>
        <ResponsiveContainer width="100%" height={Math.max(180, datosChart.length * 36)}>
          <BarChart data={datosChart} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis type="category" dataKey="proveedorNombre" width={120} tick={{ fill: 'var(--color-text)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface2)' }} />
            <Bar dataKey="total" fill="var(--color-accent)" radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface2">
              <tr>
                <th className={th}>Proveedor</th>
                <th className={thNum}>Facturas</th>
                <th className={thNum}>Sin IVA</th>
                <th className={thNum}>IVA</th>
                <th className={thNum}>Total</th>
                <th className={thNum}>Recibidos sin facturar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(f => {
                const abierto = expandidoId === f.proveedorId
                return (
                  <Fragment key={f.proveedorId}>
                    <tr className={f.facturasCount > 0 ? 'cursor-pointer transition-colors hover:bg-surface2' : ''} onClick={() => f.facturasCount > 0 && setExpandidoId(abierto ? null : f.proveedorId)}>
                      <td className="px-4 py-3 font-medium text-text">
                        <span className="inline-flex items-center gap-1.5">
                          {f.facturasCount > 0
                            ? (abierto ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />)
                            : <span className="w-3.5" />}
                          {f.proveedorNombre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{f.facturasCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{formatearMonedaExacta(f.subtotal)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{formatearMonedaExacta(f.iva)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-text">{formatearMonedaExacta(f.total)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${f.recibidosSinFacturar > 0 ? 'font-semibold text-warning' : 'text-muted'}`}>{f.recibidosSinFacturar}</td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={6} className="bg-surface2 px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted">
                                <th className="py-1 pr-3 text-left font-semibold">Factura</th>
                                <th className="py-1 pr-3 text-left font-semibold">Pedido</th>
                                <th className="py-1 pr-3 text-left font-semibold">Fecha</th>
                                <th className="py-1 pr-3 text-right font-semibold">Sin IVA</th>
                                <th className="py-1 pr-3 text-right font-semibold">IVA</th>
                                <th className="py-1 text-right font-semibold">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {f.detalle.map(d => (
                                <tr key={d.facturaId} className="text-text">
                                  <td className="py-1 pr-3">
                                    <Link
                                      href={`/admin/compras/pedidos/facturas?factura=${d.facturaId}`}
                                      onClick={e => e.stopPropagation()}
                                      className="font-mono tabular-nums underline decoration-accent decoration-2 underline-offset-2 hover:opacity-80"
                                    >
                                      {d.numero}
                                    </Link>
                                    {d.esNotaCredito && <span className="ml-1.5 text-muted">nota de crédito</span>}
                                  </td>
                                  <td className="py-1 pr-3 font-mono tabular-nums text-muted">{d.pedidoNumero != null ? codigoPedido(d.pedidoNumero) : '—'}</td>
                                  <td className="py-1 pr-3 text-muted">{d.fecha ? formatearFecha(d.fecha) : '—'}</td>
                                  <td className="whitespace-nowrap py-1 pr-3 text-right tabular-nums">{formatearMonedaExacta(d.subtotal)}</td>
                                  <td className="whitespace-nowrap py-1 pr-3 text-right tabular-nums">{formatearMonedaExacta(d.iva)}</td>
                                  <td className="whitespace-nowrap py-1 text-right tabular-nums">{formatearMonedaExacta(d.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot className="border-t border-border">
              <tr className="font-semibold text-text">
                <td className="px-4 py-3" colSpan={2}>Total del período</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatearMonedaExacta(subtotal)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatearMonedaExacta(iva)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatearMonedaExacta(total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sinFacturar}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
