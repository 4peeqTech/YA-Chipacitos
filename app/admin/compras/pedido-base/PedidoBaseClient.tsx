'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, GripVertical, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import { useToasts, ToastStack } from '@/components/ui/Toast'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface ProveedorOption {
  id: string
  nombre: string
}

interface CatalogoItem {
  id: string
  nombre: string
  unidad: string
  proveedorPrincipalId: string | null
  proveedoresAsociados: string[]
}

interface PlantillaLinea {
  id: string
  item_id: string | null
  descripcion: string
  proveedor_id: string
  unidad: string | null
  cantidad: number
  orden: number
  activo: boolean
}

const emptyForm = (): Partial<PlantillaLinea> => ({
  item_id: null,
  descripcion: '',
  proveedor_id: '',
  unidad: '',
  cantidad: 0,
  activo: true,
})

function FilaPlantilla({
  linea,
  nombreProveedor,
  onToggleActivo,
  onEditar,
  onEliminar,
}: {
  linea: PlantillaLinea
  nombreProveedor: (id: string) => string
  onToggleActivo: (l: PlantillaLinea) => void
  onEditar: (l: PlantillaLinea) => void
  onEliminar: (l: PlantillaLinea) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: linea.id })

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.5 : undefined,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`hover:bg-[#1a1a1a] transition-colors ${!linea.activo ? 'opacity-50' : ''}`}
    >
      <td className="px-2 py-3">
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Reordenar ${linea.descripcion}`}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#555] hover:text-[#e8c547] cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={15} />
        </button>
      </td>
      <td className="px-4 py-3 text-[#f0f0f0] font-medium">{linea.descripcion}</td>
      <td className="px-4 py-3 text-[#888]">{nombreProveedor(linea.proveedor_id)}</td>
      <td className="px-4 py-3 text-[#888]">{linea.cantidad} {linea.unidad}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onToggleActivo(linea)}
          title={linea.activo ? 'Desactivar' : 'Activar'}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            linea.activo ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#666]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${linea.activo ? 'bg-green-400' : 'bg-[#555]'}`} />
          {linea.activo ? 'Activa' : 'Inactiva'}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onEditar(linea)}
            title="Editar"
            aria-label={`Editar ${linea.descripcion}`}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onEliminar(linea)}
            title="Eliminar"
            aria-label={`Eliminar ${linea.descripcion}`}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function PedidoBaseClient({
  plantillaInicial,
  proveedores,
  itemsCatalogo,
}: {
  plantillaInicial: PlantillaLinea[]
  proveedores: ProveedorOption[]
  itemsCatalogo: CatalogoItem[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [lineas, setLineas] = useState(plantillaInicial)
  const [editando, setEditando] = useState<PlantillaLinea | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<PlantillaLinea>>(emptyForm())
  const [eliminando, setEliminando] = useState<PlantillaLinea | null>(null)
  const [generando, setGenerando] = useState(false)
  const [isPending, startTransition] = useTransition()

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? '—'
  const activas = lineas.filter(l => l.activo)

  function abrirCrear() {
    setForm(emptyForm())
    setEditando(null)
    setCreando(true)
  }

  function abrirEditar(l: PlantillaLinea) {
    setForm({ ...l })
    setEditando(l)
    setCreando(false)
  }

  function cerrarForm() {
    setCreando(false)
    setEditando(null)
  }

  function elegirItem(itemId: string) {
    if (!itemId) { setForm(f => ({ ...f, item_id: null })); return }
    const item = itemsCatalogo.find(i => i.id === itemId)
    if (!item) return
    setForm(f => ({
      ...f,
      item_id: item.id,
      descripcion: f.descripcion?.trim() ? f.descripcion : item.nombre,
      unidad: f.unidad?.trim() ? f.unidad : item.unidad,
      proveedor_id: f.proveedor_id || item.proveedorPrincipalId || '',
    }))
  }

  // Limita el select de proveedor a los asociados al ítem elegido — si no hay
  // ítem (línea libre) o el ítem no tiene proveedores cargados, se ve la lista completa.
  function proveedoresParaForm(): ProveedorOption[] {
    const item = itemsCatalogo.find(i => i.id === form.item_id)
    if (!item || !item.proveedoresAsociados.length) return proveedores
    return proveedores.filter(p => item.proveedoresAsociados.includes(p.id))
  }

  async function guardar() {
    if (!form.descripcion?.trim()) { toast.error('La descripción es obligatoria'); return }
    if (!form.proveedor_id) { toast.error('El proveedor es obligatorio'); return }

    startTransition(async () => {
      const body = {
        item_id: form.item_id ?? null,
        descripcion: form.descripcion!.trim(),
        proveedor_id: form.proveedor_id,
        unidad: form.unidad?.trim() || null,
        cantidad: Number(form.cantidad ?? 0),
        activo: form.activo ?? true,
      }

      if (creando) {
        const orden = Math.max(0, ...lineas.map(l => l.orden)) + 1
        const { data, error } = await supabase.from('compras_plantilla_base').insert([{ ...body, orden }]).select().single()
        if (error) { toast.error(error.message); return }
        setLineas(prev => [...prev, data])
        toast.success('Línea agregada a la plantilla')
      } else if (editando) {
        const { data, error } = await supabase.from('compras_plantilla_base').update(body).eq('id', editando.id).select().single()
        if (error) { toast.error(error.message); return }
        setLineas(prev => prev.map(l => l.id === editando.id ? data : l))
        toast.success('Cambios guardados')
      }
      cerrarForm()
    })
  }

  async function toggleActivo(l: PlantillaLinea) {
    const { data, error } = await supabase.from('compras_plantilla_base').update({ activo: !l.activo }).eq('id', l.id).select().single()
    if (error) { toast.error('No se pudo actualizar el estado'); return }
    setLineas(prev => prev.map(x => x.id === l.id ? data : x))
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    startTransition(async () => {
      const { error } = await supabase.from('compras_plantilla_base').delete().eq('id', eliminando.id)
      if (error) { toast.error(error.message || 'No se pudo eliminar'); return }
      setLineas(prev => prev.filter(l => l.id !== eliminando.id))
      toast.success('Línea eliminada')
      setEliminando(null)
    })
  }

  async function generarPedidoBase() {
    setGenerando(true)
    const { error } = await supabase.rpc('generar_solicitud_base')
    setGenerando(false)
    if (error) { toast.error(error.message || 'No se pudo generar el pedido base'); return }
    toast.success('Solicitud del pedido base creada')
    router.push('/admin/compras/solicitudes')
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const previo = lineas
    const desde = lineas.findIndex(l => l.id === active.id)
    const hasta = lineas.findIndex(l => l.id === over.id)
    const nuevas = arrayMove(lineas, desde, hasta).map((l, i) => ({ ...l, orden: i + 1 }))
    setLineas(nuevas)
    const { error } = await supabase.rpc('reordenar_plantilla_base', { p_ids: nuevas.map(l => l.id) })
    if (error) { setLineas(previo); toast.error('No se pudo guardar el nuevo orden') }
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-[#f0f0f0]"><ClipboardList size={22} className="text-[#e8c547]" /> Pedido base</h1>
          <p className="text-[#888] text-sm mt-0.5">{activas.length} línea{activas.length === 1 ? '' : 's'} activa{activas.length === 1 ? '' : 's'} del pedido fijo de los miércoles</p>
        </div>
        <div className="flex gap-2">
          <button onClick={abrirCrear} className="flex items-center gap-1.5 border border-[#2a2a2a] hover:border-[#e8c547] text-[#f0f0f0] font-semibold text-sm py-2 px-4 rounded-xl transition-all">
            <Plus size={16} /> Agregar materia prima/insumo
          </button>
          <button
            onClick={generarPedidoBase}
            disabled={generando || activas.length === 0}
            className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-['Syne'] font-bold text-sm py-2 px-4 rounded-xl transition-all"
          >
            <Send size={16} /> {generando ? 'Generando...' : 'Generar pedido base'}
          </button>
        </div>
      </div>

      <p className="text-xs text-[#666]">
        Esto es una plantilla: lo que está acá se pide todas las semanas, sin importar el conteo. Generar crea una solicitud en la bandeja de <span className="text-[#f0f0f0]">Solicitudes</span>, con las mismas cantidades de acá — la ajustás y la convertís en pedidos desde ahí, igual que el pedido complementario de Fábrica. El orden de la lista es el orden en el que aparecen los ítems en la solicitud y en los pedidos por proveedor; se ajusta arrastrando desde el ícono de la izquierda.
        <HelpTooltip text="Si ya hay un pedido base pendiente de revisión sin convertir, no se puede generar otro hasta resolver ese." />
      </p>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {lineas.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">Todavía no hay líneas. Usá &quot;+ Agregar materia prima/insumo&quot; para armar la plantilla.</p>
        ) : (
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-sm">
                <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                  <tr>
                    <th className="w-10 px-2 py-3"><span className="sr-only">Reordenar</span></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <SortableContext items={lineas.map(l => l.id)} strategy={verticalListSortingStrategy}>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {lineas.map(l => (
                      <FilaPlantilla
                        key={l.id}
                        linea={l}
                        nombreProveedor={nombreProveedor}
                        onToggleActivo={toggleActivo}
                        onEditar={abrirEditar}
                        onEliminar={setEliminando}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </div>
        )}
      </div>

      <Modal open={creando || !!editando} onClose={cerrarForm} title={creando ? 'Nueva línea' : `Editar — ${editando?.descripcion}`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>
              Ítem del catálogo
              <HelpTooltip text="Opcional. Elegilo para autocompletar descripción, unidad y proveedor desde el catálogo de Insumos — igual podés editarlos después. Dejalo vacío para una línea libre (por ejemplo, algo que no está en ningún catálogo)." />
            </label>
            <select className={inputClass} value={form.item_id ?? ''} onChange={e => elegirItem(e.target.value)}>
              <option value="">Línea libre (sin ítem)</option>
              {itemsCatalogo.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Descripción *</label>
            <input className={inputClass} value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Proveedor *</label>
            <select className={inputClass} value={form.proveedor_id ?? ''} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {proveedoresParaForm().map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Unidad</label>
            <input className={inputClass} placeholder="Ej: kg, unidad, docena" value={form.unidad ?? ''} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Cantidad</label>
            <InputNumero placeholder="0" className={inputClass} value={!form.cantidad ? null : form.cantidad} onChange={v => setForm(f => ({ ...f, cantidad: v ?? 0 }))} />
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

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar línea" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.descripcion}</span> de la plantilla? Esta acción no se puede deshacer.
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
