'use client'

import { useState, useEffect, useTransition } from 'react'

interface LocalConfig {
  id: string
  sucursal: string
  fudo_api_key: string | null
  fudo_api_secret: string | null
  activo: boolean
  updated_at: string
}

const emptyForm = { sucursal: '', fudo_api_key: '', fudo_api_secret: '' }

export default function LocalesClient() {
  const [locales, setLocales] = useState<LocalConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})

  useEffect(() => { fetchLocales() }, [])

  async function fetchLocales() {
    setLoading(true)
    const res = await fetch('/api/locales')
    const data = await res.json()
    setLocales(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function startEdit(local: LocalConfig) {
    setEditingId(local.id)
    setForm({ sucursal: local.sucursal, fudo_api_key: local.fudo_api_key ?? '', fudo_api_secret: local.fudo_api_secret ?? '' })
    setShowForm(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(false)
    setError('')
  }

  async function saveEdit() {
    if (!editingId) return
    startTransition(async () => {
      const res = await fetch('/api/locales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...form }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setEditingId(null)
      setForm(emptyForm)
      await fetchLocales()
    })
  }

  async function saveNew() {
    if (!form.sucursal.trim()) { setError('El nombre del local es obligatorio'); return }
    startTransition(async () => {
      const res = await fetch('/api/locales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setShowForm(false)
      setForm(emptyForm)
      await fetchLocales()
    })
  }

  async function toggleActivo(local: LocalConfig) {
    startTransition(async () => {
      await fetch('/api/locales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: local.id, activo: !local.activo }),
      })
      await fetchLocales()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este local?')) return
    startTransition(async () => {
      await fetch('/api/locales', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchLocales()
    })
  }

  async function testConnection(local: LocalConfig) {
    if (!local.fudo_api_key || !local.fudo_api_secret) {
      setTestResult(prev => ({ ...prev, [local.id]: { ok: false, msg: 'Sin credenciales' } }))
      return
    }
    setTesting(local.id)
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const params = new URLSearchParams({ sucursal: local.sucursal, tipo: 'expenses', desde: hoy, hasta: hoy })
      const res = await fetch(`/api/fudo?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTestResult(prev => ({ ...prev, [local.id]: { ok: true, msg: `Conectado (${data.total} gastos hoy)` } }))
    } catch (e: unknown) {
      setTestResult(prev => ({ ...prev, [local.id]: { ok: false, msg: e instanceof Error ? e.message : 'Error' } }))
    } finally {
      setTesting(null)
    }
  }

  const toggleSecret = (id: string) => {
    setShowSecrets(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const inputClass = "w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
  const mask = (s: string | null) => s ? `${s.slice(0, 6)}${'•'.repeat(Math.max(0, (s.length - 6)))}` : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Locales</h1>
          <p className="text-[#888] text-sm mt-0.5">Configuración de credenciales Fudo por sucursal</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setError('') }}
          className="bg-[#e8c547] hover:opacity-90 text-black font-bold text-sm py-2 px-4 rounded-xl transition-all"
        >
          + Agregar local
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-sm">{error}</div>
      )}

      {/* Formulario nuevo */}
      {showForm && (
        <div className="bg-[#111111] border border-[#e8c547]/30 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#e8c547] uppercase tracking-wider">Nuevo local</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#888] mb-1.5">Nombre sucursal</label>
              <input className={inputClass} placeholder="YA! NOMBRE" value={form.sucursal} onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1.5">Fudo API Key</label>
              <input className={inputClass} placeholder="MUAz..." value={form.fudo_api_key} onChange={e => setForm(f => ({ ...f, fudo_api_key: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1.5">Fudo API Secret</label>
              <input className={inputClass} placeholder="Secret..." value={form.fudo_api_secret} onChange={e => setForm(f => ({ ...f, fudo_api_secret: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveNew} disabled={isPending} className="bg-[#e8c547] disabled:opacity-40 text-black font-bold text-sm py-2 px-5 rounded-xl">
              Guardar
            </button>
            <button onClick={cancelEdit} className="text-[#888] hover:text-[#f0f0f0] text-sm py-2 px-4 rounded-xl hover:bg-[#1a1a1a]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-[#888] text-sm p-8 text-center">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {locales.map(local => (
            <div key={local.id} className={`bg-[#111111] border rounded-xl overflow-hidden transition-colors ${local.activo ? 'border-[#2a2a2a]' : 'border-[#1a1a1a] opacity-60'}`}>
              {editingId === local.id ? (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-[#888] mb-1.5">Nombre sucursal</label>
                      <input className={inputClass} value={form.sucursal} onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#888] mb-1.5">Fudo API Key</label>
                      <input className={inputClass} value={form.fudo_api_key} onChange={e => setForm(f => ({ ...f, fudo_api_key: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#888] mb-1.5">Fudo API Secret</label>
                      <input className={inputClass} value={form.fudo_api_secret} onChange={e => setForm(f => ({ ...f, fudo_api_secret: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={isPending} className="bg-[#e8c547] disabled:opacity-40 text-black font-bold text-sm py-2 px-5 rounded-xl">
                      Guardar
                    </button>
                    <button onClick={cancelEdit} className="text-[#888] hover:text-[#f0f0f0] text-sm py-2 px-4 rounded-xl hover:bg-[#1a1a1a]">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[#888] text-xs mb-0.5">Sucursal</p>
                      <p className="text-[#f0f0f0] font-bold text-sm">{local.sucursal}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs mb-0.5">API Key</p>
                      <p className="text-[#f0f0f0] text-sm font-mono">{mask(local.fudo_api_key)}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs mb-0.5">API Secret</p>
                      <p className="text-[#f0f0f0] text-sm font-mono flex items-center gap-2">
                        {showSecrets.has(local.id) ? local.fudo_api_secret : mask(local.fudo_api_secret)}
                        <button onClick={() => toggleSecret(local.id)} className="text-[#555] hover:text-[#888] text-xs">
                          {showSecrets.has(local.id) ? 'ocultar' : 'ver'}
                        </button>
                      </p>
                    </div>
                  </div>

                  {/* Test result */}
                  {testResult[local.id] && (
                    <span className={`text-xs px-2 py-1 rounded-full ${testResult[local.id].ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                      {testResult[local.id].msg}
                    </span>
                  )}

                  {/* Acciones */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => testConnection(local)}
                      disabled={testing === local.id}
                      className="text-xs text-[#888] hover:text-[#e8c547] border border-[#2a2a2a] hover:border-[#e8c547]/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {testing === local.id ? 'Probando...' : 'Probar'}
                    </button>
                    <button
                      onClick={() => startEdit(local)}
                      className="text-xs text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActivo(local)}
                      className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${local.activo ? 'text-yellow-400 border-yellow-900/40 hover:bg-yellow-900/20' : 'text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'}`}
                    >
                      {local.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => handleDelete(local.id)}
                      className="text-xs text-red-500 hover:text-red-400 border border-red-900/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
