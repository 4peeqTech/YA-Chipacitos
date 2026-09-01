'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from './Modal'
import InputNumero from './InputNumero'
import { useToasts, ToastStack } from './Toast'

interface Item { id: string; nombre: string; activo: boolean; [key: string]: unknown }

interface CampoExtraBase {
  key: string
  label: string
  /** Solo se muestra si el checkbox con esta key está en `true`. */
  dependeDe?: string
}
export type CampoExtra =
  | (CampoExtraBase & { tipo: 'numero'; step?: string; obligatorio?: boolean })
  | (CampoExtraBase & { tipo: 'checkbox'; ayuda?: string; /** El valor guardado/leído es `!checked`. */ invertido?: boolean })
  | (CampoExtraBase & { tipo: 'select'; opciones: { valor: string; label: string }[] })

interface Props {
  titulo: string
  descripcion: string
  apiPath: string
  /** Forma singular de `titulo`, para textos como "Nuevo sabor" / "Editar sabor". */
  singular?: string
  camposExtra?: CampoExtra[]
  /** Badges/subtítulo por fila, para no meter lógica de dominio dentro de la tabla. */
  resumenFila?: (item: Item) => React.ReactNode
}

type ModalTipo = 'crear' | 'editar' | null

function valorDefault(campo: CampoExtra): unknown {
  if (campo.tipo === 'checkbox') return true
  if (campo.tipo === 'select') return campo.opciones[0]?.valor ?? ''
  return ''
}

export default function TablaMaestra({ titulo, descripcion, apiPath, singular, camposExtra, resumenFila }: Props) {
  const nombreSingular = singular ?? titulo.toLowerCase()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<ModalTipo>(null)
  const [itemActual, setItemActual] = useState<Item | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formExtras, setFormExtras] = useState<Record<string, unknown>>({})
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
    setFormNombre('')
    setFormExtras(Object.fromEntries((camposExtra ?? []).map(c => [c.key, valorDefault(c)])))
    setItemActual(null)
    setModal('crear')
  }

  function abrirEditar(item: Item) {
    setFormNombre(item.nombre)
    setFormExtras(Object.fromEntries((camposExtra ?? []).map(c => [c.key, item[c.key] ?? valorDefault(c)])))
    setItemActual(item)
    setModal('editar')
  }

  function cerrarModal() {
    setModal(null); setItemActual(null)
  }

  /** Valor mostrado (post-inversión) de un checkbox de camposExtra, para resolver dependeDe. */
  function checkboxMarcado(key: string): boolean {
    const campo = (camposExtra ?? []).find(c => c.key === key)
    const valor = !!formExtras[key]
    return campo?.tipo === 'checkbox' && campo.invertido ? !valor : valor
  }

  /** Campos numéricos obligatorios visibles (respetando dependeDe) sin completar. */
  const numerosFaltantes = (camposExtra ?? []).filter(c =>
    c.tipo === 'numero' && c.obligatorio &&
    (!c.dependeDe || checkboxMarcado(c.dependeDe)) &&
    String(formExtras[c.key] ?? '').trim() === ''
  )

  async function guardar() {
    if (!formNombre.trim()) { toast.error('El nombre es obligatorio'); return }
    if (numerosFaltantes.length > 0) { toast.error(`${numerosFaltantes[0].label} es obligatorio`); return }

    setGuardando(true)
    const body: Record<string, unknown> = { nombre: formNombre.trim() }
    for (const c of camposExtra ?? []) {
      body[c.key] = c.tipo === 'numero' ? Number(formExtras[c.key]) : formExtras[c.key]
    }
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
                  {resumenFila?.(item)}
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
          {(camposExtra ?? [])
            .filter(c => !c.dependeDe || checkboxMarcado(c.dependeDe))
            .map(c => (
              <div key={c.key}>
                {c.tipo === 'numero' && (
                  <>
                    <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{c.label}</label>
                    <InputNumero
                      placeholder="0"
                      className={inputClass}
                      value={formExtras[c.key] === '' || formExtras[c.key] == null ? null : Number(formExtras[c.key])}
                      onChange={v => setFormExtras(prev => ({ ...prev, [c.key]: v == null ? '' : String(v) }))}
                      onKeyDown={e => e.key === 'Enter' && guardar()}
                    />
                  </>
                )}
                {c.tipo === 'checkbox' && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#e8c547]"
                      checked={c.invertido ? !formExtras[c.key] : !!formExtras[c.key]}
                      onChange={e => {
                        const checked = e.target.checked
                        setFormExtras(prev => ({ ...prev, [c.key]: c.invertido ? !checked : checked }))
                      }}
                    />
                    <span>
                      <span className="block text-sm text-[#f0f0f0]">{c.label}</span>
                      {c.ayuda && <span className="block text-xs text-[#666] mt-0.5">{c.ayuda}</span>}
                    </span>
                  </label>
                )}
                {c.tipo === 'select' && (
                  <>
                    <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{c.label}</label>
                    <select
                      className={inputClass}
                      value={String(formExtras[c.key] ?? '')}
                      onChange={e => setFormExtras(prev => ({ ...prev, [c.key]: e.target.value }))}
                    >
                      {c.opciones.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                    </select>
                  </>
                )}
              </div>
            ))}
          <div className="flex gap-2 pt-1">
            <button onClick={cerrarModal} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !formNombre.trim() || numerosFaltantes.length > 0}
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
