'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ProveedorOption {
  id: string
  nombre: string
}

interface CompraItem {
  id: string
  proveedor_id: string
  nombre: string
  unidad: string
  meta_semanal: number
  consumo_por_masa: number | null
  orden: number
  estado: 'activo' | 'archivado'
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const emptyForm = (): Partial<CompraItem> => ({
  proveedor_id: '',
  nombre: '',
  unidad: '',
  meta_semanal: 0,
  consumo_por_masa: null,
  orden: 0,
  estado: 'activo',
})

export default function InsumosClient({
  itemsIniciales,
  proveedores,
}: {
  itemsIniciales: CompraItem[]
  proveedores: ProveedorOption[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<CompraItem[]>(itemsIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<CompraItem | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<CompraItem>>(emptyForm())
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'

  const filtrados = items.filter(i => {
    const matchEstado = filtro === 'todos' || i.estado === filtro
    const matchBusqueda = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchBusqueda
  })

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
    setError('')
  }

  function abrirEditar(i: CompraItem) {
    setForm({ ...i })
    setEditando(i)
    setCreando(false)
    setError('')
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
    setError('')
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError('El nombre es requerido'); return }
    if (!form.proveedor_id) { setError('El proveedor es requerido'); return }
    if (!form.unidad?.trim()) { setError('La unidad es requerida'); return }
    setError('')

    startTransition(async () => {
      if (creando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .insert([{ ...form, estado: 'activo' }])
          .select()
          .single()
        if (err) { setError(err.message); return }
        setItems(prev => [...prev, data].sort((a, b) => a.orden - b.orden))
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .update({ ...form })
          .eq('id', editando.id)
          .select()
          .single()
        if (err) { setError(err.message); return }
        setItems(prev => prev.map(i => i.id === editando.id ? data : i).sort((a, b) => a.orden - b.orden))
      }
      cerrarForm()
    })
  }

  async function archivar(i: CompraItem) {
    const nuevoEstado = i.estado === 'activo' ? 'archivado' : 'activo'
    const { data, error: err } = await supabase
      .from('compras_items')
      .update({ estado: nuevoEstado })
      .eq('id', i.id)
      .select()
      .single()
    if (err) { setError(err.message); return }
    setItems(prev => prev.map(x => x.id === i.id ? data : x))
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Insumos</h1>
          <p className="text-[#888] text-sm mt-0.5">{items.filter(i => i.estado === 'activo').length} activos · {items.filter(i => i.estado === 'archivado').length} archivados</p>
        </div>
        <button onClick={abrirCrear} className="bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          + Nuevo insumo
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar insumo..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#e8c547] w-64"
        />
        {(['activo', 'archivado', 'todos'] as FiltroEstado[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${filtro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {(creando || editando) && (
        <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#f0f0f0]">{creando ? 'Nuevo insumo' : `Editar — ${editando?.nombre}`}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Proveedor *</label>
              <select className={inputClass} value={form.proveedor_id ?? ''} onChange={e => setForm(f => ({...f, proveedor_id: e.target.value}))}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Unidad *</label>
              <input className={inputClass} placeholder="Ej: kg, unidad, docena" value={form.unidad ?? ''} onChange={e => setForm(f => ({...f, unidad: e.target.value}))} />
            </div>
            <div>
              <label className={labelClass}>Meta semanal</label>
              <input type="number" step="0.01" className={inputClass} value={form.meta_semanal ?? 0} onChange={e => setForm(f => ({...f, meta_semanal: Number(e.target.value)}))} />
            </div>
            <div>
              <label className={labelClass}>Consumo por masa</label>
              <input type="number" step="0.01" className={inputClass} value={form.consumo_por_masa ?? ''} onChange={e => setForm(f => ({...f, consumo_por_masa: e.target.value === '' ? null : Number(e.target.value)}))} />
            </div>
            <div>
              <label className={labelClass}>Orden</label>
              <input type="number" className={inputClass} value={form.orden ?? 0} onChange={e => setForm(f => ({...f, orden: Number(e.target.value)}))} />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button onClick={guardar} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cerrarForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-sm py-2 px-6 rounded-xl transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay insumos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Meta semanal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(i => (
                  <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{i.nombre}</td>
                    <td className="px-4 py-3 text-[#888]">{nombreProveedor(i.proveedor_id)}</td>
                    <td className="px-4 py-3 text-[#888]">{i.unidad}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.meta_semanal}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${i.estado === 'activo' ? 'bg-green-900/50 text-green-300' : 'bg-[#2a2a2a] text-[#666]'}`}>
                        {i.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => abrirEditar(i)} className="text-xs text-[#888] hover:text-[#e8c547] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          Editar
                        </button>
                        <button onClick={() => archivar(i)} className="text-xs text-[#888] hover:text-[#f0f0f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#2a2a2a]">
                          {i.estado === 'activo' ? 'Archivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
