'use client'

import { useState, useEffect, useTransition } from 'react'

interface Item { id: string; nombre: string; activo: boolean }

interface Props {
  titulo: string
  descripcion: string
  apiPath: string
}

export default function TablaMaestra({ titulo, descripcion, apiPath }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const fetch_ = () => {
    setLoading(true)
    fetch(apiPath).then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { fetch_() }, [])

  async function agregar() {
    if (!nuevo.trim()) return
    startTransition(async () => {
      const res = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevo.trim() }) })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setNuevo(''); fetch_()
    })
  }

  async function guardarEdit() {
    if (!editId || !editNombre.trim()) return
    startTransition(async () => {
      await fetch(apiPath, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, nombre: editNombre.trim() }) })
      setEditId(null); fetch_()
    })
  }

  async function toggleActivo(item: Item) {
    startTransition(async () => {
      await fetch(apiPath, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, activo: !item.activo }) })
      fetch_()
    })
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este elemento?')) return
    startTransition(async () => {
      await fetch(apiPath, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      fetch_()
    })
  }

  const inputClass = "bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">{titulo}</h1>
        <p className="text-[#888] text-sm mt-0.5">{descripcion}</p>
      </div>

      {error && <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-sm">{error}</div>}

      {/* Agregar */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex gap-3">
        <input
          className={`${inputClass} flex-1`}
          placeholder={`Nuevo ${titulo.toLowerCase()}...`}
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
        />
        <button
          onClick={agregar}
          disabled={isPending || !nuevo.trim()}
          className="bg-[#e8c547] disabled:opacity-40 text-black font-bold text-sm py-2 px-5 rounded-xl"
        >
          + Agregar
        </button>
      </div>

      {/* Lista */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-[#888] text-sm">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-[#888] text-sm">Sin registros aún</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {items.map(item => (
              <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.activo ? 'opacity-50' : ''}`}>
                {editId === item.id ? (
                  <>
                    <input
                      className={`${inputClass} flex-1`}
                      value={editNombre}
                      onChange={e => setEditNombre(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') guardarEdit(); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                    />
                    <button onClick={guardarEdit} className="text-xs bg-[#e8c547] text-black font-bold px-3 py-1.5 rounded-lg">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-[#888] hover:text-[#f0f0f0] px-3 py-1.5 rounded-lg border border-[#2a2a2a]">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-[#f0f0f0]">{item.nombre}</span>
                    <button onClick={() => { setEditId(item.id); setEditNombre(item.nombre) }} className="text-xs text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] px-3 py-1.5 rounded-lg">Editar</button>
                    <button onClick={() => toggleActivo(item)} className={`text-xs border px-3 py-1.5 rounded-lg ${item.activo ? 'text-yellow-400 border-yellow-900/40' : 'text-[#888] border-[#2a2a2a]'}`}>
                      {item.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => eliminar(item.id)} className="text-xs text-red-500 hover:text-red-400 border border-red-900/30 px-3 py-1.5 rounded-lg">Eliminar</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
