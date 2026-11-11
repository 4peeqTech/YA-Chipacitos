'use client'

import { useEffect, useState, useTransition } from 'react'
import { ClipboardCheck, Loader2, ReceiptText, RotateCcw, Scale, Truck } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { controlClass } from '@/components/ui/Field'
import { ChipGroup } from '@/components/ui/Chip'
import { Skeleton } from '@/components/ui/Skeleton'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearFechaHora } from '@/lib/formato'
import { mensajeError } from '@/lib/errores'
import { TIPOS_REVERTIBLES, TIPO_MOVIMIENTO_LABEL, esTipoMovimiento } from '@/lib/compras/movimientos'
import { FILTROS_MOVIMIENTOS, type FiltroMovimientos } from '@/lib/compras/trazabilidad'
import type { Database } from '@/lib/database.types'
import { conUnidad } from '../../pedidos/modelo'
import { revertirMovimiento } from '../acciones'
import type { FilaStock } from '../StockClient'
import { TANDA_MOVIMIENTOS, consultarMovimientos, type Movimiento } from './datos'

function textoDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${conUnidad(Math.abs(delta), null)}`
}

const CHIP = 'min-h-11 sm:min-h-9 px-3 text-xs font-semibold text-text'

// Lo que ya dicen los chips no se repite en el texto: el código del remito, y
// "(desde factura N)" cuando están el chip del remito y el de la factura.
function detalleMovimiento(m: Movimiento): string | null {
  let txt = m.motivo ?? ''
  if (m.remito_id && m.remito_codigo) txt = txt.replace(`Remito ${m.remito_codigo}`, '')
  if (m.remito_id && m.factura_id) txt = txt.replace(/\s*\(desde factura [^)]*\)/i, '')
  return txt.trim() || null
}

/** Pestaña Movimientos (A2c §6.5): el ledger del insumo, con filtro y links a su origen. */
export default function PanelMovimientos({
  supabase,
  fila,
  onCerrar,
}: {
  supabase: SupabaseClient<Database>
  fila: FilaStock
  onCerrar: () => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [filtro, setFiltro] = useState<FiltroMovimientos>('todos')
  const [limite, setLimite] = useState(TANDA_MOVIMIENTOS)
  const [revirtiendo, setRevirtiendo] = useState<Movimiento | null>(null)
  const [motivoReversion, setMotivoReversion] = useState('')
  // Se vuelven a pedir cuando cambia el stock (refresh() trae un stock nuevo),
  // el filtro o la tanda.
  const clave = `${fila.item.id}|${fila.actualizadoEn ?? ''}|${fila.cantidad}|${filtro}|${limite}`
  const [movs, setMovs] = useState<{ clave: string; filtro: FiltroMovimientos; lista: Movimiento[]; hayMas: boolean; error: string | null } | null>(null)
  const cargando = movs?.clave !== clave
  const unidad = fila.item.unidad

  useEffect(() => {
    let vigente = true
    consultarMovimientos(supabase, fila.item.id, filtro, limite).then(({ data, error }) => {
      if (!vigente) return
      const lista = data ?? []
      setMovs({
        clave,
        filtro,
        lista: lista.slice(0, limite),
        hayMas: lista.length > limite,
        error: error ? mensajeError(error, 'No se pudo cargar el historial.') : null,
      })
    })
    return () => { vigente = false }
  }, [supabase, fila.item.id, clave, filtro, limite])

  function cambiarFiltro(f: FiltroMovimientos) {
    setFiltro(f)
    setLimite(TANDA_MOVIMIENTOS)
    setRevirtiendo(null)
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

  // Con otro filtro, la lista vieja no se muestra (sería de otra cosa).
  const lista = movs && movs.filtro === filtro ? movs.lista : null

  return (
    <div className="space-y-3">
      <ChipGroup opciones={FILTROS_MOVIMIENTOS.map(f => ({ value: f.valor, label: f.label }))} value={filtro} onChange={cambiarFiltro} />

      {cargando && !lista?.length ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : movs?.error ? (
        <p role="alert" className="text-sm text-brand-red">{movs.error}</p>
      ) : !lista?.length ? (
        <p className="py-4 text-sm text-muted">
          {filtro === 'todos' ? 'Este insumo todavía no tiene movimientos.' : 'No hay movimientos de este tipo.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lista.map(m => {
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {m.remito_id && m.remito_codigo && (
                      <LinkEntidad entidad={{ tipo: 'remito', id: m.remito_id }} variante="chip" onNavegar={onCerrar}
                        title={`Abrir el remito ${m.remito_codigo}`} className={`${CHIP} font-mono tabular-nums`}>
                        <Truck size={13} /> {m.remito_codigo}
                      </LinkEntidad>
                    )}
                    {m.factura_id && (
                      <LinkEntidad entidad={{ tipo: 'factura', id: m.factura_id }} variante="chip" onNavegar={onCerrar}
                        title={m.discrepancia_id ? 'Abrir la factura y su diferencia' : 'Abrir la factura'} className={CHIP}>
                        {m.discrepancia_id ? <><Scale size={13} /> Diferencia</> : <><ReceiptText size={13} /> Factura</>}
                      </LinkEntidad>
                    )}
                    {m.conteo_id && (
                      <LinkEntidad entidad={{ tipo: 'conteo', id: m.conteo_id }} variante="chip" onNavegar={onCerrar}
                        title="Abrir el conteo de fábrica" className={CHIP}>
                        <ClipboardCheck size={13} /> Conteo
                      </LinkEntidad>
                    )}
                    <p className="min-w-16 text-right text-sm tabular-nums">
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
                    {tipo === 'ajuste_conteo' && m.conteo_id && !m.revertido && (
                      <span className="text-xs text-muted">Se revierte desde el conteo</span>
                    )}
                    {tipo === 'ajuste_factura' && !m.revertido && (
                      <span className="text-xs text-muted">Se revierte desde la factura</span>
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
      {movs?.hayMas && movs.filtro === filtro && (
        <button
          type="button"
          onClick={() => setLimite(l => l + TANDA_MOVIMIENTOS)}
          disabled={cargando}
          className="presionable min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50"
        >
          {cargando && <Loader2 size={15} className="animate-spin" />} Ver {TANDA_MOVIMIENTOS} movimientos más
        </button>
      )}
      {movs && movs.filtro === filtro && !movs.hayMas && movs.lista.length >= TANDA_MOVIMIENTOS && (
        <p className="text-center text-xs text-muted">Estos son todos los movimientos{filtro === 'todos' ? ' del insumo' : ' de este tipo'}.</p>
      )}
    </div>
  )
}
