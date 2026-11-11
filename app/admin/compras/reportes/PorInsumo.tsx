'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Lock, ShoppingBasket } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import HelpTooltip from '@/components/ui/HelpTooltip'
import LinkEntidad from '@/components/ui/LinkEntidad'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { ChipGroup } from '@/components/ui/Chip'
import { SkeletonTabla } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ProveedorUI'
import { descargarCsv } from '@/lib/csv'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearMoneda, formatearMonedaExacta } from '@/lib/formato'
import type { RangoFechas } from '@/lib/compras/rangoFechas'
import { etiquetaCobraPor } from '@/lib/compras/unidades'
import {
  cabecerasCsv, categoriasReporte, filasCsv, filasReporte, filtrarReporte, nombreCsv, totalesReporte,
  type FilaReporteInsumo,
} from '@/lib/compras/reportePorInsumo'
import { conUnidad } from '../pedidos/modelo'

const TODAS = '__todas__'

interface BarraTop { nombre: string; neto: number; total: number; facturado: string | null }

function TooltipTop({ active, payload }: { active?: boolean; payload?: { payload: BarraTop }[] }) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text">{b.nombre}</p>
      <p className="font-semibold tabular-nums text-text">{formatearMonedaExacta(b.neto)} neto</p>
      <p className="tabular-nums text-muted">{formatearMonedaExacta(b.total)} con IVA</p>
      {b.facturado && <p className="tabular-nums text-muted">{b.facturado}</p>}
    </div>
  )
}

function pesosCortos(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (Math.abs(n) >= 1000) return `$ ${(n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 0 })} mil`
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/**
 * Compras › Reportes › Por insumo (A2c §6.7): cuánto se pidió, recibió y facturó
 * de cada insumo en el período, con CSV. Calcula en el navegador con la función
 * compras_trazabilidad_insumo (acotada por período). Un no admin no ve pesos.
 */
export default function PorInsumo({ rango, esAdmin }: { rango: RangoFechas; esAdmin: boolean }) {
  const toast = useToast()
  const supabase = useMemo(() => createClient(), [])
  const clave = `${rango.desde}|${rango.hasta}`
  const [datos, setDatos] = useState<{ clave: string; filas: FilaReporteInsumo[]; error: string | null } | null>(null)
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState<string>(TODAS)

  // useToast() devuelve un objeto nuevo en cada render del proveedor: va por ref
  // para no volver a pedir el reporte cada vez que aparece un toast.
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })

  useEffect(() => {
    let vigente = true
    supabase.rpc('compras_trazabilidad_insumo', { p_desde: rango.desde, p_hasta: rango.hasta }).then(({ data, error }) => {
      if (!vigente) return
      const msg = error ? mensajeError(error, 'No se pudo cargar el reporte.') : null
      if (msg) toastRef.current.error(msg)
      setDatos({ clave, filas: filasReporte(data ?? []), error: msg })
    })
    return () => { vigente = false }
  }, [supabase, rango.desde, rango.hasta, clave])

  const cargando = datos?.clave !== clave
  const todas = useMemo(() => {
    const filas = datos?.filas ?? []
    // Orden por defecto: admin por neto (ya viene así), no admin por recibido.
    return esAdmin ? filas : [...filas].sort((a, b) => b.t.recibido.cantidad - a.t.recibido.cantidad)
  }, [datos, esAdmin])
  const categorias = useMemo(() => categoriasReporte(todas), [todas])
  const filtradas = useMemo(
    () => filtrarReporte(todas, { texto, categoria: categoria === TODAS ? null : categoria }),
    [todas, texto, categoria],
  )
  const totales = totalesReporte(filtradas)
  const hayFiltros = !!texto || categoria !== TODAS

  const top: BarraTop[] = useMemo(() => filtradas
    .filter(f => (f.t.facturado?.neto ?? 0) > 0)
    .sort((a, b) => (b.t.facturado?.neto ?? 0) - (a.t.facturado?.neto ?? 0))
    .slice(0, 8)
    .map(f => ({ nombre: f.t.nombre, neto: f.t.facturado?.neto ?? 0, total: f.t.facturado?.total ?? 0, facturado: f.facturadoTexto })),
  [filtradas])

  function exportar() {
    descargarCsv(nombreCsv(rango.desde, rango.hasta), cabecerasCsv(esAdmin), filasCsv(filtradas, esAdmin))
  }

  const columnas: Columna<FilaReporteInsumo>[] = [
    {
      key: 'insumo',
      header: 'Insumo',
      render: ({ t }) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <LinkEntidad entidad={{ tipo: 'insumo', id: t.itemId, pestana: 'compras' }} variante="texto" className="font-medium text-text" title="Ver la ficha del insumo">
            {t.nombre}
          </LinkEntidad>
          {t.estado === 'archivado' && (
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">Archivado</span>
          )}
        </span>
      ),
      ordenar: ({ t }) => t.nombre,
    },
    {
      key: 'categoria', header: 'Categoría', ocultarHasta: 'xl',
      render: ({ t }) => <span className="text-muted">{t.categoria ?? '—'}</span>,
      ordenar: ({ t }) => t.categoria ?? '',
    },
    {
      key: 'pedido', header: 'Pedido', alinear: 'right', ocultarHasta: 'lg',
      render: ({ t }) => <span className="whitespace-nowrap tabular-nums text-muted">{conUnidad(t.pedido.cantidad, t.unidades.unidad)}</span>,
      ordenar: ({ t }) => t.pedido.cantidad,
    },
    {
      key: 'recibido', header: 'Recibido', alinear: 'right',
      render: f => <span className="tabular-nums text-text">{f.recibidoTexto}</span>,
      ordenar: ({ t }) => t.recibido.cantidad,
    },
    ...(esAdmin ? [
      {
        key: 'facturado', header: 'Facturado', alinear: 'right', ocultarHasta: 'md',
        render: f => <span className="tabular-nums text-muted">{f.facturadoTexto ?? '—'}</span>,
        ordenar: ({ t }) => t.facturado?.cantidad ?? 0,
      },
      {
        key: 'neto',
        header: <>Neto<HelpTooltip text="Sin IVA. Las notas de crédito restan." /></>,
        alinear: 'right',
        render: ({ t }) => <span className="whitespace-nowrap font-semibold tabular-nums text-text">{formatearMoneda(t.facturado?.neto ?? 0)}</span>,
        ordenar: ({ t }) => t.facturado?.neto ?? 0,
      },
      {
        key: 'total', header: 'Total con IVA', alinear: 'right', ocultarHasta: 'lg',
        render: ({ t }) => <span className="whitespace-nowrap tabular-nums text-muted">{formatearMoneda(t.facturado?.total ?? 0)}</span>,
        ordenar: ({ t }) => t.facturado?.total ?? 0,
      },
      {
        key: 'promedio', header: '$ promedio', alinear: 'right', ocultarHasta: 'lg',
        render: f => <span className="tabular-nums text-muted">{f.precioPromTexto ?? '—'}</span>,
        ordenar: ({ t }) => t.facturado?.promUnidad ?? 0,
      },
      {
        key: 'ultimo', header: 'Último precio', alinear: 'right', ocultarHasta: '2xl',
        render: ({ t }) => {
          const u = t.facturado?.ultimo
          if (!u) return <span className="text-muted">—</span>
          return (
            <span className="whitespace-nowrap tabular-nums text-text">
              {formatearMonedaExacta(u.precio)} /{etiquetaCobraPor(u.por, t.unidades)}
              <span className="block text-xs text-muted">
                <LinkEntidad entidad={{ tipo: 'factura', id: u.facturaId }} variante="texto" title="Ver la factura">{formatearFecha(u.fecha)}</LinkEntidad>
              </span>
            </span>
          )
        },
        ordenar: ({ t }) => t.facturado?.ultimo?.fecha ?? '',
      },
    ] satisfies Columna<FilaReporteInsumo>[] : [
      {
        key: 'stock', header: 'Stock al final', alinear: 'right', ocultarHasta: 'md',
        render: ({ t }) => <span className="whitespace-nowrap tabular-nums text-muted">{conUnidad(t.puente.fin, t.unidades.unidad)}</span>,
        ordenar: ({ t }) => t.puente.fin,
      },
    ] satisfies Columna<FilaReporteInsumo>[]),
  ]

  return (
    <div className="space-y-4">
      {!esAdmin && (
        <p className="flex items-center gap-2 text-sm text-muted"><Lock size={14} /> Lo facturado y los precios los ve un administrador.</p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={texto} onChange={setTexto} placeholder="Buscar insumo" className="w-full sm:w-64" />
          <ClearFiltersButton visible={hayFiltros} onClick={() => { setTexto(''); setCategoria(TODAS) }} />
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={cargando || filtradas.length === 0}
          className="presionable inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50"
        >
          <Download size={15} /> Exportar CSV
        </button>
      </div>
      {categorias.length > 1 && (
        <ChipGroup
          opciones={[{ value: TODAS, label: 'Todas' }, ...categorias.map(c => ({ value: c, label: c }))]}
          value={categoria}
          onChange={setCategoria}
        />
      )}

      {cargando ? (
        <SkeletonTabla filas={6} columnas={esAdmin ? 5 : 3} />
      ) : datos?.error ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState icono={ShoppingBasket} titulo="No se pudo cargar el reporte" descripcion={datos.error} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {todas.length === 0
            ? <EmptyState icono={ShoppingBasket} titulo="Sin compras de insumos en el período" descripcion="Probá con otro período." />
            : <EmptyState icono={ShoppingBasket} titulo="Ningún insumo coincide con los filtros" accion={<ClearFiltersButton visible onClick={() => { setTexto(''); setCategoria(TODAS) }} />} />}
        </div>
      ) : (
        <>
          {esAdmin && top.length >= 2 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Top {top.length} por pesos facturados (neto)</p>
              <ResponsiveContainer width="100%" height={Math.max(200, top.length * 34 + 40)}>
                <BarChart data={top} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={pesosCortos} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fill: 'var(--color-text)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipTop />} cursor={{ fill: 'var(--color-surface2)' }} />
                  <Bar dataKey="neto" name="Neto" fill="var(--color-accent-fg)" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <DataTable filas={filtradas} columnas={columnas} filaKey={f => f.t.itemId} />
          <p className="text-sm text-muted tabular-nums">
            {totales.insumos === 1 ? '1 insumo' : `${totales.insumos} insumos`}
            {esAdmin && <> · Neto {formatearMoneda(totales.neto)} · Total con IVA {formatearMoneda(totales.total)}</>}
          </p>
        </>
      )}
    </div>
  )
}
