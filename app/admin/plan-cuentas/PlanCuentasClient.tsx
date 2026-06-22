'use client'

import { useState, useEffect, useRef } from 'react'

interface Cuenta {
  id: string
  rubro: string
  categoria: string | null
  activo: boolean
  orden: number
}

type Grouped = Record<string, Cuenta[]>

export default function PlanCuentasClient() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // New categoria state
  const [addingCatIn, setAddingCatIn] = useState<string | null>(null)
  const [newCatValue, setNewCatValue] = useState('')

  // New rubro state
  const [addingRubro, setAddingRubro] = useState(false)
  const [newRubroValue, setNewRubroValue] = useState('')

  const editRef = useRef<HTMLInputElement>(null)
  const newCatRef = useRef<HTMLInputElement>(null)
  const newRubroRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  useEffect(() => {
    if (addingCatIn && newCatRef.current) newCatRef.current.focus()
  }, [addingCatIn])

  useEffect(() => {
    if (addingRubro && newRubroRef.current) newRubroRef.current.focus()
  }, [addingRubro])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/plan-cuentas')
    const data = await res.json()
    setCuentas(Array.isArray(data) ? data : [])
    setLoading(false)
    // Expand all rubros by default
    const rubros = [...new Set((Array.isArray(data) ? data : []).map((c: Cuenta) => c.rubro))]
    setExpanded(new Set(rubros))
  }

  const grouped: Grouped = cuentas.reduce<Grouped>((acc, c) => {
    if (!acc[c.rubro]) acc[c.rubro] = []
    acc[c.rubro].push(c)
    return acc
  }, {})

  const rubros = Object.keys(grouped).sort((a, b) => {
    const oA = grouped[a][0]?.orden ?? 999
    const oB = grouped[b][0]?.orden ?? 999
    return oA - oB
  })

  const toggleExpand = (rubro: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(rubro) ? next.delete(rubro) : next.add(rubro)
      return next
    })
  }

  async function toggleActivo(c: Cuenta) {
    await fetch('/api/plan-cuentas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, activo: !c.activo }),
    })
    setCuentas(prev => prev.map(x => x.id === c.id ? { ...x, activo: !x.activo } : x))
  }

  async function saveEdit(c: Cuenta) {
    const val = editValue.trim()
    if (!val || val === (c.categoria ?? c.rubro)) { setEditingId(null); return }
    if (c.categoria !== null) {
      await fetch('/api/plan-cuentas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, categoria: val }),
      })
      setCuentas(prev => prev.map(x => x.id === c.id ? { ...x, categoria: val } : x))
    }
    setEditingId(null)
  }

  async function deleteItem(c: Cuenta) {
    if (!confirm(`¿Eliminar "${c.categoria ?? c.rubro}"?`)) return
    await fetch('/api/plan-cuentas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id }),
    })
    setCuentas(prev => prev.filter(x => x.id !== c.id))
  }

  async function addCategoria(rubro: string) {
    const val = newCatValue.trim()
    if (!val) { setAddingCatIn(null); return }
    const maxOrden = Math.max(...(grouped[rubro]?.map(c => c.orden) ?? [0]))
    const res = await fetch('/api/plan-cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubro, categoria: val.toUpperCase(), orden: maxOrden + 1 }),
    })
    const nueva = await res.json()
    setCuentas(prev => [...prev, nueva])
    setNewCatValue('')
    setAddingCatIn(null)
  }

  async function addRubro() {
    const val = newRubroValue.trim()
    if (!val) { setAddingRubro(false); return }
    const maxOrden = Math.max(...cuentas.map(c => c.orden), 0)
    const res = await fetch('/api/plan-cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubro: val.toUpperCase(), categoria: null, orden: maxOrden + 10 }),
    })
    const nuevo = await res.json()
    setCuentas(prev => [...prev, nuevo])
    setExpanded(prev => new Set([...prev, val.toUpperCase()]))
    setNewRubroValue('')
    setAddingRubro(false)
  }

  const inputClass = 'bg-[#0a0a0a] border border-[#e8c547] text-[#f0f0f0] rounded px-2 py-1 text-sm focus:outline-none w-full'

  if (loading) return <div className="text-[#555] py-10 text-center">Cargando…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Plan de cuentas</h1>
        <p className="text-[#888] text-sm mt-0.5">Rubros y categorías para clasificar gastos</p>
      </div>

      <div className="space-y-3">
        {rubros.map(rubro => (
          <div key={rubro} className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
            {/* Rubro header */}
            <button
              onClick={() => toggleExpand(rubro)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
            >
              <span className="text-xs font-bold text-[#e8c547] uppercase tracking-widest">{rubro}</span>
              <div className="flex items-center gap-3">
                <span className="text-[#555] text-xs">{grouped[rubro].length} categorías</span>
                <span className={`text-[#555] text-xs transition-transform ${expanded.has(rubro) ? '' : '-rotate-90'}`}>▼</span>
              </div>
            </button>

            {expanded.has(rubro) && (
              <div className="border-t border-[#2a2a2a]">
                {grouped[rubro].map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1a1a1a] last:border-0 hover:bg-[#1a1a1a] group">
                    {editingId === c.id ? (
                      <input
                        ref={editRef}
                        className={inputClass}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(c)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => saveEdit(c)}
                      />
                    ) : (
                      <span className={`flex-1 text-sm ${c.activo ? 'text-[#f0f0f0]' : 'text-[#444] line-through'}`}>
                        {c.categoria ?? <span className="italic text-[#555]">Sin categoría</span>}
                      </span>
                    )}

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId !== c.id && c.categoria !== null && (
                        <button
                          onClick={() => { setEditingId(c.id); setEditValue(c.categoria ?? '') }}
                          className="text-[#555] hover:text-[#f0f0f0] text-xs px-1.5 py-0.5 rounded hover:bg-[#2a2a2a]"
                        >
                          ✏️
                        </button>
                      )}
                      <button
                        onClick={() => toggleActivo(c)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          c.activo
                            ? 'border-green-800 text-green-500 hover:bg-green-900/20'
                            : 'border-[#2a2a2a] text-[#444] hover:bg-[#2a2a2a]'
                        }`}
                      >
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        onClick={() => deleteItem(c)}
                        className="text-[#333] hover:text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-900/20"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Agregar categoría */}
                {addingCatIn === rubro ? (
                  <div className="px-4 py-2.5 flex items-center gap-2 border-t border-[#1a1a1a]">
                    <input
                      ref={newCatRef}
                      className={inputClass}
                      placeholder="Nueva categoría…"
                      value={newCatValue}
                      onChange={e => setNewCatValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') addCategoria(rubro)
                        if (e.key === 'Escape') { setAddingCatIn(null); setNewCatValue('') }
                      }}
                      onBlur={() => addCategoria(rubro)}
                    />
                    <button onClick={() => addCategoria(rubro)} className="text-[#e8c547] text-xs whitespace-nowrap">Guardar</button>
                    <button onClick={() => { setAddingCatIn(null); setNewCatValue('') }} className="text-[#555] text-xs">Cancelar</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCatIn(rubro)}
                    className="w-full text-left px-4 py-2 text-xs text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] transition-colors"
                  >
                    + Agregar categoría
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Agregar rubro */}
        {addingRubro ? (
          <div className="bg-[#111111] border border-[#e8c547] rounded-xl px-4 py-3 flex items-center gap-2">
            <input
              ref={newRubroRef}
              className={inputClass}
              placeholder="Nombre del rubro…"
              value={newRubroValue}
              onChange={e => setNewRubroValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addRubro()
                if (e.key === 'Escape') { setAddingRubro(false); setNewRubroValue('') }
              }}
            />
            <button onClick={addRubro} className="text-[#e8c547] text-xs font-bold whitespace-nowrap px-3">Guardar</button>
            <button onClick={() => { setAddingRubro(false); setNewRubroValue('') }} className="text-[#555] text-xs whitespace-nowrap">Cancelar</button>
          </div>
        ) : (
          <button
            onClick={() => setAddingRubro(true)}
            className="w-full bg-[#111111] border border-dashed border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#555] hover:text-[#888] hover:border-[#444] transition-colors"
          >
            + Agregar rubro
          </button>
        )}
      </div>
    </div>
  )
}
