'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { ClipboardList, Clock, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import AyudaLink from '@/components/ui/AyudaLink'
import EmptyState from '@/components/ui/EmptyState'
import EstadoBadge from '@/components/ui/EstadoBadge'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import { SegmentedControl } from '@/components/ui/Chip'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import { DIAS_DEMORA, subtextoEstado, type FiltroPedidos } from '@/lib/compras/estadoPedido'
import { armarVistas, coincideBusqueda, type PedidoVista } from './modelo'
import PedidoDetalle from './PedidoDetalle'
import PedidoEditor from './PedidoEditor'
import PedidoEnvio from './PedidoEnvio'
import CerrarPedidoModal from './CerrarPedidoModal'
import { eliminarPedido, reabrirPedido } from './acciones'
import type { EventoPedido, ItemCatalogo, LineaPendiente, LocalFacturacion, PedidoFila, Plantilla, ProveedorPedido } from './datos'

type Vista = 'detalle' | 'editar' | 'enviar' | 'cerrar'

const FILTROS: { value: FiltroPedidos; label: string; vacio: { titulo: string; descripcion: string } }[] = [
  { value: 'activos', label: 'Activos', vacio: { titulo: 'No hay pedidos activos', descripcion: 'Acá aparecen los pedidos sin enviar y los que esperan mercadería.' } },
  { value: 'por_facturar', label: 'Por facturar', vacio: { titulo: 'No hay pedidos por facturar', descripcion: 'Cuando llegue la mercadería de un pedido, aparece acá hasta que se cargue su factura.' } },
  { value: 'facturados', label: 'Facturados', vacio: { titulo: 'No hay pedidos facturados', descripcion: 'Los pedidos con factura cargada aparecen acá.' } },
  { value: 'devueltos', label: 'Devueltos', vacio: { titulo: 'No hay pedidos devueltos', descripcion: 'Los pedidos devueltos al proveedor aparecen acá.' } },
  { value: 'todos', label: 'Todos', vacio: { titulo: 'Todavía no hay pedidos', descripcion: 'Usá "Crear pedido" para armar el primero.' } },
]

// Activos: primero los que falta enviar, después los enviados hace más tiempo.
function ordenActivos(a: PedidoVista, b: PedidoVista): number {
  const ea = a.fila.enviado_en
  const eb = b.fila.enviado_en
  if (!ea && !eb) return b.creado.localeCompare(a.creado)
  if (!ea) return -1
  if (!eb) return 1
  return ea.localeCompare(eb)
}

export default function PedidosClient({
  pedidos,
  lineas,
  eventos,
  proveedores,
  itemsCatalogo,
  stock,
  plantillas,
  localesFacturacion,
  pedidoInicial,
}: {
  pedidos: PedidoFila[]
  lineas: LineaPendiente[]
  eventos: EventoPedido[]
  proveedores: ProveedorPedido[]
  itemsCatalogo: ItemCatalogo[]
  stock: { item_id: string; cantidad: number }[]
  plantillas: Plantilla[]
  localesFacturacion: LocalFacturacion[]
  pedidoInicial?: string
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [filtro, setFiltro] = useState<FiltroPedidos>('activos')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abiertoId, setAbiertoId] = useState<string | null>(pedidoInicial ?? null)
  const [creando, setCreando] = useState(false)
  const [vista, setVista] = useState<Vista>('detalle')
  const [avisoReenvio, setAvisoReenvio] = useState(false)
  const [editorConCambios, setEditorConCambios] = useState(false)

  // Los datos vienen siempre del servidor: las acciones llaman a refresh() y
  // la pantalla se vuelve a armar con lo que quedó en la base.
  const vistas = useMemo(() => armarVistas(pedidos, lineas, eventos), [pedidos, lineas, eventos])
  const stockPorItem = useMemo(() => Object.fromEntries(stock.map(s => [s.item_id, s.cantidad])), [stock])
  const abierto = abiertoId ? vistas.find(v => v.fila.id === abiertoId) ?? null : null
  const activos = useMemo(() => vistas.filter(v => v.filtro === 'activos'), [vistas])

  const conteos = useMemo(() => {
    const c: Record<FiltroPedidos, number> = { activos: 0, por_facturar: 0, facturados: 0, devueltos: 0, todos: vistas.length }
    for (const v of vistas) if (v.filtro) c[v.filtro]++
    return c
  }, [vistas])

  const hayFiltros = !!busqueda || !!desde || !!hasta
  const filtrados = useMemo(() => {
    const lista = vistas
      .filter(v => filtro === 'todos' || v.filtro === filtro)
      .filter(v => coincideBusqueda(v, busqueda))
      .filter(v => !desde || v.creado.slice(0, 10) >= desde)
      .filter(v => !hasta || v.creado.slice(0, 10) <= hasta)
    return filtro === 'activos' ? [...lista].sort(ordenActivos) : lista
  }, [vistas, filtro, busqueda, desde, hasta])

  function limpiarFiltros() { setBusqueda(''); setDesde(''); setHasta('') }

  function abrir(id: string, v: Vista = 'detalle') {
    setCreando(false)
    setAbiertoId(id)
    setVista(v)
    setAvisoReenvio(false)
    setEditorConCambios(false)
  }

  function cerrarModalYa() {
    setCreando(false)
    setAbiertoId(null)
    setVista('detalle')
    setAvisoReenvio(false)
    setEditorConCambios(false)
  }

  // Salir del editor con cambios sin guardar pide confirmación.
  function siNoHayCambios(seguir: () => void) {
    if (vista === 'editar' && editorConCambios) {
      confirmar({
        titulo: 'Descartar cambios',
        mensaje: 'Tenés cambios sin guardar en el pedido. ¿Descartarlos?',
        textoConfirmar: 'Descartar',
        textoCancelar: 'Seguir editando',
        peligroso: true,
        onConfirmar: seguir,
      })
      return
    }
    seguir()
  }

  function cerrarModal() {
    if (isPending) return
    siNoHayCambios(cerrarModalYa)
  }

  function cancelarEditor() {
    siNoHayCambios(() => {
      setEditorConCambios(false)
      if (creando) cerrarModalYa()
      else setVista('detalle')
    })
  }

  const alCambiarEditor = useCallback((hay: boolean) => setEditorConCambios(hay), [])

  function alGuardar(r: { id: string; numero: number; nuevo: boolean; yaEnviado: boolean }) {
    setEditorConCambios(false)
    setCreando(false)
    setAbiertoId(r.id)
    if (r.nuevo) {
      toast.success(`Pedido ${codigoPedido(r.numero)} creado`)
      setVista('detalle')
    } else if (r.yaEnviado) {
      toast.success('Cambios guardados')
      setAvisoReenvio(true)
      setVista('enviar')
    } else {
      toast.success('Cambios guardados')
      setVista('detalle')
    }
  }

  function pedirEliminar(p: PedidoVista) {
    confirmar({
      titulo: `Eliminar ${p.codigo}`,
      mensaje: `¿Eliminar el pedido ${p.codigo} a ${p.proveedor}? El número ${p.codigo} no se vuelve a usar.`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await eliminarPedido({ pedidoId: p.fila.id })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`${p.codigo} eliminado`)
        cerrarModalYa()
      }),
    })
  }

  function pedirReabrir(p: PedidoVista) {
    confirmar({
      titulo: `Reabrir ${p.codigo}`,
      mensaje: `${p.codigo} vuelve a esperar mercadería y se puede editar y cargarle remitos.`,
      textoConfirmar: 'Reabrir',
      onConfirmar: () => startTransition(async () => {
        const r = await reabrirPedido({ pedidoId: p.fila.id })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`${p.codigo} reabierto`)
      }),
    })
  }

  const columnas: Columna<PedidoVista>[] = [
    {
      key: 'numero',
      header: 'N°',
      render: p => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono tabular-nums">
          {p.codigo}
          {p.demorado && (
            <span title={`Enviado hace ${DIAS_DEMORA} días o más y todavía sin recibir todo`} className="text-warning">
              <Clock size={13} aria-label="Demorado" />
            </span>
          )}
        </span>
      ),
      ordenar: p => p.fila.numero,
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      render: p => <span className="font-medium">{p.proveedor}</span>,
      ordenar: p => p.proveedor,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: p => (
        <div className="whitespace-nowrap">
          <p>{formatearFecha(p.creado)}</p>
          {p.fila.enviado_en && <p className="text-2xs text-muted">enviado {formatearFecha(p.fila.enviado_en)}</p>}
        </div>
      ),
      ordenar: p => p.creado,
      ocultarHasta: 'sm',
    },
    {
      key: 'estado',
      header: 'Estado',
      render: p => {
        const sub = subtextoEstado(p.entrada)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <EstadoBadge dominio="compras_pedido" estado={p.visible} />
            {sub && <span className="text-2xs text-muted">{sub}</span>}
          </div>
        )
      },
      ordenar: p => p.visible,
    },
    {
      key: 'recepcion',
      header: 'Recepción',
      render: p => {
        if (p.entrada.estado_recepcion === 'sin_enviar' || p.lineas.length === 0) return <span className="text-faint">—</span>
        const pct = Math.round((p.lineasCompletas / p.lineas.length) * 100)
        return (
          <div className="min-w-24">
            <p className="text-xs tabular-nums text-muted">{p.lineasCompletas}/{p.lineas.length} líneas</p>
            <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-surface2" aria-hidden>
              <div className={`h-full rounded-full ${pct === 100 ? 'bg-success' : 'bg-warning'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      },
      ordenar: p => (p.lineas.length ? p.lineasCompletas / p.lineas.length : -1),
      ocultarHasta: 'sm',
    },
    {
      key: 'origen',
      header: 'Origen',
      render: p => <span className="text-muted">{p.origen}</span>,
      ordenar: p => p.origen,
      ocultarHasta: 'md',
    },
    {
      key: 'items',
      header: 'Ítems',
      render: p => p.lineas.length,
      ordenar: p => p.lineas.length,
      alinear: 'right',
      ocultarHasta: 'lg',
    },
  ]

  const filtroActual = FILTROS.find(f => f.value === filtro) ?? FILTROS[0]
  const modalAbierto = creando || !!abierto

  const titulo = creando
    ? 'Nuevo pedido'
    : abierto
      ? {
          detalle: `Pedido ${abierto.codigo}`,
          editar: `Editar ${abierto.codigo}`,
          enviar: `Enviar ${abierto.codigo}`,
          cerrar: `Cerrar ${abierto.codigo} a mano`,
        }[vista]
      : ''

  return (
    <div className="space-y-6">
      <PageHeader
        icono={ClipboardList}
        titulo="Pedidos a proveedores"
        descripcion="Armá el pedido, mandalo por WhatsApp y seguí qué llegó y qué falta."
        acciones={
          <>
            <AyudaLink seccion="compras-pedidos" />
            <button
              type="button"
              onClick={() => { setAbiertoId(null); setCreando(true); setVista('editar'); setEditorConCambios(false) }}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <Plus size={16} /> Crear pedido
            </button>
          </>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          value={filtro}
          onChange={setFiltro}
          opciones={FILTROS.map(f => ({
            value: f.value,
            label: (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {f.label}
                <span className="tabular-nums opacity-70">{conteos[f.value]}</span>
              </span>
            ),
          }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar N° o proveedor..." className="w-full sm:w-72" />
        <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-border overflow-hidden">
          {hayFiltros ? (
            <EmptyState
              icono={ClipboardList}
              titulo="Ningún pedido coincide con la búsqueda"
              descripcion="Probá con otro número o proveedor, o limpiá los filtros."
              accion={<ClearFiltersButton visible onClick={limpiarFiltros} />}
            />
          ) : (
            <EmptyState icono={ClipboardList} titulo={filtroActual.vacio.titulo} descripcion={filtroActual.vacio.descripcion} />
          )}
        </div>
      ) : (
        <DataTable filas={filtrados} columnas={columnas} filaKey={p => p.fila.id} onFilaClick={p => abrir(p.fila.id)} />
      )}

      <Modal
        open={modalAbierto}
        onClose={cerrarModal}
        title={titulo}
        encabezado={abierto && !creando ? (
          <span>
            {{ detalle: 'Pedido', editar: 'Editar', enviar: 'Enviar', cerrar: 'Cerrar' }[vista]}{' '}
            <span className="font-mono tabular-nums">{abierto.codigo}</span>
            {vista === 'cerrar' && ' a mano'}
          </span>
        ) : undefined}
        size="xl"
        pantallaCompletaMobile
      >
        {creando && (
          <PedidoEditor
            key="nuevo"
            pedido={null}
            proveedores={proveedores}
            itemsCatalogo={itemsCatalogo}
            stockPorItem={stockPorItem}
            pedidosAbiertos={activos}
            onGuardado={alGuardar}
            onCancelar={cancelarEditor}
            onCambios={alCambiarEditor}
            onVerPedido={id => siNoHayCambios(() => abrir(id))}
          />
        )}
        {!creando && abierto && vista === 'detalle' && (
          <PedidoDetalle
            pedido={abierto}
            pendiente={isPending}
            acciones={{
              onEnviar: () => { setAvisoReenvio(false); setVista('enviar') },
              onEditar: () => setVista('editar'),
              onCerrar: () => setVista('cerrar'),
              onReabrir: () => pedirReabrir(abierto),
              onEliminar: () => pedirEliminar(abierto),
            }}
          />
        )}
        {!creando && abierto && vista === 'editar' && (
          <PedidoEditor
            key={abierto.fila.id}
            pedido={abierto}
            proveedores={proveedores}
            itemsCatalogo={itemsCatalogo}
            stockPorItem={stockPorItem}
            pedidosAbiertos={activos}
            onGuardado={alGuardar}
            onCancelar={cancelarEditor}
            onCambios={alCambiarEditor}
            onVerPedido={id => siNoHayCambios(() => abrir(id))}
          />
        )}
        {!creando && abierto && vista === 'enviar' && (
          <PedidoEnvio
            key={abierto.fila.id}
            pedido={abierto}
            plantillas={plantillas}
            localesFacturacion={localesFacturacion}
            avisoReenvio={avisoReenvio}
            onListo={() => { setAvisoReenvio(false); setVista('detalle') }}
          />
        )}
        {!creando && abierto && vista === 'cerrar' && (
          <CerrarPedidoModal pedido={abierto} onVolver={() => setVista('detalle')} onCerrado={() => setVista('detalle')} />
        )}
      </Modal>
    </div>
  )
}
