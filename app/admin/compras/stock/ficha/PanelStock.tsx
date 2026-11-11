'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, SlidersHorizontal, Truck } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import InputNumero from '@/components/ui/InputNumero'
import { Field, controlClass } from '@/components/ui/Field'
import { ChipGroup } from '@/components/ui/Chip'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useToast } from '@/components/ui/ProveedorUI'
import { codigoPedido } from '@/lib/compras/codigos'
import type { Database } from '@/lib/database.types'
import { conUnidad } from '../../pedidos/modelo'
import { ajustarStock } from '../acciones'
import type { FilaStock } from '../StockClient'
import { aPedidosEnCamino, consultarEnCamino, type PedidoEnCamino } from './datos'

const MOTIVOS = ['Recuento en el depósito', 'Rotura o vencimiento', 'Corrección de una carga', 'Otro'] as const
type MotivoRapido = (typeof MOTIVOS)[number] | ''

function textoDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${conUnidad(Math.abs(delta), null)}`
}

/** Pestaña Stock (A2c §6.2): el "Ajustar stock" de siempre + lo que está en camino. */
export default function PanelStock({
  supabase,
  fila,
  onCambios,
  onCerrar,
}: {
  supabase: SupabaseClient<Database>
  fila: FilaStock
  onCambios: (hay: boolean) => void
  onCerrar: () => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [motivo, setMotivo] = useState<MotivoRapido>('')
  const [otro, setOtro] = useState('')
  // Se vuelve a pedir cuando cambia el stock (un remito nuevo puede cerrar un pedido).
  const clave = `${fila.item.id}|${fila.actualizadoEn ?? ''}|${fila.cantidad}`
  const [enCamino, setEnCamino] = useState<{ clave: string; lista: PedidoEnCamino[] } | null>(null)

  useEffect(() => {
    let vigente = true
    consultarEnCamino(supabase, fila.item.id).then(({ data }) => {
      if (vigente) setEnCamino({ clave, lista: aPedidosEnCamino(data?.pedidos_abiertos) })
    })
    return () => { vigente = false }
  }, [supabase, fila.item.id, clave])

  const unidad = fila.item.unidad
  const motivoFinal = motivo === 'Otro' ? otro.trim() : motivo
  const delta = cantidad == null ? 0 : cantidad - fila.cantidad
  const puedeAjustar = cantidad != null && delta !== 0 && !!motivoFinal

  function marcar(cambios: { cantidad?: number | null; motivo?: MotivoRapido }) {
    const c = cambios.cantidad !== undefined ? cambios.cantidad : cantidad
    const m = cambios.motivo !== undefined ? cambios.motivo : motivo
    onCambios(c != null || m !== '')
  }

  function ajustar() {
    if (cantidad == null) { toast.error('Cargá la cantidad que hay en el depósito.'); return }
    if (delta === 0) { toast.error('Es la misma cantidad que ya figura: no hay nada que ajustar.'); return }
    if (!motivoFinal) { toast.error('Elegí el motivo del ajuste: queda en el historial.'); return }
    startTransition(async () => {
      const r = await ajustarStock({ itemId: fila.item.id, cantidad, motivo: motivoFinal })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`Stock de ${fila.item.nombre}: ${conUnidad(r.data.antes, null)} → ${conUnidad(r.data.despues, unidad)}`)
      setCantidad(null)
      setMotivo('')
      setOtro('')
      onCambios(false)
    })
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-text">
          <SlidersHorizontal size={16} className="text-accent-fg" /> Ajustar stock
        </h4>
        <p className="text-xs text-muted">
          Usalo cuando lo que hay en el depósito no coincide con el sistema. Lo que llega de un pedido se carga como remito.
        </p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Cantidad real">
            <div className="flex items-center gap-2">
              <InputNumero
                value={cantidad}
                onChange={v => { setCantidad(v); marcar({ cantidad: v }) }}
                min={0}
                placeholder={conUnidad(fila.cantidad, null)}
                className={`${controlClass} min-h-11 text-right tabular-nums`}
                ariaLabel="Cantidad real en el depósito"
              />
              <span className="text-xs text-muted">{unidad}</span>
            </div>
          </Field>
          <Field label="Motivo">
            <ChipGroup
              opciones={MOTIVOS.map(m => ({ value: m, label: m }))}
              value={motivo}
              onChange={v => { setMotivo(v); marcar({ motivo: v }) }}
            />
          </Field>
        </div>
        {motivo === 'Otro' && (
          <input
            type="text"
            className={`${controlClass} min-h-11`}
            placeholder="Contá qué pasó"
            aria-label="Motivo del ajuste"
            value={otro}
            onChange={e => setOtro(e.target.value)}
          />
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm tabular-nums" aria-live="polite">
            {cantidad == null
              ? <span className="text-muted">Cargá cuánto hay para ver cómo queda.</span>
              : delta === 0
                ? <span className="text-muted">Es lo mismo que figura en el sistema.</span>
                : <>Pasa de <strong>{conUnidad(fila.cantidad, null)}</strong> a <strong>{conUnidad(cantidad, unidad)}</strong>{' '}
                    <span className={delta > 0 ? 'text-success' : 'text-warning'}>({textoDelta(delta)})</span></>}
          </p>
          <button
            type="button"
            onClick={ajustar}
            disabled={isPending || !puedeAjustar}
            className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {isPending && <Loader2 size={16} className="animate-spin" />}
            Ajustar stock
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted tabular-nums">
          <Truck size={15} className="shrink-0 text-accent-fg" />
          {enCamino?.clave !== clave ? (
            <span>Buscando pedidos en camino…</span>
          ) : enCamino.lista.length === 0 ? (
            <span>No hay pedidos en camino.</span>
          ) : (
            <>
              <span>En camino:</span>
              {enCamino.lista.map((p, i) => (
                <span key={p.pedido_id}>
                  {p.numero != null
                    ? <LinkEntidad entidad={{ tipo: 'pedido', id: p.pedido_id }} onNavegar={onCerrar} className="text-text" title="Ver el pedido">{codigoPedido(p.numero)}</LinkEntidad>
                    : 'Pedido'}
                  {' · faltan '}{conUnidad(p.pendiente, unidad)}
                  {i < enCamino.lista.length - 1 && ';'}
                </span>
              ))}
            </>
          )}
        </p>
        <Link
          href="/admin/compras/stock/historico"
          onClick={onCerrar}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
        >
          Histórico por conteo <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}
