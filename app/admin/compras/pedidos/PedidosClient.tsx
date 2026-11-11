'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { ClipboardList, Clock, Plus, X } from 'lucide-react'
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
import { useAlCambiarParam, useQuitarParams } from '@/components/ui/useParamDeepLink'
import { useSearchParams } from 'next/navigation'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import { DIAS_DEMORA, coincideAlerta, subtextoEstado, type FiltroPedidos } from '@/lib/compras/estadoPedido'
import { ALERTAS_PEDIDOS, type AlertaPedidos } from '@/lib/compras/rutas'
import { armarVistas, coincideBusqueda, type PedidoVista } from './modelo'
import PedidoDetalle from './PedidoDetalle'
import PedidoEditor from './PedidoEditor'
import PedidoEnvio from './PedidoEnvio'
import CerrarPedidoModal from './CerrarPedidoModal'
import PedidosEliminados from './PedidosEliminados'
import { reabrirPedido } from './acciones'
import type { DiferenciaFila } from '@/lib/compras/diferencias'
import { armarDevoluciones, type DevolucionFila } from './devoluciones/datos'
import type { FacturaDePedido, ItemCatalogo, LineaPendiente, LocalFacturacion, PedidoEliminado, PedidoFila, Plantilla, ProveedorPedido } from './datos'

type Vista = 'detalle' | 'editar' | 'enviar' | 'cerrar' | 'eliminar'

const FILTROS: { value: FiltroPedidos; label: string; vacio: { titulo: string; descripcion: string } }[] = [
  { value: 'activos', label: 'Activos', vacio: { titulo: 'No hay pedidos activos', descripcion: 'Acá aparecen los pedidos sin enviar y los que esperan mercadería.' } },
  { value: 'por_facturar', label: 'Por facturar', vacio: { titulo: 'No hay pedidos por facturar', descripcion: 'Cuando llegue la mercadería de un pedido, aparece acá hasta que se cargue su factura.' } },
  { value: 'facturados', label: 'Facturados', vacio: { titulo: 'No hay pedidos facturados', descripcion: 'Los pedidos con factura cargada aparecen acá.' } },
  { value: 'devueltos', label: 'Devueltos', vacio: { titulo: 'No hay pedidos devueltos', descripcion: 'Los pedidos devueltos al proveedor aparecen acá.' } },
  { value: 'cerrados', label: 'Cerrados', vacio: { titulo: 'No hay pedidos cerrados a mano', descripcion: 'Los pedidos que se cierran con "Cerrar a mano" aparecen acá, con su motivo.' } },
  { value: 'todos', label: 'Todos', vacio: { titulo: 'Todavía no hay pedidos', descripcion: 'Usá "Crear pedido" para armar el primero.' } },
  { value: 'eliminados', label: 'Eliminados', vacio: { titulo: 'No hay pedidos eliminados', descripcion: '' } },
]

function filtroDeParam(valor: string | undefined): FiltroPedidos | null {
  return FILTROS.find(f => f.value === valor)?.value ?? null
}

// B5: ?alerta= (los KPIs del dashboard y los avisos agrupados). Se suma a la pestaña.
const ALERTAS: Record<AlertaPedidos, { label: string; vacio: string; soloAdmin: boolean }> = {
  por_recibir: { label: 'Por recibir', vacio: 'No hay pedidos esperando mercadería', soloAdmin: false },
  demorados: { label: 'Demorados', vacio: 'No hay pedidos demorados', soloAdmin: false },
  diferencias: { label: 'Con diferencias', vacio: 'No hay pedidos con diferencias por resolver', soloAdmin: true },
  nc: { label: 'Esperando nota de crédito', vacio: 'No hay pedidos esperando nota de crédito', soloAdmin: true },
}

function alertaDeParam(valor: string | null, esAdmin: boolean): AlertaPedidos | null {
  const a = ALERTAS_PEDIDOS.find(x => x === valor) ?? null
  // Diferencias y NC son datos de admin: para el resto la vista no los trae.
  return a && (!ALERTAS[a].soloAdmin || esAdmin) ? a : null
}

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
  proveedores,
  itemsCatalogo,
  stock,
  plantillas,
  localesFacturacion,
  eliminados,
  facturas,
  diferencias,
  devoluciones,
  esAdmin,
  pedidoInicial,
  devolucionInicial,
  diasDemora = DIAS_DEMORA,
}: {
  pedidos: PedidoFila[]
  lineas: LineaPendiente[]
  proveedores: ProveedorPedido[]
  itemsCatalogo: ItemCatalogo[]
  stock: { item_id: string; cantidad: number }[]
  plantillas: Plantilla[]
  localesFacturacion: LocalFacturacion[]
  eliminados: PedidoEliminado[]
  facturas: FacturaDePedido[]
  diferencias: DiferenciaFila[]
  devoluciones: DevolucionFila[]
  /** Solo admin ve la factura del pedido y puede cargarla (P1). */
  esAdmin: boolean
  pedidoInicial?: string
  /** B4: ?devolucion= (con ?pedido=) abre el pedido y resalta esa devolución. */
  devolucionInicial?: string
  /** B5: compras_config 'pedidos.dias_demora'. */
  diasDemora?: number
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  // B3: ?estado=por_facturar (el aviso de Reportes) arranca en esa pestaña; un
  // valor que no es una pestaña se ignora. Elegir otra a mano lo saca de la URL.
  const searchParams = useSearchParams()
  const estadoParam = searchParams.get('estado') ?? undefined
  const alerta = alertaDeParam(searchParams.get('alerta'), esAdmin)
  const quitarAlerta = useQuitarParams('alerta')
  const [filtro, setFiltro] = useState<FiltroPedidos>(() => alerta ? 'todos' : filtroDeParam(estadoParam) ?? 'activos')
  useAlCambiarParam(alerta ?? undefined, () => setFiltro('todos'))
  const quitarEstado = useQuitarParams('estado')
  useAlCambiarParam(estadoParam, e => { const f = filtroDeParam(e); if (f) setFiltro(f) })
  function elegirFiltro(f: FiltroPedidos) { setFiltro(f); quitarEstado() }
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abiertoId, setAbiertoId] = useState<string | null>(pedidoInicial ?? null)
  const [creando, setCreando] = useState(false)
  const [vista, setVista] = useState<Vista>('detalle')
  const [avisoReenvio, setAvisoReenvio] = useState(false)
  const [editorConCambios, setEditorConCambios] = useState(false)
  const quitarParam = useQuitarParams('pedido', 'devolucion')
  const [devolucionResaltada, setDevolucionResaltada] = useState<string | null>(devolucionInicial ?? null)
  useAlCambiarParam(pedidoInicial, id => abrir(id))
  useAlCambiarParam(devolucionInicial, id => setDevolucionResaltada(id))

  // Los datos vienen siempre del servidor: las acciones llaman a refresh() y
  // la pantalla se vuelve a armar con lo que quedó en la base.
  const devolucionesVista = useMemo(() => armarDevoluciones(devoluciones), [devoluciones])
  const vistas = useMemo(
    () => armarVistas(pedidos, lineas, facturas, esAdmin, undefined, diferencias, devolucionesVista, diasDemora),
    [pedidos, lineas, facturas, esAdmin, diferencias, devolucionesVista, diasDemora],
  )
  const stockPorItem = useMemo(() => Object.fromEntries(stock.map(s => [s.item_id, s.cantidad])), [stock])
  const abierto = abiertoId ? vistas.find(v => v.fila.id === abiertoId) ?? null : null
  const activos = useMemo(() => vistas.filter(v => v.filtro === 'activos'), [vistas])

  const conteos = useMemo(() => {
    const c: Record<FiltroPedidos, number> = {
      activos: 0, por_facturar: 0, facturados: 0, devueltos: 0, cerrados: 0, todos: vistas.length, eliminados: eliminados.length,
    }
    for (const v of vistas) {
      if (v.filtro) c[v.filtro]++
      if (v.visible === 'cerrado') c.cerrados++
    }
    return c
  }, [vistas, eliminados])

  const hayFiltros = !!busqueda || !!desde || !!hasta
  const filtrados = useMemo(() => {
    const lista = vistas
      .filter(v => filtro === 'todos' || (filtro === 'cerrados' ? v.visible === 'cerrado' : v.filtro === filtro))
      .filter(v => !alerta || coincideAlerta({ ...v.entrada, demorado: v.demorado }, alerta))
      .filter(v => coincideBusqueda(v, busqueda))
      .filter(v => !desde || v.creado.slice(0, 10) >= desde)
      .filter(v => !hasta || v.creado.slice(0, 10) <= hasta)
    return filtro === 'activos' ? [...lista].sort(ordenActivos) : lista
  }, [vistas, filtro, alerta, busqueda, desde, hasta])

  function limpiarFiltros() { setBusqueda(''); setDesde(''); setHasta('') }

  function abrir(id: string, v: Vista = 'detalle') {
    setCreando(false)
    setAbiertoId(id)
    setVista(v)
    setAvisoReenvio(false)
    setEditorConCambios(false)
  }

  function cerrarModalYa() {
    quitarParam()
    setDevolucionResaltada(null)
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

  function alGuardar(r: { id: string; numero: number; cambios: boolean; nuevo: boolean; yaEnviado: boolean }) {
    setEditorConCambios(false)
    setCreando(false)
    setAbiertoId(r.id)
    if (r.nuevo) {
      toast.success(`Pedido ${codigoPedido(r.numero)} creado`)
      setVista('detalle')
    } else if (!r.cambios) {
      toast.success('Sin cambios')
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
            <span title={`Enviado hace ${diasDemora} días o más y todavía sin recibir todo`} className="text-warning">
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
        if (p.entrada.estado_recepcion === 'sin_enviar' || p.lineas.length === 0) return <span className="text-muted" aria-label="Sin enviar">—</span>
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
      key: 'recibido',
      header: 'Recibido',
      alinear: 'right',
      render: p => p.entrada.estado_recepcion === 'sin_enviar' || p.lineas.length === 0
        ? <span className="text-muted" aria-label="Sin enviar">—</span>
        : <span className={`tabular-nums font-semibold ${p.porcentajeRecibido >= 100 ? 'text-success' : 'text-text'}`}>{p.porcentajeRecibido}%</span>,
      ordenar: p => (p.entrada.estado_recepcion === 'sin_enviar' ? -1 : p.porcentajeRecibido),
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
    ...(esAdmin ? [{
      key: 'factura',
      header: 'Factura',
      alinear: 'right' as const,
      render: (p: PedidoVista) => {
        if (!p.factura) return <span className="text-muted" aria-label="Sin factura">—</span>
        return (
          <div className="whitespace-nowrap">
            <p className="font-mono text-xs tabular-nums text-text">{p.factura.numero}</p>
            <p className="text-2xs tabular-nums text-muted">
              {p.factura.estado === 'borrador' ? 'borrador' : formatearMonedaExacta(p.factura.total)}
            </p>
          </div>
        )
      },
      ordenar: (p: PedidoVista) => p.factura?.numero ?? '',
      // 'xl' y no 'lg': dentro de /admin el sidebar se come 240px y esta tabla
      // ya venía justa de ancho.
      ocultarHasta: 'xl' as const,
    }] : []),
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
          eliminar: `Eliminar ${abierto.codigo}`,
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
              onClick={() => { quitarParam(); setAbiertoId(null); setCreando(true); setVista('editar'); setEditorConCambios(false) }}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              <Plus size={16} /> Crear pedido
            </button>
          </>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          value={filtro}
          onChange={elegirFiltro}
          opciones={FILTROS.map(f => ({
            value: f.value,
            label: (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {f.label}
                <span className="tabular-nums font-semibold">{conteos[f.value]}</span>
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

      {alerta && filtro !== 'eliminados' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 py-1 pl-3 pr-1 text-text">
            <span className="font-medium">{ALERTAS[alerta].label}</span>
            <span className="tabular-nums font-semibold">{filtrados.length}</span>
            <button
              type="button"
              onClick={quitarAlerta}
              title="Quitar este filtro"
              aria-label={`Quitar el filtro ${ALERTAS[alerta].label}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-text"
            >
              <X size={14} />
            </button>
          </span>
          {alerta === 'demorados' && <span className="text-xs text-muted">Enviados hace {diasDemora} días o más</span>}
        </div>
      )}

      {filtro === 'eliminados' ? (
        <PedidosEliminados
          eliminados={eliminados}
          filtrar={e => {
            const t = busqueda.trim().toLowerCase()
            const fecha = (e.eliminado_en ?? '').slice(0, 10)
            if (desde && fecha < desde) return false
            if (hasta && fecha > hasta) return false
            if (!t) return true
            const digitos = t.replace(/^p-?/, '')
            return (e.proveedor_nombre ?? '').toLowerCase().includes(t)
              || codigoPedido(e.numero ?? 0).toLowerCase().includes(t)
              || (/^\d+$/.test(digitos) && Number(digitos) === e.numero)
          }}
        />
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-border overflow-hidden">
          {hayFiltros ? (
            <EmptyState
              icono={ClipboardList}
              titulo="Ningún pedido coincide con la búsqueda"
              descripcion="Probá con otro número o proveedor, o limpiá los filtros."
              accion={<ClearFiltersButton visible onClick={limpiarFiltros} />}
            />
          ) : alerta ? (
            <EmptyState
              icono={ClipboardList}
              titulo={ALERTAS[alerta].vacio}
              accion={<button type="button" onClick={quitarAlerta} className="text-sm text-accent hover:underline">Ver todos los pedidos</button>}
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
            {{ detalle: 'Pedido', editar: 'Editar', enviar: 'Enviar', cerrar: 'Cerrar', eliminar: 'Eliminar' }[vista]}{' '}
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
            esAdmin={esAdmin}
            stockPorItem={stockPorItem}
            devolucionResaltada={devolucionResaltada}
            diasDemora={diasDemora}
            acciones={{
              onEnviar: () => { setAvisoReenvio(false); setVista('enviar') },
              onEditar: () => setVista('editar'),
              onCerrar: () => setVista('cerrar'),
              onReabrir: () => pedirReabrir(abierto),
              onEliminar: () => setVista('eliminar'),
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
        {!creando && abierto && vista === 'eliminar' && (
          <CerrarPedidoModal key={`eliminar-${abierto.fila.id}`} pedido={abierto} modo="eliminar" onVolver={() => setVista('detalle')} onCerrado={cerrarModalYa} />
        )}
      </Modal>
    </div>
  )
}
