'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BellRing, ClipboardList, Clock, History, Inbox, LayoutGrid, PackageOpen, RefreshCw, Truck, X, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { EstadoPedido, Pedido, PedidoEvento, PedidoMensaje, Producto } from '@/lib/types'
import PushToggle from '@/components/ui/PushToggle'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { useRefrescarAlVolver } from '@/lib/hooks/useRefrescarAlVolver'
import { esCerrado } from '@/lib/pedidos/estados'
import TarjetaPedido from './TarjetaPedido'
import DetallePedidoModal from './DetallePedidoModal'
import HistorialPedidos from './HistorialPedidos'
import HojaPreparacion from './HojaPreparacion'
import { leerVistos, marcarVisto, mensajesSinLeer, notificarNavegador, sonarAviso } from './utiles'
import { prepararSonido } from '@/lib/sonido'

// Pantalla del mayorista (/mayorista/pedidos): tablero Nuevos / En preparación /
// En camino, historial paginado y hoja de preparación. Mantiene lo del
// tablero viejo: realtime con reconexión y resincronización, sonido,
// notificación del navegador, título que parpadea y PushToggle.

const DESTINO = 'fabrica'
const SELECT = '*, pedido_items(*), pedido_mensajes(*)'
const ACTIVOS: EstadoPedido[] = ['pendiente', 'preparando', 'enviado']

type Vista = 'tablero' | 'historial' | 'hoja'

const COLUMNAS: { estado: EstadoPedido; titulo: string; corto: string; icono: LucideIcon; vacio: string }[] = [
  { estado: 'pendiente',  titulo: 'Nuevos', corto: 'Nuevos',         icono: Clock,       vacio: 'No hay pedidos nuevos.' },
  { estado: 'preparando', titulo: 'En preparación', corto: 'Preparando', icono: PackageOpen, vacio: 'No estás preparando ninguno.' },
  { estado: 'enviado',    titulo: 'En camino', corto: 'En camino',      icono: Truck,       vacio: 'No hay pedidos en camino.' },
]

interface Props {
  pedidosIniciales: Pedido[]
  productos: Producto[]
  sucursales: string[]
  inicioVersion: string | null
  usuarioId: string
}

function ordenar(ps: Pedido[]) {
  return [...ps].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export default function PedidosMayoristaClient({ pedidosIniciales, productos, sucursales: sucursalesIniciales, inicioVersion, usuarioId }: Props) {
  const [supabase] = useState(() => createClient())
  const pathname = usePathname()
  const pedidoParam = useSearchParams().get('pedido')
  const [pedidos, setPedidos] = useState<Pedido[]>(() => ordenar(pedidosIniciales))
  const [nuevosIds, setNuevosIds] = useState<string[]>([])
  const [vista, setVista] = useState<Vista>('tablero')
  const [columnaMovil, setColumnaMovil] = useState<EstadoPedido>('pendiente')
  const [sucursal, setSucursal] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [detalle, setDetalle] = useState<Pedido | null>(null)
  const [eventos, setEventos] = useState<PedidoEvento[] | null>(null)
  const [vistos, setVistos] = useState<Record<string, number>>({})
  const [versionHistorial, setVersionHistorial] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const toast = useToasts()

  const pedidosRef = useRef(pedidos)
  const detalleIdRef = useRef<string | null>(null)
  const actualizarRef = useRef<() => void>(() => {})
  const tituloRef = useRef('')

  useEffect(() => { pedidosRef.current = pedidos }, [pedidos])
  useEffect(() => { detalleIdRef.current = detalle?.id ?? null }, [detalle])
  useEffect(() => {
    setVistos(leerVistos()) // eslint-disable-line react-hooks/set-state-in-effect
    prepararSonido() // Safari: el sonido se despierta con el primer toque
    tituloRef.current = document.title
    const iv = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])

  const leerPedido = useCallback(async (id: string): Promise<Pedido | null> => {
    const { data } = await supabase.from('pedidos').select(SELECT).eq('id', id).maybeSingle()
    return (data as Pedido | null) ?? null
  }, [supabase])

  const leerEventos = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('pedido_eventos').select('*').eq('pedido_id', id).order('created_at')
    if (detalleIdRef.current !== id) return
    if (error) { toast.error('No se pudieron cargar los movimientos del pedido.'); setEventos([]); return }
    setEventos((data ?? []) as PedidoEvento[])
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Mete el pedido actualizado en el tablero (o lo saca si se cerró) y en el detalle abierto. */
  const aplicarPedido = useCallback((p: Pedido) => {
    setPedidos(prev => {
      const sin = prev.filter(x => x.id !== p.id)
      return esCerrado(p.estado) ? sin : ordenar([...sin, p])
    })
    if (esCerrado(p.estado)) setVersionHistorial(v => v + 1)
    setDetalle(d => d?.id === p.id ? p : d)
  }, [])

  const recargar = useCallback(async (id: string) => {
    const p = await leerPedido(id)
    if (p) aplicarPedido(p)
    if (detalleIdRef.current === id) await leerEventos(id)
  }, [leerPedido, aplicarPedido, leerEventos])

  async function actualizar() {
    setActualizando(true)
    // Lo que había al arrancar la consulta: si falta en la respuesta es que
    // se cerró. Lo que llegó por realtime mientras tanto se conserva.
    const previos = new Set(pedidosRef.current.map(p => p.id))
    const { data, error } = await supabase.from('pedidos').select(SELECT)
      .eq('destino', DESTINO).in('estado', ACTIVOS).order('created_at')
    if (error) {
      toast.error('No se pudieron actualizar los pedidos. Revisá la conexión.')
    } else if (data) {
      const leidos = data as Pedido[]
      // Si el realtime venía muerto en silencio, esto detecta los pedidos que
      // llegaron sin avisar y los marca como nuevos recién ahora.
      const nuevos = leidos.filter(p => !previos.has(p.id) && p.estado === 'pendiente')
      const idsLeidos = new Set(leidos.map(p => p.id))
      setPedidos(prev => ordenar([...leidos, ...prev.filter(p => !idsLeidos.has(p.id) && !previos.has(p.id))]))
      setVersionHistorial(v => v + 1)
      if (nuevos.length > 0) {
        setNuevosIds(prev => [...new Set([...prev, ...nuevos.map(p => p.id)])])
        sonarAviso()
      }
      const abierto = detalleIdRef.current
      if (abierto) {
        const p = (data as Pedido[]).find(x => x.id === abierto) ?? await leerPedido(abierto)
        if (p) setDetalle(p)
        leerEventos(abierto)
      }
    }
    setActualizando(false)
  }
  useEffect(() => { actualizarRef.current = actualizar })

  // Red de seguridad: visibilidad, red y (abajo) reconexión del canal.
  const dispararActualizacion = useRefrescarAlVolver(() => actualizarRef.current?.())

  // Realtime: pedidos nuevos y cambios de estado, más eventos y mensajes en
  // vivo. Un solo canal para todo el tablero (RLS filtra lo que llega); el
  // chat del detalle abre el suyo, de a un pedido por vez.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let activo = true

    function conectar() {
      if (!activo) return
      // Topic único por intento: si se reconecta antes de que el `leave` del
      // canal anterior termine, supabase-js devolvería el mismo canal.
      const topic = `mayorista-${DESTINO}-${Math.random().toString(36).slice(2)}`
      const ch = supabase.channel(topic)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `destino=eq.${DESTINO}` }, async payload => {
          const p = await leerPedido(payload.new.id as string)
          if (!p || esCerrado(p.estado)) return
          setPedidos(prev => prev.some(x => x.id === p.id) ? prev : ordenar([...prev, p]))
          setNuevosIds(prev => prev.includes(p.id) ? prev : [...prev, p.id])
          sonarAviso()
          notificarNavegador(p)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `destino=eq.${DESTINO}` }, payload => {
          const cambio = payload.new as Pedido
          const actual = pedidosRef.current.find(p => p.id === cambio.id)
          if (actual) {
            aplicarPedido({ ...actual, ...cambio })
          } else if (!esCerrado(cambio.estado)) {
            leerPedido(cambio.id).then(p => { if (p) aplicarPedido(p) })
          } else {
            setVersionHistorial(v => v + 1)
          }
          if (detalleIdRef.current === cambio.id) setDetalle(d => d ? { ...d, ...cambio } : d)
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedido_eventos' }, payload => {
          const ev = payload.new as PedidoEvento
          if (detalleIdRef.current === ev.pedido_id) {
            setEventos(prev => prev && !prev.some(e => e.id === ev.id) ? [...prev, ev] : prev)
          }
          // Una edición cambia los ítems: se vuelven a leer.
          if (ev.tipo === 'editado' && pedidosRef.current.some(p => p.id === ev.pedido_id)) {
            leerPedido(ev.pedido_id).then(p => { if (p) aplicarPedido(p) })
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedido_mensajes' }, payload => {
          const m = payload.new as PedidoMensaje
          const agregar = (p: Pedido) => p.id !== m.pedido_id || (p.pedido_mensajes ?? []).some(x => x.id === m.id)
            ? p : { ...p, pedido_mensajes: [...(p.pedido_mensajes ?? []), m] }
          setPedidos(prev => prev.map(agregar))
          setDetalle(d => d ? agregar(d) : d)
        })
      channel = ch
      ch.subscribe(status => {
        // Solo el canal vigente: removeChannel vuelve a avisar CLOSED, y sin
        // este corte se reconectaría en bucle (o después de desmontar).
        if (channel !== ch) return
        // El socket puede caerse en silencio; cuando lo reporta,
        // reconectamos y resincronizamos lo que se perdió.
        // También en la primera suscripción: cubre lo que entró entre el
        // render del servidor y este momento.
        if (status === 'SUBSCRIBED') dispararActualizacion()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channel = null
          supabase.removeChannel(ch)
          retryTimer = setTimeout(conectar, 3000)
        }
      })
    }
    conectar()

    return () => {
      activo = false
      if (retryTimer) clearTimeout(retryTimer)
      const ch = channel
      channel = null
      if (ch) supabase.removeChannel(ch)
    }
  }, [supabase, dispararActualizacion, leerPedido, aplicarPedido])

  // Título que parpadea mientras haya pedidos nuevos sin abrir.
  useEffect(() => {
    if (nuevosIds.length === 0) return
    const n = nuevosIds.length
    const msg = `(${n}) Pedido${n > 1 ? 's' : ''} nuevo${n > 1 ? 's' : ''}`
    let alterna = true
    document.title = msg
    const iv = setInterval(() => {
      document.title = alterna ? msg : 'Pedidos — YA! Chipacitos'
      alterna = !alterna
    }, 1000)
    return () => {
      clearInterval(iv)
      document.title = tituloRef.current
    }
  }, [nuevosIds])

  function abrir(p: Pedido) {
    setDetalle(p)
    setEventos(null)
    detalleIdRef.current = p.id
    leerEventos(p.id)
    setNuevosIds(prev => prev.filter(id => id !== p.id))
    // Los mensajes quedan leídos al abrir el chat (BotonChat), no al abrir el pedido.
  }

  function cerrarDetalle() {
    setDetalle(null)
    setEventos(null)
    // Que recargar la página no lo vuelva a abrir. replaceState (integrado al router de
    // Next) saca el ?pedido= sin volver a pedir la página: router.replace la releía entera
    // y en el tablero la dirección quedaba sin cambiar.
    if (pedidoParam) window.history.replaceState(null, '', pathname)
  }

  // ?pedido=<id> (al tocar una notificación): se abre ese pedido. Si no está en el
  // tablero (por ejemplo ya se recibió), se lee aparte.
  const atendidoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pedidoParam) { atendidoRef.current = null; return }
    if (atendidoRef.current === pedidoParam) return
    atendidoRef.current = pedidoParam
    const enTablero = pedidos.find(p => p.id === pedidoParam)
    // Abrir el detalle responde a un cambio de la dirección (algo externo): va en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enTablero) { abrir(enTablero); return }
    supabase.from('pedidos').select(SELECT).eq('id', pedidoParam).maybeSingle()
      .then(({ data }) => { if (data && atendidoRef.current === pedidoParam) abrir(data as Pedido) })
  }, [pedidoParam, pedidos, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const sucursales = useMemo(
    () => [...new Set([...sucursalesIniciales, ...pedidos.map(p => p.local_nombre)])].sort((a, b) => a.localeCompare(b, 'es')),
    [sucursalesIniciales, pedidos],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pedidos.filter(p =>
      (sucursal === 'todas' || p.local_nombre === sucursal) &&
      (!q || String(p.numero).includes(q) || p.local_nombre.toLowerCase().includes(q) ||
        (p.pedido_items ?? []).some(i => i.producto_nombre.toLowerCase().includes(q))),
    )
  }, [pedidos, sucursal, busqueda])

  const porColumna = useMemo(() => {
    const r: Record<string, Pedido[]> = { pendiente: [], preparando: [], enviado: [] }
    for (const p of filtrados) r[p.estado]?.push(p)
    // En camino: lo último que salió arriba.
    r.enviado.sort((a, b) => new Date(b.enviado_at ?? b.created_at).getTime() - new Date(a.enviado_at ?? a.created_at).getTime())
    return r
  }, [filtrados])

  const nuevosVisibles = pedidos.filter(p => nuevosIds.includes(p.id))

  const VISTAS: { key: Vista; label: string; corto: string; icono: LucideIcon }[] = [
    { key: 'tablero', label: 'Tablero', corto: 'Tablero', icono: LayoutGrid },
    { key: 'hoja', label: 'Hoja de preparación', corto: 'Hoja', icono: ClipboardList },
    { key: 'historial', label: 'Historial', corto: 'Historial', icono: History },
  ]

  return (
    <div className="w-full space-y-4 px-4 py-4 lg:px-8 lg:py-6">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />

      <PushToggle
        descripcionActivar="Te avisamos cuando llegue un pedido nuevo, aunque cierres la pestaña."
        descripcionActiva="Este dispositivo recibe el aviso de pedidos nuevos aunque cierres la pestaña."
      />

      {nuevosVisibles.length > 0 && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card border-2 border-brand-red bg-danger-bg px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <BellRing size={18} className="mt-0.5 shrink-0 text-brand-red" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-red">
                {nuevosVisibles.length} pedido{nuevosVisibles.length > 1 ? 's' : ''} nuevo{nuevosVisibles.length > 1 ? 's' : ''} sin abrir
              </p>
              <p className="mt-0.5 truncate text-xs text-brand-red/80">
                {nuevosVisibles.map(p => `#${p.numero} ${p.local_nombre}`).join(' · ')}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setNuevosIds([])} aria-label="Marcar como vistos" title="Marcar como vistos"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-red hover:bg-brand-red/10">
            <X size={18} />
          </button>
        </div>
      )}

      {/* En el celular: renglón 1 = vistas + actualizar; renglón 2 = sucursal + búsqueda.
          Sin scroll horizontal: las vistas reparten el ancho y usan el nombre corto. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 lg:w-auto">
          <div role="tablist" aria-label="Vista" className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1 lg:flex lg:flex-none">
            {VISTAS.map(v => {
              const Icono = v.icono
              const activa = vista === v.key
              return (
                <button key={v.key} type="button" role="tab" aria-selected={activa} aria-label={v.label} onClick={() => setVista(v.key)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                    activa ? 'bg-accent text-black' : 'text-muted hover:bg-surface2 hover:text-text'
                  }`}>
                  <Icono size={15} aria-hidden className="shrink-0" />
                  <span className="sm:hidden">{v.corto}</span>
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => actualizar()} disabled={actualizando} aria-label="Actualizar" title="Actualizar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:border-accent hover:text-accent disabled:opacity-50 lg:order-last">
            <RefreshCw size={16} className={actualizando ? 'animate-spin' : ''} />
          </button>
        </div>

        {vista !== 'historial' && (
          <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
            <select value={sucursal} onChange={e => setSucursal(e.target.value)} aria-label="Sucursal"
              className="w-auto max-w-[45%] shrink-0 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none lg:max-w-none">
              <option value="todas">Todas las sucursales</option>
              {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {vista === 'tablero' && (
              <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar…" className="min-w-0 flex-1" />
            )}
          </div>
        )}
      </div>

      {vista === 'tablero' && (
        <>
          {/* Debajo de lg (tablet y celular) las columnas pasan a pestañas. */}
          <div role="tablist" aria-label="Estado" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1 lg:hidden">
            {COLUMNAS.map(c => {
              const activa = columnaMovil === c.estado
              const n = porColumna[c.estado].length
              return (
                <button key={c.estado} type="button" role="tab" aria-selected={activa} onClick={() => setColumnaMovil(c.estado)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${
                    activa ? 'bg-surface2 text-text' : 'text-muted hover:text-text'
                  }`}>
                  <span className="truncate">{c.corto}</span>
                  <span className={`rounded-full px-1.5 text-2xs font-bold ${activa ? 'bg-accent text-black' : 'bg-surface2 text-muted'}`}>{n}</span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNAS.map(c => {
              const lista = porColumna[c.estado]
              const Icono = c.icono
              return (
                <section key={c.estado} aria-label={c.titulo}
                  className={`min-w-0 space-y-3 lg:block ${columnaMovil === c.estado ? 'block' : 'hidden'}`}>
                  <header className="hidden items-center gap-2 lg:flex">
                    <Icono size={16} className="text-muted" aria-hidden />
                    <h2 className="text-sm font-semibold text-text">{c.titulo}</h2>
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-bold text-muted">{lista.length}</span>
                  </header>
                  {lista.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border">
                      <EmptyState icono={busqueda || sucursal !== 'todas' ? Inbox : Icono}
                        titulo={busqueda || sucursal !== 'todas' ? 'Sin resultados con estos filtros' : c.vacio} />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {lista.map(p => (
                        <TarjetaPedido key={p.id} pedido={p} ahora={ahora}
                          nuevo={nuevosIds.includes(p.id)}
                          sinLeer={mensajesSinLeer(p.pedido_mensajes, usuarioId, vistos[p.id])}
                          onAbrir={() => abrir(p)} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}

      {vista === 'hoja' && <HojaPreparacion pedidos={pedidos} productos={productos} sucursal={sucursal} />}

      {vista === 'historial' && (
        <HistorialPedidos destino={DESTINO} sucursales={sucursales} inicioVersion={inicioVersion}
          version={versionHistorial} onAbrir={abrir} />
      )}

      {detalle && (
        <DetallePedidoModal key={detalle.id} pedido={detalle} eventos={eventos} productos={productos}
          usuarioId={usuarioId} onClose={cerrarDetalle} onRecargar={recargar} toast={toast}
          sinLeer={mensajesSinLeer(detalle.pedido_mensajes, usuarioId, vistos[detalle.id])}
          onChatVisto={() => setVistos(v => marcarVisto(v, detalle.id))} />
      )}
    </div>
  )
}
