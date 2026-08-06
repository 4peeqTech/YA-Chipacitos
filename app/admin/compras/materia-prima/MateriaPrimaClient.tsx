'use client'

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface ProveedorOption {
  id: string
  nombre: string
}

interface MateriaPrima {
  id: string
  proveedor_id: string
  nombre: string
  unidad_compra: string
  kg_por_unidad: number
  coeficiente: number
  precio: number | null
  estado: 'activo' | 'archivado'
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const emptyForm = (): Partial<MateriaPrima> => ({
  proveedor_id: '',
  nombre: '',
  unidad_compra: '',
  kg_por_unidad: 0,
  coeficiente: 0,
  precio: null,
  estado: 'activo',
})

export default function MateriaPrimaClient({
  itemsIniciales,
  proveedores,
}: {
  itemsIniciales: MateriaPrima[]
  proveedores: ProveedorOption[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<MateriaPrima[]>(itemsIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<MateriaPrima | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<MateriaPrima>>(emptyForm())
  const [eliminando, setEliminando] = useState<MateriaPrima | null>(null)
  const [isPending, startTransition] = useTransition()
  const toast = useToasts()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'

  const filtrados = items
    .filter(i => {
      const matchEstado = filtro === 'todos' || i.estado === filtro
      const matchBusqueda = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
      return matchEstado && matchBusqueda
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(i: MateriaPrima) {
    setForm({ ...i })
    setEditando(i)
    setCreando(false)
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
  }

  async function guardar() {
    if (!form.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.proveedor_id) { toast.error('El proveedor es requerido'); return }
    if (!form.unidad_compra?.trim()) { toast.error('La unidad de compra es requerida'); return }
    if (!form.kg_por_unidad || form.kg_por_unidad <= 0) { toast.error('Los kg por unidad deben ser mayores a 0'); return }

    startTransition(async () => {
      const body = {
        proveedor_id: form.proveedor_id,
        nombre: form.nombre!.trim(),
        unidad_compra: form.unidad_compra!.trim(),
        kg_por_unidad: form.kg_por_unidad,
        coeficiente: Number(form.coeficiente ?? 0),
        precio: form.precio ?? null,
      }

      if (creando) {
        const { data, error: err } = await supabase
          .from('fabrica_materia_prima')
          .insert([{ ...body, estado: 'activo' }])
          .select()
          .single()
        if (err) { toast.error(err.message); return }
        setItems(prev => [...prev, data])
        toast.success('Materia prima creada')
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('fabrica_materia_prima')
          .update(body)
          .eq('id', editando.id)
          .select()
          .single()
        if (err) { toast.error(err.message); return }
        setItems(prev => prev.map(i => i.id === editando.id ? data : i))
        toast.success('Cambios guardados')
      }
      cerrarForm()
    })
  }

  async function archivar(i: MateriaPrima) {
    const nuevoEstado = i.estado === 'activo' ? 'archivado' : 'activo'
    const { data, error: err } = await supabase
      .from('fabrica_materia_prima')
      .update({ estado: nuevoEstado })
      .eq('id', i.id)
      .select()
      .single()
    if (err) { toast.error(err.message); return }
    setItems(prev => prev.map(x => x.id === i.id ? data : x))
    toast.success(nuevoEstado === 'archivado' ? 'Materia prima archivada' : 'Materia prima reactivada')
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    startTransition(async () => {
      const { error: err } = await supabase.from('fabrica_materia_prima').delete().eq('id', eliminando.id)
      if (err) { toast.error('No se pudo eliminar — ya está en uso en algún conteo o pedido. Probá archivarla en su lugar.'); return }
      setItems(prev => prev.filter(i => i.id !== eliminando.id))
      toast.success('Materia prima eliminada')
      setEliminando(null)
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Materia prima</h1>
          <p className="text-[#888] text-sm mt-0.5">
            {items.filter(i => i.estado === 'activo').length} activas · {items.filter(i => i.estado === 'archivado').length} archivadas
          </p>
        </div>
        <button onClick={abrirCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nueva materia prima
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar materia prima..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#e8c547] w-64"
          />
        </div>
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

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">
            {items.length === 0 ? 'Todavía no hay materia prima. Usá "+ Nueva materia prima" para crear la primera.' : 'Ningún resultado para tu búsqueda.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Unidad de compra</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Kg/unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Coeficiente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Precio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(i => (
                  <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{i.nombre}</td>
                    <td className="px-4 py-3 text-[#888]">{nombreProveedor(i.proveedor_id)}</td>
                    <td className="px-4 py-3 text-[#888]">{i.unidad_compra}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.kg_por_unidad}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.coeficiente}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.precio != null ? `$${i.precio.toLocaleString('es-AR')}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${i.estado === 'activo' ? 'bg-green-900/50 text-green-300' : 'bg-[#2a2a2a] text-[#666]'}`}>
                        {i.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => abrirEditar(i)}
                          title="Editar"
                          aria-label={`Editar ${i.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => archivar(i)}
                          title={i.estado === 'activo' ? 'Archivar' : 'Reactivar'}
                          aria-label={i.estado === 'activo' ? `Archivar ${i.nombre}` : `Reactivar ${i.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
                        >
                          {i.estado === 'activo' ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                        </button>
                        <button
                          onClick={() => setEliminando(i)}
                          title="Eliminar"
                          aria-label={`Eliminar ${i.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={15} />
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

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nueva materia prima' : `Editar — ${editando?.nombre}`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
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
            <label className={labelClass}>Unidad de compra *</label>
            <input className={inputClass} placeholder="Ej: Bolsa, Caja, Sardo, Pote" value={form.unidad_compra ?? ''} onChange={e => setForm(f => ({...f, unidad_compra: e.target.value}))} />
          </div>
          <div>
            <label className={labelClass}>
              Kg por unidad *
              <HelpTooltip text="Cuántos kg trae cada unidad de compra. Por ejemplo, una bolsa de fécula trae 25kg." />
            </label>
            <input type="number" step="0.01" className={inputClass} value={form.kg_por_unidad ?? 0} onChange={e => setForm(f => ({...f, kg_por_unidad: Number(e.target.value)}))} />
          </div>
          <div>
            <label className={labelClass}>
              Coeficiente
              <HelpTooltip text="Kg de esta materia prima que se necesitan por cada kg de masa producida. La necesidad sugerida = coeficiente × kg de masa proyectados. Dejalo en 0 si no entra en la receta (por ejemplo, Pategrás)." />
            </label>
            <input type="number" step="0.00001" className={inputClass} value={form.coeficiente ?? 0} onChange={e => setForm(f => ({...f, coeficiente: Number(e.target.value)}))} />
          </div>
          <div>
            <label className={labelClass}>Precio</label>
            <input type="number" step="0.01" className={inputClass} value={form.precio ?? ''} onChange={e => setForm(f => ({...f, precio: e.target.value === '' ? null : Number(e.target.value)}))} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={guardar} disabled={isPending} className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={cerrarForm} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            Cancelar
          </button>
        </div>
      </Modal>

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar materia prima" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.nombre}</span>? Esta acción no se puede deshacer. Si ya se usó en algún conteo o pedido, no se va a poder eliminar — archivala en su lugar.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminando(null)} disabled={isPending} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarEliminar} disabled={isPending} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
