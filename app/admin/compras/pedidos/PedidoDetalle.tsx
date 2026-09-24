'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Clock, History, ListChecks, Loader2, Lock, MoreHorizontal, PackageOpen, PencilLine,
  RotateCcw, Send, Trash2, Truck, type LucideIcon,
} from 'lucide-react'
import EstadoBadge from '@/components/ui/EstadoBadge'
import { formatearFecha, formatearFechaHora } from '@/lib/formato'
import { proximaAccion, subtextoEstado } from '@/lib/compras/estadoPedido'
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
}

// Desempate cuando dos eventos tienen la misma hora.
const ORDEN_EVENTO = ['creado', 'enviado', 'remito', 'cerrado', 'reabierto']

function detalleEvento(e: EventoPedido): string | null {
  if (e.tipo === 'remito' && e.detalle) return `Remito del ${formatearFecha(e.detalle)}`
  if (e.tipo === 'cerrado' && e.detalle) return `Motivo: ${e.detalle}`
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
        className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted hover:text-text hover:bg-surface2 transition-colors"
      >
        <MoreHorizontal size={16} /> Más acciones
      </button>
      {abierto && (
        <div role="menu" className="absolute left-0 z-10 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
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
}: {
  pedido: PedidoVista
  acciones: AccionesDetalle
  pendiente: boolean
}) {
  const { fila, entrada, visible } = pedido
  const accion = proximaAccion(entrada)
  const subtexto = subtextoEstado(entrada)
  const esperaMercaderia = entrada.estado_recepcion === 'enviado' || entrada.estado_recepcion === 'parcial'
  const remitos = [...fila.compras_remitos].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const eventos = [...pedido.eventos].sort((a, b) =>
    (a.fecha ?? '').localeCompare(b.fecha ?? '') || ORDEN_EVENTO.indexOf(a.tipo ?? '') - ORDEN_EVENTO.indexOf(b.tipo ?? ''))
  const hrefRemito = `/admin/compras/pedidos/remitos?pedido=${fila.id}`

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
            {pedido.origen} · creado el {formatearFecha(pedido.creado)}
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
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <Send size={16} /> {accion.boton}
            </button>
          )}
          {accion.tipo === 'cargar_remito' && (
            <Link
              href={hrefRemito}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <Truck size={16} /> {accion.boton}
            </Link>
          )}
          {accion.tipo === 'ninguna' && pedido.lineas.length === 0 && pedido.editable && (
            <button
              type="button"
              onClick={acciones.onEditar}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <PencilLine size={16} /> Editar ítems
            </button>
          )}
          {visible === 'cerrado' && (
            <button
              type="button"
              onClick={acciones.onReabrir}
              disabled={pendiente}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface transition-colors disabled:opacity-50"
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
          <span className="font-normal text-faint">({pedido.lineas.length})</span>
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
                      <td className="px-3 py-2.5 text-text">{l.descripcion}</td>
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
            <span className="font-normal text-faint">({remitos.length})</span>
          </h4>
          {remitos.length === 0 ? (
            <p className="text-sm text-muted">Todavía no llegó ningún remito.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {remitos.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="text-text">
                    Remito del {formatearFecha(r.fecha)}
                    {r.numero && <span className="text-muted"> · N° {r.numero}</span>}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {r.compras_remito_items[0]?.count ?? 0} línea{(r.compras_remito_items[0]?.count ?? 0) === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href={hrefRemito} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 transition-opacity">
            {remitos.length ? 'Ver o editar en Remitos' : 'Ir a Remitos'} <ArrowRight size={14} />
          </Link>
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
            const extra = detalleEvento(e)
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
