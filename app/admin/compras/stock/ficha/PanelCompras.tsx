'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClipboardList, Lock, Pencil, ReceiptText, Scale, Star, Tag, Truck, Wallet } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChipGroup } from '@/components/ui/Chip'
import HelpTooltip from '@/components/ui/HelpTooltip'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePuedeEntrar } from '@/components/ui/AccesoModulos'
import Link from 'next/link'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearMoneda, formatearMonedaExacta } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import { calcularRangoUltimos, type RangoFechas } from '@/lib/compras/rangoFechas'
import { rutaEditarInsumo } from '@/lib/compras/rutas'
import {
  aLineaDocumento, aTrazabilidad, modoPrecioInicial,
  type LineaDocumento, type ModoPrecio, type Trazabilidad,
} from '@/lib/compras/trazabilidad'
import { convertirPrecio, cortoBase, esCobraPor, etiquetaCobraPor, numeroCorto, tieneConversion, type UnidadesInsumo } from '@/lib/compras/unidades'
import type { Database } from '@/lib/database.types'
import { conUnidad } from '../../pedidos/modelo'
import {
  LIMITE_DOCUMENTOS, consultarProveedoresDe, consultarPuntosPrecio, consultarTrazabilidad, consultarUltimosDocumentos,
  type ProveedorDeInsumo,
} from './datos'
import GraficoPrecio from './GraficoPrecio'
import PuenteStock from './PuenteStock'

type Periodo = '30d' | '3m' | '12m'
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '30d', label: '30 días' },
  { value: '3m', label: '3 meses' },
  { value: '12m', label: '12 meses' },
]

function rangoDe(p: Periodo, ahora: Date): RangoFechas {
  if (p === '30d') return calcularRangoUltimos(30, ahora)
  return calcularRangoUltimos(p === '3m' ? 3 : 12, ahora, 'meses')
}

function fechaCorta(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

type Cargado<T> = { clave: string; datos: T; error: string | null }

function Seccion({ titulo, icono, accion, children }: { titulo: string; icono: ReactNode; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{icono}{titulo}</h4>
        {accion}
      </div>
      {children}
    </section>
  )
}

function Tarjeta({ icono, label, valor, children }: { icono: ReactNode; label: string; valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-bg text-accent-fg sm:flex">{icono}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-2xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        <div className="text-base font-bold leading-tight text-text tabular-nums sm:text-lg">{valor}</div>
        {children && <div className="text-xs text-muted tabular-nums">{children}</div>}
      </div>
    </div>
  )
}

export default function PanelCompras({
  supabase,
  itemId,
  unidades,
  esAdmin,
  visible,
  onCerrar,
}: {
  supabase: SupabaseClient<Database>
  itemId: string
  unidades: UnidadesInsumo
  esAdmin: boolean
  /** Oculta (otra pestaña activa): el gráfico no se dibuja, los datos quedan. */
  visible: boolean
  onCerrar: () => void
}) {
  const puedeEntrar = usePuedeEntrar()
  const puedeEditar = puedeEntrar(rutaEditarInsumo(itemId))
  const [periodo, setPeriodo] = useState<Periodo>('3m')
  // El "hoy" se fija al abrir la pestaña: así el rango no cambia entre renders.
  const [ahora] = useState(() => new Date())
  const rango = useMemo(() => rangoDe(periodo, ahora), [periodo, ahora])
  const desde12 = useMemo(() => rangoDe('12m', ahora).desde, [ahora])
  const claveTraz = `${itemId}|${rango.desde}|${rango.hasta}`

  const [traz, setTraz] = useState<Cargado<Trazabilidad | null> | null>(null)
  const [fijos, setFijos] = useState<{
    remitos: Cargado<LineaDocumento[]>; facturas: Cargado<LineaDocumento[]>
    grafico: Cargado<LineaDocumento[]>; proveedores: Cargado<ProveedorDeInsumo[]>
  } | null>(null)
  const [modo, setModo] = useState<ModoPrecio | null>(null)

  // Resumen y puente: siguen al período.
  useEffect(() => {
    let vigente = true
    consultarTrazabilidad(supabase, itemId, rango.desde, rango.hasta).then(({ data, error }) => {
      if (!vigente) return
      setTraz({
        clave: claveTraz,
        datos: data?.[0] ? aTrazabilidad(data[0]) : null,
        error: error ? mensajeError(error, 'No se pudo cargar el resumen del período.') : null,
      })
    })
    return () => { vigente = false }
  }, [supabase, itemId, rango.desde, rango.hasta, claveTraz])

  // Listas, gráfico y proveedores: no dependen del período. Para un no admin no
  // se dispara ninguna consulta de facturas (E8).
  useEffect(() => {
    let vigente = true
    const vacio = Promise.resolve({ data: [] as Database['public']['Views']['v_compras_insumo_documentos']['Row'][], error: null })
    Promise.all([
      consultarUltimosDocumentos(supabase, itemId, 'remito'),
      esAdmin ? consultarUltimosDocumentos(supabase, itemId, 'factura') : vacio,
      esAdmin ? consultarPuntosPrecio(supabase, itemId, desde12) : vacio,
      consultarProveedoresDe(supabase, itemId),
    ]).then(([rem, fac, gra, prov]) => {
      if (!vigente) return
      const err = (e: unknown, m: string) => (e ? mensajeError(e, m) : null)
      setFijos({
        remitos: { clave: itemId, datos: (rem.data ?? []).map(aLineaDocumento), error: err(rem.error, 'No se pudieron cargar los remitos.') },
        facturas: { clave: itemId, datos: (fac.data ?? []).map(aLineaDocumento), error: err(fac.error, 'No se pudieron cargar las facturas.') },
        grafico: { clave: itemId, datos: (gra.data ?? []).map(aLineaDocumento), error: err(gra.error, 'No se pudo cargar el gráfico.') },
        proveedores: { clave: itemId, datos: prov.data ?? [], error: err(prov.error, 'No se pudieron cargar los proveedores.') },
      })
    })
    return () => { vigente = false }
  }, [supabase, itemId, esAdmin, desde12])

  const t = traz?.clave === claveTraz ? traz.datos : null
  const cargandoTraz = traz?.clave !== claveTraz
  const proveedores = fijos?.proveedores.datos ?? []
  const principal = proveedores.find(p => p.es_principal && p.activo) ?? null
  const cobraPorPrincipal = esCobraPor(principal?.cobra_por) ? principal.cobra_por : null
  const modoEfectivo: ModoPrecio = modo ?? modoPrecioInicial(unidades, cobraPorPrincipal)
  const conversion = tieneConversion(unidades)
  const sePesa = proveedores.some(p => p.cobra_por === 'base')
  const base = cortoBase(unidades.unidadBase)

  return (
    <div className="space-y-6">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ChipGroup opciones={PERIODOS} value={periodo} onChange={setPeriodo} />
        <p className="text-xs text-muted tabular-nums">
          Del {fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}
          <HelpTooltip text="Lo recibido cuenta por la fecha del remito, lo facturado por la fecha de la factura y el stock por cuándo se cargó cada movimiento." />
        </p>
      </div>

      {/* Resumen del período */}
      {traz?.error && traz.clave === claveTraz ? (
        <p role="alert" className="text-sm text-brand-red">{traz.error}</p>
      ) : (
        // 2×2 siempre: el modal mide como mucho 768px y 4 columnas no entran.
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {cargandoTraz || !t ? (
            Array.from({ length: esAdmin ? 4 : 3 }, (_, i) => <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />)
          ) : (
            <>
              <Tarjeta icono={<ClipboardList size={16} />} label="Pedido" valor={conUnidad(t.pedido.cantidad, unidades.unidad)}>
                {t.pedido.pedidos === 1 ? '1 pedido' : `${t.pedido.pedidos} pedidos`}
              </Tarjeta>
              <Tarjeta icono={<Truck size={16} />} label="Recibido" valor={conUnidad(t.recibido.cantidad, unidades.unidad)}>
                {[
                  conversion && t.recibido.baseReal != null ? `${numeroCorto(t.recibido.baseReal)} ${base} pesados` : null,
                  conversion && sePesa && t.recibido.sinPesar > 0 ? `${t.recibido.sinPesar} sin pesar` : null,
                  `${t.recibido.remitos} remito${t.recibido.remitos === 1 ? '' : 's'}`,
                ].filter(Boolean).join(' · ')}
              </Tarjeta>
              {t.facturado ? (
                <>
                  <Tarjeta
                    icono={<ReceiptText size={16} />}
                    label="Facturado"
                    valor={t.facturado.facturas === 0 ? <span className="text-sm font-normal text-muted">Sin facturas en el período</span>
                      : `${conUnidad(t.facturado.cantidad, unidades.unidad)}${conversion ? ` · ${numeroCorto(t.facturado.base)} ${base}` : ''}`}
                  >
                    {t.facturado.facturas > 0 && <>
                      {formatearMoneda(t.facturado.neto)} neto · {t.facturado.facturas === 1 ? '1 factura' : `${t.facturado.facturas} facturas`}
                    </>}
                  </Tarjeta>
                  <TarjetaPrecio t={t} unidades={unidades} modo={modoEfectivo} onNavegar={onCerrar} />
                </>
              ) : (
                <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-surface2 p-3 text-sm text-muted sm:p-4">
                  <Lock size={16} className="shrink-0" /> Lo facturado y los precios los ve un administrador
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Puente de stock */}
      <Seccion titulo={`Cómo se movió el stock (del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)})`} icono={<Scale size={13} />}>
        {cargandoTraz || !t
          ? <Skeleton className="h-[332px] w-full rounded-xl" />
          : <PuenteStock puente={t.puente} desde={rango.desde} hasta={rango.hasta} unidades={unidades} />}
      </Seccion>

      {/* Gráfico (admin) */}
      {esAdmin && visible && (
        !fijos ?<Skeleton className="h-[280px] w-full rounded-xl" />
          : fijos.grafico.error ? <p role="alert" className="text-sm text-brand-red">{fijos.grafico.error}</p>
            : (
              <GraficoPrecio
                lineas={fijos.grafico.datos}
                unidades={unidades}
                modo={modoEfectivo}
                onModo={setModo}
                principalId={principal?.proveedor_id ?? null}
                precioRef={principal?.precio_ref ?? null}
                cobraPorPrincipal={cobraPorPrincipal}
              />
            )
      )}

      {/* Últimas facturas y remitos */}
      <div className={`grid gap-6 ${esAdmin ? 'lg:grid-cols-2' : ''}`}>
        {esAdmin && (
          <Seccion titulo="Últimas facturas" icono={<ReceiptText size={13} />}>
            <ListaDocumentos cargado={fijos?.facturas} vacio="Todavía no hay facturas de este insumo" unidades={unidades} onNavegar={onCerrar} />
          </Seccion>
        )}
        <Seccion titulo="Últimos remitos" icono={<Truck size={13} />}>
          <ListaDocumentos cargado={fijos?.remitos} vacio="Todavía no hay remitos de este insumo" unidades={unidades} onNavegar={onCerrar} />
        </Seccion>
      </div>

      {/* Proveedores */}
      <Seccion
        titulo="Proveedores"
        icono={<Tag size={13} />}
        accion={puedeEditar && (
          <Link href={rutaEditarInsumo(itemId)} onClick={onCerrar}
            className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80">
            <Pencil size={13} /> Editar en Insumos
          </Link>
        )}
      >
        {!fijos ? <Skeleton className="h-16 w-full rounded-xl" />
          : fijos.proveedores.error ? <p role="alert" className="text-sm text-brand-red">{fijos.proveedores.error}</p>
            : proveedores.length === 0 ? <p className="text-sm text-muted">Este insumo no tiene proveedores asociados.</p>
              : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {[...proveedores.filter(p => p.activo), ...proveedores.filter(p => !p.activo)].map(p => (
                    <FilaProveedor key={p.proveedor_id} p={p} unidades={unidades} esAdmin={esAdmin} onNavegar={onCerrar} />
                  ))}
                </ul>
              )}
      </Seccion>
    </div>
  )
}

function TarjetaPrecio({ t, unidades, modo, onNavegar }: { t: Trazabilidad; unidades: UnidadesInsumo; modo: ModoPrecio; onNavegar: () => void }) {
  const f = t.facturado
  if (!f) return null
  const principal = modo === 'base' ? f.promBase : f.promUnidad
  const otroModo: ModoPrecio = modo === 'base' ? 'unidad' : 'base'
  const otro = modo === 'base' ? f.promUnidad : f.promBase
  const u = f.ultimo
  // El último precio se muestra en el modo del gráfico (E5: se convierte si hace falta).
  const ultimo = u ? convertirPrecio(u.precio, u.por, modo, unidades.contenido) : null
  return (
    <Tarjeta
      icono={<Wallet size={16} />}
      label="Precio promedio"
      valor={principal == null
        ? <span className="text-sm font-normal text-muted">Sin facturas en el período</span>
        : `${formatearMonedaExacta(principal)} /${etiquetaCobraPor(modo, unidades)}`}
    >
      {tieneConversion(unidades) && otro != null && <span className="block">{formatearMonedaExacta(otro)} /{etiquetaCobraPor(otroModo, unidades)}</span>}
      {u && ultimo != null && (
        <span className="block">
          último {formatearMonedaExacta(ultimo)}/{etiquetaCobraPor(modo, unidades)}
          {u.proveedor && <> · {u.proveedor}</>} ·{' '}
          <LinkEntidad entidad={{ tipo: 'factura', id: u.facturaId }} variante="texto" onNavegar={onNavegar} title="Ver la factura">
            {fechaCorta(u.fecha)}
          </LinkEntidad>
        </span>
      )}
    </Tarjeta>
  )
}

function ListaDocumentos({
  cargado,
  vacio,
  unidades,
  onNavegar,
}: {
  cargado: Cargado<LineaDocumento[]> | undefined
  vacio: string
  unidades: UnidadesInsumo
  onNavegar: () => void
}) {
  if (!cargado) return <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
  if (cargado.error) return <p role="alert" className="text-sm text-brand-red">{cargado.error}</p>
  if (cargado.datos.length === 0) return <p className="text-sm text-muted">{vacio}.</p>
  const base = cortoBase(unidades.unidadBase)
  const conversion = tieneConversion(unidades)
  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {cargado.datos.map(l => {
          const nc = l.tipoComprobante === 'nota_credito'
          const precio = l.precioUnitario != null && l.precioPor
            ? `${formatearMonedaExacta(l.precioUnitario)}/${etiquetaCobraPor(l.precioPor, unidades)}` : null
          return (
            <li key={l.lineaId} className="space-y-0.5 px-3 py-2 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted tabular-nums">{l.fecha ? formatearFecha(l.fecha) : '—'}</span>
                <LinkEntidad entidad={{ tipo: l.tipo, id: l.documentoId }} onNavegar={onNavegar} className="text-text"
                  title={l.tipo === 'factura' ? 'Ver la factura' : 'Ver el remito'}>
                  {l.codigo}
                </LinkEntidad>
                {l.tipo === 'remito' && l.pedidoId && l.pedidoNumero != null && (
                  <LinkEntidad entidad={{ tipo: 'pedido', id: l.pedidoId }} onNavegar={onNavegar} className="text-muted" title="Ver el pedido">
                    {codigoPedido(l.pedidoNumero)}
                  </LinkEntidad>
                )}
                {l.proveedor && <span className="min-w-0 truncate text-muted">{l.proveedor}</span>}
                {l.origen === 'factura' && <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-medium text-muted">desde factura</span>}
                {nc && <span className="rounded-full bg-info-bg px-2 py-0.5 text-2xs font-medium text-info">Nota de crédito</span>}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {[
                  conUnidad(l.cantidad, unidades.unidad),
                  conversion && l.cantidadBase != null ? `${numeroCorto(l.cantidadBase)} ${base}` : null,
                  precio,
                  l.subtotal != null ? formatearMonedaExacta(nc ? -l.subtotal : l.subtotal) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </li>
          )
        })}
      </ul>
      {cargado.datos.length >= LIMITE_DOCUMENTOS && <p className="text-right text-xs text-muted">Últimos {LIMITE_DOCUMENTOS}</p>}
    </div>
  )
}

function FilaProveedor({ p, unidades, esAdmin, onNavegar }: { p: ProveedorDeInsumo; unidades: UnidadesInsumo; esAdmin: boolean; onNavegar: () => void }) {
  const cobra = esCobraPor(p.cobra_por) ? p.cobra_por : 'unidad'
  const ultimoPor = esCobraPor(p.ultimo_precio_por) ? p.ultimo_precio_por : 'unidad'
  const nombre = p.proveedores?.nombre ?? 'Proveedor'
  return (
    <li className={`flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${p.activo ? '' : 'text-muted'}`}>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        {p.es_principal && p.activo && <Star size={13} fill="currentColor" className="text-accent-fg" aria-label="Principal" />}
        {p.proveedor_id
          ? <LinkEntidad entidad={{ tipo: 'proveedor', id: p.proveedor_id, pestana: 'insumos' }} variante="texto" onNavegar={onNavegar}
              className={`font-medium ${p.activo ? 'text-text' : 'text-muted'}`} title="Ver el proveedor">{nombre}</LinkEntidad>
          : <span className="font-medium">{nombre}</span>}
        {!p.activo && <span className="text-xs">(anterior)</span>}
        <span className="text-xs text-muted">cobra por {etiquetaCobraPor(cobra, unidades)}</span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums sm:justify-end sm:text-right">
        <span className="whitespace-nowrap text-muted">
          Ref. {p.precio_ref != null ? `${formatearMonedaExacta(p.precio_ref)} /${etiquetaCobraPor(cobra, unidades)}` : '—'}
        </span>
        {esAdmin && (
          p.ultimo_precio != null ? (
            <span className="whitespace-nowrap text-text">
              Últ. {formatearMonedaExacta(p.ultimo_precio)} /{etiquetaCobraPor(ultimoPor, unidades)}
              {p.ultima_factura_id && p.ultima_factura_fecha && (
                <span className="text-xs text-muted">
                  {' · '}
                  <LinkEntidad entidad={{ tipo: 'factura', id: p.ultima_factura_id }} variante="texto" onNavegar={onNavegar} title="Ver la factura">
                    {fechaCorta(p.ultima_factura_fecha)}
                  </LinkEntidad>
                </span>
              )}
            </span>
          ) : <span className="text-muted">—</span>
        )}
      </span>
    </li>
  )
}
