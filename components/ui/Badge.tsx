import { EstadoPedido } from '@/lib/types'
import { refDeUrl, REF_PROD } from '@/lib/entorno'

const estadoConfig: Record<EstadoPedido, { label: string; class: string }> = {
  pendiente:  { label: 'Pendiente',       class: 'bg-warning-bg text-warning' },
  preparando: { label: 'En preparación',  class: 'bg-accent-bg text-accent' },
  enviado:    { label: 'Enviado',         class: 'bg-info-bg text-accent2' },
  recibido:   { label: 'Recibido',        class: 'bg-green-bg text-success' },
}

export function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const cfg = estadoConfig[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${cfg.class}`}>
      {cfg.label}
    </span>
  )
}

export function BadgeDestino({ destino }: { destino: 'fabrica' | 'deposito' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold ${
      destino === 'fabrica'
        ? 'bg-violet-400/15 text-violet-400'
        : 'bg-sky-400/15 text-sky-400'
    }`}>
      {destino === 'fabrica' ? '🏭 Fábrica' : '📦 Depósito'}
    </span>
  )
}

export function BadgeOk() {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-green-bg text-success">OK</span>
}

export function BadgeDiff() {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-danger-bg text-brand-red">Diferencia</span>
}

// Pill visible cuando el bundle apunta a otro proyecto que no es prod —
// reemplaza "grepear el JS del deploy" como método de detección.
export function BadgeEntorno() {
  const ref = refDeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (ref === REF_PROD) return null
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide bg-danger-bg text-brand-red">
      Datos de dev
    </span>
  )
}
