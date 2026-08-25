'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Pencil, Plus, Star, Trash2,
  Truck, User, Package, CalendarDays, MapPin, Receipt, Store, CreditCard,
} from 'lucide-react'
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

const VARIABLES: { key: string; label: string; desc: string; icon: typeof Truck }[] = [
  { key: 'proveedor', label: 'Proveedor', desc: 'Nombre del proveedor (mayúsculas)', icon: Truck },
  { key: 'contacto', label: 'Contacto', desc: 'Contacto del proveedor', icon: User },
  { key: 'items', label: 'Detalle del pedido', desc: 'Lista de ítems del pedido', icon: Package },
  { key: 'fecha', label: 'Fecha', desc: 'Fecha de hoy', icon: CalendarDays },
  { key: 'dia', label: 'Día', desc: 'Día de la semana', icon: CalendarDays },
  { key: 'entrega', label: 'Entrega', desc: 'Bloque de dirección de entrega (si el proveedor tiene local asignado)', icon: MapPin },
  { key: 'facturacion', label: 'Facturación', desc: 'Bloque de datos de facturación (si el proveedor tiene local asignado)', icon: Receipt },
  { key: 'local_suc', label: 'Sucursal', desc: 'Nombre de la sucursal del local', icon: Store },
  { key: 'local_direccion', label: 'Dirección del local', desc: 'Dirección del local', icon: MapPin },
  { key: 'local_cuit', label: 'CUIT del local', desc: 'CUIT del local', icon: CreditCard },
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
  const [textareaDragOver, setTextareaDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Recuerda dónde estaba el cursor la última vez que el usuario tocó el textarea,
  // así un clic en una variable inserta ahí aunque el foco haya pasado al botón.
  // Sin ningún clic previo (null) inserta al final — no hace falta "primero
  // posicionar el cursor" para usar las variables.
  const cursorPos = useRef<number | null>(null)

  function abrirCrear() {
    setForm(emptyForm())
    cursorPos.current = null
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(p: Plantilla) {
    setForm({ ...p })
    cursorPos.current = null
    setEditando(p)
    setCreando(false)
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
  }

  function recordarCursor(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    cursorPos.current = e.currentTarget.selectionStart
  }

  function insertarVariable(key: string) {
    const token = `{{${key}}}`
    const actual = form.cuerpo ?? ''
    const pos = cursorPos.current ?? actual.length
    const nuevo = actual.slice(0, pos) + token + actual.slice(pos)
    const nuevaPos = pos + token.length
    setForm(f => ({ ...f, cuerpo: nuevo }))
    cursorPos.current = nuevaPos
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(nuevaPos, nuevaPos)
    })
  }

  async function guardar() {
    if (!form.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.cuerpo?.trim()) { toast.error('El cuerpo es requerido'); return }

    startTransition(async () => {
      const nombre = form.nombre!.trim()
      const cuerpo = form.cuerpo!.trim()

      if (creando) {
        // Activa/default se manejan desde la lista, no al crear — una plantilla
        // nueva arranca inactiva de default y al final del orden.
        const orden = plantillas.length ? Math.max(...plantillas.map(p => p.orden)) + 1 : 0
        const { data, error } = await supabase
          .from('compras_plantillas_mensaje')
          .insert([{ nombre, cuerpo, es_default: false, activo: true, orden }])
          .select()
          .single()
        if (error) { toast.error(error.message); return }
        setPlantillas(prev => [...prev, data])
        toast.success('Plantilla creada')
      } else if (editando) {
        const { data, error } = await supabase
          .from('compras_plantillas_mensaje')
          .update({ nombre, cuerpo, updated_at: new Date().toISOString() })
          .eq('id', editando.id)
          .select()
          .single()
        if (error) { toast.error(error.message); return }
        setPlantillas(prev => prev.map(p => p.id === editando.id ? data : p))
        toast.success('Cambios guardados')
      }
      cerrarForm()
    })
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
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} value={form.nombre ?? ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>
              Variables
              <HelpTooltip text="Arrastrá una variable hasta el punto exacto del mensaje, o hacé clic para agregarla donde tengas el cursor (al final si no tocaste el texto todavía)." />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  title={v.desc}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', `{{${v.key}}}`)}
                  onClick={() => insertarVariable(v.key)}
                  className="flex items-center gap-1.5 text-xs text-[#ccc] hover:text-[#e8c547] bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#e8c547] rounded-lg px-2.5 py-1.5 cursor-grab active:cursor-grabbing transition-colors"
                >
                  <v.icon size={13} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Cuerpo *</label>
            <textarea
              ref={textareaRef}
              className={`${inputClass} resize-none transition-colors ${textareaDragOver ? 'border-[#e8c547] ring-1 ring-[#e8c547]' : ''}`}
              rows={8}
              value={form.cuerpo ?? ''}
              onChange={e => { setForm(f => ({ ...f, cuerpo: e.target.value })); recordarCursor(e) }}
              onSelect={recordarCursor}
              onClick={recordarCursor}
              onKeyUp={recordarCursor}
              onDragOver={e => { e.preventDefault(); setTextareaDragOver(true) }}
              onDragLeave={() => setTextareaDragOver(false)}
              onDrop={() => setTextareaDragOver(false)}
            />
          </div>

          <div>
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
