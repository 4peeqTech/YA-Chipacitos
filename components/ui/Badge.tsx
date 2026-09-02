import { EstadoPedido } from '@/lib/types'
import { refDeUrl, REF_PROD } from '@/lib/entorno'

const estadoConfig: Record<EstadoPedido, { label: string; class: string }> = {
  pendiente:  { label: 'Pendiente',       class: 'bg-[rgba(240,168,73,.15)] text-[#f0a849]' },
  preparando: { label: 'En preparación',  class: 'bg-[rgba(232,197,71,.15)] text-[#e8c547]' },
  enviado:    { label: 'Enviado',         class: 'bg-[rgba(79,195,247,.15)] text-[#f0a030]' },
  recibido:   { label: 'Recibido',        class: 'bg-[rgba(86,214,138,.15)] text-[#56d68a]' },
}

export function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const cfg = estadoConfig[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cfg.class}`}>
      {cfg.label}
    </span>
  )
}

export function BadgeDestino({ destino }: { destino: 'fabrica' | 'deposito' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
      destino === 'fabrica'
        ? 'bg-[rgba(140,100,255,.15)] text-[#a78bfa]'
        : 'bg-[rgba(56,189,248,.15)] text-[#38bdf8]'
    }`}>
      {destino === 'fabrica' ? '🏭 Fábrica' : '📦 Depósito'}
    </span>
  )
}

export function BadgeOk() {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(86,214,138,.15)] text-[#56d68a]">OK</span>
}

export function BadgeDiff() {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(232,66,16,.15)] text-[#e84210]">Diferencia</span>
}

// Pill visible cuando el bundle apunta a otro proyecto que no es prod —
// reemplaza "grepear el JS del deploy" como método de detección.
export function BadgeEntorno() {
  const ref = refDeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (ref === REF_PROD) return null
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[rgba(232,66,16,.15)] text-[#e84210]">
      Datos de dev
    </span>
  )
}
