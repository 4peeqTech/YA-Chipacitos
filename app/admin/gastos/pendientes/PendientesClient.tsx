'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface GastoManual {
  _source: 'manual'
  id: string
  fecha: string
  local: string
  rubro: string
  categoria: string
  monto: number
  forma_pago: string
  estado: string
  observaciones: string | null
  comprobante_url: string | null
  fecha_pago: string | null
  proveedores: { nombre: string } | null
}

interface GastoFudo {
  _source: 'fudo'
  id: string
  sucursal: string
  date: string
  description: string
  amount: number
  status: string
  expenseCategory: { name: string } | null
  provider: { name: string } | null
}

type GastoPendiente = GastoManual | GastoFudo

interface Props {
  gastosManual: GastoManual[]
}

function formatMonto(n: number | unknown) {
  const v = Number(n)
  return isNaN(v) ? '—' : `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function hoy() { return new Date().toISOString().split('T')[0] }

function getLocal(g: GastoPendiente) { return g._source === 'manual' ? g.local : g.sucursal }
function getMonto(g: GastoPendiente) { return g._source === 'manual' ? g.monto : Number((g as GastoFudo).amount) }
function getDescripcion(g: GastoPendiente) {
  if (g._source === 'manual') {
    return g.proveedores?.nombre ?? g.categoria
  }
  const f = g as GastoFudo
  return f.description || f.expenseCategory?.name || f.provider?.name || '—'
}
function getFecha(g: GastoPendiente) { return g._source === 'manual' ? g.fecha : (g as GastoFudo).date }

export default function PendientesClient({ gastosManual: initialManual }: Props) {
  const supabase = createClient()
  const [gastosManual, setGastosManual] = useState<GastoManual[]>(initialManual)
  const [gastosFudo, setGastosFudo] = useState<GastoFudo[]>([])
  const [loadingFudo, setLoadingFudo] = useState(true)
  const [errorFudo, setErrorFudo] = useState('')

  const [cajas, setCajas] = useState<string[]>([])
  const [formasPago, setFormasPago] = useState<string[]>([])

  // Filtros
  const [filtroSucursal, setFiltroSucursal] = useState('todas')
  const [filtroOrigen, setFiltroOrigen] = useState<'todos' | 'manual' | 'fudo'>('todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')

  const [modalGasto, setModalGasto] = useState<GastoPendiente | null>(null)
  const [fechaPago, setFechaPago] = useState(hoy())
  const [caja, setCaja] = useState('')
  const [formaPago, setFormaPago] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    fetch('/api/cajas').then(r => r.json()).then((d: Array<{ nombre: string; activo: boolean }>) => {
      setCajas(Array.isArray(d) ? d.filter(x => x.activo).map(x => x.nombre) : [])
    })
    fetch('/api/formas-pago').then(r => r.json()).then((d: Array<{ nombre: string; activo: boolean }>) => {
      setFormasPago(Array.isArray(d) ? d.filter(x => x.activo).map(x => x.nombre) : [])
    })
  }, [])

  useEffect(() => {
    fetch('/api/fudo/pendientes')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setGastosFudo(data as GastoFudo[])
        else setErrorFudo(data.error ?? 'Error al cargar Fudo')
      })
      .catch(() => setErrorFudo('Error de conexión con Fudo'))
      .finally(() => setLoadingFudo(false))
  }, [])

  const todos: GastoPendiente[] = [
    ...gastosManual.map(g => ({ ...g, _source: 'manual' as const })),
    ...gastosFudo,
  ]

  const todosFiltrados = todos.filter(g => {
    if (filtroOrigen !== 'todos' && g._source !== filtroOrigen) return false
    if (filtroSucursal !== 'todas' && getLocal(g) !== filtroSucursal) return false
    if (filtroDesde && getFecha(g) < filtroDesde) return false
    if (filtroHasta && getFecha(g) > filtroHasta) return false
    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase()
      if (!getDescripcion(g).toLowerCase().includes(q) && !getLocal(g).toLowerCase().includes(q)) return false
    }
    return true
  })

  const sucursalesDisponibles = [...new Set(todos.map(getLocal))].sort()

  const porLocal = todosFiltrados.reduce<Record<string, GastoPendiente[]>>((acc, g) => {
    const k = getLocal(g)
    if (!acc[k]) acc[k] = []
    acc[k].push(g)
    return acc
  }, {})

  const totalPendiente = todos.reduce((s, g) => s + getMonto(g), 0)

  function openModal(gasto: GastoPendiente) {
    setModalGasto(gasto)
    setFechaPago(hoy())
    setCaja('')
    setFormaPago(gasto._source === 'manual' ? gasto.forma_pago : '')
    setFile(null)
    setError('')
  }

  function closeModal() { setModalGasto(null); setFile(null); setError('') }

  async function marcarPagado() {
    if (!modalGasto) return
    if (!caja) { setError('Seleccioná una caja'); return }
    if (!formaPago) { setError('Seleccioná una forma de pago'); return }
    setSaving(true); setError('')
    try {
      let comprobante_url: string | null = null

      if (file) {
        const id = modalGasto.id
        const ext = file.name.split('.').pop()
        const path = `gastos/${id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
        if (upErr) throw new Error(`Error al subir: ${upErr.message}`)
        const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
        comprobante_url = urlData.publicUrl
      }

      if (modalGasto._source === 'manual') {
        const { error: e } = await supabase
          .from('gastos')
          .update({ estado: 'Pagado', fecha_pago: fechaPago, forma_pago: formaPago, caja, comprobante_url })
          .eq('id', modalGasto.id)
        if (e) throw new Error(e.message)
        setGastosManual(prev => prev.filter(g => g.id !== modalGasto.id))
      } else {
        const fg = modalGasto as GastoFudo
        const { error: e } = await supabase.from('fudo_pagos').insert({
          fudo_expense_id: fg.id,
          sucursal: fg.sucursal,
          descripcion: getDescripcion(fg),
          monto: fg.amount,
          fecha_gasto: fg.date,
          fecha_pago: fechaPago,
          forma_pago: formaPago,
          caja,
          comprobante_url,
        })
        if (e) throw new Error(e.message)
        setGastosFudo(prev => prev.filter(g => !(g.id === fg.id && g.sucursal === fg.sucursal)))
      }

      closeModal()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Pendientes de pago</h1>
        <p className="text-[#888] text-sm mt-0.5">Gastos manuales + Fudo por sucursal</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Total pendiente</p>
          <p className="text-xl font-bold text-red-400 mt-1">{formatMonto(todosFiltrados.reduce((s, g) => s + getMonto(g), 0))}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Manuales</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">{gastosManual.length}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Fudo</p>
          <p className={`text-xl font-bold mt-1 ${loadingFudo ? 'text-[#555]' : 'text-[#f0f0f0]'}`}>
            {loadingFudo ? '…' : gastosFudo.length}
          </p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Mostrando</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">{todosFiltrados.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Sucursal</label>
          <select className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
            value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)}>
            <option value="todas">Todas</option>
            {sucursalesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Origen</label>
          <select className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
            value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value as 'todos' | 'manual' | 'fudo')}>
            <option value="todos">Todos</option>
            <option value="manual">Manual</option>
            <option value="fudo">Fudo</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Desde</label>
          <input type="date" className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"
            value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Hasta</label>
          <input type="date" className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"
            value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Buscar</label>
          <input type="text" placeholder="Descripción o sucursal..."
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547]"
            value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} />
        </div>
        {(filtroSucursal !== 'todas' || filtroOrigen !== 'todos' || filtroDesde || filtroHasta || filtroBusqueda) && (
          <button onClick={() => { setFiltroSucursal('todas'); setFiltroOrigen('todos'); setFiltroDesde(''); setFiltroHasta(''); setFiltroBusqueda('') }}
            className="text-xs text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] px-3 py-2 rounded-lg">
            Limpiar
          </button>
        )}
      </div>

      {errorFudo && (
        <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-3 text-yellow-300 text-sm">
          Fudo: {errorFudo}
        </div>
      )}

      {todosFiltrados.length === 0 && !loadingFudo && (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-[#f0f0f0] font-medium">{todos.length === 0 ? 'Todo al día' : 'Sin resultados'}</p>
          <p className="text-[#888] text-sm mt-1">{todos.length === 0 ? 'No hay gastos pendientes de pago' : 'Probá cambiando los filtros'}</p>
        </div>
      )}

      {Object.entries(porLocal).sort(([a], [b]) => a.localeCompare(b)).map(([local, items]) => {
        const subtotal = items.reduce((s, g) => s + getMonto(g), 0)
        return (
          <div key={local} className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="font-bold text-[#f0f0f0] text-sm">{local}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#888]">{items.length} gastos</span>
                <span className="text-sm font-bold text-red-400">{formatMonto(subtotal)}</span>
              </div>
            </div>
            <div className="divide-y divide-[#1a1a1a]">
              {items.map(gasto => (
                <div key={`${gasto._source}-${gasto.id}`} className="px-4 py-3 flex items-center gap-4 hover:bg-[#161616] transition-colors">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-[#888] text-xs">Fecha</p>
                      <p className="text-[#f0f0f0]">{getFecha(gasto)}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Descripción</p>
                      <p className="text-[#f0f0f0] truncate">{getDescripcion(gasto)}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Origen</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${gasto._source === 'fudo' ? 'bg-blue-900/40 text-blue-300' : 'bg-[#2a2a2a] text-[#888]'}`}>
                        {gasto._source === 'fudo' ? 'Fudo' : 'Manual'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Monto</p>
                      <p className="text-[#f0f0f0] font-bold">{formatMonto(getMonto(gasto))}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openModal(gasto)}
                    className="bg-[#e8c547] hover:opacity-90 text-black font-bold text-xs py-1.5 px-3 rounded-lg transition-all shrink-0"
                  >
                    Dar pago
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Modal */}
      {modalGasto && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-[#f0f0f0]">Registrar pago</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${modalGasto._source === 'fudo' ? 'bg-blue-900/40 text-blue-300' : 'bg-[#2a2a2a] text-[#888]'}`}>
                  {modalGasto._source === 'fudo' ? 'Fudo' : 'Manual'}
                </span>
              </div>
              <p className="text-[#888] text-sm">{getLocal(modalGasto)} — {getDescripcion(modalGasto)}</p>
            </div>

            <div className="bg-[#0a0a0a] rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Fecha gasto</span>
                <span className="text-[#f0f0f0]">{getFecha(modalGasto)}</span>
              </div>
              {modalGasto._source === 'manual' && (
                <div className="flex justify-between">
                  <span className="text-[#888]">Forma de pago</span>
                  <span className="text-[#f0f0f0]">{modalGasto.forma_pago}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[#2a2a2a] pt-2 mt-2">
                <span className="text-[#888] font-medium">Monto</span>
                <span className="text-[#e8c547] font-bold text-base">{formatMonto(getMonto(modalGasto))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Fecha de pago</label>
                <input type="date" className={inputClass} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Caja <span className="text-red-400">*</span></label>
                <select className={inputClass} value={caja} onChange={e => setCaja(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {cajas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Forma de pago <span className="text-red-400">*</span></label>
              <select className={inputClass} value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                <option value="">Seleccionar...</option>
                {formasPago.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">
                Comprobante <span className="text-[#555] normal-case font-normal">(opcional)</span>
              </label>
              <label className="flex items-center gap-3 border border-dashed border-[#2a2a2a] hover:border-[#e8c547]/40 rounded-xl p-4 cursor-pointer transition-colors">
                <span className="text-2xl">📎</span>
                <p className={`text-sm ${file ? 'text-[#f0f0f0]' : 'text-[#888]'}`}>
                  {file ? file.name : 'Seleccionar archivo (JPG, PNG, PDF)'}
                </p>
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={marcarPagado} disabled={saving}
                className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-bold py-2.5 rounded-xl text-sm">
                {saving ? 'Guardando...' : 'Confirmar pago'}
              </button>
              <button onClick={closeModal}
                className="px-4 text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] rounded-xl text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
