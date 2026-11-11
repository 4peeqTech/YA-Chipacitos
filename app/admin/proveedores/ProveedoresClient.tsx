'use client'

import { useMemo, useState } from 'react'
import { Truck, Plus, MessageCircle } from 'lucide-react'
import { normalizarTelefonoAR, formatearTelefono } from '@/lib/compras/telefono'
import type { PestanaProveedor } from '@/lib/compras/rutas'
import PageHeader from '@/components/ui/PageHeader'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { Chip, SegmentedControl } from '@/components/ui/Chip'
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import type { ProveedorFila } from './datos'
import ProveedorForm from './ProveedorForm'
import ProveedorFicha from './ProveedorFicha'

export interface LocalFacturacion {
  id: string
  nombre: string
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

export default function ProveedoresClient({
  proveedores,
  insumosPorProveedor,
  abiertosPorProveedor,
  localesFacturacion,
  esAdmin,
  proveedorInicial,
  pestanaInicial,
  diasDemora,
}: {
  proveedores: ProveedorFila[]
  /** Pares activos por proveedor. */
  insumosPorProveedor: Record<string, number>
  /** Pedidos abiertos por proveedor (pedidoAbierto). */
  abiertosPorProveedor: Record<string, number>
  localesFacturacion: LocalFacturacion[]
  /** La Cuenta, las facturas y el último precio son de admin (E17). */
  esAdmin: boolean
  /** B5: compras_config 'pedidos.dias_demora'. */
  diasDemora?: number
  /** ?proveedor=<id>: abre su ficha. */
  proveedorInicial?: string
  /** ?pestana=: con qué pestaña abre la ficha. */
  pestanaInicial?: PestanaProveedor
}) {
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [soloSinInsumos, setSoloSinInsumos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // Se guarda el id, no la fila: después de cada acción refresh() trae los datos nuevos.
  const [fichaId, setFichaId] = useState<string | null>(() =>
    proveedores.some(p => p.id === proveedorInicial) ? proveedorInicial ?? null : null)
  const [fichaPestana, setFichaPestana] = useState<PestanaProveedor | undefined>(pestanaInicial)
  // form: null = cerrado; { id: null } = alta.
  const [form, setForm] = useState<{ id: string | null } | null>(null)
  // Cambia en cada apertura: la ficha y el form arrancan de cero aunque sea el mismo proveedor.
  const [aperturas, setAperturas] = useState(0)

  const quitarParams = useQuitarParams('proveedor', 'pestana')
  useAlCambiarParam(proveedorInicial, id => {
    if (proveedores.some(p => p.id === id)) abrirFicha(id, pestanaInicial)
  })

  const ficha = fichaId ? proveedores.find(p => p.id === fichaId) ?? null : null
  const enForm = form?.id ? proveedores.find(p => p.id === form.id) ?? null : null

  const activos = proveedores.filter(p => p.estado === 'activo').length
  const archivados = proveedores.length - activos

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return proveedores.filter(p =>
      (filtro === 'todos' || p.estado === filtro) &&
      (!q || p.nombre.toLowerCase().includes(q)) &&
      (!soloSinInsumos || !insumosPorProveedor[p.id]))
  }, [proveedores, filtro, busqueda, soloSinInsumos, insumosPorProveedor])

  const hayFiltros = !!busqueda || filtro !== 'activo' || soloSinInsumos
  function limpiarFiltros() { setBusqueda(''); setFiltro('activo'); setSoloSinInsumos(false) }

  function abrirFicha(id: string, pestana?: PestanaProveedor) {
    setFichaId(id)
    setFichaPestana(pestana)
    setAperturas(n => n + 1)
  }

  function cerrarFicha() {
    quitarParams()
    setFichaId(null)
  }

  function abrirForm(id: string | null) {
    setForm({ id })
    setAperturas(n => n + 1)
  }

  const columnas: Columna<ProveedorFila>[] = [
    {
      key: 'nombre',
      header: 'Proveedor',
      className: 'min-w-44',
      ordenar: p => p.nombre.toLowerCase(),
      render: p => (
        <div className="min-w-0">
          <span className="font-medium text-text">{p.nombre}</span>
          {p.categoria && <span className="mt-0.5 block text-xs text-muted md:hidden">{p.categoria}</span>}
        </div>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoría',
      ocultarHasta: 'md',
      ordenar: p => (p.categoria ?? '').toLowerCase(),
      render: p => <span className="text-muted">{p.categoria || '—'}</span>,
    },
    {
      key: 'insumos',
      header: 'Insumos',
      alinear: 'right',
      ocultarHasta: 'lg',
      ordenar: p => insumosPorProveedor[p.id] ?? 0,
      render: p => <span className="tabular-nums text-muted">{insumosPorProveedor[p.id] || '—'}</span>,
    },
    {
      key: 'abiertos',
      header: <span className="whitespace-nowrap">Pedidos abiertos</span>,
      alinear: 'right',
      ordenar: p => abiertosPorProveedor[p.id] ?? 0,
      render: p => {
        const n = abiertosPorProveedor[p.id] ?? 0
        return <span className={`tabular-nums ${n > 0 ? 'font-semibold text-warning' : 'text-muted'}`}>{n || '—'}</span>
      },
    },
    {
      key: 'estado',
      header: 'Estado',
      ocultarHasta: 'sm',
      ordenar: p => p.estado,
      render: p => <EstadoBadge dominio="proveedores" estado={p.estado === 'archivado' ? 'archivado' : 'activo'} />,
    },
    {
      key: 'whatsapp',
      header: <span className="sr-only">WhatsApp</span>,
      alinear: 'right',
      render: p => {
        const tel = normalizarTelefonoAR(p.contacto_telefono)
        if (!tel) return null
        return (
          <a
            href={`https://wa.me/${tel}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            title={`WhatsApp: ${formatearTelefono(p.contacto_telefono)}`}
            aria-label={`WhatsApp a ${p.nombre}`}
            className="-my-2 ml-auto flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-success sm:size-9"
          >
            <MessageCircle size={16} />
          </a>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={Truck}
        titulo="Proveedores"
        descripcion={`${activos} activo${activos === 1 ? '' : 's'} · ${archivados} archivado${archivados === 1 ? '' : 's'}`}
        acciones={
          <button
            onClick={() => abrirForm(null)}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 sm:min-h-9"
          >
            <Plus size={16} /> Nuevo proveedor
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar proveedor..." className="w-full sm:w-64" />
        <SegmentedControl<FiltroEstado>
          opciones={[
            { value: 'activo', label: 'Activos' },
            { value: 'archivado', label: 'Archivados' },
            { value: 'todos', label: 'Todos' },
          ]}
          value={filtro}
          onChange={setFiltro}
        />
        <Chip active={soloSinInsumos} onClick={() => setSoloSinInsumos(v => !v)}>Sin insumos asociados</Chip>
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      <DataTable
        filas={filtrados}
        columnas={columnas}
        filaKey={p => p.id}
        onFilaClick={p => abrirFicha(p.id)}
        filaClassName={p => (p.estado === 'archivado' ? 'opacity-60' : '')}
        vacio={proveedores.length === 0
          ? (
            <EmptyState
              icono={Truck}
              titulo="Todavía no hay proveedores"
              descripcion="Cargá el primero para poder hacerle pedidos y registrar sus facturas."
              accion={
                <button onClick={() => abrirForm(null)} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 sm:min-h-9">
                  <Plus size={16} /> Nuevo proveedor
                </button>
              }
            />
          )
          : (
            <EmptyState
              icono={Truck}
              titulo="Ningún proveedor coincide con los filtros"
              accion={<ClearFiltersButton visible onClick={limpiarFiltros} />}
            />
          )}
      />

      {ficha && (
        <ProveedorFicha
          key={`${ficha.id}-${aperturas}`}
          proveedor={ficha}
          pestanaInicial={fichaPestana}
          insumosActivos={insumosPorProveedor[ficha.id] ?? 0}
          pedidosAbiertos={abiertosPorProveedor[ficha.id] ?? 0}
          localesFacturacion={localesFacturacion}
          esAdmin={esAdmin}
          diasDemora={diasDemora}
          onEditar={() => abrirForm(ficha.id)}
          onEliminado={cerrarFicha}
          onClose={cerrarFicha}
        />
      )}

      {form && (
        <ProveedorForm
          key={`${form.id ?? 'nuevo'}-${aperturas}`}
          proveedor={enForm}
          localesFacturacion={localesFacturacion}
          onClose={() => setForm(null)}
          onCreado={id => { setForm(null); abrirFicha(id) }}
        />
      )}
    </div>
  )
}
