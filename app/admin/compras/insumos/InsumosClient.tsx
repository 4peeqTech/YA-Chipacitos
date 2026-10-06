'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, TriangleAlert } from 'lucide-react'
import { esPorMasaSinReceta, type ModoCalculo, type Redondeo } from '@/lib/fabrica/calculoSugerido'
import { REDONDEO_LABEL } from '@/lib/estados'
import { formatearFecha, formatearMoneda, formatearNumero } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import { etiquetaCobraPor, textoBase, type CobraPor, type UnidadBase, type UnidadesInsumo } from '@/lib/compras/unidades'
import PageHeader from '@/components/ui/PageHeader'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { Chip, SegmentedControl } from '@/components/ui/Chip'
import HelpTooltip from '@/components/ui/HelpTooltip'
import LinkEntidad from '@/components/ui/LinkEntidad'
import InsumoModal from './InsumoModal'

export interface ProveedorOption {
  id: string
  nombre: string
  /** false = archivado: sirve para mostrar el nombre de un par viejo, no se ofrece. */
  activo: boolean
}

export interface CategoriaOption {
  id: string
  nombre: string
}

export interface ItemProveedor {
  proveedor_id: string
  es_principal: boolean
  /** false = "Proveedores anteriores": quedó desactivado porque tenía historia (E4). */
  activo: boolean
  precio_ref: number | null
  codigo_proveedor: string | null
  created_at: string | null
  /** A2b: 'unidad' = precio_ref por unidad de compra; 'base' = por kg (o la unidad base). */
  cobra_por: CobraPor
}

export interface CompraItem {
  id: string
  categoria_id: string | null
  nombre: string
  unidad: string | null
  stock_minimo: number
  cantidad_por_unidad: number
  cantidad_por_masa: number
  redondeo: Redondeo
  /** Tope opcional de los insumos a demanda (unidades de compra): si el conteo lo supera, avisa sobrestock. */
  stock_maximo: number | null
  /** "Se pide a demanda": no avisa sobrestock salvo que tenga stock_maximo (decisión X2). */
  a_demanda: boolean
  /** IVA con el que suele venir en la factura del proveedor. Se copia a la línea y ahí se puede cambiar (F3). */
  alicuota_iva: number
  estado: 'activo' | 'archivado'
  /** A2b: kg | unidades | litros. cantidad_por_unidad es cuánta unidad base trae 1 unidad de compra. */
  unidad_base: UnidadBase
  /** A2b: con qué arranca un proveedor nuevo del insumo. */
  cobra_por_default: CobraPor
  compras_item_proveedores: ItemProveedor[]
}

export function unidadesDe(i: Pick<CompraItem, 'unidad' | 'unidad_base' | 'cantidad_por_unidad'>): UnidadesInsumo {
  return { unidad: i.unidad, unidadBase: i.unidad_base, contenido: i.cantidad_por_unidad }
}

export interface PedidoAbierto {
  pedido_id: string
  numero: number | null
  pendiente: number
  enviado_en: string | null
}

/** Una fila de v_compras_insumos_resumen. El último precio facturado es null si no es admin (E10). */
export interface ResumenInsumo {
  stock: number
  precioRefPrincipal: number | null
  ultimoPrecio: number | null
  ultimoPrecioUnidad: string | null
  ultimoPrecioFecha: string | null
  ultimoPrecioFacturaId: string | null
  ultimoPrecioProveedorId: string | null
  pedidosAbiertos: PedidoAbierto[]
  puedeEliminar: boolean
  /** A2b: cómo cobra el proveedor principal (unidad del precio de referencia). */
  cobraPorPrincipal: CobraPor | null
  /** A2b: la unidad del último precio facturado (solo admin). */
  ultimoPrecioPor: CobraPor | null
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const RESUMEN_VACIO: ResumenInsumo = {
  stock: 0, precioRefPrincipal: null, ultimoPrecio: null, ultimoPrecioUnidad: null, ultimoPrecioFecha: null,
  ultimoPrecioFacturaId: null, ultimoPrecioProveedorId: null, pedidosAbiertos: [], puedeEliminar: false,
  cobraPorPrincipal: null, ultimoPrecioPor: null,
}

const mismaUnidad = (a: string | null, b: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

export default function InsumosClient({
  items,
  proveedores,
  categorias,
  conteosPorItem,
  modosPorItem,
  resumenPorItem,
  enPedidoBase,
  esAdmin,
}: {
  items: CompraItem[]
  proveedores: ProveedorOption[]
  categorias: CategoriaOption[]
  conteosPorItem: Record<string, string[]>
  modosPorItem: Record<string, ModoCalculo[]>
  resumenPorItem: Record<string, ResumenInsumo>
  enPedidoBase: string[]
  esAdmin: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [soloADemanda, setSoloADemanda] = useState(false)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | 'todas'>('todas')
  const [busqueda, setBusqueda] = useState('')
  // Se guarda el id, no la fila: después de cada acción refresh() trae los datos nuevos.
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  // Cambia en cada apertura: el form arranca de cero aunque sea el mismo insumo.
  const [aperturas, setAperturas] = useState(0)

  const abierto = abiertoId ? items.find(i => i.id === abiertoId) ?? null : null
  const resumen = (id: string) => resumenPorItem[id] ?? RESUMEN_VACIO

  const nombreProveedor = (id: string | null) => proveedores.find(p => p.id === id)?.nombre ?? '—'
  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre ?? '—'

  // Por masa sin receta y sin la marca de a demanda: el conteo no puede
  // calcular su sobrestock (mismo criterio que cerrar_conteo_fabrica).
  const sinReceta = items.filter(i =>
    i.estado === 'activo' && !i.a_demanda &&
    (modosPorItem[i.id] ?? []).some(modoCalculo => esPorMasaSinReceta({ modoCalculo, cantidadPorMasa: i.cantidad_por_masa })))

  // C5: sin unidad de compra no se puede calcular el sobrestock de los conteos.
  const sinUnidadCompra = items.filter(i =>
    i.estado === 'activo' && (conteosPorItem[i.id] ?? []).length > 0 && (!i.unidad?.trim() || !(i.cantidad_por_unidad > 0)))

  const activos = items.filter(i => i.estado === 'activo').length
  const archivados = items.length - activos

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return items
      .filter(i =>
        (filtro === 'todos' || i.estado === filtro) &&
        (categoriaFiltro === 'todas' || i.categoria_id === categoriaFiltro) &&
        (!q || i.nombre.toLowerCase().includes(q)) &&
        (!soloADemanda || i.a_demanda))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [items, filtro, categoriaFiltro, busqueda, soloADemanda])

  const hayFiltros = !!busqueda || categoriaFiltro !== 'todas' || filtro !== 'activo' || soloADemanda
  function limpiarFiltros() { setBusqueda(''); setCategoriaFiltro('todas'); setFiltro('activo'); setSoloADemanda(false) }

  function abrirCrear() {
    setAbiertoId(null)
    setCreando(true)
    setAperturas(n => n + 1)
  }

  function abrirEditar(i: CompraItem) {
    setCreando(false)
    setAbiertoId(i.id)
    setAperturas(n => n + 1)
  }

  function cerrarForm() {
    setCreando(false)
    setAbiertoId(null)
  }

  function proveedoresActivos(i: CompraItem) {
    return i.compras_item_proveedores.filter(p => p.activo)
  }

  const columnas: Columna<CompraItem>[] = [
    {
      key: 'insumo',
      header: 'Insumo',
      className: 'min-w-52',
      ordenar: i => i.nombre.toLowerCase(),
      render: i => (
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-text">{i.nombre}</span>
            {i.a_demanda && (
              <span
                title={i.stock_maximo != null ? `Se pide según se necesite. Avisa sobrestock si el conteo pasa de ${i.stock_maximo} ${i.unidad ?? ''}.` : 'Se pide según se necesite, no por proyección de masas. No avisa sobrestock.'}
                className="rounded-full border border-border px-2 py-0.5 text-2xs font-medium text-muted"
              >
                A demanda{i.stock_maximo != null && ` · tope ${formatearNumero(i.stock_maximo)}`}
              </span>
            )}
            {i.estado === 'archivado' && (
              <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">Archivado</span>
            )}
          </span>
          {i.categoria_id && <span className="mt-0.5 block text-xs text-muted xl:hidden">{nombreCategoria(i.categoria_id)}</span>}
        </div>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoría',
      ocultarHasta: 'xl',
      ordenar: i => nombreCategoria(i.categoria_id),
      render: i => <span className="text-muted">{nombreCategoria(i.categoria_id)}</span>,
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      ocultarHasta: 'md',
      ordenar: i => {
        const lista = proveedoresActivos(i)
        return nombreProveedor((lista.find(p => p.es_principal) ?? lista[0])?.proveedor_id ?? null)
      },
      render: i => {
        const lista = proveedoresActivos(i)
        if (!lista.length) return <span className="text-muted">—</span>
        const principal = lista.find(p => p.es_principal) ?? lista[0]
        return (
          <span className="text-muted">
            {nombreProveedor(principal.proveedor_id)}
            {lista.length > 1 && (
              <span className="ml-1 text-faint" title={lista.filter(p => p !== principal).map(p => nombreProveedor(p.proveedor_id)).join(', ')}>
                +{lista.length - 1}
              </span>
            )}
          </span>
        )
      },
    },
    {
      key: 'stock',
      header: 'Stock',
      alinear: 'right',
      ordenar: i => resumen(i.id).stock,
      render: i => {
        const stock = resumen(i.id).stock
        const bajo = i.estado === 'activo' && i.stock_minimo > 0 && stock < i.stock_minimo
        return (
          <div className="flex flex-col items-end gap-0.5 tabular-nums">
            <LinkEntidad entidad={{ tipo: 'insumo', id: i.id }} variante="texto" title="Ver la ficha de stock de este insumo" className="whitespace-nowrap text-text">
              {formatearNumero(stock)} {i.unidad ?? ''}
            </LinkEntidad>
            {textoBase(stock, unidadesDe(i)) && (
              <span className="whitespace-nowrap text-2xs text-muted">{textoBase(stock, unidadesDe(i))}</span>
            )}
            {bajo && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-2xs font-semibold text-warning" title={`Stock mínimo: ${formatearNumero(i.stock_minimo)} ${i.unidad ?? ''}`}>
                <TriangleAlert size={12} /> bajo mín.
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'pedido',
      header: <span className="whitespace-nowrap">Pedido abierto</span>,
      ocultarHasta: 'lg',
      ordenar: i => resumen(i.id).pedidosAbiertos.length,
      render: i => {
        const pedidos = resumen(i.id).pedidosAbiertos
        if (!pedidos.length) return <span className="text-muted">—</span>
        const [primero, ...otros] = pedidos
        return (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <LinkEntidad entidad={{ tipo: 'pedido', id: primero.pedido_id }} title="Ver el pedido" className="text-text">
              {primero.numero != null ? codigoPedido(primero.numero) : 'Pedido'}
            </LinkEntidad>
            <span className="whitespace-nowrap text-xs text-muted tabular-nums">faltan {formatearNumero(primero.pendiente)}</span>
            {otros.length > 0 && (
              <span
                className="text-xs text-faint"
                title={otros.map(p => `${p.numero != null ? codigoPedido(p.numero) : 'Pedido'}: faltan ${formatearNumero(p.pendiente)}`).join(' · ')}
              >
                +{otros.length}
              </span>
            )}
          </span>
        )
      },
    },
    {
      key: 'precioRef',
      header: (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          Precio ref.
          <HelpTooltip text="Precio de referencia del proveedor principal. Lo actualiza la factura al confirmarla, o lo cargás en el insumo." />
        </span>
      ),
      alinear: 'right',
      ocultarHasta: 'md',
      ordenar: i => resumen(i.id).precioRefPrincipal ?? -1,
      render: i => {
        const r = resumen(i.id)
        const precio = r.precioRefPrincipal
        if (precio == null) return <span className="text-muted">—</span>
        return (
          <span className="whitespace-nowrap tabular-nums text-muted">
            {formatearMoneda(precio)}
            <span className="text-faint"> /{etiquetaCobraPor(r.cobraPorPrincipal ?? 'unidad', unidadesDe(i))}</span>
          </span>
        )
      },
    },
    ...(esAdmin ? [{
      key: 'ultimaFactura',
      header: <span className="whitespace-nowrap">Última factura</span>,
      alinear: 'right' as const,
      ocultarHasta: 'lg' as const,
      ordenar: (i: CompraItem) => resumen(i.id).ultimoPrecioFecha ?? '',
      render: (i: CompraItem) => {
        const r = resumen(i.id)
        if (r.ultimoPrecio == null) return <span className="text-muted">—</span>
        // Una línea por kg dice en qué se cobró. El aviso queda para las facturas
        // viejas, cargadas en otra unidad sin decirlo (antes de A2b).
        const porBase = r.ultimoPrecioPor === 'base'
        const sufijo = porBase ? etiquetaCobraPor('base', unidadesDe(i)) : r.ultimoPrecioUnidad
        const otraUnidad = !porBase && !!r.ultimoPrecioUnidad && !mismaUnidad(r.ultimoPrecioUnidad, i.unidad)
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="whitespace-nowrap tabular-nums text-text">
              {formatearMoneda(r.ultimoPrecio)}
              {sufijo && (
                <span
                  className={otraUnidad ? 'font-semibold text-warning' : 'text-muted'}
                  title={otraUnidad ? `Facturado en ${r.ultimoPrecioUnidad}: el insumo se cuenta en ${i.unidad ?? 'otra unidad'}` : undefined}
                >
                  {' '}/ {sufijo}
                </span>
              )}
            </span>
            {r.ultimoPrecioFacturaId && r.ultimoPrecioFecha && (
              <span className="whitespace-nowrap text-xs text-muted">
                <LinkEntidad entidad={{ tipo: 'factura', id: r.ultimoPrecioFacturaId }} variante="texto" title="Ver la factura">
                  {formatearFecha(r.ultimoPrecioFecha)}
                </LinkEntidad>
                {' · '}{nombreProveedor(r.ultimoPrecioProveedorId)}
              </span>
            )}
          </div>
        )
      },
    }] : []),
    {
      key: 'masa',
      header: 'Cant./masa',
      alinear: 'right',
      ocultarHasta: '2xl',
      render: i => <span className="tabular-nums text-muted">{i.cantidad_por_masa > 0 ? formatearNumero(i.cantidad_por_masa) : '—'}</span>,
    },
    {
      key: 'minimo',
      header: (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          Stock mín.
          <HelpTooltip text="Piso general de este insumo para cualquier proveedor, sin relación con los conteos — lo usan la sugerencia de /admin/compras/pedidos y el indicador de bajo stock de /admin/compras/stock." />
        </span>
      ),
      alinear: 'right',
      ocultarHasta: '2xl',
      render: i => <span className="tabular-nums text-muted">{i.stock_minimo > 0 ? formatearNumero(i.stock_minimo) : '—'}</span>,
    },
    {
      key: 'redondeo',
      header: 'Redondeo',
      ocultarHasta: '2xl',
      render: i => <span className="block max-w-40 text-xs text-muted">{REDONDEO_LABEL[i.redondeo] ?? i.redondeo}</span>,
    },
    {
      key: 'listas',
      header: (
        <span className="inline-flex items-center gap-1">
          Listas de conteo
          <HelpTooltip text="En qué listas de conteo participa este insumo. Se gestiona desde Insumos → Listas de conteo." />
        </span>
      ),
      ocultarHasta: 'xl',
      render: i => (conteosPorItem[i.id] ?? []).length > 0 ? (
        <Link
          href="/admin/compras/insumos/listas-conteo"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          className="text-xs text-muted underline decoration-accent decoration-2 underline-offset-4 hover:text-text"
        >
          {conteosPorItem[i.id].join(', ')}
        </Link>
      ) : <span className="text-muted">—</span>,
    },
  ]

  const proveedoresAbierto = abierto?.compras_item_proveedores ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Package}
        titulo="Insumos"
        descripcion={`${activos} activo${activos === 1 ? '' : 's'} · ${archivados} archivado${archivados === 1 ? '' : 's'}`}
        acciones={
          <button
            onClick={abrirCrear}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 sm:min-h-9"
          >
            <Plus size={16} /> Nuevo insumo
          </button>
        }
      />

      {sinUnidadCompra.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm text-text">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            <span className="font-semibold">{sinUnidadCompra.length} insumo{sinUnidadCompra.length === 1 ? '' : 's'} sin unidad de compra: no se puede avisar sobrestock.</span>{' '}
            <span className="text-muted">Completá en qué se compra y cuánto trae cada una en {sinUnidadCompra.map(i => i.nombre).join(', ')}.</span>
          </span>
        </p>
      )}

      {sinReceta.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm text-text">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            <span className="font-semibold">{sinReceta.length} insumo{sinReceta.length === 1 ? '' : 's'} sin receta: no se puede calcular el sobrestock.</span>{' '}
            <span className="text-muted">Cargale la cantidad por masa, o marcalo como que se pide a demanda: {sinReceta.map(i => i.nombre).join(', ')}.</span>
          </span>
        </p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar insumo..." className="w-full sm:w-64" />
          <SegmentedControl<FiltroEstado>
            opciones={[
              { value: 'activo', label: 'Activos' },
              { value: 'archivado', label: 'Archivados' },
              { value: 'todos', label: 'Todos' },
            ]}
            value={filtro}
            onChange={setFiltro}
          />
          <Chip active={soloADemanda} onClick={() => setSoloADemanda(v => !v)}>A demanda</Chip>
          <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
        </div>
        {categorias.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip active={categoriaFiltro === 'todas'} onClick={() => setCategoriaFiltro('todas')}>Todas las categorías</Chip>
            {categorias.map(c => (
              <Chip key={c.id} active={categoriaFiltro === c.id} onClick={() => setCategoriaFiltro(c.id)}>{c.nombre}</Chip>
            ))}
          </div>
        )}
      </div>

      <DataTable
        filas={filtrados}
        columnas={columnas}
        filaKey={i => i.id}
        onFilaClick={abrirEditar}
        filaClassName={i => (i.estado === 'archivado' ? 'opacity-60' : '')}
        vacio={items.length === 0
          ? (
            <EmptyState
              icono={Package}
              titulo="Todavía no hay insumos"
              descripcion="Cargá el primero para poder pedirlo, contarlo y seguir su stock."
              accion={
                <button onClick={abrirCrear} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 sm:min-h-9">
                  <Plus size={16} /> Nuevo insumo
                </button>
              }
            />
          )
          : (
            <EmptyState
              icono={Package}
              titulo="Ningún insumo coincide con la búsqueda"
              accion={
                <button onClick={limpiarFiltros} className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-text sm:min-h-9">
                  Limpiar filtros
                </button>
              }
            />
          )}
      />

      {(creando || abierto) && (
        <InsumoModal
          key={`${abierto?.id ?? 'nuevo'}-${aperturas}`}
          item={creando ? null : abierto}
          proveedoresItem={proveedoresAbierto}
          proveedores={proveedores}
          categorias={categorias}
          resumen={abierto ? resumen(abierto.id) : RESUMEN_VACIO}
          listas={abierto ? conteosPorItem[abierto.id] ?? [] : []}
          enPedidoBase={!!abierto && enPedidoBase.includes(abierto.id)}
          onClose={cerrarForm}
        />
      )}
    </div>
  )
}
