import type { EstadoPedido } from '@/lib/types'

export interface EstadoPedidoInfo {
  label: string
  /** Clases de fondo y texto para badges. */
  clase: string
  /** Color del borde/acento (tarjetas, barras). */
  borde: string
}

// "enviado" se muestra como "En camino" en toda la app.
export const ESTADOS_PEDIDO: Record<EstadoPedido, EstadoPedidoInfo> = {
  pendiente:  { label: 'Pendiente',      clase: 'bg-warning-bg text-warning', borde: 'border-t-warning' },
  preparando: { label: 'En preparación', clase: 'bg-accent-bg text-accent',   borde: 'border-t-accent' },
  enviado:    { label: 'En camino',      clase: 'bg-info-bg text-accent2',    borde: 'border-t-accent2' },
  recibido:   { label: 'Recibido',       clase: 'bg-green-bg text-success',   borde: 'border-t-success' },
  cancelado:  { label: 'Cancelado',      clase: 'bg-surface2 text-muted',     borde: 'border-t-border' },
}

export const ORDEN_ESTADOS: EstadoPedido[] = ['pendiente', 'preparando', 'enviado', 'recibido', 'cancelado']

export function etiquetaEstado(estado: EstadoPedido): string {
  return ESTADOS_PEDIDO[estado]?.label ?? estado
}

/** Recibido o cancelado: ya no admite cambios. */
export function esCerrado(estado: EstadoPedido): boolean {
  return estado === 'recibido' || estado === 'cancelado'
}

/** Pendiente o en preparación: el operador todavía puede editar, y se puede cancelar. */
export function esEditable(estado: EstadoPedido): boolean {
  return estado === 'pendiente' || estado === 'preparando'
}

/** Cantidad con hasta 3 decimales, en formato argentino (1,5). */
export function formatoCantidad(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}
