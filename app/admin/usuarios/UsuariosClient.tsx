'use client'

import { useState } from 'react'
import { Profile, Rol } from '@/lib/types'
import Card from '@/components/ui/Card'

const ROL_LABELS: Record<Rol, string> = {
  local: 'Local', deposito: 'Depósito', fabrica: 'Fábrica', admin: 'Admin',
}
const ROL_COLORS: Record<Rol, string> = {
  local:    'bg-[rgba(140,100,255,.2)] text-[#a78bfa]',
  deposito: 'bg-[rgba(56,189,248,.2)] text-[#38bdf8]',
  fabrica:  'bg-[rgba(240,168,73,.2)] text-[#f0a849]',
  admin:    'bg-[rgba(232,197,71,.2)] text-[#e8c547]',
}

interface Props { usuariosIniciales: Profile[] }

export default function UsuariosClient({ usuariosIniciales }: Props) {
  const [usuarios, setUsuarios] = useState(usuariosIniciales)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: 'local' as Rol, local_nombre: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [resetModal, setResetModal] = useState<{ id: string; nombre: string } | null>(null)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [reseteando, setReseteando] = useState(false)
  const [waModal, setWaModal] = useState<{ id: string; nombre: string; phone: string | null; apikey: string | null } | null>(null)
  const [waForm, setWaForm] = useState({ phone: '', apikey: '' })
  const [guardandoWa, setGuardandoWa] = useState(false)

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

  async function guardarWhatsapp() {
    if (!waModal) return
    setGuardandoWa(true)
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: waModal.id,
        whatsapp_phone: waForm.phone || null,
        whatsapp_apikey: waForm.apikey || null,
      }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.map(u => u.id === waModal.id
        ? { ...u, whatsapp_phone: waForm.phone || null, whatsapp_apikey: waForm.apikey || null }
        : u))
      setExito(`WhatsApp de "${waModal.nombre}" actualizado`)
      setTimeout(() => setExito(''), 3000)
    } else {
      const d = await res.json()
      setError(d.error || 'Error al guardar')
    }
    setWaModal(null)
    setGuardandoWa(false)
  }

  async function cambiarRol(userId: string, nuevoRol: Rol) {
    const res = await fetch('/api/usuarios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, rol: nuevoRol }),
    })
    if (res.ok) setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, rol: nuevoRol } : u))
  }

  return (
    <div className="space-y-5 max-w-4xl">
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
                    <select value={u.rol} onChange={e => cambiarRol(u.id, e.target.value as Rol)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer w-auto ${ROL_COLORS[u.rol]}`}>
                      {(Object.keys(ROL_LABELS) as Rol[]).map(r => (
                        <option key={r} value={r}>{ROL_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[#888] text-xs">
                    {new Date(u.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setResetModal({ id: u.id, nombre: u.nombre }); setNuevaPassword(''); setError('') }}
                        className="text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors whitespace-nowrap"
                      >
                        🔑 Contraseña
                      </button>
                      {(u.rol === 'fabrica' || u.rol === 'deposito') && (
                        <button
                          onClick={() => { setWaModal({ id: u.id, nombre: u.nombre, phone: u.whatsapp_phone, apikey: u.whatsapp_apikey }); setWaForm({ phone: u.whatsapp_phone || '', apikey: u.whatsapp_apikey || '' }); setError('') }}
                          className={`text-xs border px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${u.whatsapp_phone ? 'border-[#25d366]/40 text-[#25d366]' : 'border-[#2a2a2a] text-[#888] hover:border-[#25d366] hover:text-[#25d366]'}`}
                        >
                          📱 WhatsApp
                        </button>
                      )}
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
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer w-auto ${ROL_COLORS[u.rol]}`}>
                {(Object.keys(ROL_LABELS) as Rol[]).map(r => (
                  <option key={r} value={r}>{ROL_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setResetModal({ id: u.id, nombre: u.nombre }); setNuevaPassword(''); setError('') }}
                className="flex-1 text-xs text-[#888] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-[#e8c547] hover:text-[#e8c547] transition-colors text-center"
              >
                🔑 Contraseña
              </button>
              {(u.rol === 'fabrica' || u.rol === 'deposito') && (
                <button
                  onClick={() => { setWaModal({ id: u.id, nombre: u.nombre, phone: u.whatsapp_phone, apikey: u.whatsapp_apikey }); setWaForm({ phone: u.whatsapp_phone || '', apikey: u.whatsapp_apikey || '' }); setError('') }}
                  className={`flex-1 text-xs border px-2.5 py-1.5 rounded-lg transition-colors text-center ${u.whatsapp_phone ? 'border-[#25d366]/40 text-[#25d366]' : 'border-[#2a2a2a] text-[#888] hover:border-[#25d366] hover:text-[#25d366]'}`}
                >
                  📱 WhatsApp
                </button>
              )}
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

      {/* Modal WhatsApp */}
      {waModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#25d366] rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-['Syne'] font-bold text-lg text-[#f0f0f0]">WhatsApp — {waModal.nombre}</h3>
            <div className="bg-[rgba(37,211,102,.06)] border border-[#25d366]/20 rounded-xl p-3 text-xs text-[#888] space-y-1">
              <p className="text-[#25d366] font-semibold">WhatsApp via Meta Cloud API</p>
              <p>Ingresá el número con código de país. Recibirá un mensaje cada vez que llegue un pedido nuevo.</p>
            </div>
            {error && (
              <div className="bg-[rgba(232,66,16,.1)] border border-[#e84210]/30 rounded-lg p-3 text-[#e84210] text-sm">{error}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#25d366] uppercase tracking-wider mb-1.5">Teléfono (con código de país)</label>
              <input
                type="text"
                value={waForm.phone}
                onChange={e => setWaForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+5491123456789"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#25d366]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setWaModal(null); setError('') }}
                className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0]">
                Cancelar
              </button>
              <button onClick={guardarWhatsapp} disabled={guardandoWa}
                className="flex-1 py-2.5 bg-[#25d366] text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40">
                {guardandoWa ? 'Guardando...' : 'Guardar'}
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
                {(Object.keys(ROL_LABELS) as Rol[]).map(r => (
                  <option key={r} value={r}>{ROL_LABELS[r]}</option>
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
