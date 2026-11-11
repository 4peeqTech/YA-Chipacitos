'use client'

import { useState, useTransition } from 'react'
import { Info, Loader2, Lock, Trash2 } from 'lucide-react'
import { ChipGroup } from '@/components/ui/Chip'
import { Field, controlClass } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { cerrarPedidoManual, eliminarPedido } from './acciones'
import type { PedidoVista } from './modelo'

// TODO(config): motivos de cierre y de eliminación a compras_config si Marcos quiere editarlos.
const MOTIVOS = {
  cerrar: ['Enviado por error', 'Proveedor sin stock', 'No se va a recibir', 'Otro'],
  eliminar: ['Creado por error', 'Pedido duplicado', 'Ya no hace falta', 'Otro'],
} as const
type Motivo = (typeof MOTIVOS)[keyof typeof MOTIVOS][number]

/**
 * Contenido del modal del pedido para "Cerrar a mano" o "Eliminar" (se muestra
 * dentro del mismo Modal). Los dos piden motivo: el cierre queda en el
 * historial y la eliminación en la pestaña Eliminados, junto al número.
 */
export default function CerrarPedidoModal({
  pedido,
  modo = 'cerrar',
  onVolver,
  onCerrado,
}: {
  pedido: PedidoVista
  modo?: 'cerrar' | 'eliminar'
  onVolver: () => void
  onCerrado: () => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [motivo, setMotivo] = useState<Motivo | ''>('')
  const [otro, setOtro] = useState('')
  const [intento, setIntento] = useState(false)

  const texto = motivo === 'Otro' ? otro.trim() : motivo
  const faltan = pedido.lineas.filter(l => (l.pendiente ?? 0) > 0).length

  function cerrar() {
    setIntento(true)
    if (!texto) return
    startTransition(async () => {
      const r = modo === 'eliminar'
        ? await eliminarPedido({ pedidoId: pedido.fila.id, motivo: texto })
        : await cerrarPedidoManual({ pedidoId: pedido.fila.id, motivo: texto })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(modo === 'eliminar' ? `${pedido.codigo} eliminado` : `${pedido.codigo} cerrado`)
      onCerrado()
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {modo === 'eliminar' ? (
          <>El pedido se borra y su número <span className="font-mono tabular-nums text-text">{pedido.codigo}</span> no se vuelve a usar.</>
        ) : (
          <>
            El pedido deja de esperar mercadería.
            {pedido.recibioAlgo && faltan > 0 && <> Lo que falta llegar ({faltan} línea{faltan === 1 ? '' : 's'}) se da por cerrado.</>}
          </>
        )}
      </p>

      <Field label={modo === 'eliminar' ? '¿Por qué lo eliminás?' : '¿Por qué lo cerrás?'} obligatorio>
        <ChipGroup
          opciones={MOTIVOS[modo].map(m => ({ value: m, label: m }))}
          value={motivo as Motivo}
          onChange={setMotivo}
        />
      </Field>

      {motivo === 'Otro' && (
        <Field label="Contanos el motivo" obligatorio>
          <textarea
            aria-label={modo === 'eliminar' ? 'Motivo de la eliminación' : 'Motivo del cierre'}
            value={otro}
            onChange={e => setOtro(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="Ej.: se lo pedimos a otro proveedor"
            className={controlClass}
          />
        </Field>
      )}

      {intento && !texto && (
        <p className="text-sm text-brand-red">{motivo === 'Otro' ? 'Escribí el motivo.' : 'Elegí un motivo.'}</p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        {modo === 'eliminar'
          ? 'Queda registrado en la pestaña Eliminados, con quién y cuándo, así se sabe por qué falta ese número.'
          : 'Queda en el historial del pedido. Si después llega la mercadería, reabrí el pedido y cargá el remito.'}
      </p>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onVolver}
          disabled={isPending}
          className="presionable min-h-11 rounded-xl border border-border px-5 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={cerrar}
          disabled={isPending}
          className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : modo === 'eliminar' ? <Trash2 size={16} /> : <Lock size={16} />}
          {modo === 'eliminar' ? 'Eliminar pedido' : 'Cerrar pedido'}
        </button>
      </div>
    </div>
  )
}
