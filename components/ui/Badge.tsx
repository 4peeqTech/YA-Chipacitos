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

// Aviso de entorno de prueba: se ve cuando el bundle apunta a un proyecto de
// Supabase que no es el de producción (QA y local usan la base de dev). Así
// nadie carga datos reales en QA creyendo que está en el sistema de verdad.
// En producción no aparece nada.
const esEntornoPrueba = () => refDeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) !== REF_PROD
const EXPLICACION = 'Estás en el entorno de prueba: lo que cargues o cambies acá no afecta los datos reales del sistema.'

/** `corto`: en celular dice "Prueba" (el header operativo no tiene lugar para más). */
export function BadgeEntorno({ corto = false }: { corto?: boolean }) {
  if (!esEntornoPrueba()) return null
  const completo = 'Entorno de prueba · no afecta los datos reales'
  return (
    <span title={EXPLICACION}
      className="inline-flex items-center whitespace-nowrap rounded-full border border-warning/40 bg-warning-bg px-2.5 py-0.5 text-2xs font-semibold text-warning">
      {corto ? (
        <>
          <span className="sm:hidden">Prueba</span>
          <span className="hidden sm:inline lg:hidden">Entorno de prueba</span>
          <span className="hidden lg:inline">{completo}</span>
        </>
      ) : completo}
      <span className="sr-only">. {EXPLICACION}</span>
    </span>
  )
}

/** Franja fina a rayas arriba de todas las pantallas del entorno de prueba. */
export function FranjaEntorno() {
  if (!esEntornoPrueba()) return null
  return (
    <div aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-[repeating-linear-gradient(135deg,var(--color-warning)_0_10px,#111_10px_20px)]" />
  )
}
