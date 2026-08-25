'use client'

import { useRef, useState, useTransition } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderPlantilla, type ContextoMensaje } from '@/lib/compras/pedidoMensaje'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

interface Plantilla {
  id: string
  nombre: string
  cuerpo: string
  es_default: boolean
  activo: boolean
  orden: number
}

const VARIABLES: { key: string; desc: string }[] = [
  { key: 'proveedor', desc: 'Nombre del proveedor (mayúsculas)' },
  { key: 'contacto', desc: 'Contacto del proveedor' },
  { key: 'items', desc: 'Detalle de ítems del pedido' },
  { key: 'fecha', desc: 'Fecha de hoy' },
  { key: 'dia', desc: 'Día de la semana' },
  { key: 'entrega', desc: 'Bloque de entrega (si el proveedor tiene local asignado)' },
  { key: 'facturacion', desc: 'Bloque de facturación (si el proveedor tiene local asignado)' },
  { key: 'local_suc', desc: 'Sucursal del local' },
  { key: 'local_direccion', desc: 'Dirección del local' },
  { key: 'local_cuit', desc: 'CUIT del local' },
]

const EJEMPLO: ContextoMensaje = {
  proveedorNombre: 'Distribuidora Ejemplo',
  contactoNombre: 'Juan Pérez',
  local: 'paraguay',
  items: [
    { descripcion: 'Harina 000', unidad: 'kg', cantidad: 25 },
    { descripcion: 'Huevos', unidad: 'cajón', cantidad: 2 },
  ],
}

const emptyForm = (): Partial<Plantilla> => ({
  nombre: '',
  cuerpo: '',
  es_default: false,
  activo: true,
})

export default function PlantillasClient({ plantillasIniciales }: { plantillasIniciales: Plantilla[] }) {
  const supabase = createClient()
  const toast = useToasts()
  const [plantillas, setPlantillas] = useState<Plantilla[]>(plantillasIniciales)
  const [editando, setEditando] = useState<Plantilla | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<Plantilla>>(emptyForm())
  const [eliminando, setEliminando] = useState<Plantilla | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(p: Plantilla) {
    setForm({ ...p })
    setEditando(p)
    setCreando(false)
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
  }

  function insertarVariable(key: string) {
    const token = `{{${key}}}`
    const textarea = textareaRef.current
    const actual = form.cuerpo ?? ''
    if (!textarea) {
      setForm(f => ({ ...f, cuerpo: actual + token }))
      return
    }
    const inicio = textarea.selectionStart ?? actual.length
    const fin = textarea.selectionEnd ?? actual.length
    const nuevo = actual.slice(0, inicio) + token + actual.slice(fin)
    setForm(f => ({ ...f, cuerpo: nuevo }))
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = inicio + token.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  // El índice único de es_default no "corre" al anterior — hay que desmarcarlo
  // en un paso aparte antes de guardar este como default, si no la escritura falla.
  async function guardar() {
    if (!form.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.cuerpo?.trim()) { toast.error('El cuerpo es requerido'); return }

    startTransition(async () => {
      const esDefault = form.es_default ?? false

      if (esDefault) {
        let query = supabase.from('compras_plantillas_mensaje').update({ es_default: false }).eq('es_default', true)
        if (editando) query = query.neq('id', editando.id)
        const { error: errUnset } = await query
        if (errUnset) { toast.error(errUnset.message); return }
      }

      // Sin input manual de orden: una nueva plantilla va al final de la lista;
      // al editar, conserva el orden que ya tenía.
      const orden = creando
        ? (plantillas.length ? Math.max(...plantillas.map(p => p.orden)) + 1 : 0)
        : editando!.orden

      const body = {
        nombre: form.nombre!.trim(),
        cuerpo: form.cuerpo!.trim(),
        es_default: esDefault,
        activo: form.activo ?? true,
        orden,
        updated_at: new Date().toISOString(),
      }

      if (creando) {
        const { data, error } = await supabase.from('compras_plantillas_mensaje').insert([body]).select().single()
        if (error) { toast.error(error.message); return }
        setPlantillas(prev => aplicarDefault([...prev, data], data))
        toast.success('Plantilla creada')
      } else if (editando) {
        const { data, error } = await supabase.from('compras_plantillas_mensaje').update(body).eq('id', editando.id).select().single()
        if (error) { toast.error(error.message); return }
        setPlantillas(prev => aplicarDefault(prev.map(p => p.id === editando.id ? data : p), data))
        toast.success('Cambios guardados')
      }
      cerrarForm()
    })
  }

  function aplicarDefault(lista: Plantilla[], guardada: Plantilla): Plantilla[] {
    if (!guardada.es_default) return lista
    return lista.map(p => p.id === guardada.id ? p : { ...p, es_default: false })
  }

  async function marcarDefault(p: Plantilla) {
    if (p.es_default) return
    const { error: errUnset } = await supabase.from('compras_plantillas_mensaje').update({ es_default: false }).eq('es_default', true)
    if (errUnset) { toast.error(errUnset.message); return }
    const { data, error } = await supabase
      .from('compras_plantillas_mensaje')
      .update({ es_default: true, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setPlantillas(prev => prev.map(x => x.id === p.id ? data : { ...x, es_default: false }))
    toast.success('Marcada como default')
  }

  async function toggleActivo(p: Plantilla) {
    const { data, error } = await supabase
      .from('compras_plantillas_mensaje')
      .update({ activo: !p.activo, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setPlantillas(prev => prev.map(x => x.id === p.id ? data : x))
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    startTransition(async () => {
      const { error } = await supabase.from('compras_plantillas_mensaje').delete().eq('id', eliminando.id)
      if (error) { toast.error(error.message || 'No se pudo eliminar'); return }
      setPlantillas(prev => prev.filter(p => p.id !== eliminando.id))
      toast.success('Plantilla eliminada')
      setEliminando(null)
    })
  }

  const preview = form.cuerpo?.trim() ? renderPlantilla(form.cuerpo, EJEMPLO) : ''

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Plantillas de mensaje</h1>
          <p className="text-[#888] text-sm mt-0.5">Formato del mensaje de WhatsApp al armar un pedido a proveedor.</p>
        </div>
        <button onClick={abrirCrear} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nueva plantilla
        </button>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {plantillas.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">Todavía no hay plantillas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Default</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {[...plantillas].sort((a, b) => a.orden - b.orden).map(p => (
                  <tr key={p.id} className={`hover:bg-[#1a1a1a] transition-colors ${!p.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{p.nombre}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => marcarDefault(p)}
                        title={p.es_default ? 'Plantilla default' : 'Marcar como default'}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${p.es_default ? 'text-[#e8c547]' : 'text-[#444] hover:text-[#888]'}`}
                      >
                        <Star size={16} fill={p.es_default ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActivo(p)}
                        title={p.activo ? 'Desactivar' : 'Activar'}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          p.activo ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#666]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${p.activo ? 'bg-green-400' : 'bg-[#555]'}`} />
                        {p.activo ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => abrirEditar(p)}
                          title="Editar"
                          aria-label={`Editar ${p.nombre}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setEliminando(p)}
                          title="Eliminar"
                          aria-label={`Eliminar ${p.nombre}`}
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

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nueva plantilla' : `Editar — ${editando?.nombre}`} size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="md:col-span-2 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-[#f0f0f0]">
              <input type="checkbox" checked={form.activo ?? true} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-[#e8c547]" />
              Activa
            </label>
            <label className="flex items-center gap-2 text-sm text-[#f0f0f0]">
              <input type="checkbox" checked={form.es_default ?? false} onChange={e => setForm(f => ({ ...f, es_default: e.target.checked }))} className="w-4 h-4 accent-[#e8c547]" />
              Default
            </label>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>
              Variables
              <HelpTooltip text="Clic para insertar en el cursor del cuerpo del mensaje." />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  title={v.desc}
                  onClick={() => insertarVariable(v.key)}
                  className="text-xs text-[#ccc] hover:text-[#e8c547] font-mono bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#e8c547] rounded-lg px-2 py-1 transition-colors"
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Cuerpo *</label>
            <textarea
              ref={textareaRef}
              className={`${inputClass} font-mono resize-none`}
              rows={8}
              value={form.cuerpo ?? ''}
              onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Vista previa (con datos de ejemplo)</label>
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
              <pre className="text-[#e0e0e0] text-sm whitespace-pre-wrap font-sans">{preview || 'Escribí el cuerpo para ver la vista previa.'}</pre>
            </div>
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

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar plantilla" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.nombre}</span>? Esta acción no se puede deshacer.
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
