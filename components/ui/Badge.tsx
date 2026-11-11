import { EstadoPedido } from '@/lib/types'
import { refDeUrl, REF_PROD } from '@/lib/entorno'
import { ESTADOS_PEDIDO } from '@/lib/pedidos/estados'

export function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const cfg = ESTADOS_PEDIDO[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${cfg.clase}`}>
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

/** Conteo cerrado en un día distinto al de su lista. El motivo va en el title (desktop); en celular mostralo aparte. */
export function BadgeFueraDeDia({ motivo }: { motivo?: string | null }) {
  return (
    <span title={motivo ?? undefined} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-amber-400/15 text-amber-400 whitespace-nowrap">
      Fuera de día
    </span>
  )
}

export function BadgeDiff() {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-danger-bg text-brand-red">Diferencia</span>
}

// Pill visible cuando el bundle apunta a otro proyecto que no es prod —
// reemplaza "grepear el JS del deploy" como método de detección.
/** `corto`: en celular dice "Dev" (el header operativo no tiene lugar para más). */
export function BadgeEntorno({ corto = false }: { corto?: boolean }) {
  const ref = refDeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (ref === REF_PROD) return null
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide bg-danger-bg text-brand-red">
      {corto ? (
        <>
          <span className="sm:hidden">Dev</span>
          <span className="hidden sm:inline">Datos de dev</span>
        </>
      ) : 'Datos de dev'}
    </span>
  )
}
