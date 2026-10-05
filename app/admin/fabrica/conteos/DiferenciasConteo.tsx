'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { Check, ClipboardCheck, EyeOff, Loader2, RotateCcw, TriangleAlert } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { mensajeError } from '@/lib/errores'
import type { Database } from '@/lib/database.types'
import { conUnidad } from '../../compras/pedidos/modelo'
import { resolverDiferenciasConteo } from './acciones'

type FilaVista = Database['public']['Views']['v_fabrica_conteo_diferencias']['Row']

type EstadoFila = 'pendiente' | 'superada' | 'aplicada' | 'ignorada' | 'coincide' | 'sin_contar' | 'sin_control'

interface Fila {
  id: string
  itemId: string
  nombre: string
  unidad: string | null
  contado: number
  teorico: number | null
  diferencia: number | null
  estado: EstadoFila
  resueltaPor: string | null
  resueltaEn: string | null
  stockHoy: number
  movidoDesdeCierre: number
  superadoPor: string | null
  superadoPorConteoId: string | null
  grande: boolean
  pct: number | null
}

const ORDEN_ESTADO: Record<EstadoFila, number> = {
  pendiente: 0, superada: 1, aplicada: 2, ignorada: 2, coincide: 3, sin_contar: 4, sin_control: 5,
}

function conSigno(n: number): string {
  const abs = Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

function diaMes(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function aFila(v: FilaVista, umbralPct: number): Fila {
  const teorico = v.stock_teorico
  const dif = v.diferencia
  let estado: EstadoFila
  if (teorico == null) estado = 'sin_control'
  else if (!v.contado_en) estado = 'sin_contar'
  else if (v.diferencia_estado === 'aplicada') estado = 'aplicada'
  else if (v.diferencia_estado === 'ignorada') estado = 'ignorada'
  else if (v.diferencia_estado === 'pendiente') estado = v.superado_por_conteo_id ? 'superada' : 'pendiente'
  else estado = 'coincide'
  const pct = dif != null && teorico != null && teorico !== 0 ? (dif / Math.abs(teorico)) * 100 : null
  // D11: ámbar si supera el umbral del esperado, o si se esperaba 0 y hay diferencia.
  const grande = dif != null && dif !== 0 && (teorico === 0 || (pct != null && Math.abs(pct) > umbralPct))
  return {
    id: v.id ?? '',
    itemId: v.item_id ?? '',
    nombre: v.item_nombre ?? '—',
    unidad: v.unidad,
    contado: v.contado ?? 0,
    teorico,
    diferencia: dif,
    estado,
    resueltaPor: v.diferencia_resuelta_por_nombre,
    resueltaEn: v.diferencia_resuelta_en,
    stockHoy: v.stock_hoy ?? 0,
    movidoDesdeCierre: v.movido_desde_cierre ?? 0,
    superadoPor: v.superado_por,
    superadoPorConteoId: v.superado_por_conteo_id,
    grande,
    pct,
  }
}

const TONO = {
  alerta: 'text-warning bg-warning-bg',
  exito: 'text-success bg-green-bg',
  neutro: 'text-muted bg-surface2',
} as const

function Pill({ tono, children }: { tono: keyof typeof TONO; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${TONO[tono]}`}>
      {children}
    </span>
  )
}

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-text hover:bg-surface2 disabled:opacity-50'
const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50'

export default function DiferenciasConteo({
  conteoId,
  descartado,
  umbralPct,
  onNavegar,
  onAbrirConteo,
}: {
  conteoId: string
  descartado: boolean
  umbralPct: number
  /** Se llama antes de navegar a otra pantalla (cierra el modal). */
  onNavegar: () => void
  /** Abre otro conteo en el mismo modal (diferencia superada). */
  onAbrirConteo: (id: string) => void
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [isPending, startTransition] = useTransition()
  const [enCurso, setEnCurso] = useState<string | null>(null)
  // Se recarga por versión: cada acción la sube y se vuelven a pedir las filas.
  const [version, setVersion] = useState(0)
  const clave = `${conteoId}|${version}`
  const [datos, setDatos] = useState<{ clave: string; filas: Fila[]; error: string | null } | null>(null)
  const cargando = datos?.clave !== clave

  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])

  useEffect(() => {
    let vigente = true
    supabase
      .from('v_fabrica_conteo_diferencias')
      .select('*')
      .eq('conteo_id', conteoId)
      .then(({ data, error }) => {
        if (!vigente) return
        const filas = (data ?? []).map(v => aFila(v, umbralPct)).sort((a, b) =>
          ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
          || Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0)
          || a.nombre.localeCompare(b.nombre))
        setDatos({ clave, filas, error: error ? mensajeError(error, 'No se pudieron cargar las diferencias.') : null })
      })
    return () => { vigente = false }
  }, [supabase, conteoId, clave, umbralPct])

  const filas = datos?.filas ?? []
  const aplicables = filas.filter(f => f.estado === 'pendiente')
  const superadas = filas.filter(f => f.estado === 'superada')

  function ejecutar(
    clavesEnCurso: string,
    entrada: Parameters<typeof resolverDiferenciasConteo>[0],
    mensajeOk: (r: { hechas: number; omitidasSuperadas: number; items: { nombre: string; cantidad_despues: number | null }[] }) => string,
  ) {
    setEnCurso(clavesEnCurso)
    startTransition(async () => {
      const r = await resolverDiferenciasConteo(entrada)
      if (r.ok) toast.success(mensajeOk(r.data))
      else toast.error(r.error)
      setEnCurso(null)
      setVersion(v => v + 1)
    })
  }

  function avisoMovido(f: Fila): ReactNode {
    if (f.movidoDesdeCierre === 0) return null
    return (
      <p className="mt-2 text-sm text-warning">
        Desde el cierre el stock se movió {conSigno(f.movidoDesdeCierre)} (remitos, facturas o ajustes). La diferencia se
        calculó al cerrar: si esa mercadería ya estaba cuando se contó, ya está explicada y conviene ignorarla.
      </p>
    )
  }

  function aplicar(f: Fila) {
    const dif = f.diferencia ?? 0
    const despues = f.stockHoy + dif
    confirmar({
      titulo: 'Aplicar diferencia de conteo',
      textoConfirmar: 'Aplicar',
      mensaje: (
        <div className="space-y-1 text-sm text-text tabular-nums">
          <p>
            El stock de <strong>{f.nombre}</strong> pasa de <strong>{conUnidad(f.stockHoy, null)}</strong> a{' '}
            <strong>{conUnidad(despues, null)}</strong> ({conSigno(dif)} {f.unidad ?? ''}).
          </p>
          {despues < 0 && <p className="text-warning">Queda en negativo.</p>}
          {avisoMovido(f)}
        </div>
      ),
      onConfirmar: () => ejecutar(f.id, { conteoId, itemIds: [f.id], accion: 'aplicar' }, r => {
        const queda = r.items[0]?.cantidad_despues
        return `Diferencia aplicada: ${f.nombre} queda en ${conUnidad(queda ?? despues, f.unidad)}`
      }),
    })
  }

  function aplicarTodas() {
    const top = [...aplicables].sort((a, b) => Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0)).slice(0, 3)
    const negativas = aplicables.filter(f => f.stockHoy + (f.diferencia ?? 0) < 0).length
    const conMovimiento = aplicables.filter(f => f.movidoDesdeCierre !== 0).length
    confirmar({
      titulo: 'Aplicar todas las diferencias',
      textoConfirmar: `Aplicar ${aplicables.length}`,
      ancho: 'lg',
      mensaje: (
        <div className="space-y-2 text-sm text-text tabular-nums">
          <p>Vas a aplicar <strong>{aplicables.length}</strong> diferencia{aplicables.length === 1 ? '' : 's'}. {top.length > 1 ? 'Las más grandes:' : ''}</p>
          <ul className="space-y-0.5">
            {top.map(f => (
              <li key={f.id}>
                <strong>{f.nombre}</strong>: pasa de {conUnidad(f.stockHoy, null)} a {conUnidad(f.stockHoy + (f.diferencia ?? 0), f.unidad)}{' '}
                <span className="text-muted">({conSigno(f.diferencia ?? 0)})</span>
              </li>
            ))}
          </ul>
          {superadas.length > 0 && (
            <p className="text-muted">
              {superadas.length} quedaron viejas (hay un conteo más nuevo) y no se aplican.
            </p>
          )}
          {negativas > 0 && <p className="text-warning">{negativas} quedan en negativo.</p>}
          {conMovimiento > 0 && (
            <p className="text-warning">
              En {conMovimiento} el stock se movió desde el cierre: revisalas una por una si esa mercadería ya estaba cuando se contó.
            </p>
          )}
        </div>
      ),
      onConfirmar: () => ejecutar('todas', { conteoId, itemIds: null, accion: 'aplicar' }, r => {
        const base = `${r.hechas} diferencia${r.hechas === 1 ? '' : 's'} aplicada${r.hechas === 1 ? '' : 's'}`
        return r.omitidasSuperadas > 0 ? `${base} (${r.omitidasSuperadas} vieja${r.omitidasSuperadas === 1 ? '' : 's'} sin aplicar)` : base
      }),
    })
  }

  function ignorar(f: Fila) {
    ejecutar(f.id, { conteoId, itemIds: [f.id], accion: 'ignorar' }, () => `Diferencia ignorada: ${f.nombre}`)
  }

  function revertir(f: Fila) {
    if (f.estado === 'ignorada') {
      ejecutar(f.id, { conteoId, itemIds: [f.id], accion: 'revertir' }, () => `${f.nombre}: la diferencia vuelve a estar pendiente`)
      return
    }
    const dif = f.diferencia ?? 0
    const despues = f.stockHoy - dif
    confirmar({
      titulo: 'Revertir diferencia aplicada',
      textoConfirmar: 'Revertir',
      peligroso: true,
      mensaje: (
        <p className="text-sm text-text tabular-nums">
          El stock de <strong>{f.nombre}</strong> vuelve de <strong>{conUnidad(f.stockHoy, null)}</strong> a{' '}
          <strong>{conUnidad(despues, null)}</strong> ({conSigno(-dif)} {f.unidad ?? ''}). La diferencia queda pendiente otra vez.
        </p>
      ),
      onConfirmar: () => ejecutar(f.id, { conteoId, itemIds: [f.id], accion: 'revertir' }, r => {
        const queda = r.items[0]?.cantidad_despues
        return `Diferencia revertida: ${f.nombre} vuelve a ${conUnidad(queda ?? despues, f.unidad)}`
      }),
    })
  }

  function estadoPill(f: Fila): ReactNode {
    switch (f.estado) {
      case 'pendiente': return <Pill tono="alerta">Pendiente</Pill>
      case 'aplicada':
        return (
          <span className="inline-flex flex-col items-start gap-0.5">
            <Pill tono="exito"><Check size={11} /> Aplicada</Pill>
            {(f.resueltaPor || f.resueltaEn) && (
              <span className="text-2xs text-muted">{f.resueltaPor ? `por ${f.resueltaPor}` : ''}{f.resueltaEn ? `, ${diaMes(f.resueltaEn)}` : ''}</span>
            )}
          </span>
        )
      case 'ignorada': return <Pill tono="neutro"><EyeOff size={11} /> Ignorada</Pill>
      case 'superada':
        return (
          <span className="inline-flex flex-col items-start gap-0.5">
            <Pill tono="neutro">Superada</Pill>
            {f.superadoPorConteoId && (
              <button
                type="button"
                onClick={() => onAbrirConteo(f.superadoPorConteoId!)}
                className="min-h-11 sm:min-h-0 text-left text-2xs font-medium text-text underline decoration-accent underline-offset-2 hover:opacity-80"
              >
                por {f.superadoPor}
              </button>
            )}
          </span>
        )
      case 'coincide': return <Pill tono="neutro">Coincide</Pill>
      case 'sin_contar': return <Pill tono="neutro">Sin contar</Pill>
      case 'sin_control': return <span className="text-muted">—</span>
    }
  }

  function acciones(f: Fila): ReactNode {
    if (descartado) return null
    const ocupado = isPending
    const spinner = (id: string) => enCurso === id && <Loader2 size={13} className="animate-spin" />
    if (f.estado === 'pendiente') {
      return (
        <>
          <button type="button" onClick={() => aplicar(f)} disabled={ocupado} className={botonPrimario}>
            {spinner(f.id) || <Check size={13} />} Aplicar
          </button>
          <button type="button" onClick={() => ignorar(f)} disabled={ocupado} className={botonSecundario}>
            <EyeOff size={13} /> Ignorar
          </button>
        </>
      )
    }
    if (f.estado === 'superada') {
      return (
        <button type="button" onClick={() => ignorar(f)} disabled={ocupado} className={botonSecundario}>
          {spinner(f.id) || <EyeOff size={13} />} Ignorar
        </button>
      )
    }
    if (f.estado === 'aplicada' || f.estado === 'ignorada') {
      return (
        <button type="button" onClick={() => revertir(f)} disabled={ocupado} className={botonSecundario}>
          {spinner(f.id) || <RotateCcw size={13} />} Revertir
        </button>
      )
    }
    return null
  }

  function insumo(f: Fila): ReactNode {
    return (
      <>
        {/* TODO(B0): LinkEntidad */}
        <Link
          href={`/admin/compras/stock?insumo=${f.itemId}`}
          onClick={onNavegar}
          className="font-medium text-text underline decoration-border decoration-1 underline-offset-4 hover:decoration-accent"
        >
          {f.nombre}
        </Link>
        {f.estado === 'pendiente' && f.movidoDesdeCierre !== 0 && (
          <span className="mt-0.5 flex items-center gap-1 text-2xs text-warning">
            <TriangleAlert size={11} /> Desde el cierre el stock se movió {conSigno(f.movidoDesdeCierre)}
          </span>
        )}
      </>
    )
  }

  function diferencia(f: Fila): ReactNode {
    if (f.diferencia == null) return <span className="text-muted">—</span>
    if (f.diferencia === 0) return <span className="text-muted">0</span>
    return (
      <span className={`inline-flex flex-col items-end ${f.grande ? 'text-warning font-semibold' : 'text-text'}`}>
        {conSigno(f.diferencia)}
        {f.pct != null && <span className={`text-2xs ${f.grande ? '' : 'text-muted'}`}>{conSigno(Math.round(f.pct))} %</span>}
      </span>
    )
  }

  if (cargando && !datos) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (datos?.error) return <p className="text-sm text-brand-red">{datos.error}</p>

  const sinControl = filas.length > 0 && filas.every(f => f.estado === 'sin_control')
  if (filas.length === 0 || sinControl) {
    return (
      <div className="rounded-xl border border-border">
        <EmptyState
          icono={ClipboardCheck}
          titulo="Sin diferencias"
          descripcion={sinControl
            ? 'Este conteo es anterior al control: cuando se cargó, pisó el stock directamente.'
            : 'Este conteo no tiene ítems.'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        El conteo no cambia el stock: compara lo contado con lo que decía el sistema al cerrar. Si la diferencia es real,
        aplicala. Si Fábrica contó mal, ignorala.
      </p>

      {!descartado && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={aplicarTodas}
            disabled={isPending || aplicables.length === 0}
            className="presionable min-h-11 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 sm:w-auto"
          >
            {enCurso === 'todas' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Aplicar todas las pendientes ({aplicables.length})
          </button>
        </div>
      )}

      {/* Desktop: tabla */}
      <div className={`hidden overflow-hidden overflow-x-auto rounded-xl border border-border sm:block ${cargando ? 'opacity-60' : ''}`}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface2">
            <tr className="text-2xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-3 py-2.5 text-left">Insumo</th>
              <th className="px-3 py-2.5 text-right">Esperado (sistema)</th>
              <th className="px-3 py-2.5 text-right">Contado</th>
              <th className="px-3 py-2.5 text-right">Diferencia</th>
              <th className="px-3 py-2.5 text-left">Estado</th>
              <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map(f => (
              <tr key={f.id} className="align-top">
                <td className="px-3 py-3">{insumo(f)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted whitespace-nowrap">
                  {f.teorico == null ? '—' : conUnidad(f.teorico, f.unidad)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                  {f.estado === 'sin_contar' ? <span className="text-muted">Sin contar</span> : conUnidad(f.contado, f.unidad)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{diferencia(f)}</td>
                <td className="px-3 py-3">{estadoPill(f)}</td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">{acciones(f)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: tarjetas */}
      <ul className={`space-y-2 sm:hidden ${cargando ? 'opacity-60' : ''}`}>
        {filas.map(f => {
          const botones = acciones(f)
          return (
            <li key={f.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">{insumo(f)}</div>
                {estadoPill(f)}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-muted">Esperado</dt>
                  <dd className="text-muted">{f.teorico == null ? '—' : conUnidad(f.teorico, null)}</dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-muted">Contado</dt>
                  <dd>{f.estado === 'sin_contar' ? <span className="text-muted">Sin contar</span> : conUnidad(f.contado, null)}</dd>
                </div>
                <div className="text-right">
                  <dt className="text-2xs uppercase tracking-wide text-muted">Diferencia</dt>
                  <dd>{diferencia(f)}</dd>
                </div>
              </dl>
              {botones && <div className="grid grid-flow-col auto-cols-fr gap-2">{botones}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
