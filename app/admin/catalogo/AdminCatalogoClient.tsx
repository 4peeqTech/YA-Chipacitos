'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, TipoProducto, DestinoProducto } from '@/lib/types'
import Card from '@/components/ui/Card'

interface Props {
  productosIniciales: Producto[]
}

const CATEGORIAS = [
  'Bolsas Congelados',
  'Cajas Congelados',
  'Toppings',
  'Productos Ya!',
  'Masas',
  'Insumos Facturas',
  'Insumos General',
  'Bolsas Ya!',
  'Cajas Ya!',
  'Vasos Café Ya!',
]

const FORM_VACIO = { nombre: '', descripcion: '', unidad: 'unidad', tipo: 'producto' as TipoProducto, destino: 'fabrica' as DestinoProducto, categoria: '' }

export default function AdminCatalogoClient({ productosIniciales }: Props) {
  const [productos, setProductos] = useState(productosIniciales)
  const [tab, setTab] = useState<DestinoProducto>('fabrica')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [formEdit, setFormEdit] = useState({ nombre: '', descripcion: '', unidad: '', categoria: '' })
  const [guardando, setGuardando] = useState(false)
  const supabase = createClient()

  const filtrados = productos.filter(p => p.destino === tab)
  const activos = filtrados.filter(p => p.activo).length

  async function toggleActivo(producto: Producto) {
    const { data } = await supabase
      .from('productos').update({ activo: !producto.activo }).eq('id', producto.id).select().single()
    if (data) setProductos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function agregar() {
    if (!form.nombre) return
    setGuardando(true)
    const { data } = await supabase
      .from('productos').insert({ ...form, activo: true }).select().single()
    if (data) { setProductos(prev => [...prev, data]); setModalNuevo(false); setForm({ ...FORM_VACIO, destino: tab, tipo: tab === 'fabrica' ? 'producto' : 'insumo' }) }
    setGuardando(false)
  }

  function abrirEdicion(p: Producto) {
    setEditando(p)
    setFormEdit({ nombre: p.nombre, descripcion: p.descripcion ?? '', unidad: p.unidad, categoria: p.categoria ?? '' })
  }

  async function guardarEdicion() {
    if (!editando || !formEdit.nombre) return
    setGuardando(true)
    const { data } = await supabase
      .from('productos')
      .update({ nombre: formEdit.nombre, descripcion: formEdit.descripcion, unidad: formEdit.unidad, categoria: formEdit.categoria || null })
      .eq('id', editando.id).select().single()
    if (data) { setProductos(prev => prev.map(p => p.id === data.id ? data : p)); setEditando(null) }
    setGuardando(false)
  }

  function abrirNuevo() {
    setForm({ ...FORM_VACIO, destino: tab, tipo: tab === 'fabrica' ? 'producto' : 'insumo' })
    setModalNuevo(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-['Syne'] font-bold text-xl text-[#f0f0f0]">Catálogo de productos</h1>
        <p className="text-xs text-[#888] mt-1">Gestioná los productos y insumos disponibles para pedidos.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['fabrica', 'deposito'] as DestinoProducto[]).map(d => (
          <button
            key={d}
            onClick={() => setTab(d)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === d ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {d === 'fabrica' ? '🚚 Fábrica' : '📦 Depósito'}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#e8c547] uppercase tracking-wider">
            {tab === 'fabrica' ? 'Productos' : 'Insumos'} · {tab === 'fabrica' ? 'Fábrica' : 'Depósito'}
          </p>
          <span className="text-[11px] text-[#888]">{activos} activos de {filtrados.length}</span>
        </div>
        <Card>
          {filtrados.length === 0 ? (
            <p className="text-xs text-[#888] text-center py-6">Sin {tab === 'fabrica' ? 'productos' : 'insumos'} en el catálogo.</p>
          ) : (
            filtrados.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-3 ${i < filtrados.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${p.activo ? 'text-[#f0f0f0]' : 'text-[#555]'}`}>{p.nombre}</p>
                  <p className="text-[11px] text-[#555] mt-0.5">
                    {p.unidad}
                    {p.categoria ? <span className="ml-1 px-1.5 py-0.5 rounded bg-[#1e1e1e] text-[#e8c547] text-[10px] font-medium">{p.categoria}</span> : null}
                    {p.descripcion ? ` · ${p.descripcion}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => abrirEdicion(p)}
                  className="text-[#444] hover:text-[#e8c547] transition-colors text-xs px-1.5 py-1 rounded shrink-0"
                  title="Editar"
                >
                  ✏️
                </button>
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
        onClick={abrirNuevo}
        className="w-full border border-dashed border-[#e8c547]/30 text-[#e8c547] rounded-lg py-2.5 text-xs font-medium hover:bg-[#e8c547]/5 transition-colors"
      >
        + Agregar {tab === 'fabrica' ? 'producto' : 'insumo'}
      </button>

      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-t-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-sm text-[#f0f0f0]">
              Nuevo {tab === 'fabrica' ? 'producto' : 'insumo'} · {tab === 'fabrica' ? 'Fábrica' : 'Depósito'}
            </h3>
            {[
              { label: 'Nombre *', key: 'nombre', placeholder: tab === 'fabrica' ? 'Chipacitos clásicos' : 'Harina de mandioca 1kg' },
              { label: 'Descripción', key: 'descripcion', placeholder: 'Descripción opcional' },
              { label: 'Unidad', key: 'unidad', placeholder: 'unidad, kg, bolsa...' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type="text" value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-[#f0f0f0] focus:outline-none focus:border-[#e8c547]">
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
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

      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-t-2xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-['Syne'] font-bold text-sm text-[#f0f0f0]">Editar producto</h3>
            {[
              { label: 'Nombre *', key: 'nombre' },
              { label: 'Descripción', key: 'descripcion' },
              { label: 'Unidad', key: 'unidad' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type="text" value={(formEdit as Record<string, string>)[key]}
                  onChange={e => setFormEdit(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Categoría</label>
              <select value={formEdit.categoria} onChange={e => setFormEdit(f => ({ ...f, categoria: e.target.value }))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-[#f0f0f0] focus:outline-none focus:border-[#e8c547]">
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditando(null)}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-xs font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando || !formEdit.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-xs font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
