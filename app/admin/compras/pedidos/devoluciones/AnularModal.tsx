'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Ban, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { ChipGroup } from '@/components/ui/Chip'
import { controlClass } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearMonedaExacta } from '@/lib/formato'
import {
  bloqueoAnularNc, estadoRecepcionConDevolucion, textoImpactoEstado,
} from '@/lib/compras/devoluciones'
import type { EstadoFacturacion, EstadoRecepcion } from '@/lib/compras/estadoPedido'
import { anularDevolucion, anularNotaCredito } from './acciones'
import type { DevolucionVista } from './datos'

type MotivoRapido = 'error' | 'no_acepto' | 'otro'
const MOTIVOS: { value: MotivoRapido; label: string }[] = [
  { value: 'error', label: 'Se cargó por error' },
  { value: 'no_acepto', label: 'El proveedor no la aceptó' },
  { value: 'otro', label: 'Otro' },
]

export interface ContextoAnular {
  estado: { estado_recepcion: EstadoRecepcion; estado_facturacion: EstadoFacturacion }
  /** Líneas del pedido con lo que ya pasó (v_compras_pedido_pendiente). */
  lineas: { pedidoItemId: string; cantidad: number; recibido: number; devuelto: number; devueltoSinRepone: number }[]
  hayRemitos: boolean
  devoluciones: DevolucionVista[]
  stockPorItem: Record<string, number>
  gasto: { id: string; estado: string | null; monto: number | null } | null
  facturaNumero: string | null
}

/**
 * Anular una devolución o solo su nota de crédito (§6.5). Muestra el impacto
 * antes de confirmar y frena de antemano lo que la base va a rechazar.
 */
export default function AnularModal({
  modo, devolucion, contexto, onCerrar,
}: {
  modo: 'devolucion' | 'nota_credito'
  devolucion: DevolucionVista | null
  contexto: ContextoAnular
  onCerrar: () => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [rapido, setRapido] = useState<MotivoRapido>('error')
  const [texto, setTexto] = useState('')
  const d = devolucion

  if (!d) return <Modal open={false} onClose={onCerrar} title="Anular">{null}</Modal>

  const tieneNc = !!d.notaCreditoId
  const motivo = rapido === 'otro' ? texto.trim() : `${MOTIVOS.find(m => m.value === rapido)!.label}${texto.trim() ? `: ${texto.trim()}` : ''}`

  // Impacto
  const frases: string[] = []
  if (modo === 'devolucion' && d.devuelveMercaderia) {
    const porItem = new Map<string, { nombre: string; unidad: string | null; cantidad: number }>()
    for (const l of d.lineas) {
      if (!l.itemId) continue
      const p = porItem.get(l.itemId) ?? { nombre: l.descripcion, unidad: l.unidad, cantidad: 0 }
      p.cantidad += l.cantidad
      porItem.set(l.itemId, p)
    }
    for (const [itemId, p] of porItem) {
      const despues = (contexto.stockPorItem[itemId] ?? 0) + p.cantidad
      frases.push(`Vuelve a sumar ${p.cantidad.toLocaleString('es-AR')}${p.unidad ? ` ${p.unidad}` : ''} de ${p.nombre} (queda en ${despues.toLocaleString('es-AR')}).`)
    }
    // El estado sin esta devolución.
    const lineas = contexto.lineas.map(l => {
      const propias = d.lineas.filter(x => x.pedidoItemId === l.pedidoItemId).reduce((t, x) => t + x.cantidad, 0)
      return {
        cantidad: l.cantidad, recibido: l.recibido,
        devuelto: l.devuelto - propias, devueltoSinRepone: l.devueltoSinRepone - (d.repone ? 0 : propias),
      }
    })
    const otras = contexto.devoluciones.filter(x => x.id !== d.id && x.estado === 'activa' && x.devuelveMercaderia)
    const despues = estadoRecepcionConDevolucion({
      actual: contexto.estado.estado_recepcion === 'devuelto' ? 'recibido' : contexto.estado.estado_recepcion,
      lineas,
      netoTotal: lineas.reduce((t, l) => t + l.recibido - l.devuelto, 0),
      hayRemitos: contexto.hayRemitos,
      haySinRepone: otras.some(x => !x.repone),
    })
    frases.push(`El pedido: ${textoImpactoEstado(contexto.estado, despues, false).replace(/^./, c => c.toLowerCase())}`)
  } else if (modo === 'devolucion') {
    frases.push('El stock no se mueve.')
  }
  if (tieneNc) {
    const g = contexto.gasto
    const vuelve = d.ncGasto === 'descontado' || d.ncGasto === 'cancelo_gasto'
    frases.push(`Se anula la nota de crédito N° ${d.ncNumero ?? '—'}${vuelve && g?.monto != null && d.ncGastoDescontado != null
      ? ` y el gasto vuelve a ${formatearMonedaExacta(g.monto + d.ncGastoDescontado)}${d.ncGasto === 'cancelo_gasto' ? ' (pendiente de pago)' : ''}`
      : d.ncGasto === 'a_favor' ? ': el gasto ya estaba pagado y no cambia' : ''}.`)
  }
  if (modo === 'nota_credito') frases.push('La devolución queda activa, esperando una nota de crédito nueva.')

  const bloqueo = tieneNc ? bloqueoAnularNc({ ncGasto: d.ncGasto, gastoEstado: contexto.gasto?.estado ?? null, facturaNumero: contexto.facturaNumero }) : null
  const puede = !bloqueo && motivo.length > 0 && !isPending

  function anular() {
    startTransition(async () => {
      if (modo === 'nota_credito') {
        const r = await anularNotaCredito({ devolucionId: d!.id, motivo })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`Nota de crédito de ${d!.codigo} anulada`)
      } else {
        const r = await anularDevolucion({ devolucionId: d!.id, motivo })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`${d!.codigo} anulada${r.data.notaCreditoAnulada ? ' · también su nota de crédito' : ''}`)
      }
      onCerrar()
    })
  }

  const titulo = modo === 'nota_credito' ? `Anular la nota de crédito de ${d.codigo}` : `Anular ${d.codigo}`
  return (
    <Modal open onClose={() => { if (!isPending) onCerrar() }} title={titulo} size="lg" accent="red">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-text">¿Por qué la anulás?</legend>
          <ChipGroup opciones={MOTIVOS} value={rapido} onChange={setRapido} />
          <textarea
            aria-label="Detalle del motivo"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={2}
            maxLength={250}
            placeholder={rapido === 'otro' ? 'Contá qué pasó (obligatorio)' : 'Detalle (opcional)'}
            className={`${controlClass} py-2`}
          />
        </fieldset>

        <div className="space-y-1 rounded-xl bg-surface2 px-4 py-3 text-sm text-text">
          {frases.map(f => <p key={f}>{f}</p>)}
        </div>

        {bloqueo && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-3 py-2.5 text-sm text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {bloqueo}{' '}
              {contexto.gasto && <LinkEntidad entidad={{ tipo: 'gasto', id: contexto.gasto.id }} variante="texto">Ver el gasto</LinkEntidad>}
            </span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={isPending} className="presionable min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50">Volver</button>
          <button type="button" onClick={anular} disabled={!puede} className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {modo === 'nota_credito' ? 'Anular nota de crédito' : 'Anular devolución'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
