'use client'

import { useMemo, useState, useTransition } from 'react'
import { IconBooks, IconListDetails, IconPlugConnected, IconAdjustmentsHorizontal, IconPlus, IconChecks } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Pestanas, { panelDe } from '@/components/ui/Pestanas'
import SearchInput from '@/components/ui/SearchInput'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Field'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { useToast, useConfirmar } from '@/components/ui/ProveedorUI'
import {
  TIPOS, TIPO_INFO, SISTEMA_LABEL, normalizar,
  type ItemNom, type ExternoNom, type ComponenteNom, type CategoriaNom, type SaborNom, type PresentacionNom, type TipoItem,
} from '@/lib/nomenclador/tipos'
import { CodigoChip, BadgeRevisar, BadgeArchivado, botonPrimario, botonSecundario } from './comun'
import ItemModal from './ItemModal'
import ExternosPanel from './ExternosPanel'
import ParametrosPanel from './ParametrosPanel'
import { marcarRevisado } from './acciones'

export interface DatosNomenclador {
  items: ItemNom[]
  externos: ExternoNom[]
  componentes: ComponenteNom[]
  categorias: CategoriaNom[]
  sabores: SaborNom[]
  presentaciones: PresentacionNom[]
}

type Tab = 'items' | 'externos' | 'parametros'
const ID_BASE = 'nomenclador'

export default function NomencladorClient(datos: DatosNomenclador) {
  const [tab, setTab] = useState<Tab>('items')
  // Ficha abierta: un ítem, "nuevo" o nada. La clave fuerza un form limpio en cada apertura.
  const [ficha, setFicha] = useState<{ id: string | null; n: number } | null>(null)
  const sinMapear = datos.externos.filter(e => e.activo && !e.item_id).length

  function abrirItem(id: string | null) {
    setFicha(f => ({ id, n: (f?.n ?? 0) + 1 }))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icono={IconBooks}
        titulo="Nomenclador"
        descripcion="Todo lo que se compra, se produce y se vende, con su código y sus códigos de Posberry y Fudo."
        acciones={tab === 'items' && (
          <button onClick={() => abrirItem(null)} className={botonPrimario}>
            <IconPlus size={16} /> Nuevo ítem
          </button>
        )}
      />

      <Pestanas
        idBase={ID_BASE}
        etiqueta="Secciones del nomenclador"
        activa={tab}
        onCambiar={id => setTab(id as Tab)}
        items={[
          { id: 'items', label: 'Ítems', icon: <IconListDetails size={16} />, contador: datos.items.filter(i => i.estado === 'activo').length },
          { id: 'externos', label: 'Códigos externos', icon: <IconPlugConnected size={16} />, contador: sinMapear || undefined },
          { id: 'parametros', label: 'Parámetros', icon: <IconAdjustmentsHorizontal size={16} /> },
        ]}
      />

      <div {...panelDe(ID_BASE, 'items')} hidden={tab !== 'items'}>
        <ItemsPanel datos={datos} onAbrir={abrirItem} />
      </div>
      <div {...panelDe(ID_BASE, 'externos')} hidden={tab !== 'externos'}>
        <ExternosPanel datos={datos} onAbrirItem={abrirItem} />
      </div>
      <div {...panelDe(ID_BASE, 'parametros')} hidden={tab !== 'parametros'}>
        <ParametrosPanel datos={datos} />
      </div>

      {ficha && (
        <ItemModal
          key={ficha.n}
          itemId={ficha.id}
          datos={datos}
          onCerrar={() => setFicha(null)}
          onAbrirOtro={abrirItem}
        />
      )}
    </div>
  )
}

function ItemsPanel({ datos, onAbrir }: { datos: DatosNomenclador; onAbrir: (id: string | null) => void }) {
  const { items, externos, categorias, sabores } = datos
  const toast = useToast()
  const confirmar = useConfirmar()
  const [pendiente, startTransition] = useTransition()

  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState<TipoItem | 'todos'>('todos')
  const [categoria, setCategoria] = useState('todas')
  const [sabor, setSabor] = useState('todos')
  const [soloRevisar, setSoloRevisar] = useState(false)
  const [soloSinCodigos, setSoloSinCodigos] = useState(false)
  const [verArchivados, setVerArchivados] = useState(false)

  const externosPorItem = useMemo(() => {
    const m = new Map<string, ExternoNom[]>()
    for (const e of externos) {
      if (!e.item_id) continue
      m.set(e.item_id, [...(m.get(e.item_id) ?? []), e])
    }
    return m
  }, [externos])

  // Texto donde se busca: código, nombre, nombres alternativos, códigos externos,
  // tipo, categoría y sabor (con los alternativos del sabor: "roquefort" encuentra Queso Azul).
  const indice = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) {
      const ext = (externosPorItem.get(i.id) ?? []).map(e => `${e.codigo} ${e.nombre}`)
      const s = sabores.find(x => x.id === i.sabor_id)
      const cat = categorias.find(c => c.id === i.categoria_id)?.nombre ?? ''
      m.set(i.id, normalizar([
        i.codigo, i.nombre, ...i.nombres_alternativos, ...ext, TIPO_INFO[i.tipo].label, cat,
        ...(s ? [s.nombre, ...s.nombres_alternativos] : []),
      ].join(' | ')))
    }
    return m
  }, [items, externosPorItem, sabores, categorias])

  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre ?? '—'

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return items.filter(i =>
      (verArchivados ? i.estado === 'archivado' : i.estado === 'activo') &&
      (tipo === 'todos' || i.tipo === tipo) &&
      (categoria === 'todas' || i.categoria_id === categoria) &&
      (sabor === 'todos' || i.sabor_id === sabor) &&
      (!soloRevisar || i.a_revisar) &&
      (!soloSinCodigos || !externosPorItem.has(i.id)) &&
      (!q || q.split(/\s+/).every(p => indice.get(i.id)!.includes(p))))
  }, [items, busqueda, tipo, categoria, sabor, soloRevisar, soloSinCodigos, verArchivados, externosPorItem, indice])

  const aRevisar = items.filter(i => i.estado === 'activo' && i.a_revisar).length
  const revisablesVisibles = filtrados.filter(i => i.a_revisar)
  const hayFiltros = !!busqueda || tipo !== 'todos' || categoria !== 'todas' || sabor !== 'todos' || soloRevisar || soloSinCodigos || verArchivados
  function limpiar() {
    setBusqueda(''); setTipo('todos'); setCategoria('todas'); setSabor('todos')
    setSoloRevisar(false); setSoloSinCodigos(false); setVerArchivados(false)
  }

  function marcarVisibles() {
    const ids = revisablesVisibles.map(i => i.id)
    confirmar({
      titulo: `Marcar ${ids.length} ítems como revisados`,
      mensaje: 'Quedan como revisados los ítems "a revisar" que se ven en la lista con los filtros actuales. Después ya no se les puede cambiar el tipo.',
      textoConfirmar: 'Marcar revisados',
      onConfirmar: () => startTransition(async () => {
        const r = await marcarRevisado({ ids, revisado: true })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`${r.data} ítems marcados como revisados`)
      }),
    })
  }

  const columnas: Columna<ItemNom>[] = [
    {
      key: 'codigo', header: 'Código', className: 'w-24',
      ordenar: i => i.codigo,
      render: i => <CodigoChip codigo={i.codigo} tipo={i.tipo} />,
    },
    {
      key: 'nombre', header: 'Nombre', className: 'min-w-56',
      ordenar: i => normalizar(i.nombre),
      render: i => (
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-text">{i.nombre}</span>
            {i.a_revisar && <BadgeRevisar />}
            {i.estado === 'archivado' && <BadgeArchivado />}
          </span>
          {i.nombres_alternativos.length > 0 && (
            <span className="mt-0.5 block truncate text-xs text-muted" title={i.nombres_alternativos.join(' · ')}>
              También: {i.nombres_alternativos.slice(0, 3).join(' · ')}{i.nombres_alternativos.length > 3 && ` +${i.nombres_alternativos.length - 3}`}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-muted md:hidden">{TIPO_INFO[i.tipo].label}</span>
        </div>
      ),
    },
    {
      key: 'tipo', header: 'Tipo', ocultarHasta: 'md',
      ordenar: i => TIPOS.indexOf(i.tipo),
      render: i => <span className="text-muted">{TIPO_INFO[i.tipo].label}</span>,
    },
    {
      key: 'categoria', header: 'Categoría', ocultarHasta: 'xl',
      ordenar: i => nombreCategoria(i.categoria_id),
      render: i => <span className="text-muted">{nombreCategoria(i.categoria_id)}</span>,
    },
    {
      key: 'externos', header: 'Posberry / Fudo', ocultarHasta: 'lg',
      ordenar: i => externosPorItem.get(i.id)?.length ?? 0,
      render: i => {
        const lista = externosPorItem.get(i.id) ?? []
        if (!lista.length) return <span className="text-faint">—</span>
        return (
          <span className="flex flex-wrap gap-1">
            {lista.map(e => (
              <span key={e.id} title={`${SISTEMA_LABEL[e.sistema]} ${e.codigo}: ${e.nombre}`}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-2xs text-muted">
                {e.sistema === 'posberry' ? 'P' : 'F'}{e.codigo}
              </span>
            ))}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por código, nombre o código de Posberry / Fudo" className="min-w-60 flex-1" />
        <Select value={tipo} onChange={e => setTipo(e.target.value as TipoItem | 'todos')} className="w-auto" aria-label="Tipo">
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_INFO[t].plural}</option>)}
        </Select>
        <Select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-auto" aria-label="Categoría">
          <option value="todas">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Select>
        <Select value={sabor} onChange={e => setSabor(e.target.value)} className="w-auto" aria-label="Sabor">
          <option value="todos">Todos los sabores</option>
          {sabores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={soloRevisar} onClick={() => setSoloRevisar(v => !v)}>A revisar · {aRevisar}</Chip>
        <Chip active={soloSinCodigos} onClick={() => setSoloSinCodigos(v => !v)}>Sin códigos externos</Chip>
        <Chip active={verArchivados} onClick={() => setVerArchivados(v => !v)}>Archivados</Chip>
        <ClearFiltersButton onClick={limpiar} visible={hayFiltros} />
        <span className="ml-auto text-xs text-muted">{filtrados.length} de {items.length}</span>
        {soloRevisar && revisablesVisibles.length > 0 && (
          <button onClick={marcarVisibles} disabled={pendiente} className={botonSecundario}>
            <IconChecks size={16} /> Marcar {revisablesVisibles.length} como revisados
          </button>
        )}
      </div>

      <DataTable
        filas={filtrados}
        columnas={columnas}
        filaKey={i => i.id}
        onFilaClick={i => onAbrir(i.id)}
        filaClassName={i => (i.estado === 'archivado' ? 'opacity-60' : '')}
        vacio={items.length === 0
          ? <EmptyState icono={IconBooks} titulo="El nomenclador está vacío" descripcion="Creá el primer ítem o corré la carga inicial." />
          : <EmptyState icono={IconListDetails} titulo="Ningún ítem coincide" descripcion="Probá con otra búsqueda o limpiá los filtros." />}
      />
    </div>
  )
}
