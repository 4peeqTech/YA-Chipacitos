'use client'

import { useState, useTransition } from 'react'
import { Info, Loader2, MessageCircle, RefreshCw, Repeat, Send, TriangleAlert } from 'lucide-react'
import CompartirMensaje from '@/components/ui/CompartirMensaje'
import { Field, controlClass } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { construirMensajePedido, renderPlantilla, type ItemMensaje } from '@/lib/compras/pedidoMensaje'
import { esCobraPor, esUnidadBase } from '@/lib/compras/unidades'
import { guardarMensaje, marcarPedidoEnviado, marcarPedidoReenviado } from './acciones'
import type { PedidoVista } from './modelo'
import type { LocalFacturacion, Plantilla } from './datos'

export default function PedidoEnvio({
  pedido,
  plantillas,
  localesFacturacion,
  avisoReenvio,
  onListo,
}: {
  pedido: PedidoVista
  plantillas: Plantilla[]
  localesFacturacion: LocalFacturacion[]
  /** Se acaban de guardar cambios en un pedido ya enviado (P3). */
  avisoReenvio: boolean
  onListo: (enviado: boolean) => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const { fila } = pedido
  const sinEnviar = pedido.entrada.estado_recepcion === 'sin_enviar'
  // La RPC igual lo bloquea: el local de un pedido facturado no se cambia.
  const facturado = pedido.entrada.estado_facturacion === 'facturado'
  const [plantillaId, setPlantillaId] = useState(plantillas.find(p => p.es_default)?.id ?? plantillas[0]?.id ?? '')
  const [localId, setLocalId] = useState(fila.local_facturacion_id ?? fila.proveedores?.local_facturacion_id ?? '')
  // Si se editó un pedido enviado, el mensaje guardado quedó viejo hasta regenerarlo.
  const [mensajeDesactualizado, setMensajeDesactualizado] = useState(avisoReenvio)
  const [compartido, setCompartido] = useState(false)
  const [accion, setAccion] = useState<'generar' | 'enviar' | 'reenviar' | null>(null)

  // A2b: unidades y cómo cobra el proveedor, desde v_compras_pedido_pendiente.
  const unidadesPorLinea = new Map(pedido.lineas.map(l => [l.pedido_item_id, l]))
  const items: ItemMensaje[] = [...fila.compras_pedido_items].sort((a, b) => a.orden - b.orden).map(i => {
    const l = unidadesPorLinea.get(i.id)
    return {
      ...i,
      contenido: l?.contenido ?? null,
      unidadBase: esUnidadBase(l?.unidad_base) ? l.unidad_base : null,
      cobraPor: esCobraPor(l?.cobra_por) ? l.cobra_por : null,
    }
  })

  function generar() {
    const local = localesFacturacion.find(l => l.id === localId) ?? null
    const plantilla = plantillas.find(p => p.id === plantillaId)
    const mensaje = plantilla
      ? renderPlantilla(plantilla.cuerpo, {
          proveedorNombre: pedido.proveedor,
          numero: fila.numero,
          contactoNombre: fila.proveedores?.contacto_nombre ?? null,
          local,
          items,
        })
      : construirMensajePedido(pedido.proveedor, local, items, fila.numero)

    setAccion('generar')
    startTransition(async () => {
      const r = await guardarMensaje({ pedidoId: fila.id, mensaje, localFacturacionId: localId || null })
      setAccion(null)
      // Si la RPC rechazó el cambio de local, el select vuelve al del pedido.
      if (!r.ok) { toast.error(r.error); setLocalId(fila.local_facturacion_id ?? ''); return }
      setMensajeDesactualizado(false)
      setCompartido(false)
    })
  }

  function marcarEnviado() {
    setAccion('enviar')
    startTransition(async () => {
      const r = await marcarPedidoEnviado({ pedidoId: fila.id })
      setAccion(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`${pedido.codigo} marcado como enviado`)
      onListo(true)
    })
  }

  function marcarReenviado() {
    setAccion('reenviar')
    startTransition(async () => {
      const r = await marcarPedidoReenviado({ pedidoId: fila.id })
      setAccion(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`${pedido.codigo} reenviado`)
      onListo(false)
    })
  }

  const hayMensaje = !!fila.mensaje

  return (
    <div className="space-y-5">
      {avisoReenvio && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm text-text">
            Guardaste cambios en un pedido que ya le mandaste al proveedor.
            {mensajeDesactualizado ? ' Regenerá el mensaje y reenvialo para que le llegue lo nuevo.' : ' Mensaje actualizado: reenvialo.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Plantilla de mensaje">
          <select
            aria-label="Plantilla de mensaje"
            value={plantillaId}
            onChange={e => setPlantillaId(e.target.value)}
            disabled={plantillas.length === 0}
            className={`${controlClass} min-h-11`}
          >
            {plantillas.length === 0 && <option value="">Sin plantillas (formato estándar)</option>}
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.es_default ? ' (predeterminada)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Facturar a" ayuda={facturado ? 'El pedido ya está facturado: el local no se cambia.' : undefined}>
          <select
            aria-label="Facturar a"
            value={localId}
            onChange={e => setLocalId(e.target.value)}
            disabled={facturado}
            className={`${controlClass} min-h-11`}
          >
            <option value="">Sin asignar</option>
            {localesFacturacion.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Field>
      </div>

      {!localId && (
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Sin local en &quot;Facturar a&quot;, el mensaje sale sin los datos de entrega y facturación.
        </p>
      )}

      <button
        type="button"
        onClick={generar}
        disabled={isPending || items.length === 0}
        className="presionable min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-accent px-4 text-sm font-semibold text-accent-fg hover:bg-surface2 disabled:opacity-50"
      >
        {accion === 'generar' ? <Loader2 size={16} className="animate-spin" /> : hayMensaje ? <RefreshCw size={16} /> : <MessageCircle size={16} />}
        {hayMensaje ? 'Regenerar mensaje' : 'Generar mensaje'}
      </button>

      {hayMensaje ? (
        <pre className={`max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-bg p-4 font-sans text-sm text-text ${mensajeDesactualizado ? 'border-warning opacity-60' : 'border-border'}`}>
          {fila.mensaje}
        </pre>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Generá el mensaje para verlo acá.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <CompartirMensaje
          mensaje={fila.mensaje}
          deshabilitado={!hayMensaje || mensajeDesactualizado}
          telefono={fila.proveedores?.contacto_telefono ?? null}
          onCompartido={() => setCompartido(true)}
        />
        <div className="sm:ml-auto">
          {sinEnviar ? (
            <button
              type="button"
              onClick={marcarEnviado}
              disabled={!compartido || isPending}
              className="presionable min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {accion === 'enviar' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Marcar como enviado
            </button>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onListo(false)}
                disabled={isPending}
                className="presionable min-h-11 w-full rounded-xl px-4 text-sm font-medium text-muted hover:text-text hover:bg-surface2 disabled:opacity-50 sm:w-auto"
              >
                Cerrar sin reenviar
              </button>
              <button
                type="button"
                onClick={marcarReenviado}
                disabled={!compartido || isPending}
                className="presionable min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 sm:w-auto"
              >
                {accion === 'reenviar' ? <Loader2 size={16} className="animate-spin" /> : <Repeat size={16} />} Marcar como reenviado
              </button>
            </div>
          )}
        </div>
      </div>
      {!compartido && hayMensaje && !mensajeDesactualizado && (
        <p className="text-xs text-muted">
          Copiá el mensaje o mandalo por WhatsApp para poder marcarlo como {sinEnviar ? 'enviado' : 'reenviado'}.
        </p>
      )}
    </div>
  )
}
