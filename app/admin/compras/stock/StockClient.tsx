'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, Package } from 'lucide-react'
import HelpTooltip from '@/components/ui/HelpTooltip'
import LinkEntidad from '@/components/ui/LinkEntidad'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { Chip } from '@/components/ui/Chip'
import { useConfirmar } from '@/components/ui/ProveedorUI'
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import { formatearRelativo } from '@/lib/formato'
import { conUnidad } from '../pedidos/modelo'
import { textoBaseItem } from '@/lib/compras/unidades'
import StockFicha from './StockFicha'

export interface InsumoStock {
  id: string
  nombre: string
  unidad: string | null
  stock_minimo: number
  /** A2a: los archivados se listan solo si tienen stock ≠ 0; la ficha abre igual por ?insumo=. */
  estado: string
  /** A2b: para mostrar la equivalencia (≈ 56,1 kg). El stock sigue en `unidad`. */
  unidad_base: string
  cantidad_por_unidad: number
}

export interface StockActual {
  item_id: string | null
  cantidad: number | null
  actualizado_en: string | null
  actualizado_por_nombre: string | null
}

export interface FilaStock {
  item: InsumoStock
  cantidad: number
  bajo: boolean
  actualizadoEn: string | null
  actualizadoPor: string | null
}

/** Conteo cerrado con diferencias pendientes (A1), para el banner. */
export interface ConteoConDiferencias {
  conteoId: string
  /** "Global 06/10" */
  etiqueta: string
  pendientes: number
}

export default function StockClient({
  items,
  stock,
  insumoInicial,
  conteosConDiferencias,
}: {
  items: InsumoStock[]
  stock: StockActual[]
  insumoInicial?: string
  conteosConDiferencias: ConteoConDiferencias[]
}) {
  const totalDiferencias = conteosConDiferencias.reduce((s, c) => s + c.pendientes, 0)
  const confirmar = useConfirmar()
  const [busqueda, setBusqueda] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [abiertoId, setAbiertoId] = useState<string | null>(insumoInicial ?? null)
  const [conCambios, setConCambios] = useState(false)
  const quitarParam = useQuitarParams('insumo')
  useAlCambiarParam(insumoInicial, id => abrir(id))

  // Todo sale de las props: las acciones llaman a refresh().
  const filas = useMemo<FilaStock[]>(() => {
    const porItem = new Map(stock.map(s => [s.item_id, s]))
    return items.map(item => {
      const s = porItem.get(item.id)
      const cantidad = s?.cantidad ?? 0
      return {
        item,
        cantidad,
        bajo: item.estado === 'activo' && cantidad < item.stock_minimo,
        actualizadoEn: s?.actualizado_en ?? null,
        actualizadoPor: s?.actualizado_por_nombre ?? null,
      }
    })
  }, [items, stock])

  const cantidadBajo = filas.filter(f => f.bajo).length
  const hayFiltros = !!busqueda || soloBajo
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return filas
      .filter(f => f.item.estado === 'activo' || f.cantidad !== 0)
      .filter(f => !texto || f.item.nombre.toLowerCase().includes(texto))
      .filter(f => !soloBajo || f.bajo)
  }, [filas, busqueda, soloBajo])

  function limpiarFiltros() { setBusqueda(''); setSoloBajo(false) }

  const abierta = abiertoId ? filas.find(f => f.item.id === abiertoId) ?? null : null

  function abrir(id: string) {
    setAbiertoId(id)
    setConCambios(false)
  }

  function cerrarYa() {
    quitarParam()
    setAbiertoId(null)
    setConCambios(false)
  }

  function cerrar() {
    if (!conCambios) { cerrarYa(); return }
    confirmar({
      titulo: 'Descartar cambios',
      mensaje: 'Empezaste a cargar un ajuste sin guardarlo. ¿Descartarlo?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir',
      peligroso: true,
      onConfirmar: cerrarYa,
    })
  }

  const columnas: Columna<FilaStock>[] = [
    {
      key: 'insumo',
      header: 'Insumo',
      render: f => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{f.item.nombre}</span>
          {f.item.estado === 'archivado' && (
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">Archivado</span>
          )}
        </span>
      ),
      ordenar: f => f.item.nombre,
    },
    {
      key: 'stock',
      header: 'Stock',
      alinear: 'right',
      render: f => (
        <span className="flex flex-col items-end">
          <span className={`tabular-nums font-semibold ${f.bajo ? 'text-brand-red' : 'text-text'}`}>
            {conUnidad(f.cantidad, null)}
          </span>
          {textoBaseItem(f.cantidad, f.item) && (
            <span className="whitespace-nowrap text-2xs text-muted tabular-nums">{textoBaseItem(f.cantidad, f.item)}</span>
          )}
        </span>
      ),
      ordenar: f => f.cantidad,
    },
    {
      key: 'unidad',
      header: 'Unidad',
      render: f => f.item.unidad ? <span className="text-muted">{f.item.unidad}</span> : <span className="text-warning">Sin unidad</span>,
      ordenar: f => f.item.unidad ?? '',
    },
    {
      key: 'minimo',
      header: 'Mínimo',
      alinear: 'right',
      ocultarHasta: 'sm',
      render: f => <span className="tabular-nums text-muted">{conUnidad(f.item.stock_minimo, null)}</span>,
      ordenar: f => f.item.stock_minimo,
    },
    {
      key: 'estado',
      header: 'Estado',
      ocultarHasta: 'sm',
      render: f => <EstadoBadge dominio="compras_stock" estado={f.bajo ? 'bajo' : 'ok'} />,
      ordenar: f => (f.bajo ? 0 : 1),
    },
    {
      key: 'actualizado',
      header: 'Último movimiento',
      ocultarHasta: 'md',
      render: f => f.actualizadoEn
        ? <span className="text-muted">{formatearRelativo(f.actualizadoEn)}{f.actualizadoPor && <> · {f.actualizadoPor}</>}</span>
        : <span className="text-muted">Sin movimientos</span>,
      ordenar: f => f.actualizadoEn ?? '',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Package}
        titulo="Stock"
        descripcion="Cuánto hay de cada insumo. Lo mueven los remitos, las facturas y los ajustes. El conteo de fábrica no lo pisa: lo controla. Si hay diferencias, se aplican desde Fábrica › Conteos."
        acciones={
          <>
            <HelpTooltip text="Antes el conteo reemplazaba el stock y tapaba los errores de carga. Ahora queda la diferencia a la vista y vos decidís." />
            <AyudaLink seccion="compras-stock" />
          </>
        }
      />

      {totalDiferencias > 0 && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning bg-warning-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-text">
            <ClipboardCheck size={18} className="shrink-0 text-warning" />
            <span>
              Hay <strong>{totalDiferencias} diferencia{totalDiferencias === 1 ? '' : 's'} de conteo</strong> sin aplicar.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {conteosConDiferencias.map(c => (
              <LinkEntidad
                key={c.conteoId}
                entidad={{ tipo: 'conteo', id: c.conteoId }}
                variante="chip"
                className="min-h-11 sm:min-h-9 px-3 text-xs font-semibold text-text"
              >
                <ClipboardCheck size={13} /> {c.etiqueta} · {c.pendientes}
              </LinkEntidad>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar insumo" className="w-full sm:w-72" />
        <Chip active={soloBajo} onClick={() => setSoloBajo(v => !v)}>
          Bajo el mínimo ({cantidadBajo})
        </Chip>
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      {filtradas.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {items.length === 0 ? (
            <EmptyState icono={Package} titulo="No hay insumos activos" descripcion="Cargalos primero en Insumos." />
          ) : (
            <EmptyState icono={Package} titulo="Ningún insumo coincide con los filtros" accion={<ClearFiltersButton visible onClick={limpiarFiltros} />} />
          )}
        </div>
      ) : (
        <DataTable filas={filtradas} columnas={columnas} filaKey={f => f.item.id} onFilaClick={f => abrir(f.item.id)} />
      )}

      <Modal open={abierta != null} onClose={cerrar} title={abierta?.item.nombre ?? 'Insumo'} size="lg" pantallaCompletaMobile>
        {abierta && (
          <StockFicha
            key={abierta.item.id}
            fila={abierta}
            onCambios={setConCambios}
            onCerrar={cerrarYa}
          />
        )}
      </Modal>
    </div>
  )
}
