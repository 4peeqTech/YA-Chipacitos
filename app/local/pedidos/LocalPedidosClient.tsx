'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, History, PackageSearch, Search, Send, ShoppingBasket, Star, Trash2, X } from 'lucide-react'
import type { Producto } from '@/lib/types'
import { crearPedido } from '@/lib/pedidos/acciones'
import { formatoCantidad } from '@/lib/pedidos/estados'
import { estiloCategoria, ordenCategoria } from '@/lib/pedidos/categorias'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import PushToggle from '@/components/ui/PushToggle'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import CampoCantidad from './CampoCantidad'
import { unidadVisible } from '@/lib/pedidos/unidad'
import { parseCantidad } from '../cantidad'
import { useCarritoGuardado, type CarritoGuardado } from './useCarritoGuardado'

export interface UltimoPedido {
  numero: number
  pedido_items: { producto_id: string | null; producto_nombre: string; cantidad: number; origen?: string | null }[]
}

/** Un producto de "Tus habituales", con lo que se pidió la última vez (null si no hay historial). */
export interface Habitual { productoId: string; ultimaCantidad: number | null }

interface Props {
  usuarioId: string
  /** Productos del mayorista, con stock o sin stock (activo = false). */
  productos: Producto[]
  habituales: Habitual[]
  ultimoPedido: UltimoPedido | null
  /** Falló la consulta del último pedido: Repetir se muestra deshabilitado. */
  errorUltimoPedido?: boolean
}

interface Linea { producto: Producto; cantidad: number }

const SIN_CATEGORIA = 'Sin categoría'

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`
}

function redondear(n: number) {
  return Math.round(n * 1000) / 1000
}

export default function LocalPedidosClient({ usuarioId, productos, habituales, ultimoPedido, errorUltimoPedido = false }: Props) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [carrito, actualizarCarrito] = useCarritoGuardado(`ya-carrito-local-${usuarioId}`)
  const [busqueda, setBusqueda] = useState('')
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const idsHabituales = useMemo(() => new Set(habituales.map(h => h.productoId)), [habituales])

  // Solo se cargan productos con stock: las líneas guardadas de un producto
  // que se quedó sin stock (o se borró) se ignoran.
  const lineas: Linea[] = carrito.lineas
    .map(l => ({ producto: porId.get(l.producto_id), cantidad: l.cantidad }))
    .filter((l): l is Linea => !!l.producto && l.producto.activo)
  const cantidadEnCarrito = (id: string) => lineas.find(l => l.producto.id === id)?.cantidad ?? 0

  // "código*cantidad" (ej. 12*1,5) + Enter suma esa cantidad al producto.
  const atajo = busqueda.trim().match(/^(\d+)\*(\d+(?:[.,]\d*)?)$/)
  const texto = (atajo ? atajo[1] : busqueda.trim()).toLowerCase()
  const esCodigo = /^\d+$/.test(texto)
  const coincide = (p: Producto) => {
    if (!texto) return true
    if (esCodigo) return p.codigo != null && String(p.codigo) === texto
    return p.nombre.toLowerCase().includes(texto) || (p.categoria || '').toLowerCase().includes(texto)
  }

  const habitualesVisibles = habituales
    .map(h => ({ ...h, producto: porId.get(h.productoId) }))
    .filter((h): h is Habitual & { producto: Producto } => !!h.producto && coincide(h.producto))
  // El resto, por categoría (lo que más se pide primero) y sin repetir los habituales.
  const resto = productos.filter(p => !idsHabituales.has(p.id) && coincide(p))
  const grupos = [...new Set(resto.map(p => p.categoria || SIN_CATEGORIA))]
    .sort((a, b) => ordenCategoria(a) - ordenCategoria(b) || a.localeCompare(b, 'es'))
    .map(cat => [cat, resto.filter(p => (p.categoria || SIN_CATEGORIA) === cat)] as const)
  const sinResultados = habitualesVisibles.length === 0 && resto.length === 0

  function setCantidad(productoId: string, cantidad: number) {
    actualizarCarrito(c => {
      const otras = c.lineas.filter(l => l.producto_id !== productoId)
      if (!(cantidad > 0)) return { ...c, lineas: otras }
      const existe = c.lineas.some(l => l.producto_id === productoId)
      return {
        ...c,
        lineas: existe
          ? c.lineas.map(l => (l.producto_id === productoId ? { ...l, cantidad } : l))
          : [...c.lineas, { producto_id: productoId, cantidad }],
      }
    })
  }

  function setNotas(notas: string) {
    actualizarCarrito(c => ({ ...c, notas }))
  }

  function alPresionarEnter() {
    const candidatos = productos.filter(coincide)
    if (candidatos.length !== 1) return
    const p = candidatos[0]
    if (!p.activo) return toast.error(`${p.nombre} está sin stock por ahora.`)
    const sumar = atajo ? parseCantidad(atajo[2]) : 1
    if (sumar == null) return
    // código*0 saca el producto del carrito (si estaba); no suma nada.
    setCantidad(p.id, sumar === 0 ? 0 : redondear(cantidadEnCarrito(p.id) + sumar))
    setBusqueda('')
  }

  function cargarUltimoPedido() {
    if (!ultimoPedido) return
    const pedidos = ultimoPedido.pedido_items.filter(i => (!i.origen || i.origen === 'pedido') && Number(i.cantidad) > 0)
    const cargados: CarritoGuardado['lineas'] = []
    const afuera: string[] = []
    for (const i of pedidos) {
      const p = i.producto_id ? porId.get(i.producto_id) : undefined
      if (p?.activo) cargados.push({ producto_id: p.id, cantidad: Number(i.cantidad) })
      else afuera.push(i.producto_nombre)
    }
    if (cargados.length === 0) {
      toast.error(`No se pudo repetir el pedido #${ultimoPedido.numero}: ninguno de sus productos tiene stock por ahora.`)
      return
    }
    actualizarCarrito(c => ({ ...c, lineas: cargados }))
    toast.success(`Cargamos ${plural(cargados.length, 'producto', 'productos')} del pedido #${ultimoPedido.numero}.`)
    if (afuera.length > 0) toast.error(`Quedaron afuera porque no tienen stock por ahora: ${afuera.join(', ').replace(/\.$/, '')}.`)
  }

  function repetir() {
    if (lineas.length === 0) return cargarUltimoPedido()
    confirmar({
      titulo: 'Repetir el último pedido',
      mensaje: 'Se reemplaza lo que tenés en el pedido por los productos de tu último pedido. Las observaciones quedan como están.',
      textoConfirmar: 'Reemplazar',
      onConfirmar: cargarUltimoPedido,
    })
  }

  function vaciar() {
    confirmar({
      titulo: 'Vaciar el pedido',
      mensaje: 'Se sacan todos los productos y las observaciones.',
      textoConfirmar: 'Vaciar',
      peligroso: true,
      onConfirmar: () => {
        actualizarCarrito(() => ({ lineas: [], notas: '' }))
        setCarritoAbierto(false)
      },
    })
  }

  function abrirResumen() {
    if (lineas.length === 0) return
    setCarritoAbierto(false)
    setResumenAbierto(true)
  }

  async function enviar() {
    if (lineas.length === 0 || enviando) return
    setEnviando(true)
    const r = await crearPedido(
      lineas.map(l => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      carrito.notas.trim() || null,
    )
    setEnviando(false)
    if (!r.ok) {
      // No se creó nada: el pedido queda como estaba para reintentar.
      toast.error(r.error)
      return
    }
    actualizarCarrito(() => ({ lineas: [], notas: '' }))
    setResumenAbierto(false)
    const numeros = r.data.map(p => `#${p.numero}`).join(' y ')
    toast.success(
      r.data.length > 1 ? `Pedidos ${numeros} enviados.` : `Pedido ${numeros} enviado.`,
      { label: 'Ver en Mis pedidos', href: '/local/historial' },
    )
    if (r.advertencia) toast.error(r.advertencia)
  }

  const panel = (conTitulo = true) => (
    <PanelCarrito
      conTitulo={conTitulo}
      lineas={lineas}
      notas={carrito.notas}
      onCantidad={setCantidad}
      onNotas={setNotas}
      onEnviar={abrirResumen}
      onVaciar={vaciar}
    />
  )

  return (
    <div className={`w-full px-4 py-4 lg:px-8 lg:py-6 ${lineas.length > 0 ? 'pb-24 lg:pb-6' : ''}`}>
      <div className="lg:flex lg:items-start lg:gap-6">
        <section className="flex-1 min-w-0 space-y-5">
          <PushToggle
            descripcionActivar="Te avisamos cuando tu pedido salga en camino, aunque cierres la pestaña."
            descripcionActiva="Este dispositivo recibe el aviso cuando tu pedido sale en camino."
          />

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-text">Pedido al mayorista</h1>
              <p className="text-xs text-muted">Escribí la cantidad y el producto entra al pedido.</p>
            </div>
            {(ultimoPedido || errorUltimoPedido) && (
              <button
                type="button"
                onClick={repetir}
                disabled={!ultimoPedido}
                title={!ultimoPedido ? 'No se pudo leer tu último pedido. Recargá la página para volver a intentar.' : undefined}
                className="shrink-0 inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface2 px-3 text-xs font-semibold text-text hover:border-accent/50 active:opacity-70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
              >
                <History size={15} aria-hidden />
                Repetir el último
              </button>
            )}
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') alPresionarEnter() }}
              placeholder="Nombre o código (12*3 + Enter)"
              aria-label="Buscar producto"
              enterKeyHint="done"
              className="h-11 w-full rounded-xl border border-border bg-surface2 pl-9 pr-10 text-sm text-text focus:border-accent focus:outline-none"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {productos.length === 0 ? (
            <EmptyState icono={PackageSearch} titulo="No hay productos para pedir" descripcion="El mayorista todavía no cargó productos. Avisale a administración." />
          ) : sinResultados ? (
            <EmptyState icono={PackageSearch} titulo="Sin resultados" descripcion="Probá con otro nombre o código." />
          ) : (
            <>
              {habitualesVisibles.length > 0 && (
                <div className="space-y-2">
                  <h2 className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent">
                    <Star size={13} aria-hidden />
                    Tus habituales
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {habitualesVisibles.map(h => (
                      <TarjetaHabitual
                        key={h.productoId}
                        producto={h.producto}
                        ultimaCantidad={h.ultimaCantidad}
                        cantidad={cantidadEnCarrito(h.productoId)}
                        onCantidad={n => setCantidad(h.productoId, n)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {grupos.map(([cat, prods]) => (
                <div key={cat} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-muted">
                    <IconoCategoria categoria={cat} chico />
                    {cat}
                  </h2>
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                    {prods.map(p => (
                      <FilaProducto key={p.id} producto={p} cantidad={cantidadEnCarrito(p.id)} onCantidad={n => setCantidad(p.id, n)} />
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </section>

        {/* Escritorio: fijo a la derecha, debajo del header sticky de LayoutOperativo (≈58px). */}
        <aside className="hidden lg:block w-96 shrink-0 sticky top-[74px] max-h-[calc(100vh-74px-5rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-4">
          {panel()}
        </aside>
      </div>

      {/* Celular: barra sobre el menú de abajo que abre el pedido. */}
      {lineas.length > 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[57px] z-40 border-t border-border bg-surface px-4 py-2.5">
          <button
            type="button"
            onClick={() => setCarritoAbierto(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 text-black active:opacity-80"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold">
              <ShoppingBasket size={18} aria-hidden />
              Ver pedido · {plural(lineas.length, 'producto', 'productos')}
            </span>
            <ChevronUp size={18} aria-hidden />
          </button>
        </div>
      )}

      <Modal open={carritoAbierto} onClose={() => setCarritoAbierto(false)} title="Tu pedido">
        {panel(false)}
      </Modal>

      <Modal open={resumenAbierto} onClose={() => !enviando && setResumenAbierto(false)} title="Revisá antes de enviar">
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lineas.map(l => (
              <li key={l.producto.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 text-text">
                  {l.producto.codigo != null && <span className="text-accent">{l.producto.codigo} · </span>}
                  {l.producto.nombre}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-text">
                  {formatoCantidad(l.cantidad)}{unidadVisible(l.producto) && <span className="text-xs font-normal text-muted"> {unidadVisible(l.producto)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Observaciones</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text">{carrito.notas.trim() || <span className="text-muted">Sin observaciones</span>}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setResumenAbierto(false)}
              disabled={enviando}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted hover:text-text disabled:opacity-40"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              <Send size={16} aria-hidden />
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function IconoCategoria({ categoria, chico = false }: { categoria: string | null | undefined; chico?: boolean }) {
  const { icono: Icono, clase } = estiloCategoria(categoria)
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg ${chico ? 'h-6 w-6' : 'h-9 w-9'} ${clase}`} aria-hidden>
      <Icono size={chico ? 13 : 17} />
    </span>
  )
}

function SinStock() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-2xs font-semibold text-muted">
      Sin stock por ahora
    </span>
  )
}

function NombreProducto({ producto }: { producto: Producto }) {
  return (
    <p className="text-sm font-semibold leading-snug text-text break-words">
      {producto.codigo != null && <span className="text-accent">{producto.codigo} · </span>}
      {producto.nombre}
    </p>
  )
}

function TarjetaHabitual({ producto, ultimaCantidad, cantidad, onCantidad }: {
  producto: Producto
  ultimaCantidad: number | null
  cantidad: number
  onCantidad: (n: number) => void
}) {
  const sinStock = !producto.activo
  return (
    <div className={`rounded-2xl border bg-surface p-3 transition-colors ${
      sinStock ? 'border-border opacity-50' : cantidad > 0 ? 'border-accent/70' : 'border-border'
    }`}>
      <div className="flex items-start gap-2.5">
        <IconoCategoria categoria={producto.categoria} />
        <div className="min-w-0 flex-1">
          <NombreProducto producto={producto} />
          {unidadVisible(producto) && <p className="text-2xs text-muted">{unidadVisible(producto)}</p>}
        </div>
      </div>
      <div className="mt-3">
        {sinStock ? <SinStock /> : (
          <CampoCantidad valor={cantidad} onCambiar={onCantidad} etiqueta={producto.nombre} unidad={producto.unidad} tamano="lg" />
        )}
      </div>
      {ultimaCantidad != null && (
        <p className="mt-2 text-2xs text-faint">Última vez: {formatoCantidad(ultimaCantidad)}{unidadVisible(producto) ? ` ${unidadVisible(producto)}` : ''}</p>
      )}
    </div>
  )
}

function FilaProducto({ producto, cantidad, onCantidad }: { producto: Producto; cantidad: number; onCantidad: (n: number) => void }) {
  const sinStock = !producto.activo
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap ${cantidad > 0 ? 'bg-accent-bg/40' : ''}`}>
      <div className={`flex min-w-0 flex-1 basis-full items-center gap-2.5 sm:basis-auto ${sinStock ? 'opacity-50' : ''}`}>
        <IconoCategoria categoria={producto.categoria} />
        <div className="min-w-0">
          <NombreProducto producto={producto} />
          {unidadVisible(producto) && <p className="text-2xs text-muted">{unidadVisible(producto)}</p>}
        </div>
      </div>
      <div className="ml-auto shrink-0">
        {sinStock ? <SinStock /> : (
          <CampoCantidad valor={cantidad} onCambiar={onCantidad} etiqueta={producto.nombre} unidad={producto.unidad} />
        )}
      </div>
    </li>
  )
}

function PanelCarrito({
  conTitulo, lineas, notas, onCantidad, onNotas, onEnviar, onVaciar,
}: {
  conTitulo: boolean
  lineas: Linea[]
  notas: string
  onCantidad: (productoId: string, n: number) => void
  onNotas: (notas: string) => void
  onEnviar: () => void
  onVaciar: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-text">
          {conTitulo && <ShoppingBasket size={16} className="text-accent" aria-hidden />}
          {conTitulo && 'Tu pedido'}
          {lineas.length > 0 && <span className="text-xs font-normal text-muted">{conTitulo ? ' · ' : ''}{plural(lineas.length, 'producto', 'productos')}</span>}
        </p>
        {lineas.length > 0 && (
          <button type="button" onClick={onVaciar} className="h-10 px-2 text-xs text-faint hover:text-brand-red">Vaciar</button>
        )}
      </div>

      {lineas.length === 0 ? (
        <p className="py-4 text-center text-sm text-faint">Todavía no cargaste productos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lineas.map(l => (
            <li key={l.producto.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight text-text break-words">
                  {l.producto.codigo != null && <span className="text-accent">{l.producto.codigo} · </span>}
                  {l.producto.nombre}
                </p>
                {unidadVisible(l.producto) && <p className="text-2xs text-faint">{unidadVisible(l.producto)}</p>}
              </div>
              <CampoCantidad
                valor={l.cantidad}
                onCambiar={n => onCantidad(l.producto.id, n)}
                etiqueta={l.producto.nombre}
                unidad={l.producto.unidad}
                conAtajos={false}
              />
              <button
                type="button"
                onClick={() => onCantidad(l.producto.id, 0)}
                aria-label={`Quitar ${l.producto.nombre}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-faint hover:text-brand-red"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={notas}
        onChange={e => onNotas(e.target.value)}
        placeholder="Observaciones (opcional)"
        aria-label="Observaciones"
        rows={2}
        maxLength={500}
        className="w-full resize-none rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
      />

      <button
        type="button"
        onClick={onEnviar}
        disabled={lineas.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-black disabled:opacity-40 active:opacity-80"
      >
        <Send size={16} aria-hidden />
        Revisar y enviar
      </button>
    </div>
  )
}
