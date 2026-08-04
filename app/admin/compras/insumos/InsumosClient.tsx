'use client'

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface ProveedorOption {
  id: string
  nombre: string
}

interface CategoriaOption {
  id: string
  nombre: string
}

type BaseCalculo = 'kg_masa' | 'kg_embolsado' | 'meta_semanal'

interface CompraItem {
  id: string
  proveedor_id: string
  categoria_id: string | null
  nombre: string
  unidad: string
  meta_semanal: number
  coeficiente: number | null
  base_calculo: BaseCalculo
  incluir_en_conteo: boolean
  orden: number
  estado: 'activo' | 'archivado'
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const BASE_CALCULO_LABEL: Record<BaseCalculo, string> = {
  kg_masa: 'Kg de masa',
  kg_embolsado: 'Kg embolsado',
  meta_semanal: 'Meta semanal',
}

const emptyForm = (): Partial<CompraItem> => ({
  proveedor_id: '',
  categoria_id: null,
  nombre: '',
  unidad: '',
  meta_semanal: 0,
  coeficiente: null,
  base_calculo: 'meta_semanal',
  incluir_en_conteo: true,
  orden: 0,
  estado: 'activo',
})

export default function InsumosClient({
  itemsIniciales,
  proveedores,
  categorias,
}: {
  itemsIniciales: CompraItem[]
  proveedores: ProveedorOption[]
  categorias: CategoriaOption[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<CompraItem[]>(itemsIniciales)
  const [filtro, setFiltro] = useState<FiltroEstado>('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<CompraItem | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<CompraItem>>(emptyForm())
  const [isPending, startTransition] = useTransition()
  const toast = useToasts()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'
  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre ?? '—'

  const filtrados = items.filter(i => {
    const matchEstado = filtro === 'todos' || i.estado === filtro
    const matchBusqueda = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchBusqueda
  })

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(i: CompraItem) {
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
    if (!form.unidad?.trim()) { toast.error('La unidad es requerida'); return }

    startTransition(async () => {
      if (creando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .insert([{ ...form, estado: 'activo' }])
          .select()
          .single()
        if (err) { toast.error(err.message); return }
        setItems(prev => [...prev, data].sort((a, b) => a.orden - b.orden))
        toast.success('Insumo creado')
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .update({ ...form })
          .eq('id', editando.id)
          .select()
          .single()
        if (err) { toast.error(err.message); return }
        setItems(prev => prev.map(i => i.id === editando.id ? data : i).sort((a, b) => a.orden - b.orden))
        toast.success('Cambios guardados')
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
    if (err) { toast.error(err.message); return }
    setItems(prev => prev.map(x => x.id === i.id ? data : x))
    toast.success(nuevoEstado === 'archivado' ? 'Insumo archivado' : 'Insumo reactivado')
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"
  const helpClass = "text-[11px] text-[#666] mt-1 leading-snug"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Insumos</h1>
          <p className="text-[#888] text-sm mt-0.5">{items.filter(i => i.estado === 'activo').length} activos · {items.filter(i => i.estado === 'archivado').length} archivados</p>
        </div>
        <button onClick={abrirCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nuevo insumo
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar insumo..."
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
            {items.length === 0 ? 'Todavía no hay insumos. Usá "+ Nuevo insumo" para crear el primero.' : 'Ningún resultado para tu búsqueda.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Categoría</th>
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
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{nombreCategoria(i.categoria_id)}</td>
                    <td className="px-4 py-3 text-[#888]">{nombreProveedor(i.proveedor_id)}</td>
                    <td className="px-4 py-3 text-[#888]">{i.unidad}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{i.meta_semanal}</td>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nuevo insumo' : `Editar — ${editando?.nombre}`}>
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
            <label className={labelClass}>Unidad *</label>
            <input className={inputClass} placeholder="Ej: kg, unidad, docena" value={form.unidad ?? ''} onChange={e => setForm(f => ({...f, unidad: e.target.value}))} />
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            <select className={inputClass} value={form.categoria_id ?? ''} onChange={e => setForm(f => ({...f, categoria_id: e.target.value || null}))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Orden</label>
            <input type="number" className={inputClass} value={form.orden ?? 0} onChange={e => setForm(f => ({...f, orden: Number(e.target.value)}))} />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Base de cálculo</label>
            <select className={inputClass} value={form.base_calculo ?? 'meta_semanal'} onChange={e => setForm(f => ({...f, base_calculo: e.target.value as BaseCalculo}))}>
              {Object.entries(BASE_CALCULO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p className={helpClass}>
              Define cómo se calcula cuánto sugerir comprar de este insumo al cerrar el conteo semanal:
              proporcional a los <strong className="text-[#888]">kg de masa</strong> proyectados, a los{' '}
              <strong className="text-[#888]">kg embolsados</strong>, o una <strong className="text-[#888]">meta semanal</strong> fija
              — un monto objetivo que no depende de cuánto se produce esa semana (útil para insumos como bolsas o
              artículos de limpieza, que se reponen a un ritmo propio y no escalan con la producción).
            </p>
          </div>

          {form.base_calculo !== 'meta_semanal' ? (
            <div>
              <label className={labelClass}>Coeficiente (por kg)</label>
              <input type="number" step="0.01" className={inputClass} value={form.coeficiente ?? ''} onChange={e => setForm(f => ({...f, coeficiente: e.target.value === '' ? null : Number(e.target.value)}))} />
              <p className={helpClass}>Cuánto de este insumo se consume por cada kg proyectado. La necesidad sugerida = coeficiente × kg proyectados.</p>
            </div>
          ) : (
            <div>
              <label className={labelClass}>Meta semanal</label>
              <input type="number" step="0.01" className={inputClass} value={form.meta_semanal ?? 0} onChange={e => setForm(f => ({...f, meta_semanal: Number(e.target.value)}))} />
              <p className={helpClass}>Cantidad fija que querés tener disponible cada semana, sin importar cuánto se produzca.</p>
            </div>
          )}

          <div className="md:col-span-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-[#f0f0f0]">
              <input type="checkbox" checked={form.incluir_en_conteo ?? true} onChange={e => setForm(f => ({...f, incluir_en_conteo: e.target.checked}))} />
              Incluir en conteo semanal
            </label>
            <p className={helpClass}>
              Con esto tildado, el insumo aparece en la pantalla de conteo semanal de fábrica para que lo cuenten a mano
              y el sistema calcule cuánto falta pedir. Destildalo para insumos que no se controlan semana a semana
              (por ejemplo, algo que se compra ocasionalmente y no vale la pena contar cada vez).
            </p>
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

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
