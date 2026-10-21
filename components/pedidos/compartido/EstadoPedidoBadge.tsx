import { Clock, PackageOpen, Truck, CircleCheck, CircleX, type LucideIcon } from 'lucide-react'
import type { EstadoPedido } from '@/lib/types'
import { ESTADOS_PEDIDO } from '@/lib/pedidos/estados'

const ICONO: Record<EstadoPedido, LucideIcon> = {
  pendiente: Clock,
  preparando: PackageOpen,
  enviado: Truck,
  recibido: CircleCheck,
  cancelado: CircleX,
}

export default function EstadoPedidoBadge({ estado, className = '' }: { estado: EstadoPedido; className?: string }) {
  const info = ESTADOS_PEDIDO[estado]
  const Icono = ICONO[estado]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide whitespace-nowrap ${info.clase} ${className}`}>
      <Icono size={12} aria-hidden />
      {info.label}
    </span>
  )
}
