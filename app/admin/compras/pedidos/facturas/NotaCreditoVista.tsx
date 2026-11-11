'use client'

import { useState } from 'react'
import { Ban, Check, FileX2, Wallet } from 'lucide-react'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { etiquetaAlicuota } from '@/lib/compras/totalesFactura'
import AnularDesdeFactura from '../devoluciones/AnularDesdeFactura'
import type { FacturaVista } from './modelo'
import type { FacturaItemFila } from './datos'

function textoGasto(nc: FacturaVista): string {
  switch (nc.ncGasto) {
    case 'descontado': return `Se descontaron ${formatearMonedaExacta(nc.gastoDescontado ?? 0)} del gasto de la factura.`
    case 'cancelo_gasto': return 'Canceló el gasto de la factura: quedó en $ 0, pagado con esta nota de crédito.'
    case 'a_favor': return 'A favor: el gasto ya estaba pagado. Se descuenta del próximo pago (cuenta corriente en noviembre).'
    case 'sin_gasto': return 'La factura no tenía gasto: la nota de crédito resta en los reportes.'
    default: return 'Sin datos del gasto.'
  }
}

/**
 * Una nota de crédito (B4, §6.6), solo lectura: qué factura corrige, de qué
 * devolución salió, sus líneas y qué pasó con el gasto. Sin compartir (D5) ni editar.
 */
export default function NotaCreditoVista({
  nc, items, onCerrar,
}: {
  nc: FacturaVista
  items: FacturaItemFila[]
  onCerrar: () => void
}) {
  const [anulando, setAnulando] = useState(false)
  const lineas = [...items].sort((a, b) => a.orden - b.orden)
  const confirmada = nc.estado === 'confirmada'

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm">
        <p className="text-muted">
          Corrige la factura{' '}
          {nc.facturaOrigenId
            ? <LinkEntidad entidad={{ tipo: 'factura', id: nc.facturaOrigenId }}>{nc.facturaOrigenNumero ?? '—'}</LinkEntidad>
            : '—'}
          {' · '}{nc.proveedor} · pedido <LinkEntidad entidad={{ tipo: 'pedido', id: nc.pedidoId }}>{nc.codigo}</LinkEntidad>
        </p>
        <p className="text-muted">
          De la devolución{' '}
          {nc.devolucionId
            ? <LinkEntidad entidad={{ tipo: 'devolucion', id: nc.devolucionId, pedidoId: nc.pedidoId }}>{nc.devolucionCodigo ?? '—'}</LinkEntidad>
            : '—'}
          {nc.fecha && <> · fecha {formatearFecha(nc.fecha)}</>}
        </p>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {lineas.map(l => (
          <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
            <span className="min-w-0 text-text">{l.descripcion}</span>
            <span className="tabular-nums text-muted">
              {(l.precio_por === 'base' ? l.cantidad_base ?? 0 : l.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 3 })}
              {' × '}{formatearMonedaExacta(l.precio_unitario)} · IVA {etiquetaAlicuota(l.alicuota_iva)}
              <span className="ml-3 font-semibold text-text">{formatearMonedaExacta(l.subtotal ?? 0)}</span>
            </span>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-surface2 px-4 py-3 text-sm tabular-nums">
        <dt className="text-muted">Subtotal</dt><dd className="text-right text-text">{formatearMonedaExacta(nc.subtotal)}</dd>
        <dt className="text-muted">IVA</dt><dd className="text-right text-text">{formatearMonedaExacta(nc.iva)}</dd>
        <dt className="font-semibold text-text">Total de la nota de crédito</dt><dd className="text-right font-bold text-text">−{formatearMonedaExacta(nc.total)}</dd>
      </dl>

      {confirmada ? (
        <>
          <p className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-muted">
            <Check size={15} className="shrink-0 text-success" />
            Cargada{nc.confirmadaEn && <> el {formatearFechaHora(nc.confirmadaEn)}</>}{nc.confirmadaPor && <> por {nc.confirmadaPor}</>}.
          </p>
          <p className="flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-text">
            <Wallet size={15} className="mt-0.5 shrink-0 text-accent-fg" />
            <span>
              {textoGasto(nc)}{' '}
              {nc.gastoId && <LinkEntidad entidad={{ tipo: 'gasto', id: nc.gastoId }} variante="texto">Ver el gasto</LinkEntidad>}
            </span>
          </p>
        </>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-danger-bg px-3 py-2.5 text-sm text-brand-red">
          <Ban size={15} className="mt-0.5 shrink-0" />
          <span>
            Anulada{nc.anuladaEn && <> el {formatearFechaHora(nc.anuladaEn)}</>}{nc.anuladaPor && <> por {nc.anuladaPor}</>}.
            {nc.anuladaMotivo && <> Motivo: {nc.anuladaMotivo}</>}
          </span>
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
        {confirmada && nc.devolucionId && (
          <button type="button" onClick={() => setAnulando(true)} className="presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg sm:mr-auto">
            <FileX2 size={15} className="text-brand-red" /> Anular nota de crédito
          </button>
        )}
        <button type="button" onClick={onCerrar} className="presionable min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 sm:ml-auto">
          Cerrar
        </button>
      </div>

      {anulando && nc.devolucionId && (
        <AnularDesdeFactura pedidoId={nc.pedidoId} devolucionId={nc.devolucionId} onCerrar={() => setAnulando(false)} />
      )}
    </div>
  )
}
