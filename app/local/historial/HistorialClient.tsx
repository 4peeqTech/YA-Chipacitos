'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronRight, ClipboardList, Pencil, Plus, SearchX, TriangleAlert, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Pedido, PedidoEvento } from '@/lib/types'
import { useRefrescarAlVolver } from '@/lib/hooks/useRefrescarAlVolver'
import SearchInput from '@/components/ui/SearchInput'
import DateRangeInputs from '@/components/ui/DateRangeInputs'
import EmptyState from '@/components/ui/EmptyState'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ProveedorUI'
import EstadoPedidoBadge from '@/components/pedidos/compartido/EstadoPedidoBadge'
import AvisoVersionAnterior, { MarcaVersionAnterior } from '@/components/pedidos/compartido/AvisoVersionAnterior'
import DetallePedido from './DetallePedido'
import { buscarPedidosCerrados } from './acciones'
import { ESTADOS_EN_CURSO, SELECT_PEDIDO, type FiltroCerrados, type PaginaCerrados } from './consultas'
import { cantidadProductos, fabricaCambio, fechaCorta, nombreDestino } from './utilidades'

type Filtro = 'en_curso' | 'recibido' | 'cancelado' | 'todos'

const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'en_curso', label: 'En curso' },
  { value: 'recibido', label: 'Recibidos' },
  { value: 'cancelado', label: 'Cancelados' },
  { value: 'todos', label: 'Todos' },
]

const CLAVE_INICIAL = 'todos|||'

function esEnCurso(p: Pedido) {
  return (ESTADOS_EN_CURSO as readonly string[]).includes(p.estado)
}

function porFechaDesc(a: Pedido, b: Pedido) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

/** Fecha del pedido como YYYY-MM-DD en Argentina, para comparar con el filtro. */
function diaAr(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

interface FiltroTexto { q: string; desde: string; hasta: string }

/** Búsqueda (número o producto) y fechas, igual que la consulta del servidor. */
function coincideTexto(p: Pedido, f: FiltroTexto) {
  if (f.desde && diaAr(p.created_at) < f.desde) return false
  if (f.hasta && diaAr(p.created_at) > f.hasta) return false
  const texto = f.q.trim().toLowerCase()
  if (!texto) return true
  if (/^\d+$/.test(texto)) return p.numero === Number(texto)
  return (p.pedido_items ?? []).some(i => i.producto_nombre.toLowerCase().includes(texto))
}

interface Props {
  usuarioId: string
  enCursoIniciales: Pedido[]
  cerradosIniciales: PaginaCerrados | null
  errorCarga: boolean
}

export default function HistorialClient({ usuarioId, enCursoIniciales, cerradosIniciales, errorCarga }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [supabase] = useState(() => createClient())

  const [enCurso, setEnCurso] = useState(enCursoIniciales)
  const [cerrados, setCerrados] = useState<Pedido[]>(cerradosIniciales?.pedidos ?? [])
  const [hayMas, setHayMas] = useState(cerradosIniciales?.hayMas ?? false)
  const [filtro, setFiltro] = useState<Filtro>(enCursoIniciales.length > 0 ? 'en_curso' : 'todos')
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [verFechas, setVerFechas] = useState(false)
  const [claveCargada, setClaveCargada] = useState(CLAVE_INICIAL)
  // Filtro con el que se cargó `cerrados` (lo usa el realtime para decidir si
  // un pedido entra en la lista) y cuántas filas trajo el servidor: el offset
  // de "Ver más" no depende de lo que agregue o saque el realtime.
  const filtroCargadoRef = useRef<FiltroTexto & { estado: FiltroCerrados }>({ estado: 'todos', q: '', desde: '', hasta: '' })
  const [offsetServidor, setOffsetServidor] = useState(cerradosIniciales?.pedidos.length ?? 0)
  const [cargando, setCargando] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [abierto, setAbierto] = useState<{ id: string; modo: 'detalle' | 'diferencias' } | null>(null)
  const [versionEventos, setVersionEventos] = useState<Record<string, number>>({})

  const estadoCerrados: FiltroCerrados = filtro === 'recibido' || filtro === 'cancelado' ? filtro : 'todos'
  const clave = `${estadoCerrados}|${q.trim()}|${desde}|${hasta}`
  const necesitaCerrados = filtro !== 'en_curso'

  // El server component es la fuente de verdad: tras un router.refresh() llegan
  // props nuevas y se resincroniza durante el render (no en un efecto).
  const [propsVistas, setPropsVistas] = useState({ enCursoIniciales, cerradosIniciales })
  if (propsVistas.enCursoIniciales !== enCursoIniciales || propsVistas.cerradosIniciales !== cerradosIniciales) {
    setPropsVistas({ enCursoIniciales, cerradosIniciales })
    setEnCurso(enCursoIniciales)
    if (cerradosIniciales && claveCargada === CLAVE_INICIAL) {
      const nuevos = new Map(cerradosIniciales.pedidos.map(p => [p.id, p]))
      setCerrados(prev => [...nuevos.values(), ...prev.filter(p => !nuevos.has(p.id))].sort(porFechaDesc))
    }
  }

  // Historial filtrado del lado del servidor (paginado con range()).
  useEffect(() => {
    if (!necesitaCerrados || clave === claveCargada) return
    let vigente = true
    const t = setTimeout(async () => {
      setCargando(true)
      const r = await buscarPedidosCerrados({ estado: estadoCerrados, q: q.trim(), desde, hasta })
      if (!vigente) return
      setCargando(false)
      if (!r.ok) return toast.error(r.error)
      setCerrados(r.data.pedidos)
      setHayMas(r.data.hayMas)
      setOffsetServidor(r.data.pedidos.length)
      filtroCargadoRef.current = { estado: estadoCerrados, q: q.trim(), desde, hasta }
      setClaveCargada(clave)
    }, 350)
    return () => { vigente = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, necesitaCerrados])

  async function cargarMas() {
    setCargandoMas(true)
    const r = await buscarPedidosCerrados({ estado: estadoCerrados, q: q.trim(), desde, hasta, offset: offsetServidor })
    setCargandoMas(false)
    if (!r.ok) return toast.error(r.error)
    setCerrados(prev => {
      const vistos = new Set(prev.map(p => p.id))
      return [...prev, ...r.data.pedidos.filter(p => !vistos.has(p.id))]
    })
    setOffsetServidor(o => o + r.data.pedidos.length)
    setHayMas(r.data.hayMas)
  }

  // Trae de nuevo un pedido y lo ubica en la lista que corresponde.
  const recargarPedido = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('pedidos').select(SELECT_PEDIDO).eq('id', id).maybeSingle()
    if (error) return
    const p = data as Pedido | null
    setEnCurso(prev => {
      const resto = prev.filter(x => x.id !== id)
      return p && esEnCurso(p) ? [...resto, p].sort(porFechaDesc) : resto
    })
    // A cerrados entra solo si cumple el filtro con el que se cargó la lista;
    // si no lo cumple (o ya no se ve), sale.
    const f = filtroCargadoRef.current
    setCerrados(prev => {
      const resto = prev.filter(x => x.id !== id)
      const entra = p && !esEnCurso(p) && (f.estado === 'todos' || p.estado === f.estado) && coincideTexto(p, f)
      return entra ? [...resto, p].sort(porFechaDesc) : resto
    })
  }, [supabase])

  // Para los avisos en vivo: número del pedido a partir del id.
  const numerosRef = useRef(new Map<string, number>())
  useEffect(() => {
    numerosRef.current = new Map([...enCurso, ...cerrados].map(p => [p.id, p.numero]))
  }, [enCurso, cerrados])

  useEffect(() => {
    // Los callbacks de un canal que ya no es el vigente (desmontado o StrictMode)
    // se ignoran; nunca se reconecta ni se llama a removeChannel desde subscribe.
    let activo = true
    const canal = supabase
      .channel(`mis-pedidos-${usuarioId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `local_id=eq.${usuarioId}` }, payload => {
        if (!activo) return
        const id = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id
        // El estado nuevo se ve al instante con lo que trae el cambio; después se
        // relee el pedido completo (ítems, y si pasa de "en curso" a cerrado).
        const nuevo = payload.new as Partial<Pedido> | undefined
        if (id && nuevo?.estado) setEnCurso(prev => prev.map(x => x.id === id ? { ...x, ...nuevo, pedido_items: x.pedido_items } : x))
        if (id) recargarPedido(id)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedido_eventos' }, payload => {
        if (!activo) return
        const ev = payload.new as PedidoEvento
        setVersionEventos(prev => ({ ...prev, [ev.pedido_id]: (prev[ev.pedido_id] ?? 0) + 1 }))
        recargarPedido(ev.pedido_id)
        if (ev.autor_id === usuarioId) return
        const numero = numerosRef.current.get(ev.pedido_id)
        const n = numero != null ? ` #${numero}` : ''
        if (ev.tipo === 'editado') toast.success(`El mayorista cambió el pedido${n}. Tocá el pedido para ver qué cambió.`)
        else if (ev.tipo === 'enviado') toast.success(`El pedido${n} salió: está en camino.`)
        else if (ev.tipo === 'cancelado') toast.error(`Se canceló el pedido${n}.`)
        // El número de "en camino" del menú lo arma el layout.
        if (ev.tipo === 'enviado' || ev.tipo === 'recibido' || ev.tipo === 'recibido_con_diferencias') router.refresh()
      })
      .subscribe(estado => { if (activo && estado === 'CHANNEL_ERROR') router.refresh() })
    return () => { activo = false; supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, supabase, recargarPedido])

  // Red de seguridad si el WebSocket se cae en silencio.
  useRefrescarAlVolver(() => router.refresh())

  function alCambiar(id: string) {
    recargarPedido(id)
    setVersionEventos(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
    router.refresh()
  }

  // En curso: siempre están todos cargados, se filtran acá.
  const texto = q.trim().toLowerCase()
  const enCursoFiltrados = enCurso.filter(p => coincideTexto(p, { q, desde, hasta }))
  const lista = filtro === 'en_curso' ? enCursoFiltrados : filtro === 'todos' ? [...enCursoFiltrados, ...cerrados] : cerrados
  const mostrandoCerrados = necesitaCerrados && clave === claveCargada
  const hayFiltros = !!(texto || desde || hasta)
  const pedidoAbierto = abierto ? [...enCurso, ...cerrados].find(p => p.id === abierto.id) ?? null : null
  const enCaminoSinConfirmar = enCurso.filter(p => p.estado === 'enviado').length

  return (
    <div className="w-full space-y-4 px-4 py-4 lg:px-8 lg:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-text">Mis pedidos</h1>
          {enCaminoSinConfirmar > 0 && (
            <p className="text-xs text-accent2">
              {enCaminoSinConfirmar === 1 ? '1 pedido en camino para confirmar' : `${enCaminoSinConfirmar} pedidos en camino para confirmar`}
            </p>
          )}
        </div>
        <Link
          href="/local/pedidos"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-black active:opacity-80"
        >
          <Plus size={15} aria-hidden />
          Nuevo pedido
        </Link>
      </div>

      <div className="flex gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Número o producto" className="flex-1 min-w-0" />
        <button
          type="button"
          onClick={() => setVerFechas(v => !v)}
          aria-expanded={verFechas}
          aria-label="Filtrar por fecha"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
            desde || hasta ? 'border-accent bg-accent-bg text-accent' : 'border-border bg-surface2 text-muted'
          }`}
        >
          <CalendarDays size={16} aria-hidden />
          <span className="hidden sm:inline">Fecha</span>
        </button>
      </div>

      {verFechas && (
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeInputs desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} className="min-w-0 [&_input]:min-w-0 [&_input]:flex-1" />
          {(desde || hasta) && (
            <button type="button" onClick={() => { setDesde(''); setHasta('') }} className="text-xs text-muted underline underline-offset-2 hover:text-text">
              Quitar fechas
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <Chip key={f.value} active={filtro === f.value} onClick={() => setFiltro(f.value)}>
            {f.label}{f.value === 'en_curso' && enCurso.length > 0 ? ` · ${enCurso.length}` : ''}
          </Chip>
        ))}
      </div>

      {errorCarga && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-brand-red/40 bg-danger-bg px-3 py-2 text-sm text-brand-red">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          No se pudieron cargar todos tus pedidos. Recargá la página en un momento.
        </p>
      )}

      {filtro !== 'en_curso' && <AvisoVersionAnterior />}

      {necesitaCerrados && (cargando || !mostrandoCerrados) && filtro !== 'todos' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : lista.length === 0 ? (
        hayFiltros ? (
          <EmptyState icono={SearchX} titulo="Sin resultados" descripcion="No hay pedidos con esa búsqueda o esas fechas." />
        ) : filtro === 'en_curso' ? (
          <EmptyState
            icono={ClipboardList}
            titulo="No tenés pedidos en curso"
            descripcion="Los pedidos que mandes aparecen acá hasta que confirmes que llegaron."
            accion={<button type="button" onClick={() => setFiltro('todos')} className="text-sm font-semibold text-accent underline underline-offset-2">Ver todos mis pedidos</button>}
          />
        ) : (
          <EmptyState icono={ClipboardList} titulo="Todavía no hay pedidos acá" />
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map(p => (
            <TarjetaPedido
              key={p.id}
              pedido={p}
              onAbrir={() => setAbierto({ id: p.id, modo: 'detalle' })}
            />
          ))}
        </div>
      )}

      {necesitaCerrados && mostrandoCerrados && hayMas && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={cargarMas}
            disabled={cargandoMas}
            className="rounded-xl border border-border bg-surface2 px-4 py-2.5 text-sm font-semibold text-text disabled:opacity-50"
          >
            {cargandoMas ? 'Cargando…' : 'Ver más pedidos'}
          </button>
        </div>
      )}
      {filtro === 'todos' && cargando && <p className="text-center text-xs text-faint">Buscando en el historial…</p>}

      <DetallePedido
        pedido={pedidoAbierto}
        usuarioId={usuarioId}
        versionEventos={abierto ? versionEventos[abierto.id] ?? 0 : 0}
        modoInicial={abierto?.modo}
        onCerrar={() => setAbierto(null)}
        onCambio={alCambiar}
      />
    </div>
  )
}

function TarjetaPedido({ pedido, onAbrir }: { pedido: Pedido; onAbrir: () => void }) {
  const cambio = fabricaCambio(pedido)
  const n = cantidadProductos(pedido)
  const enCamino = pedido.estado === 'enviado'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }}
      className={`cursor-pointer rounded-card border bg-surface p-4 text-left transition-colors hover:border-accent/40 focus-visible:border-accent focus-visible:outline-none ${
        enCamino ? 'border-accent2/50' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-text">Pedido #{pedido.numero}</p>
          <p className="mt-0.5 text-xs text-muted">
            {nombreDestino(pedido.destino)} · {fechaCorta(pedido.created_at)} · {n === 1 ? '1 producto' : `${n} productos`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EstadoPedidoBadge estado={pedido.estado} />
          <ChevronRight size={16} className="text-faint" aria-hidden />
        </div>
      </div>

      {(cambio || pedido.recepcion_con_diferencias || pedido.version_anterior || pedido.cierre_automatico) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {cambio && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
              <Pencil size={11} aria-hidden />
              {pedido.destino === 'deposito' ? 'Depósito' : 'El mayorista'} cambió el pedido
            </span>
          )}
          {pedido.recepcion_con_diferencias && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
              <TriangleAlert size={11} aria-hidden />
              Recibido con diferencias
            </span>
          )}
          <MarcaVersionAnterior pedido={pedido} />
        </div>
      )}

      {enCamino && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onAbrir() }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-bold text-black active:opacity-80"
        >
          <Truck size={17} aria-hidden />
          Confirmar recepción
        </button>
      )}
    </div>
  )
}
