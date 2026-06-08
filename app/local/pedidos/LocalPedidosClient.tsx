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
  const supabase = useMemo(() => createClient(), [])

  const productosFabrica = productos.filter(p => p.destino === 'fabrica')
  const productosDeposito = productos.filter(p => p.destino === 'deposito')

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

  function FilaProducto({ producto }: { producto: Producto }) {
    const cantidad = getCantidad(producto.id)
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-black/[0.06] last:border-0">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-sm font-medium text-[#f0f0f0] leading-tight">{producto.nombre}</p>
          <p className="text-xs text-[#888] mt-0.5">{producto.descripcion || producto.unidad}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setCantidad(producto, cantidad - 1)}
            className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-lg leading-none active:bg-[#2a2a2a] text-[#f0f0f0]">−</button>
          <span className={`w-7 text-center text-sm font-semibold ${cantidad > 0 ? 'text-[#e8c547]' : 'text-[#888]'}`}>{cantidad}</span>
          <button onClick={() => setCantidad(producto, cantidad + 1)}
            className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-lg leading-none active:bg-[#2a2a2a] text-[#f0f0f0]">+</button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6">

      {exitoNums.length > 0 && (
        <div className="bg-[rgba(86,214,138,.08)] border-l-4 border-[#56d68a] rounded-r-lg px-4 py-3 flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-[#56d68a]">
            ✓ Pedido{exitoNums.length > 1 ? 's' : ''} {exitoNums.map(n => `#${n}`).join(' y ')} enviado{exitoNums.length > 1 ? 's' : ''}
          </p>
          <button onClick={() => setExitoNums([])} className="text-[#56d68a] text-xl leading-none ml-3">×</button>
        </div>
      )}

      {/* Layout: 1 col mobile, 2 col desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Columna izquierda: formulario */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nuevo pedido</p>

          {productosFabrica.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                🏭 Fábrica
              </p>
              {productosFabrica.map(p => <FilaProducto key={p.id} producto={p} />)}
            </Card>
          )}

          {productosDeposito.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                📦 Depósito
              </p>
              {productosDeposito.map(p => <FilaProducto key={p.id} producto={p} />)}
            </Card>
          )}

          {totalItems > 0 && (
            <Card className="p-4 space-y-3">
              <div className="space-y-1.5">
                {itemsFabrica.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#888]">🏭 Fábrica</span>
                    <span className="font-medium">{itemsFabrica.reduce((s, i) => s + i.cantidad, 0)} uds</span>
                  </div>
                )}
                {itemsDeposito.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#888]">📦 Depósito</span>
                    <span className="font-medium">{itemsDeposito.reduce((s, i) => s + i.cantidad, 0)} uds</span>
                  </div>
                )}
              </div>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Nota para el pedido (opcional)" rows={2}
                className="w-full border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] resize-none bg-[#1a1a1a] text-[#f0f0f0] placeholder:text-[#888]" />
              <button onClick={enviarPedido} disabled={enviando}
                className="w-full bg-[#e8c547] text-black rounded-xl py-3 text-sm font-['Syne'] font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80">
                ✈ {enviando ? 'Enviando...' : `Enviar pedido (${totalItems} uds)`}
              </button>
            </Card>
          )}
        </div>

        {/* Columna derecha: pedidos recientes */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Pedidos recientes</p>
          {pedidos.length === 0
            ? <Card className="p-6 text-center text-sm text-[#888]">Aún no hiciste pedidos.</Card>
            : pedidos.slice(0, 8).map(pedido => (
              <Card key={pedido.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#f0f0f0]">Pedido #{pedido.numero}</span>
                  <BadgeEstado estado={pedido.estado} />
                </div>
                <div className="text-xs text-[#aaa] mt-1 flex items-center gap-1.5 flex-wrap">
                  <BadgeDestino destino={pedido.destino} />
                  <span className="text-[#555]">·</span>
                  <span>{new Date(pedido.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-[#555]">·</span>
                  <span>{pedido.pedido_items?.reduce((s, i) => s + i.cantidad, 0) || 0} uds</span>
                </div>
                {pedido.pedido_items && pedido.pedido_items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#2a2a2a] space-y-0.5">
                    {pedido.pedido_items.map(i => (
                      <p key={i.id} className="text-xs text-[#c0c0c0]">{i.cantidad}× {i.producto_nombre}</p>
                    ))}
                  </div>
                )}
                {pedido.estado === 'enviado' && (
                  <button onClick={async () => {
                    await supabase.from('pedidos').update({ estado: 'recibido', recibido_at: new Date().toISOString() }).eq('id', pedido.id)
                    setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, estado: 'recibido' } : p))
                  }} className="mt-2 w-full bg-[rgba(86,214,138,.15)] text-[#56d68a] border border-[#56d68a]/30 rounded-lg py-2 text-xs font-medium">
                    ✓ Confirmar recepción
                  </button>
                )}
                <PedidoMensajes pedidoId={pedido.id} mensajesIniciales={pedido.pedido_mensajes || []}
                  autorRol="local" autorNombre={profile.local_nombre || profile.nombre} />
              </Card>
            ))
          }
        </div>
      </div>
    </div>
  )
}
