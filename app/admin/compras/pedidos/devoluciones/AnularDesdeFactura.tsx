'use client'

import { XCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import AnularModal from './AnularModal'
import { useContextoDevolucion } from './useContextoDevolucion'

/**
 * "Anular nota de crédito" desde la vista de la NC en Facturas: carga la
 * devolución y el pedido (como el modal de registrar) y abre el mismo AnularModal.
 */
export default function AnularDesdeFactura({
  pedidoId, devolucionId, onCerrar,
}: {
  pedidoId: string
  devolucionId: string
  onCerrar: () => void
}) {
  const { ctx, error, cargando } = useContextoDevolucion(pedidoId, true)
  const dev = ctx?.devoluciones.find(d => d.id === devolucionId) ?? null

  if (cargando || error || !ctx || !dev) {
    return (
      <Modal open onClose={onCerrar} title="Anular la nota de crédito" size="lg" accent="red">
        {cargando
          ? <div className="space-y-3" aria-busy="true"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-20 w-full" /></div>
          : <EmptyState icono={XCircle} titulo="No se pudo abrir" descripcion={error ?? 'No encontramos la devolución de esta nota de crédito. Recargá la página.'} />}
      </Modal>
    )
  }

  return (
    <AnularModal
      modo="nota_credito"
      devolucion={dev}
      onCerrar={onCerrar}
      contexto={{
        estado: { estado_recepcion: ctx.pedido.estadoRecepcion, estado_facturacion: ctx.pedido.estadoFacturacion },
        lineas: ctx.lineas,
        hayRemitos: ctx.pedido.hayRemitos,
        devoluciones: ctx.devoluciones,
        stockPorItem: ctx.stock,
        gasto: ctx.factura?.gastoId ? { id: ctx.factura.gastoId, estado: ctx.factura.gastoEstado, monto: ctx.factura.gastoMonto } : null,
        facturaNumero: ctx.factura?.numero ?? null,
      }}
    />
  )
}
