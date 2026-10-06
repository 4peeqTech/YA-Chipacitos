'use client'

import EstadoBadge from '@/components/ui/EstadoBadge'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { ESTADOS } from '@/lib/estados'

type EstadoGasto = keyof typeof ESTADOS.gastos

/**
 * Cómo está pagada una factura confirmada (B3): el estado de su gasto, que
 * lleva al gasto, o "Sin gasto". Lo usan la Cuenta del proveedor y "Gasto por
 * proveedor" de Reportes.
 */
export default function PagoFactura({ gastoId, gastoEstado }: { gastoId: string | null; gastoEstado: string | null }) {
  if (!gastoId) {
    return (
      <span className="text-xs text-muted" title="La factura está confirmada pero no tiene gasto en Gastos (se borró o se vinculó a otro)">
        Sin gasto
      </span>
    )
  }
  const estado: EstadoGasto = gastoEstado && gastoEstado in ESTADOS.gastos ? (gastoEstado as EstadoGasto) : 'Pendiente de pago'
  return (
    <LinkEntidad entidad={{ tipo: 'gasto', id: gastoId }} variante="texto" title="Ver el gasto" className="inline-flex">
      <EstadoBadge dominio="gastos" estado={estado} />
    </LinkEntidad>
  )
}
