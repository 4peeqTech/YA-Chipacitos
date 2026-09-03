'use client'

import { useState, useTransition } from 'react'
import { Receipt, Plus, Pencil, Trash2, Store, Building2, CreditCard, MapPin, Hash } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface LocalFacturacion {
  id: string
  slug: string
  nombre: string
  sucursal: string
  razon_social: string
  cuit: string
  direccion: string
  activo: boolean
  orden: number
}

const emptyForm = (): Partial<LocalFacturacion> => ({
  slug: '',
  nombre: '',
  sucursal: '',
  razon_social: '',
  cuit: '',
  direccion: '',
})

export default function FacturacionClient({ localesIniciales }: { localesIniciales: LocalFacturacion[] }) {
  const supabase = createClient()
  const toast = useToasts()
  const [locales, setLocales] = useState<LocalFacturacion[]>(localesIniciales)
  const [editando, setEditando] = useState<LocalFacturacion | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<LocalFacturacion>>(emptyForm())
  const [eliminando, setEliminando] = useState<LocalFacturacion | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(l: LocalFacturacion) {
    setForm({ ...l })
    setEditando(l)
    setCreando(false)
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
  }

  async function guardar() {
    if (!form.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.slug?.trim()) { toast.error('El slug es requerido'); return }
    if (!form.sucursal?.trim()) { toast.error('La sucursal es requerida'); return }
    if (!form.razon_social?.trim()) { toast.error('La razón social es requerida'); return }
    if (!form.cuit?.trim()) { toast.error('El CUIT es requerido'); return }
    if (!form.direccion?.trim()) { toast.error('La dirección es requerida'); return }

    startTransition(async () => {
      const datos = {
        slug: form.slug!.trim(),
        nombre: form.nombre!.trim(),
        sucursal: form.sucursal!.trim(),
        razon_social: form.razon_social!.trim(),
        cuit: form.cuit!.trim(),
        direccion: form.direccion!.trim(),
      }

      if (creando) {
        const orden = locales.length ? Math.max(...locales.map(l => l.orden)) + 1 : 0
        const { data, error } = await supabase
          .from('locales_facturacion')
          .insert([{ ...datos, activo: true, orden }])
          .select()
          .single()
        if (error) { toast.error(error.message); return }
        setLocales(prev => [...prev, data])
        toast.success('Local creado')
      } else if (editando) {
        const { data, error } = await supabase
          .from('locales_facturacion')
          .update({ ...datos, updated_at: new Date().toISOString() })
          .eq('id', editando.id)
          .select()
          .single()
        if (error) { toast.error(error.message); return }
        setLocales(prev => prev.map(l => l.id === editando.id ? data : l))
        toast.success('Cambios guardados')
      }
      cerrarForm()
    })
  }

  async function toggleActivo(l: LocalFacturacion) {
    const { data, error } = await supabase
      .from('locales_facturacion')
      .update({ activo: !l.activo, updated_at: new Date().toISOString() })
      .eq('id', l.id)
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setLocales(prev => prev.map(x => x.id === l.id ? data : x))
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    startTransition(async () => {
      const { error } = await supabase.from('locales_facturacion').delete().eq('id', eliminando.id)
      if (error) { toast.error(error.message || 'No se pudo eliminar'); return }
      setLocales(prev => prev.filter(l => l.id !== eliminando.id))
      toast.success('Local eliminado')
      setEliminando(null)
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#f0f0f0]"><Receipt size={22} className="text-[#e8c547]" /> Datos de facturación</h1>
          <p className="text-[#888] text-sm mt-0.5">Locales con su razón social, CUIT y dirección — se eligen al armar un pedido a proveedor.</p>
        </div>
        <button onClick={abrirCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nuevo local
        </button>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {locales.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">Todavía no hay locales de facturación.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Razón social</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">CUIT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {[...locales].sort((a, b) => a.orden - b.orden).map(l => (
                  <tr key={l.id} className={`hover:bg-[#1a1a1a] transition-colors ${!l.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{l.nombre}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{l.razon_social}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{l.cuit}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActivo(l)}
                        title={l.activo ? 'Desactivar' : 'Activar'}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          l.activo ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#666]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${l.activo ? 'bg-green-400' : 'bg-[#555]'}`} />
                        {l.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => abrirEditar(l)}
                          title="Editar"
                          aria-label={`Editar ${l.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setEliminando(l)}
                          title="Eliminar"
                          aria-label={`Eliminar ${l.nombre}`}
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

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nuevo local' : `Editar — ${editando?.nombre}`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} placeholder="Ej: Paraguay 388" value={form.nombre ?? ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}><Hash size={13} className="text-[#666]" /> Slug *</label>
            <input
              className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              placeholder="Ej: paraguay"
              value={form.slug ?? ''}
              disabled={!!editando}
              title={editando ? 'El slug no se puede cambiar una vez creado — lo referencian proveedores y pedidos existentes' : undefined}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}><Store size={13} className="text-[#666]" /> Sucursal *</label>
            <input className={inputClass} placeholder="Ej: SUC. PARAGUAY" value={form.sucursal ?? ''} onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}><Building2 size={13} className="text-[#666]" /> Razón social *</label>
            <input className={inputClass} placeholder="Ej: YA ! CHIPACITOS" value={form.razon_social ?? ''} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}><CreditCard size={13} className="text-[#666]" /> CUIT *</label>
            <input className={inputClass} placeholder="33-71770212-9" value={form.cuit ?? ''} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}><MapPin size={13} className="text-[#666]" /> Dirección *</label>
            <input className={inputClass} placeholder="Ej: PARAGUAY 388" value={form.direccion ?? ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={guardar} disabled={isPending} className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={cerrarForm} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            Cancelar
          </button>
        </div>
      </Modal>

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar local" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.nombre}</span>? Los proveedores y pedidos que lo tengan asignado quedan sin local. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminando(null)} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors">
            Cancelar
          </button>
          <button onClick={confirmarEliminar} disabled={isPending} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-red-500 transition-colors">
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
