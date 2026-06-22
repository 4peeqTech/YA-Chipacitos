'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, TipoProducto, DestinoProducto } from '@/lib/types'

interface Props {
  productosIniciales: Producto[]
  tipo: TipoProducto
  destino: DestinoProducto
}

export default function CatalogoClient({ productosIniciales, tipo, destino }: Props) {
  const [productos, setProductos] = useState(productosIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('todas')
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  const supabase = createClient()

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase
      .from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  const categorias = useMemo(() =>
    Array.from(new Set(productos.map(p => p.categoria || 'Sin categoría'))).sort()
  , [productos])

  const filtrados = productos.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchCat = filtroCat === 'todas' || (p.categoria || 'Sin categoría') === filtroCat
    const matchActivo = filtroActivo === 'todos' || (filtroActivo === 'activos' ? p.activo : !p.activo)
    return matchBusqueda && matchCat && matchActivo
  })

  const grupos = filtrados.reduce<Record<string, Producto[]>>((acc, p) => {
    const cat = p.categoria || 'Sin categoría'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  const activos = productos.filter(p => p.activo).length
  const desactivados = productos.filter(p => !p.activo).length

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4">

      {desactivados > 0 && (
        <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-lg px-3 py-2 text-xs text-[#f0a849]">
          ⚠️ {desactivados} desactivado{desactivados !== 1 ? 's' : ''} — revisá el stock.
        </div>
      )}

      {/* Barra de controles sticky */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider">
            Catálogo — {tipo === 'producto' ? 'productos' : 'insumos'}
          </p>
          <span className="text-xs text-[#888]">{activos} activos · {productos.length} total</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c547] w-44 placeholder:text-[#555]"
          />
          <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c547]">
            <option value="todas">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroActivo} onChange={e => setFiltroActivo(e.target.value as typeof filtroActivo)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c547]">
            <option value="todos">Activos e inactivos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>
        </div>
      </div>

      {/* Grid por categoría */}
      {Object.keys(grupos).length === 0 ? (
        <p className="text-sm text-[#555] text-center py-12">Sin resultados.</p>
      ) : (
        Object.entries(grupos).map(([cat, prods]) => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-[#e8c547] rounded-full" />
              <p className="text-xs font-bold text-[#e8c547] uppercase tracking-wider">{cat}</p>
              <span className="text-[10px] text-[#555]">{prods.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {prods.map(p => (
                <div key={p.id}
                  className={`bg-[#1a1a1a] border rounded-xl p-3 flex flex-col gap-2 transition-all ${p.activo ? 'border-[#2a2a2a]' : 'border-[#2a2a2a] opacity-50'}`}>
                  <div className="flex items-start gap-1.5">
                    {p.codigo != null && (
                      <span className="shrink-0 text-[10px] font-bold text-black bg-[#e8c547] rounded px-1.5 py-0.5 leading-none mt-0.5">{p.codigo}</span>
                    )}
                    <p className={`text-xs font-semibold leading-snug flex-1 ${p.activo ? 'text-[#f0f0f0]' : 'text-[#666]'}`}>{p.nombre}</p>
                  </div>
                  <p className="text-[10px] text-[#555]">{p.unidad}{p.precio != null ? ` · $${p.precio.toLocaleString('es-AR')}` : ''}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-medium ${p.activo ? 'text-[#56d68a]' : 'text-[#555]'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    <button
                      onClick={() => toggleActivo(p)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${p.activo ? 'bg-[#56d68a]' : 'bg-[#2a2a2a]'}`}
                    >
                      <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full shadow transition-all ${p.activo ? 'right-[3px] bg-white' : 'left-[3px] bg-[#888]'}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
