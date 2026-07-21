'use client'

import { useState, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RUBROS_CATEGORIAS, RUBROS, LOCALES, FORMAS_PAGO, ESTADOS_GASTO } from '@/lib/gastos-constants'

interface Proveedor { id: string; nombre: string }
interface Gasto {
  id: string
  fecha: string
  local: string
  rubro: string
  categoria: string
  proveedor_id: string | null
  monto: number
  forma_pago: string
  estado: string
  observaciones: string | null
  proveedores?: { nombre: string } | null
}

const hoy = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  fecha: hoy(),
  local: '',
  rubro: '',
  categoria: '',
  proveedor_id: '',
  monto: '',
  forma_pago: '',
  estado: 'Pendiente de pago',
  observaciones: '',
})

const estadoBadge = (estado: string) => {
  if (estado === 'Pagado') return 'bg-green-900/50 text-green-300'
  if (estado === 'Parcial') return 'bg-yellow-900/50 text-yellow-300'
  return 'bg-red-900/30 text-red-300'
}

export default function GastosClient() {
  const [supabase] = useState(() => createClient())
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  useEffect(() => {
    supabase.from('proveedores').select('id, nombre').eq('estado', 'activo').order('nombre')
      .then(({ data }) => setProveedores(data ?? []))

    supabase.from('gastos')
      .select('*, proveedores(nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setGastos(data ?? []))
  }, [])

  const categorias = form.rubro ? (RUBROS_CATEGORIAS[form.rubro] ?? []) : []

  function setField(key: string, value: string) {
    setForm(f => {
      const updated = { ...f, [key]: value }
      if (key === 'rubro') updated.categoria = ''
      return updated
    })
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.local || !form.rubro || !form.categoria || !form.monto || !form.forma_pago) {
      setError('Completá todos los campos requeridos')
      return
    }
    setError('')

    startTransition(async () => {
      const payload = {
        fecha: form.fecha,
        local: form.local,
        rubro: form.rubro,
        categoria: form.categoria,
        proveedor_id: form.proveedor_id || null,
        monto: parseFloat(form.monto),
        forma_pago: form.forma_pago,
        estado: form.estado,
        observaciones: form.observaciones || null,
      }

      const { data, error: err } = await supabase
        .from('gastos')
        .insert([payload])
        .select('*, proveedores(nombre)')
        .single()

      if (err) { setError(err.message); return }

      setGastos(prev => [data, ...prev])
      setForm(emptyForm())
      setExito(true)
      setTimeout(() => setExito(false), 2500)
    })
  }

  const gastosFiltrados = filtroEstado === 'todos'
    ? gastos
    : gastos.filter(g => g.estado === filtroEstado)

  const totalFiltrado = gastosFiltrados.reduce((s, g) => s + g.monto, 0)
  const totalPendiente = gastos.filter(g => g.estado === 'Pendiente de pago').reduce((s, g) => s + g.monto, 0)

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors [color-scheme:dark]"
  const labelClass = "block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5"
  const selectClass = `${inputClass} cursor-pointer`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Registro de Egresos</h1>
        <p className="text-[#888] text-sm mt-0.5">Cargá y seguí los gastos operativos</p>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Total registrado</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">${gastos.reduce((s,g) => s+g.monto, 0).toLocaleString('es-AR', {minimumFractionDigits:2})}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Pendiente de pago</p>
          <p className="text-xl font-bold text-red-400 mt-1">${totalPendiente.toLocaleString('es-AR', {minimumFractionDigits:2})}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Gastos cargados</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">{gastos.length}</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-[#111111] border border-[#2a2a2a] border-t-2 border-t-[#e8c547] rounded-xl p-6">
        <h2 className="text-base font-bold text-[#f0f0f0] mb-5">Nuevo egreso</h2>
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* FECHA */}
            <div>
              <label className={labelClass}>📅 Fecha</label>
              <input type="date" className={inputClass} value={form.fecha} onChange={e => setField('fecha', e.target.value)} />
            </div>

            {/* LOCAL */}
            <div>
              <label className={labelClass}>🏠 Local</label>
              <select className={selectClass} value={form.local} onChange={e => setField('local', e.target.value)}>
                <option value="">— elegí de la lista —</option>
                {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* RUBRO */}
            <div>
              <label className={labelClass}>📁 Rubro</label>
              <select className={selectClass} value={form.rubro} onChange={e => setField('rubro', e.target.value)}>
                <option value="">— elegí primero el rubro —</option>
                {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* CATEGORIA */}
            <div>
              <label className={labelClass}>🏷️ Categoría</label>
              <select className={selectClass} value={form.categoria} onChange={e => setField('categoria', e.target.value)} disabled={!form.rubro}>
                <option value="">— se filtra según el rubro —</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* PROVEEDOR */}
            <div>
              <label className={labelClass}>🚚 Proveedor</label>
              <select className={selectClass} value={form.proveedor_id} onChange={e => setField('proveedor_id', e.target.value)}>
                <option value="">— elegí de la lista —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            {/* MONTO */}
            <div>
              <label className={labelClass}>$ Monto ARS</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="solo el número, sin $"
                className={inputClass}
                value={form.monto}
                onChange={e => setField('monto', e.target.value)}
              />
            </div>

            {/* FORMA DE PAGO */}
            <div>
              <label className={labelClass}>💳 Forma de pago</label>
              <select className={selectClass} value={form.forma_pago} onChange={e => setField('forma_pago', e.target.value)}>
                <option value="">— elegí de la lista —</option>
                {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
              </select>
            </div>

            {/* ESTADO */}
            <div>
              <label className={labelClass}>🎯 Estado</label>
              <select className={selectClass} value={form.estado} onChange={e => setField('estado', e.target.value)}>
                {ESTADOS_GASTO.map(es => <option key={es} value={es}>{es}</option>)}
              </select>
            </div>

            {/* OBSERVACIONES */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={labelClass}>📝 Observaciones</label>
              <input
                type="text"
                placeholder="opcional"
                className={inputClass}
                value={form.observaciones}
                onChange={e => setField('observaciones', e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {exito && <p className="text-green-400 text-sm">✓ Egreso guardado correctamente</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-bold py-3 rounded-xl transition-all tracking-wide"
          >
            {isPending ? 'Guardando...' : 'GUARDAR EGRESO'}
          </button>
        </form>
      </div>

      {/* Lista de gastos */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[#f0f0f0]">Egresos registrados</h2>
          <div className="flex gap-2 flex-wrap">
            {['todos', ...ESTADOS_GASTO].map(e => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filtroEstado === e ? 'bg-[#e8c547] text-black' : 'bg-[#2a2a2a] text-[#888] hover:text-[#f0f0f0]'}`}
              >
                {e === 'todos' ? 'Todos' : e}
              </button>
            ))}
            {filtroEstado !== 'todos' && (
              <span className="px-3 py-1 text-xs text-[#888]">
                ${totalFiltrado.toLocaleString('es-AR', {minimumFractionDigits:2})}
              </span>
            )}
          </div>
        </div>

        {gastosFiltrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay egresos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a]">
                <tr>
                  {['Fecha', 'Local', 'Rubro', 'Categoría', 'Proveedor', 'Monto', 'Forma pago', 'Estado'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {gastosFiltrados.map(g => (
                  <tr key={g.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#888] whitespace-nowrap">{new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#f0f0f0]">{g.local}</td>
                    <td className="px-4 py-3 text-[#888]">{g.rubro}</td>
                    <td className="px-4 py-3 text-[#888]">{g.categoria}</td>
                    <td className="px-4 py-3 text-[#888]">{g.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium whitespace-nowrap">${g.monto.toLocaleString('es-AR', {minimumFractionDigits:2})}</td>
                    <td className="px-4 py-3 text-[#888] whitespace-nowrap">{g.forma_pago}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${estadoBadge(g.estado)}`}>{g.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
