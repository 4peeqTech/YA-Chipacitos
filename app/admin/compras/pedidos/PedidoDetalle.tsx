'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Ban, Clock, History, ListChecks, Loader2, Lock, MoreHorizontal, PackageOpen, PencilLine,
  ReceiptText, RotateCcw, Scale, Send, Trash2, Truck, type LucideIcon,
} from 'lucide-react'
import EstadoBadge from '@/components/ui/EstadoBadge'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { proximaAccion, subtextoEstado } from '@/lib/compras/estadoPedido'
import { codigoRemito } from '@/lib/compras/codigos'
import { rutaCargarDePedido, rutaDe } from '@/lib/compras/rutas'
import { leerEventoDiferencia, RESOLUCION_PASADO } from '@/lib/compras/diferencias'
import DiferenciasPanel from './facturas/DiferenciasPanel'
import { conUnidad, type PedidoVista } from './modelo'
import type { EventoPedido } from './datos'

export interface AccionesDetalle {
  onEnviar: () => void
  onEditar: () => void
  onCerrar: () => void
  onReabrir: () => void
  onEliminar: () => void
}

const EVENTO: Record<string, { label: string; icono: LucideIcon }> = {
  creado: { label: 'Pedido creado', icono: PencilLine },
  enviado: { label: 'Enviado al proveedor', icono: Send },
  remito: { label: 'Llegó un remito', icono: Truck },
  cerrado: { label: 'Cerrado a mano', icono: Lock },
  reabierto: { label: 'Reabierto', icono: RotateCcw },
  factura: { label: 'Factura confirmada', icono: ReceiptText },
  factura_anulada: { label: 'Factura anulada', icono: Ban },
  diferencia: { label: 'Diferencia con la factura resuelta', icono: Scale },
}

// Desempate cuando dos eventos tienen la misma hora.
const ORDEN_EVENTO = ['creado', 'enviado', 'remito', 'factura', 'diferencia', 'factura_anulada', 'cerrado', 'reabierto']

function detalleEvento(e: EventoPedido, codigoDe: (remitoId: string | null) => string | null): ReactNode {
  if (e.tipo === 'remito' && e.detalle) {
    const codigo = codigoDe(e.remito_id)
    return (
      <>
        {codigo && e.remito_id && <><LinkEntidad entidad={{ tipo: 'remito', id: e.remito_id }}>{codigo}</LinkEntidad> · </>}
        llegó el {formatearFecha(e.detalle)}
      </>
    )
  }
  if (e.tipo === 'cerrado' && e.detalle) return `Motivo: ${e.detalle}`
  if ((e.tipo === 'factura' || e.tipo === 'factura_anulada') && e.detalle) return `N° ${e.detalle}`
  if (e.tipo === 'diferencia') {
    const d = leerEventoDiferencia(e.detalle)
    return d ? `${d.insumo}: ${RESOLUCION_PASADO[d.resolucion]}` : null
  }
  return null
}

function MenuSecundario({ items }: { items: { label: string; icono: LucideIcon; onClick: () => void; peligro?: boolean }[] }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape, true)
    }
  }, [abierto])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted hover:text-text hover:bg-surface2"
      >
        <MoreHorizontal size={16} /> Más acciones
      </button>
      {abierto && (
        <div role="menu" className="popover-entrada absolute left-0 z-10 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setAbierto(false); it.onClick() }}
              className={`flex w-full min-h-11 items-center gap-2.5 px-3.5 text-left text-sm transition-colors hover:bg-surface2 ${it.peligro ? 'text-brand-red' : 'text-text'}`}
            >
              <it.icono size={15} className={it.peligro ? '' : 'text-muted'} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PedidoDetalle({
  pedido,
  acciones,
  pendiente,
  esAdmin,
  stockPorItem,
}: {
  pedido: PedidoVista
  acciones: AccionesDetalle
  pendiente: boolean
  /** Solo admin ve la factura del pedido y puede cargarla (P1). */
  esAdmin: boolean
  /** Para mostrar cómo queda el stock al resolver una diferencia. */
  stockPorItem: Record<string, number>
}) {
  const { fila, entrada, visible } = pedido
  const accion = proximaAccion(entrada)
  const subtexto = subtextoEstado(entrada)
  const esperaMercaderia = entrada.estado_recepcion === 'enviado' || entrada.estado_recepcion === 'parcial'
  const remitos = [...fila.compras_remitos].sort((a, b) => a.secuencia - b.secuencia)
  const codigoDe = (remitoId: string | null) => {
    const r = remitoId ? fila.compras_remitos.find(x => x.id === remitoId) : undefined
    return r ? codigoRemito(fila.numero, r.secuencia) : null
  }
  const eventos = [...pedido.eventos].sort((a, b) =>
    (a.fecha ?? '').localeCompare(b.fecha ?? '') || ORDEN_EVENTO.indexOf(a.tipo ?? '') - ORDEN_EVENTO.indexOf(b.tipo ?? ''))
  const hrefRemito = rutaCargarDePedido('remito', fila.id)
  const hrefFactura = pedido.factura
    ? rutaDe({ tipo: 'factura', id: pedido.factura.id })
    : rutaCargarDePedido('factura', fila.id)
  // La sección aparece cuando ya hay algo que mostrar o algo que hacer: antes
  // de enviar el pedido, la factura todavía no existe como paso.
  const mostrarFactura = esAdmin && (pedido.factura != null || entrada.estado_recepcion !== 'sin_enviar')

  const secundarias: { label: string; icono: LucideIcon; onClick: () => void; peligro?: boolean }[] = []
  if (pedido.editable) secundarias.push({ label: 'Editar ítems', icono: PencilLine, onClick: acciones.onEditar })
  if (esperaMercaderia && entrada.estado_facturacion !== 'facturado') secundarias.push({ label: 'Reenviar mensaje', icono: Send, onClick: acciones.onEnviar })
  if (esperaMercaderia) secundarias.push({ label: 'Cerrar a mano', icono: Lock, onClick: acciones.onCerrar })
  if (visible === 'sin_enviar') secundarias.push({ label: 'Eliminar pedido', icono: Trash2, onClick: acciones.onEliminar, peligro: true })

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-text truncate">{pedido.proveedor}</p>
          <p className="text-xs text-muted mt-0.5">
            {fila.solicitud_id
              ? <LinkEntidad entidad={{ tipo: 'solicitud', id: fila.solicitud_id }} variante="texto" title="Ver la solicitud que generó este pedido">{pedido.origen}</LinkEntidad>
              : pedido.origen} · creado el {formatearFecha(pedido.creado)}
            {fila.enviado_en && <> · enviado el {formatearFecha(fila.enviado_en)}</>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {pedido.demorado && <Clock size={14} className="text-warning" aria-label="Demorado" />}
            <EstadoBadge dominio="compras_pedido" estado={visible} />
          </div>
          {subtexto && <span className="text-2xs text-muted">{subtexto}</span>}
        </div>
      </div>

      {/* Qué sigue */}
      <section aria-label="Qué sigue" className="rounded-2xl border border-border bg-surface2 p-4 space-y-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Qué sigue</p>
          <p className="mt-1 font-semibold text-text">{accion.titulo}</p>
          <p className="text-sm text-muted">{accion.descripcion}</p>
          {visible === 'cerrado' && fila.cierre_motivo && (
            <p className="mt-1 text-sm text-text">Motivo: {fila.cierre_motivo}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accion.tipo === 'enviar' && (
            <button
              type="button"
              onClick={acciones.onEnviar}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Send size={16} /> {accion.boton}
            </button>
          )}
          {accion.tipo === 'cargar_remito' && (
            <Link
              href={hrefRemito}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Truck size={16} /> {accion.boton}
            </Link>
          )}
          {accion.tipo === 'resolver_diferencias' && (
            <Link
              href={hrefFactura}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Scale size={16} /> {accion.boton}
            </Link>
          )}
          {accion.tipo === 'cargar_factura' && (
            <Link
              href={hrefFactura}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <ReceiptText size={16} /> {accion.boton}
            </Link>
          )}
          {accion.tipo === 'ninguna' && pedido.lineas.length === 0 && pedido.editable && (
            <button
              type="button"
              onClick={acciones.onEditar}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <PencilLine size={16} /> Editar ítems
            </button>
          )}
          {visible === 'cerrado' && (
            <button
              type="button"
              onClick={acciones.onReabrir}
              disabled={pendiente}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface disabled:opacity-50"
            >
              {pendiente ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Reabrir pedido
            </button>
          )}
          <MenuSecundario items={secundarias} />
        </div>
      </section>

      {/* Líneas */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-text">
          <ListChecks size={16} className="text-accent" /> Ítems
          <span className="font-normal text-muted">({pedido.lineas.length})</span>
        </h4>
        {pedido.lineas.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">Todavía no hay ítems.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-2xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Insumo</th>
                  <th className="px-3 py-2 text-right font-semibold">Pedido</th>
                  {entrada.estado_recepcion !== 'sin_enviar' && (
                    <>
                      <th className="px-3 py-2 text-right font-semibold">Recibido</th>
                      <th className="px-3 py-2 text-right font-semibold">Falta</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pedido.lineas.map(l => {
                  const falta = l.pendiente ?? 0
                  const excedente = l.excedente ?? 0
                  return (
                    <tr key={l.pedido_item_id}>
                      <td className="px-3 py-2.5 text-text">
                        {l.item_id
                          ? <LinkEntidad entidad={{ tipo: 'insumo', id: l.item_id }} variante="texto" title="Ver el stock de este insumo">{l.descripcion}</LinkEntidad>
                          : l.descripcion}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text whitespace-nowrap">{conUnidad(l.cantidad, l.unidad)}</td>
                      {entrada.estado_recepcion !== 'sin_enviar' && (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted whitespace-nowrap">
                            {conUnidad(l.recibido, null)}
                            {excedente > 0 && <span className="ml-1.5 text-warning">+{conUnidad(excedente, null)} de más</span>}
                          </td>
                          <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${falta > 0 ? 'text-text font-semibold' : 'text-success'}`}>
                            {falta > 0 ? conUnidad(falta, null) : '✓'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Remitos */}
      {entrada.estado_recepcion !== 'sin_enviar' && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-text">
            <PackageOpen size={16} className="text-accent" /> Remitos
            <span className="font-normal text-muted">({remitos.length})</span>
          </h4>
          {remitos.length === 0 ? (
            <p className="text-sm text-muted">Todavía no llegó ningún remito.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {remitos.map(r => (
                <li key={r.id}>
                  <Link
                    href={rutaDe({ tipo: 'remito', id: r.id })}
                    className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface2 transition-colors"
                  >
                    <span className="text-text">
                      <span className="font-mono tabular-nums font-medium">{codigoRemito(fila.numero, r.secuencia)}</span>
                      <span className="text-muted"> · llegó el {formatearFecha(r.fecha)}</span>
                      {r.origen === 'factura' && <span className="text-muted"> · desde la factura</span>}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
                      {r.compras_remito_items[0]?.count ?? 0} línea{(r.compras_remito_items[0]?.count ?? 0) === 1 ? '' : 's'}
                      <ArrowRight size={13} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={hrefRemito} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 transition-opacity">
            {remitos.length ? 'Cargar otro remito' : 'Cargar remito'} <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Factura */}
      {mostrarFactura && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-text">
            <ReceiptText size={16} className="text-accent" /> Factura
          </h4>
          {pedido.factura ? (
            <Link
              href={hrefFactura}
              className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm transition-colors hover:bg-surface2"
            >
              <span className="text-text">
                <span className="font-mono tabular-nums font-medium">{pedido.factura.numero}</span>
                <span className="text-muted"> · {formatearFecha(pedido.factura.fecha)}</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap">
                {pedido.factura.estado === 'borrador'
                  ? <span className="text-xs text-muted">Borrador sin confirmar</span>
                  : <span className="tabular-nums font-semibold text-text">{formatearMonedaExacta(pedido.factura.total)}</span>}
                <ArrowRight size={13} className="text-muted" />
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted">Todavía no se cargó la factura de este pedido.</p>
          )}
          {pedido.factura?.estado === 'confirmada' && (
            <DiferenciasPanel
              diferencias={pedido.diferencias}
              estadoRecepcion={entrada.estado_recepcion}
              stockPorItem={stockPorItem}
            />
          )}
          {!pedido.factura && (
            <Link href={hrefFactura} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 transition-opacity hover:opacity-80">
              Cargar factura <ArrowRight size={14} />
            </Link>
          )}
        </section>
      )}

      {/* Historial */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-text">
          <History size={16} className="text-accent" /> Historial
        </h4>
        <ol className="relative space-y-3 border-l border-border pl-5 ml-2">
          {eventos.map((e, i) => {
            const def = EVENTO[e.tipo ?? ''] ?? { label: e.tipo ?? '', icono: History }
            const extra = detalleEvento(e, codigoDe)
            return (
              <li key={`${e.tipo}-${e.remito_id ?? ''}-${i}`} className="relative">
                <span className="absolute -left-[1.95rem] top-0 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted">
                  <def.icono size={12} />
                </span>
                <p className="text-sm text-text">{def.label}</p>
                <p className="text-xs text-muted">
                  {e.fecha ? formatearFechaHora(e.fecha) : '—'}
                  {e.persona && <> · {e.persona}</>}
                </p>
                {extra && <p className="text-xs text-muted">{extra}</p>}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
