'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useToasts, ToastStack } from './Toast'

interface Item { id: string; nombre: string; activo: boolean; [key: string]: unknown }

interface CampoExtra {
  key: string
  label: string
  step?: string
}

interface Props {
  titulo: string
  descripcion: string
  apiPath: string
  /** Forma singular de `titulo`, para textos como "Nuevo sabor" / "Editar sabor". */
  singular?: string
  campoExtra?: CampoExtra
}

type ModalTipo = 'crear' | 'editar' | null

export default function TablaMaestra({ titulo, descripcion, apiPath, singular, campoExtra }: Props) {
  const nombreSingular = singular ?? titulo.toLowerCase()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<ModalTipo>(null)
  const [itemActual, setItemActual] = useState<Item | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formExtra, setFormExtra] = useState('')
  const [eliminando, setEliminando] = useState<Item | null>(null)
  const [guardando, setGuardando] = useState(false)
  const toast = useToasts()

  const cargar = () => {
    setLoading(true)
    fetch(apiPath)
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => toast.error('No se pudo cargar la lista'))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [apiPath])

  const filtrados = items.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  function abrirCrear() {
    setFormNombre(''); setFormExtra(''); setItemActual(null); setModal('crear')
  }

  function abrirEditar(item: Item) {
    setFormNombre(item.nombre)
    setFormExtra(campoExtra ? String(item[campoExtra.key] ?? '') : '')
    setItemActual(item)
    setModal('editar')
  }

  function cerrarModal() {
    setModal(null); setItemActual(null)
  }

  async function guardar() {
    if (!formNombre.trim()) { toast.error('El nombre es obligatorio'); return }
    if (campoExtra && !formExtra.trim()) { toast.error(`${campoExtra.label} es obligatorio`); return }

    setGuardando(true)
    const body: Record<string, unknown> = { nombre: formNombre.trim() }
    if (campoExtra) body[campoExtra.key] = Number(formExtra)
    if (modal === 'editar' && itemActual) body.id = itemActual.id

    const res = await fetch(apiPath, {
      method: modal === 'editar' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setGuardando(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || 'No se pudo guardar')
      return
    }
    toast.success(modal === 'editar' ? 'Cambios guardados' : 'Creado correctamente')
    cerrarModal()
    cargar()
  }

  async function toggleActivo(item: Item) {
    const res = await fetch(apiPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, activo: !item.activo }),
    })
    if (!res.ok) { toast.error('No se pudo actualizar el estado'); return }
    cargar()
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    setGuardando(true)
    const res = await fetch(apiPath, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: eliminando.id }),
    })
    setGuardando(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || 'No se pudo eliminar')
      return
    }
    toast.success('Eliminado correctamente')
    setEliminando(null)
    cargar()
  }

  const inputClass = "w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#f0f0f0]">{titulo}</h2>
          <p className="text-[#888] text-sm mt-0.5">{descripcion}</p>
        </div>
        <button
          onClick={abrirCrear}
          className="shrink-0 flex items-center gap-1.5 bg-[#e8c547] hover:opacity-90 text-black font-bold text-sm py-2 px-4 rounded-xl transition-all"
        >
          <Plus size={16} /> Agregar
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
        <input
          type="text"
          placeholder={`Buscar en ${titulo.toLowerCase()}...`}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
        />
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[#1a1a1a]">
            {[0, 1, 2].map(i => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-3 animate-pulse">
                <div className="h-4 bg-[#1a1a1a] rounded w-1/3" />
                <div className="h-5 bg-[#1a1a1a] rounded-full w-16 ml-auto" />
              </div>
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888] text-sm">
            {items.length === 0
              ? `Todavía no hay ${titulo.toLowerCase()}. Usá "+ Agregar" para crear el primero.`
              : 'Ningún resultado para tu búsqueda.'}
          </p>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {filtrados.map(item => (
              <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.activo ? 'opacity-50' : ''}`}>
                <span className="flex-1 text-sm text-[#f0f0f0] truncate">
                  {item.nombre}
                  {campoExtra && <span className="text-[#888]"> · {String(item[campoExtra.key])} {campoExtra.label}</span>}
                </span>
                <button
                  onClick={() => toggleActivo(item)}
                  title={item.activo ? 'Desactivar' : 'Activar'}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
                    item.activo ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#666]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.activo ? 'bg-green-400' : 'bg-[#555]'}`} />
                  {item.activo ? 'Activo' : 'Inactivo'}
                </button>
                <button
                  onClick={() => abrirEditar(item)}
                  title="Editar"
                  aria-label={`Editar ${item.nombre}`}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[#888] hover:text-[#e8c547] hover:bg-[#1a1a1a] transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setEliminando(item)}
                  title="Eliminar"
                  aria-label={`Eliminar ${item.nombre}`}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[#888] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal !== null} onClose={cerrarModal} title={modal === 'editar' ? `Editar ${nombreSingular}` : `Nuevo ${nombreSingular}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nombre</label>
            <input
              autoFocus
              className={inputClass}
              value={formNombre}
              onChange={e => setFormNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && guardar()}
            />
          </div>
          {campoExtra && (
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{campoExtra.label}</label>
              <input
                type="number"
                step={campoExtra.step ?? 'any'}
                className={inputClass}
                value={formExtra}
                onChange={e => setFormExtra(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && guardar()}
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={cerrarModal} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !formNombre.trim() || (!!campoExtra && !formExtra.trim())}
              className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-bold disabled:opacity-40 transition-opacity"
            >
              {guardando ? 'Guardando...' : modal === 'editar' ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar" accent="red">
        <p className="text-sm text-[#888]">
          ¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando?.nombre}</span>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminando(null)} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors">
            Cancelar
          </button>
          <button onClick={confirmarEliminar} disabled={guardando} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-red-500 transition-colors">
            {guardando ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
