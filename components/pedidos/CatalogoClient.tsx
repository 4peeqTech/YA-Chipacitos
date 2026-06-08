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
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', unidad: 'unidad' })
  const [guardando, setGuardando] = useState(false)
  const supabase = createClient()

  const activos = productos.filter(p => p.activo).length
  const bajoStock = productos.filter(p => !p.activo).length

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase
      .from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function agregar() {
    if (!form.nombre) return
    setGuardando(true)
    const { data } = await supabase
      .from('productos').insert({ ...form, tipo, destino, activo: true }).select().single()
    if (data) { setProductos(prev => [...prev, data]); setModalNuevo(false); setForm({ nombre: '', descripcion: '', unidad: 'unidad' }) }
    setGuardando(false)
  }

  return (
    <div className="p-3 space-y-3">

      {bajoStock > 0 && (
        <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-lg px-3 py-2 text-xs text-[#f0a849]">
          ⚠️ {bajoStock} producto{bajoStock !== 1 ? 's' : ''} desactivado{bajoStock !== 1 ? 's' : ''}. Revisá el stock antes de activar.
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
                  <p className="text-[11px] text-[#555] mt-0.5">
                    {p.activo
                      ? `${tipo === 'producto' ? 'Disponible' : 'Insumo'} · ${destino === 'fabrica' ? 'Fábrica' : 'Depósito'}`
                      : 'Desactivado'}
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

      <button
        onClick={() => setModalNuevo(true)}
        className="w-full border border-dashed border-[#e8c547]/30 text-[#e8c547] rounded-lg py-2.5 text-xs font-medium hover:bg-[#e8c547]/5 transition-colors"
      >
        + Agregar {tipo === 'producto' ? 'producto' : 'insumo'}
      </button>

      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-t-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-sm text-[#f0f0f0]">Nuevo {tipo === 'producto' ? 'producto' : 'insumo'}</h3>
            {[
              { label: 'Nombre *', key: 'nombre', placeholder: tipo === 'producto' ? 'Chipacitos clásicos' : 'Harina de mandioca 1kg' },
              { label: 'Descripción', key: 'descripcion', placeholder: 'Descripción opcional' },
              { label: 'Unidad', key: 'unidad', placeholder: 'unidad, kg, bolsa...' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type="text" value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModalNuevo(false)}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={agregar} disabled={guardando || !form.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
