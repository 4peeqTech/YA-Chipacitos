'use client'

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Redondeo } from '@/lib/fabrica/calculoSugerido'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface ProveedorOption {
  id: string
  nombre: string
}

interface CategoriaOption {
  id: string
  nombre: string
}

interface CompraItem {
  id: string
  proveedor_id: string
  categoria_id: string | null
  nombre: string
  unidad: string
  meta_semanal: number
  cantidad_por_unidad: number
  cantidad_por_masa: number
  redondeo: Redondeo
  precio: number | null
  incluir_en_conteo: boolean
  estado: 'activo' | 'archivado'
}

type FiltroEstado = 'activo' | 'archivado' | 'todos'

const REDONDEO_LABEL: Record<Redondeo, string> = {
  estandar: 'Estándar (redondeo al medio)',
  siempre_arriba: 'Siempre hacia arriba',
  siempre_abajo: 'Siempre hacia abajo',
  sin_calculo: 'Sin cálculo (solo stock)',
}

const emptyForm = (): Partial<CompraItem> => ({
  proveedor_id: '',
  categoria_id: null,
  nombre: '',
  unidad: '',
  cantidad_por_unidad: 1,
  cantidad_por_masa: 0,
  redondeo: 'estandar',
  precio: null,
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
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | 'todas'>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<CompraItem | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<CompraItem>>(emptyForm())
  const [eliminando, setEliminando] = useState<CompraItem | null>(null)
  const [isPending, startTransition] = useTransition()
  const toast = useToasts()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'
  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre ?? '—'

  const filtrados = items
    .filter(i => {
      const matchEstado = filtro === 'todos' || i.estado === filtro
      const matchCategoria = categoriaFiltro === 'todas' || i.categoria_id === categoriaFiltro
      const matchBusqueda = i.nombre.toLowerCase().includes(busqueda.toLowerCase())
      return matchEstado && matchCategoria && matchBusqueda
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

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
        setItems(prev => [...prev, data])
        toast.success('Insumo creado')
      } else if (editando) {
        const { data, error: err } = await supabase
          .from('compras_items')
          .update({ ...form })
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

  async function confirmarEliminar() {
    if (!eliminando) return
    startTransition(async () => {
      const { error: err } = await supabase.from('compras_items').delete().eq('id', eliminando.id)
      if (err) { toast.error('No se pudo eliminar — ya está en uso en algún conteo o pedido. Probá archivarlo en su lugar.'); return }
      setItems(prev => prev.filter(i => i.id !== eliminando.id))
      toast.success('Insumo eliminado')
      setEliminando(null)
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

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

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategoriaFiltro('todas')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${categoriaFiltro === 'todas' ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'}`}
        >
          Todas las categorías
        </button>
        {categorias.map(c => (
          <button
            key={c.id}
            onClick={() => setCategoriaFiltro(c.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${categoriaFiltro === c.id ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'}`}
          >
            {c.nombre}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Cant./masa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Redondeo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Precio</th>
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
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{i.cantidad_por_masa > 0 ? i.cantidad_por_masa : '—'}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell text-xs">{REDONDEO_LABEL[i.redondeo] ?? i.redondeo}</td>
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

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nuevo insumo' : `Editar — ${editando?.nombre}`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
          </div>
          <div>
            <label className={labelClass}>Proveedor *</label>
            <SelectBuscador
              value={form.proveedor_id ?? ''}
              onChange={v => setForm(f => ({...f, proveedor_id: v}))}
              opciones={proveedores.map(p => ({ value: p.id, label: p.nombre }))}
              placeholderVacio="Seleccionar..."
            />
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            <select className={inputClass} value={form.categoria_id ?? ''} onChange={e => setForm(f => ({...f, categoria_id: e.target.value || null}))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Unidad de compra *</label>
            <input className={inputClass} placeholder="Ej: kg, Bolsa, Caja, Cajón" value={form.unidad ?? ''} onChange={e => setForm(f => ({...f, unidad: e.target.value}))} />
          </div>
          <div>
            <label className={labelClass}>
              Cantidad por unidad
              <HelpTooltip text="Cuánto trae cada unidad de compra. Por ejemplo, una bolsa de fécula trae 25kg, o un cajón de huevos trae 360 unidades." />
            </label>
            <InputNumero placeholder="1" className={inputClass} value={form.cantidad_por_unidad ?? null} onChange={v => setForm(f => ({...f, cantidad_por_unidad: v ?? 1}))} />
          </div>
          <div>
            <label className={labelClass}>
              Cantidad por masa
              <HelpTooltip text="Cuánto de este insumo entra en una masa (un batch de producción) — la receta. La necesidad sugerida = cantidad por masa × masas proyectadas. Dejalo en 0 si no entra en ninguna receta." />
            </label>
            <InputNumero placeholder="0" className={inputClass} value={!form.cantidad_por_masa ? null : form.cantidad_por_masa} onChange={v => setForm(f => ({...f, cantidad_por_masa: v ?? 0}))} />
          </div>
          <div>
            <label className={labelClass}>
              Redondeo
              <HelpTooltip text="Cómo redondear cuántas unidades pedir al cerrar el conteo. Estándar: si falta menos de media unidad no se pide, si falta media o más se pide una entera. Siempre hacia arriba: cualquier faltante pide una unidad completa. Siempre hacia abajo: un faltante menor a una unidad no pide nada. Sin cálculo: no participa del pedido complementario — se repone solo vía el Pedido base semanal." />
            </label>
            <select className={inputClass} value={form.redondeo ?? 'estandar'} onChange={e => setForm(f => ({...f, redondeo: e.target.value as Redondeo}))}>
              {Object.entries(REDONDEO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Precio</label>
            <InputNumero className={inputClass} value={form.precio ?? null} onChange={v => setForm(f => ({...f, precio: v}))} />
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

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar insumo" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.nombre}</span>? Esta acción no se puede deshacer. Si ya se usó en algún conteo o pedido, no se va a poder eliminar — archivalo en su lugar.
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
