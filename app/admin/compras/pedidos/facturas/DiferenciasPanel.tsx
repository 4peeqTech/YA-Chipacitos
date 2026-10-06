'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, Clock, EyeOff, Loader2, MessageSquareWarning, PackagePlus, ReceiptText, RotateCcw, Scale, Undo2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFechaHora } from '@/lib/formato'
import {
  accionDevolucion, agruparDiferencias, explicacionResolucion, muestraKg, RESOLUCION_LABEL, textoCantidadesConDevolucion, textoDelta,
  textoDiferencia, textoEsperandoNc, textoKg, textoResuelta,
  type DiferenciaVista, type ResolucionElegible,
} from '@/lib/compras/diferencias'
import { conUnidad } from '../modelo'
import { resolverDiferencia, revertirDiferencia } from './acciones'

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

const OPCIONES: { valor: ResolucionElegible; icono: typeof Scale }[] = [
  { valor: 'ajusta_stock', icono: PackagePlus },
  { valor: 'reclamo_proveedor', icono: MessageSquareWarning },
  { valor: 'ignorada', icono: EyeOff },
]

/** Facturado · llegó, con la unidad, en una línea chica. A2b: los kg entre paréntesis, como información. */
function Cantidades({ d }: { d: DiferenciaVista }) {
  // B4: con devoluciones o NC, la cuenta completa (lo que llegó, lo devuelto, lo acreditado).
  const conDevolucion = textoCantidadesConDevolucion(d)
  if (conDevolucion) return <span className="tabular-nums">{conDevolucion}</span>
  const kg = muestraKg(d)
  const kgFact = kg ? textoKg(d.facturadaBase, d.facturadaBaseReal, d.unidadBase) : null
  const kgRec = kg ? textoKg(d.recibidaBase, d.recibidaBaseReal, d.unidadBase) : null
  return (
    <span className="tabular-nums">
      Facturado {conUnidad(d.facturada, d.unidad)}{kgFact && ` (${kgFact})`} · llegó {conUnidad(d.recibida, d.unidad)}{kgRec && ` (${kgRec})`}
    </span>
  )
}

function ResolverModal({
  diferencia, stockActual, pendiente, onResolver, onCerrar,
}: {
  diferencia: DiferenciaVista | null
  stockActual: number | null
  pendiente: boolean
  onResolver: (resolucion: ResolucionElegible, nota: string) => void
  onCerrar: () => void
}) {
  const [eleccion, setEleccion] = useState<ResolucionElegible | null>(null)
  const [nota, setNota] = useState('')
  const d = diferencia

  return (
    <Modal open={d != null} onClose={onCerrar} title="Resolver la diferencia" size="lg">
      {d && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface2 px-4 py-3">
            <p className="font-semibold text-text">{d.descripcion}</p>
            <p className="text-sm text-muted"><Cantidades d={d} /></p>
            <p className="mt-1 text-sm font-medium text-warning">{textoDiferencia(d)}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-text">¿Qué hacés con la diferencia?</legend>
            {OPCIONES.map(o => {
              const activa = eleccion === o.valor
              return (
                <label
                  key={o.valor}
                  className={`presionable flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${activa ? 'border-accent bg-surface2' : 'border-border hover:border-muted'}`}
                >
                  <input
                    type="radio"
                    name="resolucion"
                    value={o.valor}
                    checked={activa}
                    onChange={() => setEleccion(o.valor)}
                    className="mt-1 size-5 shrink-0 cursor-pointer accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-text">
                      <o.icono size={16} className="text-accent-fg" /> {RESOLUCION_LABEL[o.valor]}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{explicacionResolucion(o.valor, d, stockActual)}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <Field label="Nota">
            <textarea
              aria-label="Nota sobre la diferencia"
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={eleccion === 'reclamo_proveedor' ? 'Ej.: le avisé a Juan por WhatsApp el 30/09' : 'Opcional'}
              className={`${controlClass} py-2`}
            />
          </Field>

          <p className="text-xs text-muted">Si te equivocás, después la podés revertir y queda pendiente otra vez.</p>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCerrar} disabled={pendiente} className={botonSecundario}>Volver</button>
            <button
              type="button"
              onClick={() => eleccion && onResolver(eleccion, nota)}
              disabled={pendiente || !eleccion}
              className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {pendiente ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {eleccion ? RESOLUCION_LABEL[eleccion] : 'Elegí una opción'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * FA9: lo facturado contra lo recibido. Mientras falta mercadería, lo que no
 * coincide es lo que todavía tiene que llegar (sin acciones). Con la recepción
 * completa, cada diferencia se resuelve y se puede revertir.
 */
export default function DiferenciasPanel({
  diferencias,
  estadoRecepcion,
  stockPorItem,
  onRegistrarDevolucion,
  onCargarNotaCredito,
}: {
  diferencias: DiferenciaVista[]
  estadoRecepcion: string | null
  stockPorItem: Record<string, number>
  /** B4: "Registrar devolución" en un reclamo al proveedor, prellenado con la diferencia. */
  onRegistrarDevolucion?: (d: DiferenciaVista) => void
  /** B4: "Cargar nota de crédito" en una diferencia que espera la NC de una devolución. */
  onCargarNotaCredito?: (devolucionId: string) => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [resolviendo, setResolviendo] = useState<DiferenciaVista | null>(null)

  if (diferencias.length === 0) return null
  const { pendientesDeLlegar, aResolver, resueltas } = agruparDiferencias(diferencias, estadoRecepcion)

  function resolver(resolucion: ResolucionElegible, nota: string) {
    const d = resolviendo
    if (!d) return
    startTransition(async () => {
      const r = await resolverDiferencia({ diferenciaId: d.id, resolucion, nota: nota.trim() || null })
      if (!r.ok) { toast.error(r.error); return }
      setResolviendo(null)
      toast.success(resolucion === 'ajusta_stock' && r.data.delta != null
        ? `Stock de ${d.descripcion} ajustado (${textoDelta(r.data.delta)})`
        : resolucion === 'reclamo_proveedor' && onRegistrarDevolucion
          ? `Diferencia de ${d.descripcion} resuelta · si el proveedor manda nota de crédito, usá "Registrar devolución" en la diferencia`
          : `Diferencia de ${d.descripcion} resuelta`)
    })
  }

  function revertir(d: DiferenciaVista) {
    const stock = stockPorItem[d.itemId] ?? null
    confirmar({
      titulo: 'Revertir la resolución',
      mensaje: d.resolucion === 'ajusta_stock'
        ? `Se deshace el ajuste: ${d.diferencia > 0 ? 'resta' : 'suma'} ${conUnidad(Math.abs(d.diferencia), d.unidad)} de ${d.descripcion}${stock == null ? '' : ` (queda en ${conUnidad(stock - d.diferencia, null)})`}. La diferencia vuelve a quedar pendiente.`
        : `La diferencia de ${d.descripcion} vuelve a quedar pendiente. El stock no se mueve.`,
      textoConfirmar: 'Revertir',
      onConfirmar: () => startTransition(async () => {
        const r = await revertirDiferencia(d.id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`La diferencia de ${d.descripcion} quedó pendiente otra vez`)
      }),
    })
  }

  return (
    <section className="space-y-3" aria-labelledby="titulo-diferencias">
      <h4 id="titulo-diferencias" className="flex items-center gap-2 text-sm font-bold text-text">
        <Scale size={16} className="text-accent" /> Diferencias con lo recibido
      </h4>

      {aResolver.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning bg-warning-bg p-3">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-warning">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {aResolver.length === 1 ? '1 diferencia a resolver' : `${aResolver.length} diferencias a resolver`}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {aResolver.map(d => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text"><LinkEntidad entidad={{ tipo: 'insumo', id: d.itemId }} variante="texto" title="Ver el stock de este insumo">{d.descripcion}</LinkEntidad></p>
                  <p className="text-xs text-muted"><Cantidades d={d} /></p>
                  <p className="text-xs font-medium text-warning">{textoDiferencia(d)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResolviendo(d)}
                  disabled={isPending}
                  className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  Resolver
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendientesDeLlegar.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface2 p-3">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-text">
            <Clock size={15} className="mt-0.5 shrink-0 text-muted" /> Pendiente de llegar
          </p>
          <p className="text-xs text-muted">
            Todavía falta recibir mercadería del pedido. Cuando llegue el resto, esto se acomoda solo; si no va a llegar,
            cerrá el pedido a mano y vas a poder resolver cada línea.
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {pendientesDeLlegar.map(d => (
              <li key={d.id} className="px-3 py-2.5">
                <p className="text-sm text-text"><LinkEntidad entidad={{ tipo: 'insumo', id: d.itemId }} variante="texto" title="Ver el stock de este insumo">{d.descripcion}</LinkEntidad></p>
                <p className="text-xs text-muted"><Cantidades d={d} /></p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resueltas.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {resueltas.map(d => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm text-text">
                  <Check size={14} className="shrink-0 text-success" /> <LinkEntidad entidad={{ tipo: 'insumo', id: d.itemId }} variante="texto" title="Ver el stock de este insumo">{d.descripcion}</LinkEntidad>
                  <span className="text-muted">· {textoResuelta(d.resolucion, d.diferencia, d.unidad)}</span>
                </p>
                <p className="text-xs text-muted">
                  <Cantidades d={d} />
                  {d.resueltoEn && <> · {formatearFechaHora(d.resueltoEn)}</>}
                  {d.resueltoPor && <> · {d.resueltoPor}</>}
                </p>
                {textoEsperandoNc(d) ? (
                  <p className="text-xs text-muted">
                    Esperando la nota de crédito de{' '}
                    <LinkEntidad entidad={{ tipo: 'devolucion', id: d.devolucionId!, pedidoId: d.pedidoId }}>{d.devolucionCodigo ?? 'la devolución'}</LinkEntidad>
                  </p>
                ) : d.nota && <p className="text-xs text-muted">Nota: {d.nota}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
              {textoEsperandoNc(d) && onCargarNotaCredito && (
                <button
                  type="button"
                  onClick={() => onCargarNotaCredito(d.devolucionId!)}
                  disabled={isPending}
                  className="presionable min-h-11 inline-flex items-center gap-1 rounded-xl bg-accent px-3 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  <ReceiptText size={13} /> Cargar nota de crédito
                </button>
              )}
              {accionDevolucion(d, estadoRecepcion) && onRegistrarDevolucion && (
                <button
                  type="button"
                  onClick={() => onRegistrarDevolucion(d)}
                  disabled={isPending}
                  className="presionable min-h-11 inline-flex items-center gap-1 rounded-xl bg-accent px-3 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  <Undo2 size={13} /> Registrar devolución
                </button>
              )}
              <button
                type="button"
                onClick={() => revertir(d)}
                disabled={isPending}
                className="presionable min-h-11 inline-flex items-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold text-text hover:bg-surface2 disabled:opacity-50"
              >
                <RotateCcw size={13} /> Revertir
              </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResolverModal
        key={resolviendo?.id ?? 'ninguna'}
        diferencia={resolviendo}
        stockActual={resolviendo ? stockPorItem[resolviendo.itemId] ?? null : null}
        pendiente={isPending}
        onResolver={resolver}
        onCerrar={() => setResolviendo(null)}
      />
    </section>
  )
}
