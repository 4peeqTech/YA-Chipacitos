'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, MessageSquare, PackageCheck, TriangleAlert, History as IconoHistorial } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cancelarPedido, confirmarRecepcion } from '@/lib/pedidos/acciones'
import { esEditable } from '@/lib/pedidos/estados'
import type { EstadoPedido, Pedido, PedidoEvento } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import EstadoPedidoBadge from '@/components/pedidos/compartido/EstadoPedidoBadge'
import ItemsPedido from '@/components/pedidos/compartido/ItemsPedido'
import HistorialEventos from '@/components/pedidos/compartido/HistorialEventos'
import ChatPedido from '@/components/pedidos/compartido/ChatPedido'
import { MarcaVersionAnterior } from '@/components/pedidos/compartido/AvisoVersionAnterior'
import RecepcionDiferencias from './RecepcionDiferencias'
import { fabricaCambio, fechaCorta, nombreDestino } from './utilidades'
import { Puntos } from '@/components/ui/Cargando'

const PASOS: { estado: EstadoPedido; label: string }[] = [
  { estado: 'pendiente', label: 'Pedido' },
  { estado: 'preparando', label: 'Preparando' },
  { estado: 'enviado', label: 'En camino' },
  { estado: 'recibido', label: 'Recibido' },
]

function LineaEstados({ pedido }: { pedido: Pedido }) {
  if (pedido.estado === 'cancelado') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface2 px-3 py-2.5">
        <CircleX size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-text">
            Cancelado{pedido.cancelado_at ? ` el ${fechaCorta(pedido.cancelado_at)}` : ''}
          </p>
          {pedido.motivo_cancelacion && <p className="text-muted">{pedido.motivo_cancelacion}</p>}
        </div>
      </div>
    )
  }
  const actual = PASOS.findIndex(p => p.estado === pedido.estado)
  return (
    <ol className="flex items-start" aria-label="Estado del pedido">
      {PASOS.map((p, i) => {
        const hecho = i <= actual
        return (
          <li key={p.estado} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span className={`absolute right-1/2 top-[9px] h-0.5 w-full ${i <= actual ? 'bg-accent' : 'bg-border'}`} aria-hidden />
            )}
            <span className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              i === actual ? 'border-accent bg-accent' : hecho ? 'border-accent bg-surface' : 'border-border bg-surface'
            }`}>
              {hecho && i !== actual && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>
            <span className={`mt-1 text-2xs leading-tight ${i === actual ? 'font-semibold text-text' : hecho ? 'text-muted' : 'text-faint'}`}>
              {p.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Seccion({ titulo, icono: Icono, children }: { titulo: string; icono: typeof MessageSquare; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
        <Icono size={13} aria-hidden />
        {titulo}
      </h4>
      {children}
    </section>
  )
}

interface Props {
  pedido: Pedido | null
  usuarioId: string
  /** Cambia cuando llega un evento nuevo de este pedido: recarga el historial. */
  versionEventos: number
  /** Abre directo en la carga de diferencias. */
  modoInicial?: 'detalle' | 'diferencias'
  onCerrar: () => void
  /** Pide al padre que recargue el pedido después de una acción. */
  onCambio: (pedidoId: string) => void
}

export default function DetallePedido({ pedido, ...resto }: Props) {
  // key: al cambiar de pedido el contenido arranca de cero.
  return (
    <Modal open={!!pedido} onClose={resto.onCerrar} title={pedido ? `Pedido #${pedido.numero}` : ''} size="lg">
      {pedido && <Contenido key={pedido.id} pedido={pedido} {...resto} />}
    </Modal>
  )
}

function Contenido({ pedido, usuarioId, versionEventos, modoInicial = 'detalle', onCambio }: Omit<Props, 'pedido' | 'onCerrar'> & { pedido: Pedido }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [modo, setModo] = useState(modoInicial)
  const [eventos, setEventos] = useState<PedidoEvento[] | null>(null)
  const [errorEventos, setErrorEventos] = useState(false)
  // Qué acción está en curso: los puntos van en ese botón y los demás se deshabilitan.
  const [enCurso, setEnCurso] = useState<'cancelar' | 'recibir' | null>(null)
  const ocupado = enCurso !== null
  const motivoRef = useRef<HTMLTextAreaElement>(null)
  const enCamino = pedido.estado === 'enviado'

  useEffect(() => {
    let vigente = true
    createClient()
      .from('pedido_eventos')
      .select('*')
      .eq('pedido_id', pedido.id)
      .order('created_at')
      .then(({ data, error }) => {
        if (!vigente) return
        setErrorEventos(!!error)
        if (!error) setEventos((data ?? []) as PedidoEvento[])
      })
    return () => { vigente = false }
  }, [pedido.id, versionEventos])

  // Si el pedido deja de estar en camino (lo confirmó otro), sale de la carga.
  const modoVisible = modo === 'diferencias' && !enCamino ? 'detalle' : modo

  function pedirCancelacion() {
    confirmar({
      titulo: `Cancelar el pedido #${pedido.numero}`,
      peligroso: true,
      textoConfirmar: 'Cancelar pedido',
      textoCancelar: 'Volver',
      mensaje: (
        <>
          El mayorista deja de prepararlo y le avisamos.
          <label className="mt-3 block">
            <span className="text-2xs font-semibold uppercase tracking-wider text-faint">Motivo (opcional)</span>
            <textarea
              ref={motivoRef}
              rows={2}
              maxLength={300}
              placeholder="Ej.: lo pedí repetido"
              className="mt-1 w-full resize-none rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </label>
        </>
      ),
      onConfirmar: async () => {
        const motivo = motivoRef.current?.value.trim() || null
        setEnCurso('cancelar')
        const r = await cancelarPedido(pedido.id, motivo)
        setEnCurso(null)
        if (!r.ok) return toast.error(r.error)
        toast.success(`Pedido #${pedido.numero} cancelado.`)
        if (r.advertencia) toast.error(r.advertencia)
        onCambio(pedido.id)
      },
    })
  }

  function pedirTodoBien() {
    confirmar({
      titulo: 'Llegó todo bien',
      mensaje: `Confirmás que llegó todo lo que se mandó en el pedido #${pedido.numero}, en las cantidades de la columna “Enviado”.`,
      textoConfirmar: 'Sí, llegó todo',
      onConfirmar: async () => {
        setEnCurso('recibir')
        const r = await confirmarRecepcion(pedido.id)
        setEnCurso(null)
        if (!r.ok) return toast.error(r.error)
        toast.success(`Recepción del pedido #${pedido.numero} confirmada.`)
        if (r.advertencia) toast.error(r.advertencia)
        onCambio(pedido.id)
      },
    })
  }

  if (modoVisible === 'diferencias') {
    return (
      <RecepcionDiferencias
        pedido={pedido}
        onVolver={() => setModo('detalle')}
        onListo={() => { setModo('detalle'); onCambio(pedido.id) }}
      />
    )
  }

  const items = pedido.pedido_items ?? []
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoPedidoBadge estado={pedido.estado} />
        <span className="text-xs text-muted">{nombreDestino(pedido.destino)} · {fechaCorta(pedido.created_at)}</span>
        <MarcaVersionAnterior pedido={pedido} />
      </div>

      <LineaEstados pedido={pedido} />

      {fabricaCambio(pedido) && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          El mayorista cambió lo que se manda. Mirá la columna “Enviado”.
        </p>
      )}

      {pedido.notas && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Tus observaciones</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text">{pedido.notas}</p>
        </div>
      )}

      {/* Con las 4 columnas de un recibido no entra en 375px: scrollea solo la tabla. */}
      <div className="overflow-x-auto">
        <ItemsPedido items={items} />
      </div>

      {pedido.estado === 'recibido' && (pedido.recepcion_con_diferencias || pedido.nota_recepcion) && (
        <div className="rounded-xl border border-border bg-surface2 px-3 py-2 text-sm">
          {pedido.recepcion_con_diferencias && <p className="font-semibold text-warning">Recibido con diferencias</p>}
          {pedido.nota_recepcion && <p className="text-muted">“{pedido.nota_recepcion}”</p>}
        </div>
      )}

      {enCamino && (
        <div className="space-y-2 rounded-2xl border border-accent2/40 bg-info-bg p-3">
          <p className="text-sm font-semibold text-text">¿Llegó el pedido?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={pedirTodoBien}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {enCurso === 'recibir' ? <><Puntos /> Confirmando</> : <><CircleCheck size={17} aria-hidden /> Llegó todo bien</>}
            </button>
            <button
              type="button"
              onClick={() => setModo('diferencias')}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-warning/60 py-3 text-sm font-semibold text-warning disabled:opacity-50"
            >
              <TriangleAlert size={16} aria-hidden />
              Hubo diferencias
            </button>
          </div>
        </div>
      )}

      <Seccion titulo="Movimientos" icono={IconoHistorial}>
        {errorEventos ? (
          <p className="text-xs text-brand-red">No se pudieron cargar los movimientos. Cerrá y volvé a abrir el pedido.</p>
        ) : eventos == null ? (
          <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
        ) : (
          <HistorialEventos eventos={eventos} />
        )}
      </Seccion>

      <Seccion titulo={pedido.destino === 'fabrica' ? 'Mensajes con el mayorista' : 'Mensajes con depósito'} icono={MessageSquare}>
        <ChatPedido pedidoId={pedido.id} usuarioId={usuarioId} />
      </Seccion>

      {esEditable(pedido.estado) && (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={pedirCancelacion}
            disabled={ocupado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-red/50 py-2.5 text-sm font-semibold text-brand-red hover:bg-danger-bg disabled:opacity-50 sm:w-auto sm:px-4"
          >
            {enCurso === 'cancelar' ? <><Puntos /> Cancelando</> : <><CircleX size={16} aria-hidden /> Cancelar pedido</>}
          </button>
          <p className="mt-1.5 text-2xs text-faint">Se puede cancelar hasta que salga en camino.</p>
        </div>
      )}

      {pedido.estado === 'recibido' && !pedido.cierre_automatico && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <PackageCheck size={14} aria-hidden />
          Recibido{pedido.recibido_at ? ` el ${fechaCorta(pedido.recibido_at)}` : ''}
        </p>
      )}
    </div>
  )
}
