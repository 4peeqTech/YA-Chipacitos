'use client'

import { useState } from 'react'
import { CircleX, PackageOpen, Pencil, StickyNote, Truck, TriangleAlert } from 'lucide-react'
import type { Pedido, PedidoEvento, PedidoItem, Producto } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import EstadoPedidoBadge from '@/components/pedidos/compartido/EstadoPedidoBadge'
import ItemsPedido from '@/components/pedidos/compartido/ItemsPedido'
import HistorialEventos from '@/components/pedidos/compartido/HistorialEventos'
import ChatPedido from '@/components/pedidos/compartido/ChatPedido'
import { MarcaVersionAnterior } from '@/components/pedidos/compartido/AvisoVersionAnterior'
import { esCerrado, esEditable, formatoCantidad } from '@/lib/pedidos/estados'
import {
  cancelarPedido, editarItemsPedido, empezarPreparacion, marcarEnviado, type ItemEdicion, type Resultado,
} from '@/lib/pedidos/acciones'
import EditorItems from './EditorItems'
import { cantidadAEnviar, fechaCorta } from './utiles'

interface Props {
  pedido: Pedido
  /** null mientras cargan. */
  eventos: PedidoEvento[] | null
  productos: Producto[]
  usuarioId: string
  onClose: () => void
  /** Vuelve a leer el pedido y sus eventos después de una acción. */
  onRecargar: (pedidoId: string) => Promise<void>
  toast: { success: (m: string) => void; error: (m: string) => void }
}

const seccion = 'text-2xs font-semibold uppercase tracking-wider text-faint'

export default function DetallePedidoModal({ pedido, eventos, productos, usuarioId, onClose, onRecargar, toast }: Props) {
  // Los ítems se congelan al empezar a editar: el realtime puede traer el
  // pedido actualizado (por ejemplo, el propio guardado) a mitad de camino.
  const [itemsEdicion, setItemsEdicion] = useState<PedidoItem[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const { confirmar, dialog } = useConfirm()

  const items = pedido.pedido_items ?? []
  const editable = esEditable(pedido.estado)
  const editando = editable && itemsEdicion !== null
  const salen = items.filter(i => cantidadAEnviar(i) > 0)

  async function ejecutar<T>(accion: () => Promise<Resultado<T>>, exito: (data: T) => string) {
    setOcupado(true)
    const r = await accion()
    if (r.ok) {
      await onRecargar(pedido.id)
      toast.success(exito(r.data))
      if (r.advertencia) toast.error(r.advertencia)
    } else {
      toast.error(r.error)
    }
    setOcupado(false)
    return r.ok
  }

  async function guardarEdicion(cambios: ItemEdicion[]) {
    const ok = await ejecutar(
      () => editarItemsPedido(pedido.id, cambios),
      n => n === 0 ? 'No había cambios para guardar.' : 'Cambios guardados. Le avisamos al local.',
    )
    if (ok) setItemsEdicion(null)
  }

  function pedirEnvio() {
    if (salen.length === 0) {
      toast.error('No queda ningún producto para mandar. Si no se manda nada, cancelá el pedido.')
      return
    }
    confirmar({
      titulo: `Marcar #${pedido.numero} como enviado`,
      textoConfirmar: 'Sí, sale ahora',
      mensaje: (
        <span className="block space-y-2">
          <span className="block">Sale para <strong className="text-text">{pedido.local_nombre}</strong>. Se descuenta del stock y le avisamos al local. Después ya no se puede editar.</span>
          <span className="block rounded-lg border border-border bg-surface2 px-3 py-2">
            {salen.map(i => (
              <span key={i.id} className="flex justify-between gap-3 py-0.5 text-xs">
                <span className="text-text">{i.producto_nombre}</span>
                <span className="font-semibold tabular-nums text-text">{formatoCantidad(cantidadAEnviar(i))}</span>
              </span>
            ))}
          </span>
        </span>
      ),
      onConfirmar: () => { ejecutar(() => marcarEnviado(pedido.id), () => `Pedido #${pedido.numero} en camino.`) },
    })
  }

  async function confirmarCancelacion() {
    const ok = await ejecutar(() => cancelarPedido(pedido.id, motivo.trim() || null), () => `Pedido #${pedido.numero} cancelado.`)
    if (ok) { setCancelando(false); setMotivo('') }
  }

  function cerrar() {
    if (ocupado) return
    onClose()
  }

  return (
    <>
      <Modal open onClose={cerrar} title={`Pedido #${pedido.numero} · ${pedido.local_nombre}`} size="2xl">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <EstadoPedidoBadge estado={pedido.estado} />
          <span>Llegó el {fechaCorta(pedido.created_at)}</span>
          {pedido.enviado_at && <span>· Salió el {fechaCorta(pedido.enviado_at)}</span>}
          {pedido.recepcion_con_diferencias && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
              <TriangleAlert size={11} aria-hidden /> Recibido con diferencias
            </span>
          )}
          <MarcaVersionAnterior pedido={pedido} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-4 min-w-0">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className={seccion}>{editando ? 'Editar lo que se manda' : 'Productos'}</h4>
                {editable && !editando && (
                  <button type="button" onClick={() => setItemsEdicion(items)} disabled={ocupado}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-bg disabled:opacity-40">
                    <Pencil size={13} /> Editar pedido
                  </button>
                )}
              </div>
              {editando && itemsEdicion ? (
                <EditorItems items={itemsEdicion} productos={productos} guardando={ocupado}
                  onCancelar={() => setItemsEdicion(null)} onGuardar={guardarEdicion} />
              ) : (
                <ItemsPedido items={items} />
              )}
            </section>

            {pedido.notas && (
              <section className="space-y-1.5">
                <h4 className={seccion}>Observaciones del local</h4>
                <p className="flex items-start gap-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text whitespace-pre-wrap">
                  <StickyNote size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  {pedido.notas}
                </p>
              </section>
            )}

            {pedido.nota_recepcion && (
              <section className="space-y-1.5">
                <h4 className={seccion}>Nota de la recepción</h4>
                <p className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text whitespace-pre-wrap">{pedido.nota_recepcion}</p>
              </section>
            )}

            {pedido.motivo_cancelacion && (
              <section className="space-y-1.5">
                <h4 className={seccion}>Motivo de la cancelación</h4>
                <p className="text-sm text-muted">{pedido.motivo_cancelacion}</p>
              </section>
            )}
          </div>

          <div className="space-y-4 min-w-0">
            <section className="space-y-2">
              <h4 className={seccion}>Mensajes</h4>
              <ChatPedido key={pedido.id} pedidoId={pedido.id} mensajesIniciales={pedido.pedido_mensajes ?? []}
                usuarioId={usuarioId} enVivo={!esCerrado(pedido.estado)} />
            </section>
            <section className="space-y-2">
              <h4 className={seccion}>Movimientos</h4>
              {eventos ? <HistorialEventos eventos={eventos} /> : (
                <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
              )}
            </section>
          </div>
        </div>

        {editable && !editando && (
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            <button type="button" onClick={() => setCancelando(true)} disabled={ocupado}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:border-brand-red/50 hover:text-brand-red disabled:opacity-40 sm:mr-auto">
              <CircleX size={16} /> Cancelar pedido
            </button>
            {pedido.estado === 'pendiente' && (
              <button type="button" disabled={ocupado}
                onClick={() => ejecutar(() => empezarPreparacion(pedido.id), () => `Empezaste a preparar el #${pedido.numero}.`)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-accent px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent-bg disabled:opacity-40">
                <PackageOpen size={16} /> Empezar preparación
              </button>
            )}
            <button type="button" onClick={pedirEnvio} disabled={ocupado}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
              <Truck size={16} /> Marcar como enviado
            </button>
          </div>
        )}
      </Modal>

      <Modal open={cancelando} onClose={() => { if (!ocupado) setCancelando(false) }} title={`Cancelar pedido #${pedido.numero}`} accent="red">
        <p className="text-sm text-muted">El pedido de <strong className="text-text">{pedido.local_nombre}</strong> no se va a preparar. Le avisamos al local.</p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Motivo (opcional)</span>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
            placeholder="Ej.: no hay stock, se mandó con otro pedido…"
            className="w-full rounded-field border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none" />
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setCancelando(false)} disabled={ocupado}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted hover:text-text">
            Volver
          </button>
          <button type="button" onClick={confirmarCancelacion} disabled={ocupado}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40">
            {ocupado ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        </div>
      </Modal>

      {dialog}
    </>
  )
}
