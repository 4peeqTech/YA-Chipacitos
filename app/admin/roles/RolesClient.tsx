'use client'

import { useState } from 'react'
import { RoleDef } from '@/lib/types'
import Card from '@/components/ui/Card'

const PALETA = ['#a78bfa', '#38bdf8', '#f0a849', '#e8c547', '#e84210', '#56d68a']

function slugify(nombre: string) {
  return nombre.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

interface Props {
  rolesIniciales: RoleDef[]
  usuariosPorRol: Record<string, number>
}

export default function RolesClient({ rolesIniciales, usuariosPorRol }: Props) {
  const [roles, setRoles] = useState(rolesIniciales)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', key: '', color: PALETA[0] })
  const [keyEditadaAMano, setKeyEditadaAMano] = useState(false)
  const [editModal, setEditModal] = useState<RoleDef | null>(null)
  const [formEdit, setFormEdit] = useState({ nombre: '', color: PALETA[0] })
  const [eliminando, setEliminando] = useState<RoleDef | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function onNombreChange(nombre: string) {
    setForm(f => ({ ...f, nombre, key: keyEditadaAMano ? f.key : slugify(nombre) }))
  }

  async function crearRol() {
    if (!form.nombre.trim() || !form.key.trim()) return
    setGuardando(true); setError('')
    const res = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error'); setGuardando(false); return }
    setRoles(prev => [...prev, data])
    setModalNuevo(false)
    setForm({ nombre: '', key: '', color: PALETA[0] })
    setKeyEditadaAMano(false)
    setGuardando(false)
  }

  function abrirEdicion(r: RoleDef) {
    setEditModal(r)
    setFormEdit({ nombre: r.nombre, color: r.color })
    setError('')
  }

  async function guardarEdicion() {
    if (!editModal || !formEdit.nombre.trim()) return
    setGuardando(true); setError('')
    const res = await fetch('/api/roles', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editModal.key, nombre: formEdit.nombre, color: formEdit.color }),
    })
    if (res.ok) {
      setRoles(prev => prev.map(r => r.key === editModal.key ? { ...r, nombre: formEdit.nombre.trim(), color: formEdit.color } : r))
      setEditModal(null)
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
    setGuardando(false)
  }

  async function eliminarRol() {
    if (!eliminando) return
    setGuardando(true); setError('')
    const res = await fetch('/api/roles', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: eliminando.key }),
    })
    if (res.ok) {
      setRoles(prev => prev.filter(r => r.key !== eliminando.key))
      setEliminando(null)
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
    setGuardando(false)
  }

  return (
    <div className="space-y-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-['Syne'] text-2xl font-bold text-[#f0f0f0]">Roles</h1>
          <p className="text-sm text-[#888] mt-0.5">{roles.length} roles definidos</p>
        </div>
        <button onClick={() => setModalNuevo(true)}
          className="bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold px-5 py-2.5 rounded-xl text-sm transition-all w-full sm:w-auto">
          + Nuevo rol
        </button>
      </div>

      <Card>
        <div className="divide-y divide-[#1a1a1a]">
          {roles.map(r => {
            const cantidad = usuariosPorRol[r.key] || 0
            const puedeEliminar = !r.es_sistema && cantidad === 0
            return (
              <div key={r.key} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: `${r.color}33`, color: r.color }}>
                  {r.nombre}
                </span>
                <span className="text-xs text-[#555] font-mono">{r.key}</span>
                {r.es_sistema && <span title="Rol del sistema, no se puede eliminar" className="text-xs text-[#666]">🔒</span>}
                <span className="text-xs text-[#888] ml-auto">{cantidad} usuario{cantidad === 1 ? '' : 's'}</span>
                <div className="flex gap-2">
                  <button onClick={() => abrirEdicion(r)}
                    className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors">
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => puedeEliminar && setEliminando(r)}
                    disabled={!puedeEliminar}
                    title={r.es_sistema ? 'Rol del sistema, no se puede eliminar' : cantidad > 0 ? 'Reasigná a los usuarios antes de eliminarlo' : undefined}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      puedeEliminar ? 'text-[#888] border-[#2a2a2a] hover:border-red-500 hover:text-red-500 cursor-pointer' : 'text-[#444] border-[#1a1a1a] cursor-not-allowed'
                    }`}>
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Modal nuevo rol */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Nuevo rol</h3>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nombre</label>
              <input type="text" value={form.nombre} onChange={e => onNombreChange(e.target.value)} placeholder="Contador" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Key</label>
              <input type="text" value={form.key}
                onChange={e => { setKeyEditadaAMano(true); setForm(f => ({ ...f, key: e.target.value })) }}
                placeholder="contador" className="font-mono" />
              <p className="text-[10px] text-[#555] mt-1">Solo minúsculas, números y guión bajo. No se puede cambiar después.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Color</label>
              <div className="flex gap-2">
                {PALETA.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalNuevo(false); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={crearRol} disabled={guardando || !form.nombre.trim() || !form.key.trim()}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar rol */}
      {editModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Editar rol</h3>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nombre</label>
              <input type="text" value={formEdit.nombre} onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Key</label>
              <input type="text" value={editModal.key} disabled className="opacity-50 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Color</label>
              <div className="flex gap-2">
                {PALETA.map(c => (
                  <button key={c} onClick={() => setFormEdit(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${formEdit.color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEditModal(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando || !formEdit.nombre.trim()}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar rol */}
      {eliminando && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-red-500 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Eliminar rol</h3>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            <p className="text-sm text-[#888]">¿Eliminar <span className="text-[#f0f0f0] font-medium">{eliminando.nombre}</span>? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEliminando(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={eliminarRol} disabled={guardando}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40 hover:bg-red-500 transition-colors">
                {guardando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
