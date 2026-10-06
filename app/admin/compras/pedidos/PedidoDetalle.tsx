'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  ArrowRight, Ban, Clock, FilePen, History, ListChecks, Loader2, Lock, MapPin, MessageCircle, MoreHorizontal,
  PackageOpen, PencilLine, ReceiptText, Repeat, RotateCcw, Scale, Send, Store, Trash2, Truck, type LucideIcon,
} from 'lucide-react'
import EstadoBadge from '@/components/ui/EstadoBadge'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { proximaAccion, subtextoEstado } from '@/lib/compras/estadoPedido'
import { codigoRemito } from '@/lib/compras/codigos'
import { rutaCargarDePedido, rutaDe } from '@/lib/compras/rutas'
import {
  agruparEventos, etiquetaEvento, leerDiferencia, partesDiff, partesLineas, textoCantidadItems, textoSolicitud, textosCabeceraRemito,
  type EntradaHistorial, type EventoLeido, type ParteDiff,
} from '@/lib/compras/historialPedido'
import { ESTADOS } from '@/lib/estados'
import DiferenciasPanel from './facturas/DiferenciasPanel'
import { mensajeError } from '@/lib/errores'
import type { Database } from '@/lib/database.types'
import { conUnidad, type PedidoVista } from './modelo'
import type { EventoPedido, PedidoFila } from './datos'

/**
 * Eventos de un solo pedido, pedidos al abrir el detalle (no todos los de la
 * página: la vista crece con cada acción y PostgREST corta en 1000 filas).
 * La clave es la "versión" del pedido: cada evento de las RPC mueve
 * actualizado_en, y remito y factura cambian los estados o los remitos. Cuando
 * refresh() la cambia, se vuelven a pedir, mostrando mientras tanto los
 * anteriores del mismo pedido.
 */
function useHistorialPedido(fila: PedidoFila) {
  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const clave = [
    fila.id, fila.actualizado_en, fila.estado_recepcion, fila.estado_facturacion,
    fila.compras_remitos.map(r => r.id).join(','),
  ].join('|')
  const [estado, setEstado] = useState<{ clave: string; pedidoId: string; eventos: EventoPedido[]; error: string | null } | null>(null)

  useEffect(() => {
    let vigente = true
    const pedidoId = clave.split('|')[0]
    supabase
      .from('v_compras_pedido_eventos')
      .select('*')
      .eq('pedido_id', pedidoId)
      .order('fecha')
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado({ clave, pedidoId, eventos: data ?? [], error: error ? mensajeError(error, 'No se pudo cargar el historial.') : null })
      })
    return () => { vigente = false }
  }, [supabase, clave])

  const delMismo = estado?.pedidoId === fila.id ? estado : null
  const historial = useMemo(() => (delMismo ? agruparEventos(delMismo.eventos) : null), [delMismo])
  return { historial, cargando: estado?.clave !== clave, error: delMismo?.error ?? null }
}

export interface AccionesDetalle {
  onEnviar: () => void
  onEditar: () => void
  onCerrar: () => void
  onReabrir: () => void
  onEliminar: () => void
}

const ICONO_EVENTO: Record<string, LucideIcon> = {
  creado: PencilLine,
  items_editados: ListChecks,
  proveedor_cambiado: Store,
  local_cambiado: MapPin,
  mensaje: MessageCircle,
  enviado: Send,
  reenviado: Repeat,
  cerrado: Lock,
  reabierto: RotateCcw,
  remito_creado: Truck,
  remito_editado: FilePen,
  remito_eliminado: Trash2,
  factura: ReceiptText,
  factura_anulada: Ban,
  diferencia: Scale,
  grupo: PencilLine,
}

const MAX_PARTES = 5

/** Las líneas de un diff ("Queso 40 → 45 kg", "agregó Sal 2 Bolsa"), con el insumo linkeado. */
function PartesDiff({ partes }: { partes: ParteDiff[] }) {
  const [todas, setTodas] = useState(false)
  const visibles = todas ? partes : partes.slice(0, MAX_PARTES)
  const resto = partes.length - MAX_PARTES
  return (
    <>
      <ul className="space-y-0.5">
        {visibles.map((p, i) => (
          <li key={`${p.tipo}-${i}`} className="flex gap-1.5 text-xs text-muted">
            <span aria-hidden="true">•</span>
            <span className="min-w-0 break-words">
              {p.previo}
              {p.itemId
                ? <LinkEntidad entidad={{ tipo: 'insumo', id: p.itemId }} variante="texto" title="Ver el stock de este insumo">{p.nombre}</LinkEntidad>
                : p.nombre}
              {p.resto}
            </span>
          </li>
        ))}
      </ul>
      {resto > 0 && (
        <button
          type="button"
          onClick={() => setTodas(t => !t)}
          aria-expanded={todas}
          className="min-h-11 rounded text-xs font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {todas ? 'Ver menos' : `Ver ${resto} cambio${resto === 1 ? '' : 's'} más`}
        </button>
      )}
    </>
  )
}

function VerMensaje({ mensaje }: { mensaje: string }) {
  return (
    <details className="group text-xs">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent">
        <span className="group-open:hidden">Ver el mensaje</span>
        <span className="hidden group-open:inline">Ocultar el mensaje</span>
      </summary>
      <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-bg p-3 font-sans text-xs text-text">
        {mensaje}
      </pre>
    </details>
  )
}

/** Lo que va debajo de la etiqueta de un evento. null si no hay nada que agregar. */
function detalleEvento(e: EventoLeido, numeroPedido: number): ReactNode {
  switch (e.tipo) {
    case 'creado': {
      if (!e.d) return null
      const items = e.d.lineas ? textoCantidadItems(e.d.lineas.length) : null
      if (e.d.origen === 'solicitud') {
        const texto = textoSolicitud(e.d.solicitud_tipo, e.d.solicitud_fecha)
        return (
          <p className="text-xs text-muted">
            {e.d.solicitud_id
              ? <LinkEntidad entidad={{ tipo: 'solicitud', id: e.d.solicitud_id }} variante="texto" title="Ver la solicitud">{texto}</LinkEntidad>
              : texto}
            {items && <> · {items}</>}
          </p>
        )
      }
      return items ? <p className="text-xs text-muted">{items}</p> : null
    }
    case 'items_editados':
      return e.d ? <PartesDiff partes={partesDiff(e.d)} /> : null
    case 'proveedor_cambiado': {
      if (!e.d) return null
      const { de, a } = e.d
      return (
        <p className="text-xs text-muted">
          {de.nombre ?? 'Otro proveedor'} →{' '}
          {a.id
            ? <LinkEntidad entidad={{ tipo: 'proveedor', id: a.id }} variante="texto" title="Ver el proveedor">{a.nombre ?? 'proveedor'}</LinkEntidad>
            : a.nombre}
        </p>
      )
    }
    case 'local_cambiado': {
      if (!e.d) return null
      const a = e.d.a?.nombre ?? 'sin asignar'
      return <p className="text-xs text-muted">{e.d.de ? `${e.d.de.nombre ?? '—'} → ${a}` : a}</p>
    }
    case 'enviado':
    case 'reenviado':
      return e.d?.mensaje ? <VerMensaje mensaje={e.d.mensaje} /> : null
    case 'cerrado':
      return e.d?.motivo ? <p className="text-xs text-muted">Motivo: {e.d.motivo}</p> : null
    case 'reabierto': {
      const estado = e.d?.estado_recepcion
      if (!estado) return null
      const clave = estado === 'cerrado_manual' ? 'cerrado' : estado
      const label = ESTADOS.compras_pedido[clave as keyof typeof ESTADOS.compras_pedido]?.label ?? estado
      return <p className="text-xs text-muted">Volvió a {label}</p>
    }
    case 'remito_creado':
      if (!e.d) return null
      return (
        <>
          <p className="text-xs text-muted">
            <LinkEntidad entidad={{ tipo: 'remito', id: e.d.remito_id }}>{codigoRemito(numeroPedido, e.d.secuencia)}</LinkEntidad>
            {e.d.fecha && <> · llegó el {formatearFecha(e.d.fecha)}</>}
            {e.d.origen === 'factura' && <> · generado al confirmar la factura {e.d.factura_numero ?? ''}</>}
          </p>
          {!!e.d.lineas?.length && <PartesDiff partes={partesLineas(e.d.lineas)} />}
        </>
      )
    case 'remito_editado': {
      if (!e.d) return null
      const cabecera = textosCabeceraRemito(e.d)
      return (
        <>
          <p className="text-xs text-muted">
            <LinkEntidad entidad={{ tipo: 'remito', id: e.d.remito_id }}>{codigoRemito(numeroPedido, e.d.secuencia)}</LinkEntidad>
            {cabecera.map(t => <span key={t}> · {t}</span>)}
          </p>
          <PartesDiff partes={partesDiff(e.d)} />
        </>
      )
    }
    case 'remito_eliminado':
      if (!e.d) return null
      return (
        <>
          <p className="text-xs text-muted">
            <span className="font-mono tabular-nums">{codigoRemito(numeroPedido, e.d.secuencia)}</span>
            {e.d.motivo && <> · Motivo: {e.d.motivo}</>}
            {!!e.d.lineas?.length && <> · Se descontó:</>}
          </p>
          {!!e.d.lineas?.length && <PartesDiff partes={partesLineas(e.d.lineas)} />}
        </>
      )
    case 'factura':
    case 'factura_anulada':
      if (!e.d) return null
      return (
        <p className="text-xs text-muted">
          <LinkEntidad entidad={{ tipo: 'factura', id: e.d.factura_id }} variante="texto">N° {e.d.numero ?? '—'}</LinkEntidad>
        </p>
      )
    case 'diferencia': {
      if (!e.d) return null
      const dif = leerDiferencia(e.d)
      return (
        <p className="text-xs text-muted">
          {e.d.item_id
            ? <LinkEntidad entidad={{ tipo: 'insumo', id: e.d.item_id }} variante="texto" title="Ver el stock de este insumo">{dif.insumo}</LinkEntidad>
            : dif.insumo}
          : {dif.texto}
        </p>
      )
    }
    default:
      return null
  }
}

/** '5 oct, 14:02' o '5 oct, 14:02–14:06' si el grupo pasa a otro minuto. */
function rangoFecha(desde: string | null, hasta: string | null): string {
  if (!desde) return '—'
  const inicio = formatearFechaHora(desde)
  if (!hasta || Math.floor(Date.parse(hasta) / 60_000) === Math.floor(Date.parse(desde) / 60_000)) return inicio
  return `${inicio}–${new Date(hasta).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
}

function EntradaDelHistorial({ entrada, numeroPedido }: { entrada: EntradaHistorial; numeroPedido: number }) {
  const Icono = ICONO_EVENTO[entrada.tipo] ?? History
  const mixto = entrada.tipo === 'grupo'
  return (
    <li className="relative">
      <span className="absolute -left-[1.95rem] top-0 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted">
        <Icono size={12} aria-hidden="true" />
      </span>
      <p className="text-sm text-text">{entrada.etiqueta}</p>
      <p className="text-xs text-muted">
        {rangoFecha(entrada.desde, entrada.hasta)}
        {entrada.persona && <> · {entrada.persona}</>}
      </p>
      {entrada.eventos.map(e => {
        const detalle = detalleEvento(e, numeroPedido)
        if (!mixto) return detalle ? <div key={`${e.tipo}-${e.id}`} className="mt-0.5">{detalle}</div> : null
        // En un grupo con varios tipos, cada sub-evento va con su propia etiqueta.
        return (
          <div key={`${e.tipo}-${e.id}`} className="mt-1">
            <p className="text-xs font-medium text-text">{etiquetaEvento(e)}</p>
            {detalle}
          </div>
        )
      })}
    </li>
  )
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
  const { historial, cargando: cargandoHistorial, error: errorHistorial } = useHistorialPedido(fila)
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
          {historial && <span className="font-normal text-muted">({historial.length})</span>}
          {cargandoHistorial && <Loader2 size={14} className="animate-spin text-muted" aria-label="Cargando el historial" />}
        </h4>
        {errorHistorial && <p className="text-sm text-brand-red">{errorHistorial}</p>}
        {historial && (
          <ol className="relative space-y-3 border-l border-border pl-5 ml-2">
            {historial.map(entrada => (
              <EntradaDelHistorial key={entrada.key} entrada={entrada} numeroPedido={fila.numero} />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
