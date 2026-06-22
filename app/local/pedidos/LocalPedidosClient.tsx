'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, Producto, Pedido, CarritoItem } from '@/lib/types'
import { BadgeEstado, BadgeDestino } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import PedidoMensajes from '@/components/pedidos/PedidoMensajes'

interface Props {
  profile: Profile
  productos: Producto[]
  pedidosIniciales: Pedido[]
}

export default function LocalPedidosClient({ profile, productos, pedidosIniciales }: Props) {
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [notas, setNotas] = useState('')
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciales)
  const [enviando, setEnviando] = useState(false)
  const [exitoNums, setExitoNums] = useState<number[]>([])
  const [remitoPedidoId, setRemitoPedidoId] = useState<string | null>(null)
  const [remitoItems, setRemitoItems] = useState<Record<string, { cantidad_recibida: string; valor_total: string }>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [tabActiva, setTabActiva] = useState<'fabrica' | 'deposito'>('fabrica')
  const [cantidadesInput, setCantidadesInput] = useState<Record<string, string>>({})
  const [busqueda, setBusqueda] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const productosFabrica = productos.filter(p => p.destino === 'fabrica')
  const productosDeposito = productos.filter(p => p.destino === 'deposito')
  const productosTabBase = tabActiva === 'fabrica' ? productosFabrica : productosDeposito
  const esBusquedaNumerica = /^\d+$/.test(busqueda.trim())
  const productosTab = busqueda.trim()
    ? productosTabBase.filter(p => {
        if (esBusquedaNumerica) {
          // búsqueda numérica: match exacto de código
          return p.codigo != null && String(p.codigo) === busqueda.trim()
        }
        return (
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
        )
      })
    : productosTabBase

  function handleBusquedaEnter() {
    if (!busqueda.trim()) return
    if (productosTab.length === 1) {
      agregarAlCarrito(productosTab[0])
      setBusqueda('')
    }
  }

  function getCantidadInput(id: string) {
    return cantidadesInput[id] ?? '1'
  }

  function setCantidad(producto: Producto, cantidad: number) {
    if (cantidad <= 0) {
      setCarrito(c => c.filter(i => i.producto.id !== producto.id))
    } else {
      setCarrito(c => {
        const ex = c.find(i => i.producto.id === producto.id)
        if (ex) return c.map(i => i.producto.id === producto.id ? { ...i, cantidad } : i)
        return [...c, { producto, cantidad }]
      })
    }
  }

  function agregarAlCarrito(producto: Producto) {
    const qty = parseFloat(cantidadesInput[producto.id] ?? '1') || 1
    setCantidad(producto, (carrito.find(i => i.producto.id === producto.id)?.cantidad || 0) + qty)
  }

  function getCantidad(id: string) {
    return carrito.find(i => i.producto.id === id)?.cantidad || 0
  }

  const itemsFabrica = carrito.filter(i => i.producto.destino === 'fabrica')
  const itemsDeposito = carrito.filter(i => i.producto.destino === 'deposito')
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0)

  async function enviarPedido() {
    if (carrito.length === 0) return
    setEnviando(true)
    const grupoId = crypto.randomUUID()
    const nums: number[] = []
    const destinos: Array<{ destino: 'fabrica' | 'deposito'; items: CarritoItem[] }> = []
    if (itemsFabrica.length > 0) destinos.push({ destino: 'fabrica', items: itemsFabrica })
    if (itemsDeposito.length > 0) destinos.push({ destino: 'deposito', items: itemsDeposito })
    for (const { destino, items } of destinos) {
      const { data: pedido, error } = await supabase.from('pedidos')
        .insert({ local_id: profile.id, local_nombre: profile.local_nombre || profile.nombre, destino, notas: notas || null, grupo_id: grupoId })
        .select().single()
      if (error || !pedido) continue
      await supabase.from('pedido_items').insert(items.map(i => ({
        pedido_id: pedido.id, producto_id: i.producto.id, producto_nombre: i.producto.nombre, cantidad: i.cantidad,
      })))
      nums.push(pedido.numero)
    }
    setExitoNums(nums)
    setCarrito([])
    setNotas('')
    setEnviando(false)
    const { data } = await supabase.from('pedidos').select('*, pedido_items(*), pedido_mensajes(*)')
      .eq('local_id', profile.id).order('created_at', { ascending: false }).limit(50)
    if (data) setPedidos(data)
  }

  useEffect(() => {
    const ch = supabase.channel('pedidos-local')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `local_id=eq.${profile.id}` },
        p => setPedidos(prev => prev.map(x => x.id === p.new.id ? { ...x, ...p.new } : x)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id]) // supabase es estable por useMemo, no necesita ser dependencia

  function abrirRemito(pedido: Pedido) {
    const inicial: Record<string, { cantidad_recibida: string; valor_total: string }> = {}
    for (const item of pedido.pedido_items || []) {
      inicial[item.id] = {
        cantidad_recibida: String(item.cantidad),
        valor_total: '',
      }
    }
    setRemitoItems(inicial)
    setRemitoPedidoId(pedido.id)
  }

  async function confirmarRecepcion(pedido: Pedido) {
    setConfirmando(true)
    const items = pedido.pedido_items || []
    await Promise.all(items.map(item => {
      const vals = remitoItems[item.id]
      return supabase.from('pedido_items').update({
        cantidad_recibida: vals?.cantidad_recibida ? parseInt(vals.cantidad_recibida) : null,
        valor_total: vals?.valor_total ? parseFloat(vals.valor_total.replace(',', '.')) : null,
      }).eq('id', item.id)
    }))
    await supabase.from('pedidos').update({ estado: 'recibido', recibido_at: new Date().toISOString() }).eq('id', pedido.id)
    setPedidos(prev => prev.map(p => p.id === pedido.id
      ? {
          ...p, estado: 'recibido',
          pedido_items: p.pedido_items?.map(item => ({
            ...item,
            cantidad_recibida: remitoItems[item.id]?.cantidad_recibida ? parseInt(remitoItems[item.id].cantidad_recibida) : null,
            valor_total: remitoItems[item.id]?.valor_total ? parseFloat(remitoItems[item.id].valor_total.replace(',', '.')) : null,
          }))
        }
      : p
    ))
    setRemitoPedidoId(null)
    setRemitoItems({})
    setConfirmando(false)
  }

  function CardProducto({ producto }: { producto: Producto }) {
    const enCarrito = getCantidad(producto.id)
    const inputVal = getCantidadInput(producto.id)
    return (
      <div className={`bg-[#1a1a1a] border rounded-2xl p-4 flex flex-col gap-3 transition-all ${enCarrito > 0 ? 'border-[#e8c547]' : 'border-[#2a2a2a]'}`}>
        <div className="flex-1 min-h-[40px]">
          <p className="text-sm font-semibold text-[#f0f0f0] leading-snug">
            {producto.codigo != null ? <span className="text-[#e8c547]">{producto.codigo} - </span> : null}{producto.nombre}
          </p>
          <span className="inline-block mt-1.5 text-[11px] text-[#666] bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-0.5">{producto.unidad}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            value={inputVal}
            onChange={e => setCantidadesInput(prev => ({ ...prev, [producto.id]: e.target.value }))}
            className="w-16 bg-[#111] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:border-[#e8c547]"
          />
          <button
            onClick={() => agregarAlCarrito(producto)}
            className="flex-1 bg-[#e8c547] hover:opacity-90 text-black text-sm font-['Syne'] font-bold rounded-xl py-2 transition-opacity active:opacity-70 whitespace-nowrap"
          >
            + Agregar
          </button>
        </div>
        {enCarrito > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-[#2a2a2a]">
            <span className="text-xs text-[#e8c547] font-semibold">En pedido: {enCarrito}</span>
            <button onClick={() => setCantidad(producto, 0)} className="text-xs text-[#555] hover:text-[#888]">✕ Quitar</button>
          </div>
        )}
      </div>
    )
  }

  const gruposTab = productosTab.reduce<Record<string, Producto[]>>((acc, p) => {
    const cat = p.categoria || 'Sin categoría'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  const pedidosActivos = pedidos.filter(p => p.estado !== 'recibido')
  const pedidosPorConfirmar = pedidos.filter(p => p.estado === 'enviado')

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-6">

      {exitoNums.length > 0 && (
        <div className="bg-[rgba(86,214,138,.08)] border-l-4 border-[#56d68a] rounded-r-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-[#56d68a]">
            ✓ Pedido{exitoNums.length > 1 ? 's' : ''} {exitoNums.map(n => `#${n}`).join(' y ')} enviado{exitoNums.length > 1 ? 's' : ''}
          </p>
          <button onClick={() => setExitoNums([])} className="text-[#56d68a] text-xl leading-none ml-3">×</button>
        </div>
      )}

      {/* Pedidos activos */}
      {pedidosActivos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Pedidos en curso</p>
          {pedidosActivos.map(pedido => (
            <div key={pedido.id} className={`bg-[#111] border border-[#2a2a2a] rounded-2xl overflow-hidden border-t-2 ${pedido.estado === 'enviado' ? 'border-t-[#56d68a]' : pedido.estado === 'preparando' ? 'border-t-[#e8c547]' : 'border-t-[#f0a849]'}`}>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-['Syne'] font-bold text-[#f0f0f0]">Pedido #{pedido.numero}</p>
                  <p className="text-xs text-[#888] mt-0.5 capitalize">{pedido.destino} · {pedido.estado === 'pendiente' ? '⏳ Pendiente' : pedido.estado === 'preparando' ? '🔄 Preparando' : '🚚 En camino'}</p>
                </div>
                {pedido.estado === 'enviado' && remitoPedidoId !== pedido.id && (
                  <button onClick={() => abrirRemito(pedido)}
                    className="bg-[#56d68a] text-black text-xs font-['Syne'] font-bold px-3 py-1.5 rounded-lg">
                    ✓ Confirmar recepción
                  </button>
                )}
              </div>
              <div className="px-4 pb-2 space-y-1">
                {(pedido.pedido_items || []).map(i => (
                  <div key={i.id} className="flex justify-between text-xs">
                    <span className="text-[#c0c0c0]">{i.producto_nombre}</span>
                    <span className="text-[#888]">× {i.cantidad}</span>
                  </div>
                ))}
              </div>

              {/* Form remito inline */}
              {remitoPedidoId === pedido.id && (
                <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-3 bg-[#0d1f14]">
                  <p className="text-xs font-semibold text-[#56d68a] uppercase tracking-wider">Cargar remito</p>
                  <div className="grid grid-cols-[1fr_90px_90px] gap-x-2 pb-1 border-b border-[#2a2a2a]">
                    <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Producto</span>
                    <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-center">Cant. recibida</span>
                    <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider text-right">$ Total</span>
                  </div>
                  {(pedido.pedido_items || []).map(item => (
                    <div key={item.id} className="grid grid-cols-[1fr_90px_90px] gap-x-2 items-center">
                      <span className="text-xs text-[#f0f0f0] leading-tight">{item.producto_nombre}</span>
                      <input
                        type="number" min="0" step="1"
                        value={remitoItems[item.id]?.cantidad_recibida ?? ''}
                        onChange={e => setRemitoItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], cantidad_recibida: e.target.value } }))}
                        placeholder={String(item.cantidad)}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-[#56d68a]"
                      />
                      <input
                        type="number" min="0" step="0.01"
                        value={remitoItems[item.id]?.valor_total ?? ''}
                        onChange={e => setRemitoItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], valor_total: e.target.value } }))}
                        placeholder="$0"
                        className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#56d68a]"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setRemitoPedidoId(null); setRemitoItems({}) }}
                      className="flex-1 py-2 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                      Cancelar
                    </button>
                    <button onClick={() => confirmarRecepcion(pedido)} disabled={confirmando}
                      className="flex-1 py-2 bg-[#56d68a] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                      {confirmando ? 'Guardando...' : 'Confirmar recepción'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-6 items-start">

        {/* Catálogo — columna principal */}
        <div className="flex-1 min-w-0 space-y-4">
          <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nuevo pedido</p>

          {/* Tabs Mayorista / Depósito */}
          <div className="flex gap-2">
            {productosFabrica.length > 0 && (
              <button onClick={() => setTabActiva('fabrica')}
                className={`flex-1 py-2 rounded-xl text-sm font-['Syne'] font-bold transition-all border ${tabActiva === 'fabrica' ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-transparent text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'}`}>
                🛒 Mayorista {itemsFabrica.length > 0 && <span className={`ml-1 text-xs ${tabActiva === 'fabrica' ? 'text-black/60' : 'text-[#e8c547]'}`}>({itemsFabrica.reduce((s,i)=>s+i.cantidad,0)})</span>}
              </button>
            )}
            {productosDeposito.length > 0 && (
              <button onClick={() => setTabActiva('deposito')}
                className={`flex-1 py-2 rounded-xl text-sm font-['Syne'] font-bold transition-all border ${tabActiva === 'deposito' ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-transparent text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'}`}>
                📦 Depósito {itemsDeposito.length > 0 && <span className={`ml-1 text-xs ${tabActiva === 'deposito' ? 'text-black/60' : 'text-[#e8c547]'}`}>({itemsDeposito.reduce((s,i)=>s+i.cantidad,0)})</span>}
              </button>
            )}
          </div>

          {/* Buscador */}
          <input
            type="text" value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleBusquedaEnter() }}
            placeholder="Buscar por nombre, código... (Enter para agregar)"
          />

          {/* Grid de productos por categoría */}
          <div className="space-y-4">
            {Object.entries(gruposTab).map(([cat, prods]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-[#e8c547] rounded-full" />
                  <p className="text-xs font-bold text-[#e8c547] uppercase tracking-wider">{cat}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {prods.map(p => <CardProducto key={p.id} producto={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Carrito — sidebar sticky */}
        <div className="hidden lg:block w-72 shrink-0 sticky top-4">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">
              Pedido actual {totalItems > 0 && <span className="text-[#e8c547]">· {totalItems} uds</span>}
            </p>
            {carrito.length === 0 ? (
              <p className="text-sm text-[#555] text-center py-4">Todavía no agregaste productos.</p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {carrito.map(item => (
                  <div key={item.producto.id} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-[#c0c0c0] flex-1 min-w-0 truncate text-xs leading-tight">{item.producto.nombre}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setCantidad(item.producto, item.cantidad - 1)} className="w-6 h-6 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] flex items-center justify-center text-base leading-none hover:text-[#f0f0f0]">−</button>
                      <span className="w-7 text-center font-semibold text-[#e8c547] text-sm">{item.cantidad}</span>
                      <button onClick={() => setCantidad(item.producto, item.cantidad + 1)} className="w-6 h-6 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] flex items-center justify-center text-base leading-none hover:text-[#f0f0f0]">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones (opcional)" rows={2}
              className="w-full border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] resize-none bg-[#1a1a1a] text-[#f0f0f0] placeholder:text-[#555]" />
            <button onClick={enviarPedido} disabled={enviando || carrito.length === 0}
              className="w-full bg-[#e8c547] text-black rounded-xl py-3 text-sm font-['Syne'] font-bold disabled:opacity-40 active:opacity-80">
              {enviando ? 'Enviando...' : carrito.length === 0 ? 'Enviar Pedido' : `Enviar Pedido (${totalItems} uds)`}
            </button>
          </div>
        </div>

      </div>

      {/* Carrito mobile — fijo abajo */}
      {carrito.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111] border-t border-[#2a2a2a] px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">Pedido · <span className="text-[#e8c547]">{totalItems} uds</span></p>
            <p className="text-xs text-[#888]">{carrito.length} producto{carrito.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={enviarPedido} disabled={enviando}
            className="w-full bg-[#e8c547] text-black rounded-xl py-3 text-sm font-['Syne'] font-bold disabled:opacity-40 active:opacity-80">
            {enviando ? 'Enviando...' : `Enviar Pedido (${totalItems} uds)`}
          </button>
        </div>
      )}
    </div>
  )
}
