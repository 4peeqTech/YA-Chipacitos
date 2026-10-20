'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, History, PackageSearch, Search, Send, ShoppingBasket, Trash2, X } from 'lucide-react'
import type { Producto } from '@/lib/types'
import { crearPedido } from '@/lib/pedidos/acciones'
import { formatoCantidad } from '@/lib/pedidos/estados'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Chip } from '@/components/ui/Chip'
import PushToggle from '@/components/ui/PushToggle'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import ControlCantidad from './ControlCantidad'
import { useCarritoGuardado, type CarritoGuardado } from './useCarritoGuardado'

export interface UltimoPedido {
  numero: number
  pedido_items: { producto_id: string | null; producto_nombre: string; cantidad: number; origen?: string | null }[]
}

interface Props {
  usuarioId: string
  /** Solo productos activos del mayorista. */
  productos: Producto[]
  ultimoPedido: UltimoPedido | null
}

interface Linea { producto: Producto; cantidad: number }

const SIN_CATEGORIA = 'Sin categoría'

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`
}

export default function LocalPedidosClient({ usuarioId, productos, ultimoPedido }: Props) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [carrito, actualizarCarrito] = useCarritoGuardado(`ya-carrito-local-${usuarioId}`)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const categorias = useMemo(
    () => [...new Set(productos.map(p => p.categoria || SIN_CATEGORIA))].sort((a, b) => a.localeCompare(b, 'es')),
    [productos],
  )

  // Las líneas guardadas de productos que ya no están activos se ignoran.
  const lineas: Linea[] = carrito.lineas
    .map(l => ({ producto: porId.get(l.producto_id), cantidad: l.cantidad }))
    .filter((l): l is Linea => !!l.producto)
  const cantidadEnCarrito = (id: string) => lineas.find(l => l.producto.id === id)?.cantidad ?? 0

  // "código*cantidad" (ej. 12*1,5) + Enter suma esa cantidad al producto.
  const atajo = busqueda.trim().match(/^(\d+)\*(\d+(?:[.,]\d+)?)$/)
  const texto = (atajo ? atajo[1] : busqueda.trim()).toLowerCase()
  const esCodigo = /^\d+$/.test(texto)
  const visibles = productos.filter(p => {
    if (categoria && (p.categoria || SIN_CATEGORIA) !== categoria) return false
    if (!texto) return true
    if (esCodigo) return p.codigo != null && String(p.codigo) === texto
    return p.nombre.toLowerCase().includes(texto) || (p.categoria || '').toLowerCase().includes(texto)
  })
  const grupos = categorias
    .map(cat => [cat, visibles.filter(p => (p.categoria || SIN_CATEGORIA) === cat)] as const)
    .filter(([, prods]) => prods.length > 0)

  function setCantidad(productoId: string, cantidad: number) {
    actualizarCarrito(c => {
      const resto = c.lineas.filter(l => l.producto_id !== productoId)
      if (cantidad <= 0) return { ...c, lineas: resto }
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
    if (visibles.length !== 1) return
    const p = visibles[0]
    const sumar = atajo ? Number(atajo[2].replace(',', '.')) || 1 : 1
    setCantidad(p.id, Math.round((cantidadEnCarrito(p.id) + sumar) * 1000) / 1000)
    setBusqueda('')
  }

  function cargarUltimoPedido() {
    if (!ultimoPedido) return
    const pedidos = ultimoPedido.pedido_items.filter(i => (!i.origen || i.origen === 'pedido') && Number(i.cantidad) > 0)
    const cargados: CarritoGuardado['lineas'] = []
    const afuera: string[] = []
    for (const i of pedidos) {
      if (i.producto_id && porId.has(i.producto_id)) cargados.push({ producto_id: i.producto_id, cantidad: Number(i.cantidad) })
      else afuera.push(i.producto_nombre)
    }
    if (cargados.length === 0) {
      toast.error(`No se pudo repetir el pedido #${ultimoPedido.numero}: ninguno de sus productos está activo.`)
      return
    }
    actualizarCarrito(c => ({ ...c, lineas: cargados }))
    toast.success(`Cargamos ${plural(cargados.length, 'producto', 'productos')} del pedido #${ultimoPedido.numero}.`)
    if (afuera.length > 0) {
      toast.error(`Quedaron afuera porque ya no están activos: ${afuera.join(', ')}.`)
    }
  }

  function repetir() {
    if (lineas.length === 0) return cargarUltimoPedido()
    confirmar({
      titulo: 'Repetir mi último pedido',
      mensaje: 'Se reemplaza lo que tenés en el carrito por los productos de tu último pedido. Las observaciones quedan como están.',
      textoConfirmar: 'Reemplazar',
      onConfirmar: cargarUltimoPedido,
    })
  }

  function vaciar() {
    confirmar({
      titulo: 'Vaciar el carrito',
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
      // No se creó nada: el carrito queda como estaba para reintentar.
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

  const panel = (
    <PanelCarrito
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
        <section className="flex-1 min-w-0 space-y-4">
          <PushToggle
            descripcionActivar="Te avisamos cuando tu pedido salga en camino, aunque cierres la pestaña."
            descripcionActiva="Este dispositivo recibe el aviso cuando tu pedido sale en camino."
          />

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-text">Pedido al mayorista</h1>
              <p className="text-xs text-muted">Cargá las cantidades y revisá antes de enviar.</p>
            </div>
            {ultimoPedido && (
              <button
                type="button"
                onClick={repetir}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs font-semibold text-text hover:border-accent/50 active:opacity-70"
              >
                <History size={15} aria-hidden />
                <span className="sm:hidden">Repetir</span>
                <span className="hidden sm:inline">Repetir mi último pedido</span>
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
              className="w-full rounded-xl border border-border bg-surface2 py-2.5 pl-9 pr-9 text-sm text-text focus:border-accent focus:outline-none"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {categorias.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none lg:mx-0 lg:flex-wrap lg:px-0">
              <Chip active={categoria === null} onClick={() => setCategoria(null)}>Todas</Chip>
              {categorias.map(c => (
                <Chip key={c} active={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>{c}</Chip>
              ))}
            </div>
          )}

          {productos.length === 0 ? (
            <EmptyState icono={PackageSearch} titulo="No hay productos para pedir" descripcion="El mayorista todavía no tiene productos activos. Avisale a administración." />
          ) : visibles.length === 0 ? (
            <EmptyState icono={PackageSearch} titulo="Sin resultados" descripcion="Probá con otro nombre o código, o elegí otra categoría." />
          ) : (
            <div className="space-y-5">
              {grupos.map(([cat, prods]) => (
                <div key={cat} className="space-y-2">
                  <h2 className="text-2xs font-bold uppercase tracking-wider text-accent">{cat}</h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {prods.map(p => (
                      <TarjetaProducto key={p.id} producto={p} cantidad={cantidadEnCarrito(p.id)} onCantidad={n => setCantidad(p.id, n)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="hidden lg:block w-80 shrink-0 sticky top-4">
          <div className="rounded-2xl border border-border bg-surface p-4">{panel}</div>
        </aside>
      </div>

      {/* Celular: barra sobre el menú de abajo que abre el carrito. */}
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
        {panel}
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
                  {formatoCantidad(l.cantidad)} <span className="text-xs font-normal text-muted">{l.producto.unidad}</span>
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

function TarjetaProducto({ producto, cantidad, onCantidad }: { producto: Producto; cantidad: number; onCantidad: (n: number) => void }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border bg-surface p-3 transition-colors ${cantidad > 0 ? 'border-accent/60' : 'border-border'}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-text break-words">
          {producto.codigo != null && <span className="text-accent">{producto.codigo} · </span>}
          {producto.nombre}
        </p>
        <span className="mt-1 inline-block rounded-md border border-border bg-bg px-1.5 py-0.5 text-2xs text-muted">{producto.unidad}</span>
      </div>
      <div className="shrink-0">
        <ControlCantidad valor={cantidad} onCambiar={onCantidad} etiqueta={producto.nombre} />
      </div>
    </div>
  )
}

function PanelCarrito({
  lineas, notas, onCantidad, onNotas, onEnviar, onVaciar,
}: {
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
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
          Tu pedido{lineas.length > 0 && <span className="text-accent"> · {plural(lineas.length, 'producto', 'productos')}</span>}
        </p>
        {lineas.length > 0 && (
          <button type="button" onClick={onVaciar} className="text-xs text-faint hover:text-brand-red">Vaciar</button>
        )}
      </div>

      {lineas.length === 0 ? (
        <p className="py-4 text-center text-sm text-faint">Todavía no agregaste productos.</p>
      ) : (
        <ul className="space-y-2">
          {lineas.map(l => (
            <li key={l.producto.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight text-text break-words">
                  {l.producto.codigo != null && <span className="text-accent">{l.producto.codigo} · </span>}
                  {l.producto.nombre}
                </p>
                <p className="text-2xs text-faint">{l.producto.unidad}</p>
              </div>
              <ControlCantidad
                valor={l.cantidad}
                onCambiar={n => onCantidad(l.producto.id, n)}
                etiqueta={l.producto.nombre}
                conBotonAgregar={false}
                tamano="sm"
              />
              <button
                type="button"
                onClick={() => onCantidad(l.producto.id, 0)}
                aria-label={`Quitar ${l.producto.nombre}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:text-brand-red"
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
