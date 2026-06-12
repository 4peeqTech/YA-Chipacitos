'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, TipoProducto, DestinoProducto } from '@/lib/types'
import Card from '@/components/ui/Card'

interface Props {
  productosIniciales: Producto[]
  tipo: TipoProducto
  destino: DestinoProducto
}

export default function CatalogoClient({ productosIniciales, tipo, destino }: Props) {
  const [productos, setProductos] = useState(productosIniciales)
  const supabase = createClient()

  const activos = productos.filter(p => p.activo).length
  const desactivados = productos.filter(p => !p.activo).length

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase
      .from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  return (
    <div className="p-3 space-y-3">

      {desactivados > 0 && (
        <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-lg px-3 py-2 text-xs text-[#f0a849]">
          ⚠️ {desactivados} producto{desactivados !== 1 ? 's' : ''} desactivado{desactivados !== 1 ? 's' : ''}. Revisá el stock antes de activar.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#e8c547] uppercase tracking-wider">
            Catálogo — {tipo === 'producto' ? 'productos' : 'insumos'}
          </p>
          <span className="text-[11px] text-[#888]">{activos} activos</span>
        </div>
        <Card>
          {productos.length === 0 ? (
            <p className="text-xs text-[#888] text-center py-6">Sin {tipo === 'producto' ? 'productos' : 'insumos'} en el catálogo.</p>
          ) : (
            productos.map((p, i) => (
              <div key={p.id} className={`flex items-center justify-between px-3 py-3 ${i < productos.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
                <div className="flex-1 min-w-0 pr-2">
                  <p className={`text-xs font-medium ${p.activo ? 'text-[#f0f0f0]' : 'text-[#555]'}`}>{p.nombre}</p>
                  <p className="text-[11px] text-[#555] mt-0.5 flex items-center gap-1 flex-wrap">
                    {p.activo ? p.unidad : 'Desactivado'}
                    {p.activo && p.categoria && (
                      <span className="px-1.5 py-0.5 rounded bg-[#1e1e1e] text-[#e8c547] text-[10px] font-medium">{p.categoria}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => toggleActivo(p)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${p.activo ? 'bg-[#e8c547]' : 'bg-[#2a2a2a]'}`}
                >
                  <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full shadow transition-all ${p.activo ? 'right-[3px] bg-black' : 'left-[3px] bg-[#888]'}`} />
                </button>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
