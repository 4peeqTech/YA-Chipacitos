'use client'

import { useState, useCallback } from 'react'

interface CatRow { categoria: string; total: number }
interface VentaRow { producto: string; cantidad: number; importe: number }
interface LocalData {
  local: string
  gastos: CatRow[]
  ventas: VentaRow[]
  totalGastos: number
  totalVendido: number
  totalMontoVendido: number
}

function hoy() { return new Date().toISOString().slice(0, 10) }
function primerDelMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function fmt(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 })
}

const inputClass =
  'bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]'

export default function ResumenClient() {
  const [desde, setDesde] = useState(primerDelMes())
  const [hasta, setHasta] = useState(hoy())
  const [data, setData] = useState<LocalData[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [filtroLocal, setFiltroLocal] = useState('todos')

  const consultar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await fetch(`/api/resumen?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      setData(json)
      // Expand all by default
      const exp: Record<string, boolean> = {}
      for (const d of json) exp[d.local] = true
      setExpandido(exp)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  const toggle = (local: string) =>
    setExpandido(prev => ({ ...prev, [local]: !prev[local] }))

  const dataFiltrada = filtroLocal === 'todos' ? (data ?? []) : (data ?? []).filter(d => d.local === filtroLocal)
  const totalGastos = dataFiltrada.reduce((s, d) => s + d.totalGastos, 0)
  const totalVendido = dataFiltrada.reduce((s, d) => s + d.totalVendido, 0)
  const totalMontoVendido = dataFiltrada.reduce((s, d) => s + d.totalMontoVendido, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Resumen por local</h1>
        <p className="text-[#888] text-sm mt-0.5">Gastos por categoría y pedidos por producto</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Desde</label>
          <input type="date" className={inputClass} value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Hasta</label>
          <input type="date" className={inputClass} value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        {data && data.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Sucursal</label>
            <select className={inputClass} value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)}>
              <option value="todos">Todas</option>
              {data.map(d => <option key={d.local} value={d.local}>{d.local}</option>)}
            </select>
          </div>
        )}
        <button
          onClick={consultar}
          disabled={loading}
          className="px-5 py-2 bg-[#e8c547] text-black text-sm font-bold rounded-lg hover:bg-[#f0d060] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {data && (
        <>
          {/* Stats globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Locales</p>
              <p className="text-xl font-bold text-[#f0f0f0] mt-1">{dataFiltrada.length}</p>
            </div>
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total gastos</p>
              <p className="text-xl font-bold text-red-400 mt-1">{fmt(totalGastos)}</p>
            </div>
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total vendido</p>
              <p className="text-xl font-bold text-[#f0f0f0] mt-1">{totalVendido.toLocaleString('es-AR')} u</p>
            </div>
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Monto vendido</p>
              <p className="text-xl font-bold text-green-400 mt-1">{fmt(totalMontoVendido)}</p>
            </div>
          </div>

          {dataFiltrada.length === 0 && (
            <div className="text-center py-16 text-[#888]">Sin datos para el período seleccionado</div>
          )}

          {/* Cards por local */}
          {dataFiltrada.map(d => (
            <div key={d.local} className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggle(d.local)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-base font-bold text-[#f0f0f0] uppercase tracking-wide">{d.local}</span>
                  <span className="text-xs text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded-full">
                    {d.gastos.length} categorías · {d.ventas.length} productos
                  </span>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-[10px] text-[#555] uppercase">Gastos</p>
                    <p className="text-sm font-bold text-red-400">{fmt(d.totalGastos)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase">Vendido</p>
                    <p className="text-sm font-bold text-green-400">{fmt(d.totalMontoVendido)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase">Unidades</p>
                    <p className="text-sm font-bold text-[#f0f0f0]">{d.totalVendido.toLocaleString('es-AR')} u</p>
                  </div>
                  <span className={`text-[#555] text-xs transition-transform ${expandido[d.local] ? '' : '-rotate-90'}`}>▼</span>
                </div>
              </button>

              {expandido[d.local] && (
                <div className="border-t border-[#2a2a2a] grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#2a2a2a]">
                  {/* Gastos por categoría */}
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-3">Gastos por categoría</h3>
                    {d.gastos.length === 0 ? (
                      <p className="text-[#555] text-sm">Sin gastos en el período</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[#555] text-xs">
                            <th className="text-left pb-2 font-medium">Categoría</th>
                            <th className="text-right pb-2 font-medium">Total</th>
                            <th className="text-right pb-2 font-medium w-16">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1a1a1a]">
                          {d.gastos.map(g => (
                            <tr key={g.categoria}>
                              <td className="py-1.5 text-[#f0f0f0]">{g.categoria}</td>
                              <td className="py-1.5 text-right text-[#f0f0f0] font-medium">{fmt(g.total)}</td>
                              <td className="py-1.5 text-right text-[#555] text-xs">
                                {d.totalGastos > 0 ? Math.round((g.total / d.totalGastos) * 100) : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[#2a2a2a]">
                            <td className="pt-2 text-[#888] font-semibold text-xs">TOTAL</td>
                            <td className="pt-2 text-right text-red-400 font-bold">{fmt(d.totalGastos)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>

                  {/* Ventas Posberry por producto */}
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-3">Ventas por producto (Posberry)</h3>
                    {d.ventas.length === 0 ? (
                      <p className="text-[#555] text-sm">Sin ventas registradas en el período</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[#555] text-xs">
                            <th className="text-left pb-2 font-medium">Producto</th>
                            <th className="text-right pb-2 font-medium">Cant.</th>
                            <th className="text-right pb-2 font-medium">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1a1a1a]">
                          {d.ventas.map(v => (
                            <tr key={v.producto}>
                              <td className="py-1.5 text-[#f0f0f0]">{v.producto}</td>
                              <td className="py-1.5 text-right text-[#f0f0f0] font-medium">
                                {v.cantidad.toLocaleString('es-AR')}
                              </td>
                              <td className="py-1.5 text-right text-green-400 text-xs">
                                {v.importe > 0 ? fmt(v.importe) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[#2a2a2a]">
                            <td className="pt-2 text-[#888] font-semibold text-xs">TOTAL</td>
                            <td className="pt-2 text-right text-[#f0f0f0] font-bold">
                              {d.totalVendido.toLocaleString('es-AR')} u
                            </td>
                            <td className="pt-2 text-right text-green-400 font-bold text-xs">
                              {d.totalMontoVendido > 0 ? fmt(d.totalMontoVendido) : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-20 text-[#555]">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-[#888]">Seleccioná un período y presioná Consultar</p>
        </div>
      )}
    </div>
  )
}
