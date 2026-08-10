'use client'

import { useState, useTransition } from 'react'
import { ClipboardList, Pencil, Plus, Settings2, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ModoCalculo } from '@/lib/fabrica/calculoSugerido'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { useToasts, ToastStack } from '@/components/ui/Toast'

type Turno = 'manana' | 'tarde'
type Periodicidad = 'semanal' | 'quincenal' | 'mensual'

interface Definicion {
  id: string
  nombre: string
  icono: string | null
  dia_semana: number
  turno_desde: Turno
  dias_ventana: number
  turno_hasta: Turno
  pide_masas: boolean
  periodicidad: Periodicidad
  modulo: string
  orden: number
  activo: boolean
}

interface DefinicionItem {
  id: string
  definicion_id: string
  item_id: string
  modo_calculo: ModoCalculo
  meta: number
  cantidad_fija: number
  orden: number
  activo: boolean
}

interface CatalogoItem {
  id: string
  nombre: string
  unidad: string
  categoria_id: string | null
}

interface CategoriaOption {
  id: string
  nombre: string
}

const DIA_OPCIONES = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 7, label: 'Domingo' },
]

const PERIODO_LABEL: Record<Periodicidad, string> = {
  semanal: 'semanal', quincenal: 'quincenal', mensual: 'mensual',
}

const MODULO_LABEL: Record<string, string> = {
  fabrica: 'Fábrica',
}

const MODO_LABEL: Record<ModoCalculo, string> = {
  por_masa: 'Por masa (receta × proyección)',
  meta_semanal: 'Meta del período (piso fijo)',
  cantidad_fija: 'Cantidad fija',
}

const emptyDefForm = (): Partial<Definicion> => ({
  nombre: '', icono: '', dia_semana: 1, turno_desde: 'tarde', dias_ventana: 3, turno_hasta: 'manana', pide_masas: false, periodicidad: 'semanal', orden: 0,
})

const emptyItemForm = (): { item_id: string; modo_calculo: ModoCalculo; meta: number; cantidad_fija: number; orden: number } => ({
  item_id: '', modo_calculo: 'por_masa', meta: 0, cantidad_fija: 0, orden: 0,
})

export default function ConteosClient({
  definicionesIniciales,
  itemsIniciales,
  catalogo,
  categorias,
}: {
  definicionesIniciales: Definicion[]
  itemsIniciales: DefinicionItem[]
  catalogo: CatalogoItem[]
  categorias: CategoriaOption[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [definiciones, setDefiniciones] = useState(definicionesIniciales)
  const [items, setItems] = useState(itemsIniciales)

  const [creandoDef, setCreandoDef] = useState(false)
  const [editandoDef, setEditandoDef] = useState<Definicion | null>(null)
  const [formDef, setFormDef] = useState<Partial<Definicion>>(emptyDefForm())
  const [eliminandoDef, setEliminandoDef] = useState<Definicion | null>(null)

  const [gestionando, setGestionando] = useState<Definicion | null>(null)
  const [formItem, setFormItem] = useState(emptyItemForm())
  const [editandoItem, setEditandoItem] = useState<DefinicionItem | null>(null)
  const [eliminandoItem, setEliminandoItem] = useState<DefinicionItem | null>(null)

  const [isPending, startTransition] = useTransition()

  const nombreCatalogo = (id: string) => catalogo.find(c => c.id === id)?.nombre ?? '—'
  const nombreCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nombre ?? 'Sin categoría'
  const itemsDe = (defId: string) => items.filter(i => i.definicion_id === defId).sort((a, b) => a.orden - b.orden)

  function diaLabel(dia: number) {
    return DIA_OPCIONES.find(d => d.value === dia)?.label ?? '—'
  }

  // --- Definición: alta/edición ---

  function abrirCrearDef() {
    setFormDef(emptyDefForm())
    setEditandoDef(null)
    setCreandoDef(true)
  }

  function abrirEditarDef(d: Definicion) {
    setFormDef({ ...d })
    setEditandoDef(d)
    setCreandoDef(false)
  }

  function cerrarFormDef() {
    setCreandoDef(false)
    setEditandoDef(null)
  }

  async function guardarDef() {
    if (!formDef.nombre?.trim()) { toast.error('El nombre es requerido'); return }

    const body = {
      nombre: formDef.nombre.trim(),
      icono: formDef.icono?.trim() || null,
      dia_semana: Number(formDef.dia_semana ?? 1),
      turno_desde: formDef.turno_desde ?? 'tarde',
      dias_ventana: Number(formDef.dias_ventana ?? 3),
      turno_hasta: formDef.turno_hasta ?? 'manana',
      pide_masas: !!formDef.pide_masas,
      periodicidad: formDef.periodicidad ?? 'semanal',
      orden: Number(formDef.orden ?? 0),
    }

    startTransition(async () => {
      if (creandoDef) {
        const { data, error } = await supabase.from('fabrica_conteo_definiciones').insert([{ ...body, activo: true }]).select().single()
        if (error) { toast.error(error.message); return }
        setDefiniciones(prev => [...prev, data])
        toast.success('Conteo creado')
      } else if (editandoDef) {
        const { data, error } = await supabase.from('fabrica_conteo_definiciones').update(body).eq('id', editandoDef.id).select().single()
        if (error) { toast.error(error.message); return }
        setDefiniciones(prev => prev.map(d => d.id === editandoDef.id ? data : d))
        toast.success('Cambios guardados')
      }
      cerrarFormDef()
    })
  }

  async function archivarDef(d: Definicion) {
    const { data, error } = await supabase.from('fabrica_conteo_definiciones').update({ activo: !d.activo }).eq('id', d.id).select().single()
    if (error) { toast.error(error.message); return }
    setDefiniciones(prev => prev.map(x => x.id === d.id ? data : x))
    toast.success(data.activo ? 'Conteo reactivado' : 'Conteo desactivado')
  }

  async function confirmarEliminarDef() {
    if (!eliminandoDef) return
    startTransition(async () => {
      const { error } = await supabase.from('fabrica_conteo_definiciones').delete().eq('id', eliminandoDef.id)
      if (error) { toast.error('No se pudo eliminar — ya tiene conteos cerrados o en curso. Probá desactivarlo en su lugar.'); return }
      setDefiniciones(prev => prev.filter(d => d.id !== eliminandoDef.id))
      setItems(prev => prev.filter(i => i.definicion_id !== eliminandoDef.id))
      toast.success('Conteo eliminado')
      setEliminandoDef(null)
    })
  }

  // --- Ítems de una definición ---

  function abrirGestionar(d: Definicion) {
    setGestionando(d)
    setFormItem(emptyItemForm())
    setEditandoItem(null)
  }

  function abrirEditarItem(i: DefinicionItem) {
    setEditandoItem(i)
    setFormItem({ item_id: i.item_id, modo_calculo: i.modo_calculo, meta: i.meta, cantidad_fija: i.cantidad_fija, orden: i.orden })
  }

  function cancelarEdicionItem() {
    setEditandoItem(null)
    setFormItem(emptyItemForm())
  }

  async function guardarItem() {
    if (!gestionando) return
    if (!formItem.item_id) { toast.error('Elegí un insumo'); return }

    const body = {
      modo_calculo: formItem.modo_calculo,
      meta: formItem.modo_calculo === 'cantidad_fija' ? 0 : Number(formItem.meta ?? 0),
      cantidad_fija: formItem.modo_calculo === 'cantidad_fija' ? Number(formItem.cantidad_fija ?? 0) : 0,
      orden: Number(formItem.orden ?? 0),
    }

    startTransition(async () => {
      if (editandoItem) {
        const { data, error } = await supabase.from('fabrica_conteo_definicion_items').update(body).eq('id', editandoItem.id).select().single()
        if (error) { toast.error(error.message); return }
        setItems(prev => prev.map(i => i.id === editandoItem.id ? data : i))
        toast.success('Ítem actualizado')
        cancelarEdicionItem()
      } else {
        const { data, error } = await supabase.from('fabrica_conteo_definicion_items').insert([{ ...body, definicion_id: gestionando.id, item_id: formItem.item_id, activo: true }]).select().single()
        if (error) { toast.error(error.message); return }
        setItems(prev => [...prev, data])
        setFormItem(emptyItemForm())
        toast.success('Ítem agregado al conteo')
      }
    })
  }

  async function quitarItem() {
    if (!eliminandoItem) return
    startTransition(async () => {
      const { error } = await supabase.from('fabrica_conteo_definicion_items').delete().eq('id', eliminandoItem.id)
      if (error) { toast.error(error.message || 'No se pudo quitar el ítem'); return }
      setItems(prev => prev.filter(i => i.id !== eliminandoItem.id))
      toast.success('Ítem quitado del conteo')
      setEliminandoItem(null)
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "flex items-center text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  const itemsDisponibles = gestionando
    ? catalogo
        .filter(c => !itemsDe(gestionando.id).some(i => i.item_id === c.id))
        .map(c => ({ value: c.id, label: c.nombre, grupo: nombreCategoria(c.categoria_id) }))
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-[#f0f0f0]"><ClipboardList size={22} className="text-[#e8c547]" /> Conteos</h1>
          <p className="text-[#888] text-sm mt-0.5">{definiciones.filter(d => d.activo).length} activos · así se arman los desplegables de /fabrica/stock</p>
        </div>
        <button onClick={abrirCrearDef} className="flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          <Plus size={16} /> Nuevo conteo
        </button>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {definiciones.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">Todavía no hay conteos. Usá &quot;+ Nuevo conteo&quot; para crear el primero.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Día</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Período</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Ventana</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Pide masas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden lg:table-cell">Módulo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Ítems</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {definiciones.sort((a, b) => a.orden - b.orden).map(d => (
                  <tr key={d.id} className={`hover:bg-[#1a1a1a] transition-colors ${!d.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{d.icono ? `${d.icono} ` : ''}{d.nombre}</td>
                    <td className="px-4 py-3 text-[#888]">{diaLabel(d.dia_semana)}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell capitalize">{PERIODO_LABEL[d.periodicidad]}</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{d.dias_ventana} días</td>
                    <td className="px-4 py-3 text-[#888] hidden md:table-cell">{d.pide_masas ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-3 text-[#888] hidden lg:table-cell">{MODULO_LABEL[d.modulo] ?? d.modulo}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => abrirGestionar(d)} className="text-xs font-semibold text-[#e8c547] hover:underline">
                        {itemsDe(d.id).length} ítem{itemsDe(d.id).length === 1 ? '' : 's'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.activo ? 'bg-green-900/50 text-green-300' : 'bg-[#2a2a2a] text-[#666]'}`}>
                        {d.activo ? 'activo' : 'inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => abrirGestionar(d)} title="Gestionar ítems" aria-label={`Gestionar ítems de ${d.nombre}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors">
                          <Settings2 size={15} />
                        </button>
                        <button onClick={() => abrirEditarDef(d)} title="Editar" aria-label={`Editar ${d.nombre}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => archivarDef(d)} title={d.activo ? 'Desactivar' : 'Reactivar'} aria-label={d.activo ? `Desactivar ${d.nombre}` : `Reactivar ${d.nombre}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors">
                          {d.activo ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                        </button>
                        <button onClick={() => setEliminandoDef(d)} title="Eliminar" aria-label={`Eliminar ${d.nombre}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors">
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

      {/* Alta/edición de definición */}
      <Modal open={creandoDef || !!editandoDef} onClose={cerrarFormDef} title={creandoDef ? 'Nuevo conteo' : `Editar — ${editandoDef?.nombre}`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} value={formDef.nombre ?? ''} onChange={e => setFormDef(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Icono (emoji)</label>
            <input className={inputClass} placeholder="📦" value={formDef.icono ?? ''} onChange={e => setFormDef(f => ({ ...f, icono: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>
              Día
              <HelpTooltip text="Qué día de la semana se hace este conteo. Fuera de ese día, /fabrica/stock avisa pero no bloquea el cierre." />
            </label>
            <select className={inputClass} value={formDef.dia_semana ?? 1} onChange={e => setFormDef(f => ({ ...f, dia_semana: Number(e.target.value) }))}>
              {DIA_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Período
              <HelpTooltip text="Cada cuánto se repite este conteo. Por ahora es solo informativo — la fecha del próximo conteo se sigue calculando semana a semana; cuando haga falta un conteo quincenal o mensual de verdad, se termina de programar la rotación." />
            </label>
            <select className={inputClass} value={formDef.periodicidad ?? 'semanal'} onChange={e => setFormDef(f => ({ ...f, periodicidad: e.target.value as Periodicidad }))}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Ventana (días)
              <HelpTooltip text="Cuántos días cubre la proyección desde el día del conteo — no es lo mismo que el período: Global es semanal pero solo proyecta 3 días (martes tarde a viernes mañana)." />
            </label>
            <InputNumero enteros placeholder="3" className={inputClass} value={formDef.dias_ventana ?? null} onChange={v => setFormDef(f => ({ ...f, dias_ventana: v ?? 0 }))} />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="pide_masas"
              type="checkbox"
              checked={!!formDef.pide_masas}
              onChange={e => setFormDef(f => ({ ...f, pide_masas: e.target.checked }))}
              className="w-4 h-4 accent-[#e8c547]"
            />
            <label htmlFor="pide_masas" className="text-sm text-[#f0f0f0] flex items-center">
              Pide proyección de masas
              <HelpTooltip text="Activalo si este conteo necesita que fábrica cargue cuántas masas proyecta producir en la ventana (los ítems en modo 'por masa' lo necesitan para calcular la necesidad). Bolsaplast, por ejemplo, no lo necesita." />
            </label>
          </div>
          {formDef.pide_masas && (
            <>
              <div>
                <label className={labelClass}>Turno desde</label>
                <select className={inputClass} value={formDef.turno_desde ?? 'tarde'} onChange={e => setFormDef(f => ({ ...f, turno_desde: e.target.value as Turno }))}>
                  <option value="manana">Mañana</option>
                  <option value="tarde">Tarde</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Turno hasta</label>
                <select className={inputClass} value={formDef.turno_hasta ?? 'manana'} onChange={e => setFormDef(f => ({ ...f, turno_hasta: e.target.value as Turno }))}>
                  <option value="manana">Mañana</option>
                  <option value="tarde">Tarde</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label className={labelClass}>Orden</label>
            <InputNumero enteros placeholder="0" className={inputClass} value={formDef.orden ?? null} onChange={v => setFormDef(f => ({ ...f, orden: v ?? 0 }))} />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={guardarDef} disabled={isPending} className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={cerrarFormDef} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2.5 px-6 rounded-xl transition-all">
            Cancelar
          </button>
        </div>
      </Modal>

      {/* Eliminar definición */}
      <Modal open={!!eliminandoDef} onClose={() => setEliminandoDef(null)} title="Eliminar conteo" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminandoDef?.nombre}</span>? Esta acción no se puede deshacer. Si ya tiene conteos cerrados o en curso, no se va a poder eliminar — desactivalo en su lugar.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminandoDef(null)} disabled={isPending} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarEliminarDef} disabled={isPending} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      {/* Gestión de ítems de una definición */}
      <Modal open={!!gestionando} onClose={() => setGestionando(null)} title={gestionando ? `Ítems — ${gestionando.nombre}` : ''} size="lg">
        {gestionando && (
          <div className="space-y-4">
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
              {itemsDe(gestionando.id).length === 0 ? (
                <p className="p-6 text-center text-[#888] text-sm">Todavía no hay ítems en este conteo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Insumo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Modo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Meta/Fija</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a2a]">
                      {itemsDe(gestionando.id).map(i => (
                        <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                          <td className="px-3 py-2 text-[#f0f0f0]">{nombreCatalogo(i.item_id)}</td>
                          <td className="px-3 py-2 text-[#888] text-xs">{MODO_LABEL[i.modo_calculo]}</td>
                          <td className="px-3 py-2 text-[#888]">{i.modo_calculo === 'cantidad_fija' ? i.cantidad_fija : (i.meta || '—')}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => abrirEditarItem(i)} title="Editar" aria-label={`Editar ${nombreCatalogo(i.item_id)}`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#2a2a2a] transition-colors">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => setEliminandoItem(i)} title="Quitar" aria-label={`Quitar ${nombreCatalogo(i.item_id)}`} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors">
                                <Trash2 size={14} />
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

            <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">
                {editandoItem ? `Editar — ${nombreCatalogo(editandoItem.item_id)}` : 'Agregar insumo'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {editandoItem ? (
                  <div className="md:col-span-2">
                    <label className={labelClass}>Insumo</label>
                    <p className="text-sm text-[#f0f0f0] px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                      {nombreCatalogo(editandoItem.item_id)}
                    </p>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className={labelClass}>Insumo</label>
                    <SelectBuscador
                      value={formItem.item_id}
                      onChange={v => setFormItem(f => ({ ...f, item_id: v }))}
                      opciones={itemsDisponibles}
                      placeholderVacio="Seleccionar insumo..."
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Modo de cálculo</label>
                  <select className={inputClass} value={formItem.modo_calculo} onChange={e => setFormItem(f => ({ ...f, modo_calculo: e.target.value as ModoCalculo }))}>
                    {Object.entries(MODO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                {formItem.modo_calculo === 'cantidad_fija' ? (
                  <div>
                    <label className={labelClass}>Cantidad fija</label>
                    <InputNumero placeholder="0" className={inputClass} value={formItem.cantidad_fija || null} onChange={v => setFormItem(f => ({ ...f, cantidad_fija: v ?? 0 }))} />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>
                      {formItem.modo_calculo === 'meta_semanal'
                        ? `Meta ${PERIODO_LABEL[gestionando.periodicidad]}`
                        : `Meta ${PERIODO_LABEL[gestionando.periodicidad]} (piso, opcional)`}
                      <HelpTooltip text={formItem.modo_calculo === 'meta_semanal' ? 'El pedido siempre completa hasta esta cantidad, cada vez que se cierra este conteo.' : 'Si se completa, el sugerido nunca baja de esta cantidad aunque la receta pida menos.'} />
                    </label>
                    <InputNumero placeholder="0" className={inputClass} value={formItem.meta || null} onChange={v => setFormItem(f => ({ ...f, meta: v ?? 0 }))} />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Orden</label>
                  <InputNumero enteros placeholder="0" className={inputClass} value={formItem.orden || null} onChange={v => setFormItem(f => ({ ...f, orden: v ?? 0 }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={guardarItem} disabled={isPending} className="flex-1 flex items-center justify-center gap-1.5 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-sm py-2 rounded-lg transition-all">
                  {editandoItem ? (isPending ? 'Guardando...' : 'Guardar cambios') : <><Plus size={15} /> Agregar</>}
                </button>
                {editandoItem && (
                  <button onClick={cancelarEdicionItem} disabled={isPending} className="flex-1 border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] font-semibold text-sm py-2 rounded-lg transition-all disabled:opacity-40">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!eliminandoItem} onClose={() => setEliminandoItem(null)} title="Quitar ítem" accent="red">
        <p className="text-sm text-[#888]">
          ¿Quitar <span className="text-[#f0f0f0] font-medium">{eliminandoItem ? nombreCatalogo(eliminandoItem.item_id) : ''}</span> de este conteo? El borrador en curso deja de pedirlo.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminandoItem(null)} disabled={isPending} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={quitarItem} disabled={isPending} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {isPending ? 'Quitando...' : 'Quitar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
