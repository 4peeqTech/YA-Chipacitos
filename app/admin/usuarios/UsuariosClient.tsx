'use client'

import { useState } from 'react'
import { Profile, Rol, RoleDef } from '@/lib/types'
import Card from '@/components/ui/Card'
import { MODULOS } from '@/lib/modulos'

const MODULOS_POR_SECCION = MODULOS.reduce((acc, m) => {
  const seccion = m.section || 'General'
  if (!acc[seccion]) acc[seccion] = []
  acc[seccion].push(m)
  return acc
}, {} as Record<string, typeof MODULOS>)

interface Props { usuariosIniciales: Profile[]; emailsById: Record<string, string>; roles: RoleDef[] }

export default function UsuariosClient({ usuariosIniciales, emailsById, roles }: Props) {
  const [usuarios, setUsuarios] = useState(usuariosIniciales)
  const rolMap = Object.fromEntries(roles.map(r => [r.key, r]))
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: (roles[0]?.key || 'local') as Rol, local_nombre: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [resetModal, setResetModal] = useState<{ id: string; nombre: string } | null>(null)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [reseteando, setReseteando] = useState(false)
  const [editModal, setEditModal] = useState<Profile | null>(null)
  const [formEdit, setFormEdit] = useState({ nombre: '', local_nombre: '', email: '', nueva_password: '' })
  const [eliminando, setEliminando] = useState<Profile | null>(null)
  const [posberryEdits, setPosberryEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(usuariosIniciales.map(u => [u.id, u.nombre_posberry || '']))
  )
  const [posberrySaving, setPosberrySaving] = useState<Record<string, 'saving' | 'ok' | 'error'>>(() => ({}))
  const [permisosModal, setPermisosModal] = useState<Profile | null>(null)
  const [permisosEdit, setPermisosEdit] = useState<string[]>([])
  const [guardandoPermisos, setGuardandoPermisos] = useState(false)

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (u.local_nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  async function crearUsuario() {
    if (!form.email || !form.password || !form.nombre) return
    setGuardando(true); setError('')
    const res = await fetch('/api/usuarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error'); setGuardando(false); return }
    setUsuarios(prev => [data.profile, ...prev])
    setModalNuevo(false)
    setForm({ email: '', password: '', nombre: '', rol: 'local', local_nombre: '' })
    setExito('Usuario creado correctamente')
    setTimeout(() => setExito(''), 3000)
    setGuardando(false)
  }

  function abrirEdicion(u: Profile) {
    setEditModal(u)
    setFormEdit({ nombre: u.nombre, local_nombre: u.local_nombre ?? '', email: emailsById[u.id] ?? '', nueva_password: '' })
  }

  async function guardarEdicion() {
    if (!editModal || !formEdit.nombre) return
    setGuardando(true)
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editModal.id, nombre: formEdit.nombre, local_nombre: formEdit.local_nombre || null, email: formEdit.email || undefined, nueva_password: formEdit.nueva_password || undefined }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.map(u => u.id === editModal.id ? { ...u, nombre: formEdit.nombre, local_nombre: formEdit.local_nombre || null } : u))
      setEditModal(null)
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
    setGuardando(false)
  }

  async function eliminarUsuario() {
    if (!eliminando) return
    setGuardando(true)
    const res = await fetch('/api/usuarios', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: eliminando.id }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.filter(u => u.id !== eliminando.id))
      setEliminando(null)
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
    setGuardando(false)
  }

  async function resetearPassword() {
    if (!resetModal || !nuevaPassword) return
    setReseteando(true)
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resetModal.id, password: nuevaPassword }),
    })
    if (res.ok) {
      setExito(`Contraseña de "${resetModal.nombre}" actualizada`)
      setTimeout(() => setExito(''), 3000)
    } else {
      const d = await res.json()
      setError(d.error || 'Error al resetear')
    }
    setResetModal(null)
    setNuevaPassword('')
    setReseteando(false)
  }

  function abrirPermisos(u: Profile) {
    setPermisosModal(u)
    setPermisosEdit(u.modulos_permitidos || [])
    setError('')
  }

  function toggleModulo(key: string) {
    setPermisosEdit(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function guardarPermisos() {
    if (!permisosModal) return
    setGuardandoPermisos(true)
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: permisosModal.id, modulos_permitidos: permisosEdit }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.map(u => u.id === permisosModal.id ? { ...u, modulos_permitidos: permisosEdit } : u))
      setPermisosModal(null)
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
    setGuardandoPermisos(false)
  }

  async function cambiarRol(userId: string, nuevoRol: Rol) {
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, rol: nuevoRol }),
    })
    if (res.ok) setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, rol: nuevoRol } : u))
  }

  async function guardarPosberry(userId: string) {
    const valor = posberryEdits[userId] ?? ''
    setPosberrySaving(prev => ({ ...prev, [userId]: 'saving' }))
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, nombre_posberry: valor || null }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, nombre_posberry: valor || null } : u))
      setPosberrySaving(prev => ({ ...prev, [userId]: 'ok' }))
      setTimeout(() => setPosberrySaving(prev => { const n = { ...prev }; delete n[userId]; return n }), 2000)
    } else {
      setPosberrySaving(prev => ({ ...prev, [userId]: 'error' }))
    }
  }

  return (
    <div className="space-y-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-['Syne'] text-2xl font-bold text-[#f0f0f0]">Usuarios</h1>
          <p className="text-sm text-[#888] mt-0.5">{usuarios.length} usuarios registrados</p>
        </div>
        <button onClick={() => setModalNuevo(true)}
          className="bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold px-5 py-2.5 rounded-xl text-sm transition-all w-full sm:w-auto">
          + Nuevo usuario
        </button>
      </div>

      {exito && (
        <div className="bg-[rgba(86,214,138,.08)] border-l-4 border-[#56d68a] rounded-r-xl p-3 text-[#56d68a] text-sm font-medium">✅ {exito}</div>
      )}

      <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o local..." />

      {/* Tabla desktop */}
      <div className="hidden md:block">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Local / Área</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Cliente Posberry</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Fecha de alta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u, i) => (
                <tr key={u.id} className={`border-b border-[#2a2a2a] ${i % 2 === 1 ? 'bg-[#1a1a1a]/40' : ''}`}>
                  <td className="px-4 py-3 font-medium text-[#f0f0f0]">{u.nombre}</td>
                  <td className="px-4 py-3 text-[#888]">{u.local_nombre || '—'}</td>
                  <td className="px-4 py-3">
                    {u.rol === 'local' ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={posberryEdits[u.id] ?? ''}
                          onChange={e => setPosberryEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') guardarPosberry(u.id) }}
                          placeholder="Nombre en Posberry..."
                          className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] text-xs px-2 py-1 w-44 rounded-lg focus:outline-none focus:border-[#e8c547] placeholder:text-[#444]"
                        />
                        {posberrySaving[u.id] === 'saving' && <span className="text-[10px] text-[#888]">...</span>}
                        {posberrySaving[u.id] === 'ok' && <span className="text-[10px] text-[#56d68a]">✓</span>}
                        {posberrySaving[u.id] === 'error' && <span className="text-[10px] text-[#e84210]">✗</span>}
                        {!posberrySaving[u.id] && (
                          <button onClick={() => guardarPosberry(u.id)}
                            className="text-[10px] text-[#555] hover:text-[#e8c547] px-1.5 py-0.5 rounded border border-[#2a2a2a] hover:border-[#e8c547]">
                            Guardar
                          </button>
                        )}
                      </div>
                    ) : <span className="text-[#444] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select value={u.rol} onChange={e => cambiarRol(u.id, e.target.value as Rol)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer w-auto"
                      style={{ background: `${rolMap[u.rol]?.color || '#888888'}33`, color: rolMap[u.rol]?.color || '#888888' }}>
                      {roles.map(r => (
                        <option key={r.key} value={r.key}>{r.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[#888] text-xs">
                    {new Date(u.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEdicion(u)}
                        className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors whitespace-nowrap"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => abrirPermisos(u)}
                        className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors whitespace-nowrap"
                      >
                        🔐 Módulos
                      </button>
                      <button
                        onClick={() => { setResetModal({ id: u.id, nombre: u.nombre }); setNuevaPassword(''); setError('') }}
                        className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors whitespace-nowrap"
                      >
                        🔑 Contraseña
                      </button>
                      <button
                        onClick={() => { setEliminando(u); setError('') }}
                        className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-red-500 hover:text-red-500 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usuariosFiltrados.length === 0 && (
            <p className="text-center text-sm text-[#888] py-8">Sin resultados.</p>
          )}
        </Card>
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-2">
        {usuariosFiltrados.map(u => (
          <Card key={u.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[#f0f0f0] text-sm">{u.nombre}</p>
                {u.local_nombre && <p className="text-xs text-[#888]">{u.local_nombre}</p>}
              </div>
              <select value={u.rol} onChange={e => cambiarRol(u.id, e.target.value as Rol)}
                className="text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer w-auto"
                style={{ background: `${rolMap[u.rol]?.color || '#888888'}33`, color: rolMap[u.rol]?.color || '#888888' }}>
                {roles.map(r => (
                  <option key={r.key} value={r.key}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1 flex-wrap">
              <button
                onClick={() => abrirEdicion(u)}
                className="flex-1 text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors text-center"
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => abrirPermisos(u)}
                className="flex-1 text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors text-center"
              >
                🔐 Módulos
              </button>
              <button
                onClick={() => { setResetModal({ id: u.id, nombre: u.nombre }); setNuevaPassword(''); setError('') }}
                className="flex-1 text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors text-center"
              >
                🔑 Contraseña
              </button>
              <button
                onClick={() => { setEliminando(u); setError('') }}
                className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-red-500 hover:text-red-500 transition-colors px-3"
              >
                🗑️
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal reset contraseña */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Resetear contraseña</h3>
            <p className="text-sm text-[#888]">Usuario: <span className="text-[#f0f0f0] font-medium">{resetModal.nombre}</span></p>
            {error && (
              <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nueva contraseña</label>
              <input
                type="text"
                value={nuevaPassword}
                onChange={e => setNuevaPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e8c547]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setResetModal(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={resetearPassword} disabled={reseteando || nuevaPassword.length < 6}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {reseteando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar usuario */}
      {editModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Editar usuario</h3>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nombre</label>
              <input type="text" value={formEdit.nombre} onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nombre del local</label>
              <input type="text" value={formEdit.local_nombre} onChange={e => setFormEdit(f => ({ ...f, local_nombre: e.target.value }))} placeholder="Suc. Nombre" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Email (nombre de usuario)</label>
              <input type="email" value={formEdit.email} onChange={e => setFormEdit(f => ({ ...f, email: e.target.value }))} placeholder="usuario@email.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Nueva contraseña <span className="text-[#555] normal-case font-normal">(dejar vacío para no cambiar)</span></label>
              <input type="text" value={formEdit.nueva_password} onChange={e => setFormEdit(f => ({ ...f, nueva_password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEditModal(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando || !formEdit.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal permisos por módulo */}
      {permisosModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div>
              <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Módulos visibles</h3>
              <p className="text-sm text-[#888] mt-0.5">Usuario: <span className="text-[#f0f0f0] font-medium">{permisosModal.nombre}</span></p>
            </div>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            {permisosModal.rol === 'admin' && (
              <div className="bg-[rgba(232,197,71,.08)] border-l-4 border-[#e8c547] rounded-r-xl p-3 text-[#e8c547] text-xs">
                Admin siempre ve todos los módulos, independientemente de esta selección.
              </div>
            )}
            <div className="space-y-4">
              {Object.entries(MODULOS_POR_SECCION).map(([seccion, items]) => (
                <div key={seccion}>
                  <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">{seccion}</p>
                  <div className="space-y-1.5">
                    {items.map(m => (
                      <label key={m.key} className="flex items-center gap-2.5 text-sm text-[#f0f0f0] cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={permisosEdit.includes(m.key)}
                          onChange={() => toggleModulo(m.key)}
                          className="w-4 h-4 accent-[#e8c547] cursor-pointer"
                        />
                        <span>{m.icon} {m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setPermisosModal(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarPermisos} disabled={guardandoPermisos}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardandoPermisos ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar usuario */}
      {eliminando && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-red-500 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Eliminar usuario</h3>
            {error && <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>}
            <p className="text-sm text-[#888]">¿Eliminar a <span className="text-[#f0f0f0] font-medium">{eliminando.nombre}</span>? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEliminando(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={eliminarUsuario} disabled={guardando}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40 hover:bg-red-500 transition-colors">
                {guardando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo usuario */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">Nuevo usuario</h3>
            {error && (
              <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>
            )}
            {[
              { label: 'Email *',           key: 'email',        type: 'email',    placeholder: 'usuario@email.com' },
              { label: 'Contraseña *',      key: 'password',     type: 'password', placeholder: '••••••••' },
              { label: 'Nombre completo *', key: 'nombre',       type: 'text',     placeholder: 'Juan García' },
              { label: 'Nombre del local',  key: 'local_nombre', type: 'text',     placeholder: 'Suc. San Lorenzo' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">{label}</label>
                <input type={type} value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Rol *</label>
              <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))}>
                {roles.map(r => (
                  <option key={r.key} value={r.key}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalNuevo(false); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={crearUsuario} disabled={guardando || !form.email || !form.password || !form.nombre}
                className="flex-1 py-2.5 bg-[#e8c547] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardando ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
