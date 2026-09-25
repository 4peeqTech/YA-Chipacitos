'use client'

import { useMemo, useState } from 'react'
import { Package } from 'lucide-react'
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
import { formatearRelativo } from '@/lib/formato'
import { conUnidad } from '../pedidos/modelo'
import StockFicha from './StockFicha'

export interface InsumoStock {
  id: string
  nombre: string
  unidad: string | null
  stock_minimo: number
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

export default function StockClient({
  items,
  stock,
  insumoInicial,
}: {
  items: InsumoStock[]
  stock: StockActual[]
  insumoInicial?: string
}) {
  const confirmar = useConfirmar()
  const [busqueda, setBusqueda] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [abiertoId, setAbiertoId] = useState<string | null>(insumoInicial ?? null)
  const [conCambios, setConCambios] = useState(false)

  // Todo sale de las props: las acciones llaman a refresh().
  const filas = useMemo<FilaStock[]>(() => {
    const porItem = new Map(stock.map(s => [s.item_id, s]))
    return items.map(item => {
      const s = porItem.get(item.id)
      const cantidad = s?.cantidad ?? 0
      return {
        item,
        cantidad,
        bajo: cantidad < item.stock_minimo,
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
    { key: 'insumo', header: 'Insumo', render: f => <span className="font-medium">{f.item.nombre}</span>, ordenar: f => f.item.nombre },
    {
      key: 'stock',
      header: 'Stock',
      alinear: 'right',
      render: f => (
        <span className={`tabular-nums font-semibold ${f.bajo ? 'text-brand-red' : 'text-text'}`}>
          {conUnidad(f.cantidad, f.item.unidad)}
        </span>
      ),
      ordenar: f => f.cantidad,
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
        descripcion="Cuánto hay de cada insumo. Los remitos lo suman solos; si no coincide con lo que hay en el depósito, tocá el insumo y ajustalo con un motivo."
        acciones={<AyudaLink seccion="compras-stock" />}
      />

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
