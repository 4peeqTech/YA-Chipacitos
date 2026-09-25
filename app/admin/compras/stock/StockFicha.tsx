'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, History, Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import InputNumero from '@/components/ui/InputNumero'
import { Field, controlClass } from '@/components/ui/Field'
import { ChipGroup } from '@/components/ui/Chip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearFechaHora } from '@/lib/formato'
import { mensajeError } from '@/lib/errores'
import { TIPOS_REVERTIBLES, TIPO_MOVIMIENTO_LABEL, esTipoMovimiento } from '@/lib/compras/movimientos'
import type { Database } from '@/lib/database.types'
import { conUnidad } from '../pedidos/modelo'
import { ajustarStock, revertirMovimiento } from './acciones'
import type { FilaStock } from './StockClient'

type Movimiento = Database['public']['Views']['v_compras_stock_movimientos']['Row']

const MOTIVOS = ['Recuento en el depósito', 'Rotura o vencimiento', 'Corrección de una carga', 'Otro'] as const
type MotivoRapido = (typeof MOTIVOS)[number] | ''

const LIMITE = 30

function textoDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${conUnidad(Math.abs(delta), null)}`
}

function detalleMovimiento(m: Movimiento): string | null {
  if (m.remito_codigo && !m.motivo?.includes(m.remito_codigo)) return `Remito ${m.remito_codigo}`
  return m.motivo
}

export default function StockFicha({
  fila,
  onCambios,
  onCerrar,
}: {
  fila: FilaStock
  onCambios: (hay: boolean) => void
  onCerrar: () => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [motivo, setMotivo] = useState<MotivoRapido>('')
  const [otro, setOtro] = useState('')
  const [revirtiendo, setRevirtiendo] = useState<Movimiento | null>(null)
  const [motivoReversion, setMotivoReversion] = useState('')
  // Movimientos por "versión" del stock: cuando refresh() trae un stock nuevo,
  // la clave cambia y se vuelven a pedir.
  const clave = `${fila.item.id}|${fila.actualizadoEn ?? ''}|${fila.cantidad}`
  const [movs, setMovs] = useState<{ clave: string; lista: Movimiento[]; error: string | null } | null>(null)
  const cargando = movs?.clave !== clave

  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])

  useEffect(() => {
    let vigente = true
    supabase
      .from('v_compras_stock_movimientos')
      .select('*')
      .eq('item_id', fila.item.id)
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (!vigente) return
        setMovs({ clave, lista: data ?? [], error: error ? mensajeError(error, 'No se pudo cargar el historial.') : null })
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

  function revertir() {
    if (!revirtiendo?.delta) return
    const mov = revirtiendo
    if (!motivoReversion.trim()) { toast.error('Contá por qué revertís el ajuste.'); return }
    startTransition(async () => {
      const r = await revertirMovimiento({ movimientoId: mov.id ?? '', motivo: motivoReversion })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`Ajuste revertido: el stock queda en ${conUnidad(r.data.despues, unidad)}`)
      setRevirtiendo(null)
      setMotivoReversion('')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Stock actual</p>
          <p className={`text-3xl font-bold tabular-nums ${fila.bajo ? 'text-brand-red' : 'text-text'}`}>
            {conUnidad(fila.cantidad, unidad)}
          </p>
        </div>
        <p className="text-sm text-muted tabular-nums">
          Mínimo {conUnidad(fila.item.stock_minimo, unidad)}
          {fila.bajo && <span className="text-brand-red"> · está por debajo</span>}
        </p>
      </div>

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
            {isPending && !revirtiendo && <Loader2 size={16} className="animate-spin" />}
            Ajustar stock
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-text">
            <History size={16} className="text-accent-fg" /> Últimos movimientos
          </h4>
          <Link
            href="/admin/compras/stock/historico"
            onClick={onCerrar}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
          >
            Histórico por conteo <ArrowRight size={14} />
          </Link>
        </div>
        {cargando ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : movs?.error ? (
          <p className="text-sm text-brand-red">{movs.error}</p>
        ) : movs?.lista.length === 0 ? (
          <p className="text-sm text-muted">Este insumo todavía no tiene movimientos.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {movs?.lista.map(m => {
              const tipo = esTipoMovimiento(m.tipo) ? m.tipo : null
              const d = m.delta ?? 0
              // Solo movimientos del ledger (con saldo): los anteriores al saldo inicial no se revierten.
              const revertible = tipo != null && TIPOS_REVERTIBLES.includes(tipo) && !m.revertido && m.cantidad_despues != null
              const detalle = detalleMovimiento(m)
              return (
                <li key={m.id} className="space-y-2 px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-sm text-text">
                        {tipo ? TIPO_MOVIMIENTO_LABEL[tipo] : m.tipo}
                        {m.revertido && <span className="ml-2 text-xs text-muted">(revertido)</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {m.created_at ? formatearFechaHora(m.created_at) : '—'}
                        {m.creado_por_nombre && <> · {m.creado_por_nombre}</>}
                        {detalle && <> · {detalle}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-right text-sm tabular-nums">
                        <span className={d > 0 ? 'text-success' : 'text-warning'}>{textoDelta(d)}</span>
                        {m.cantidad_despues != null && <span className="block text-xs text-muted">queda {conUnidad(m.cantidad_despues, null)}</span>}
                      </p>
                      {revertible && revirtiendo?.id !== m.id && (
                        <button
                          type="button"
                          onClick={() => { setRevirtiendo(m); setMotivoReversion('') }}
                          className="presionable min-h-11 inline-flex items-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold text-text hover:bg-surface2"
                        >
                          <RotateCcw size={13} /> Revertir
                        </button>
                      )}
                    </div>
                  </div>
                  {revirtiendo?.id === m.id && (
                    <div className="space-y-2 rounded-xl bg-surface2 p-3">
                      <p className="text-sm text-text tabular-nums">
                        Se registra un movimiento de <strong>{textoDelta(-d)}</strong>: el stock pasa de {conUnidad(fila.cantidad, null)} a{' '}
                        <strong>{conUnidad(fila.cantidad - d, unidad)}</strong>.
                      </p>
                      <input
                        type="text"
                        autoFocus
                        className={`${controlClass} min-h-11`}
                        placeholder="Por qué lo revertís"
                        aria-label="Motivo de la reversión"
                        value={motivoReversion}
                        onChange={e => setMotivoReversion(e.target.value)}
                      />
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setRevirtiendo(null)}
                          disabled={isPending}
                          className="presionable min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={revertir}
                          disabled={isPending || !motivoReversion.trim()}
                          className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
                        >
                          {isPending && <Loader2 size={16} className="animate-spin" />}
                          Revertir ajuste
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
