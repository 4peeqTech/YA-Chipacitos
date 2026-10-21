import {
  ArrowRight, Bot, CircleCheck, CircleX, Clock, PackageOpen, Pencil, TriangleAlert, Truck, type LucideIcon,
} from 'lucide-react'
import type { PedidoEvento, TipoEventoPedido } from '@/lib/types'
import { formatoCantidad } from '@/lib/pedidos/estados'

// Línea de tiempo del pedido (pedido_eventos). Las ediciones de quien
// despacha se resaltan con el antes → después de cada producto.

const TIPO: Record<TipoEventoPedido, { label: string; icono: LucideIcon; tono: string }> = {
  creado:                   { label: 'Pedido creado',              icono: Clock,         tono: 'text-muted' },
  preparando:               { label: 'Empezó la preparación',      icono: PackageOpen,   tono: 'text-accent' },
  editado:                  { label: 'Cambió lo que se manda',     icono: Pencil,        tono: 'text-warning' },
  enviado:                  { label: 'Salió: en camino',           icono: Truck,         tono: 'text-accent2' },
  recibido:                 { label: 'Llegó todo bien',            icono: CircleCheck,   tono: 'text-success' },
  recibido_con_diferencias: { label: 'Recibido con diferencias',   icono: TriangleAlert, tono: 'text-warning' },
  cancelado:                { label: 'Pedido cancelado',           icono: CircleX,       tono: 'text-muted' },
  cierre_automatico:        { label: 'Cerrado automáticamente',    icono: Bot,           tono: 'text-faint' },
}

interface Cambio { tipo?: string; producto_nombre?: string; antes?: number; despues?: number }
interface Diferencia { producto_nombre?: string; enviada?: number; recibida?: number; agregado?: boolean }

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function DetalleEdicion({ cambios }: { cambios: Cambio[] }) {
  return (
    <ul className="mt-1.5 space-y-1 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2">
      {cambios.map((c, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text">{c.producto_nombre}</span>
          {c.tipo === 'agregado' ? (
            <span className="text-warning font-semibold">agregado: {formatoCantidad(c.despues)}</span>
          ) : c.tipo === 'quitado' ? (
            <span className="text-warning font-semibold">quitado (se pidió {formatoCantidad(c.antes)})</span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold">
              <span className="text-muted line-through">{formatoCantidad(c.antes)}</span>
              <ArrowRight size={12} className="text-warning" aria-label="pasa a" />
              <span className="text-warning">{formatoCantidad(c.despues)}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function DetalleRecepcion({ diferencias, nota }: { diferencias: Diferencia[]; nota?: string | null }) {
  return (
    <div className="mt-1.5 space-y-1">
      {diferencias.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-border bg-surface2 px-3 py-2">
          {diferencias.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-text">{d.producto_nombre}</span>
              <span className="text-muted">
                {d.agregado ? 'llegó sin pedirse:' : `se mandó ${formatoCantidad(d.enviada)}, llegó`}
              </span>
              <span className="font-semibold text-warning">{formatoCantidad(d.recibida)}</span>
            </li>
          ))}
        </ul>
      )}
      {nota && <p className="text-xs text-muted italic">“{nota}”</p>}
    </div>
  )
}

export default function HistorialEventos({ eventos }: { eventos: PedidoEvento[] }) {
  const ordenados = [...eventos].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  if (ordenados.length === 0) {
    return <p className="text-xs text-faint">Sin movimientos registrados.</p>
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-5">
      {ordenados.map(ev => {
        const info = TIPO[ev.tipo] ?? { label: ev.tipo, icono: Clock, tono: 'text-muted' }
        const Icono = info.icono
        const detalle = ev.detalle ?? {}
        const motivo = typeof detalle.motivo === 'string' ? detalle.motivo : null
        return (
          <li key={ev.id} className="relative">
            <span className={`absolute -left-[29px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface border border-border ${info.tono}`}>
              <Icono size={11} aria-hidden />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-sm font-semibold ${ev.tipo === 'editado' ? 'text-warning' : 'text-text'}`}>{info.label}</span>
              <span className="text-2xs text-faint">
                {fechaHora(ev.created_at)}{ev.autor_nombre ? ` · ${ev.autor_nombre}` : ''}
              </span>
            </div>
            {ev.tipo === 'editado' && Array.isArray(detalle.cambios) && (
              <DetalleEdicion cambios={detalle.cambios as Cambio[]} />
            )}
            {(ev.tipo === 'recibido' || ev.tipo === 'recibido_con_diferencias') && (
              <DetalleRecepcion
                diferencias={Array.isArray(detalle.diferencias) ? detalle.diferencias as Diferencia[] : []}
                nota={typeof detalle.nota === 'string' ? detalle.nota : null}
              />
            )}
            {motivo && (ev.tipo === 'cancelado' || ev.tipo === 'cierre_automatico') && (
              <p className="mt-0.5 text-xs text-muted">{motivo}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
