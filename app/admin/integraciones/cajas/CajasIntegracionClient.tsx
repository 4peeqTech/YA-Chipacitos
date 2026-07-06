'use client'

import { useState, useMemo, useCallback } from 'react'
import Card from '@/components/ui/Card'

interface FilaCaja {
  sucursal: string
  caja: string
  ventas: number
  monto: number
  saldo?: number
  estado?: string
}

const hoy = () => new Date().toISOString().split('T')[0]

function fmt(n: number) {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default function CajasIntegracionClient() {
  const [desde, setDesde] = useState(hoy())
  const [hasta, setHasta] = useState(hoy())
  const [filas, setFilas] = useState<FilaCaja[]>([])
  const [errores, setErrores] = useState<{ sucursal: string; error: string }[]>([])
  const [cajasInfoDisponible, setCajasInfoDisponible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cargado, setCargado] = useState(false)
  const [busSucursal, setBusSucursal] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ desde, hasta })
      const res = await fetch(`/api/integraciones/cajas?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setFilas(json.filas ?? [])
      setErrores(json.errores ?? [])
      setCajasInfoDisponible(!!json.cajasInfoDisponible)
      setCargado(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  const filasFiltradas = useMemo(() => {
    if (!busSucursal) return filas
    return filas.filter(f => f.sucursal.toLowerCase().includes(busSucursal.toLowerCase()))
  }, [filas, busSucursal])

  const totalVentas = filasFiltradas.reduce((s, f) => s + f.ventas, 0)
  const totalMonto = filasFiltradas.reduce((s, f) => s + f.monto, 0)

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Integraciones — Cajas Fudo</h1>
        <p className="text-[#888] text-sm mt-0.5">Cajas de las 5 cuentas Fudo, todas juntas en una sola vista</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Desde</label>
          <input type="date" className={inputClass} value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Hasta</label>
          <input type="date" className={inputClass} value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-bold text-sm py-2 px-6 rounded-xl transition-all"
        >
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Buscar sucursal</label>
          <input type="text" className={`${inputClass} w-full`} placeholder="YA! ..." value={busSucursal} onChange={e => setBusSucursal(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {cargado && (
        <>
          {errores.length > 0 && (
            <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-xl px-4 py-3 text-sm text-[#f0a849]">
              ⚠️ No se pudo consultar Fudo para: {errores.map(e => `${e.sucursal} (${e.error})`).join(', ')}
            </div>
          )}

          {!cajasInfoDisponible && (
            <div className="bg-[rgba(56,189,248,.08)] border-l-4 border-[#38bdf8] rounded-r-xl px-4 py-3 text-sm text-[#38bdf8]">
              ℹ️ La cuenta Fudo no expone saldo/estado de caja como recurso aparte — se muestran las ventas por caja del período.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Cajas</p>
              <p className="text-xl font-bold text-[#f0f0f0] mt-1">{filasFiltradas.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Ventas</p>
              <p className="text-xl font-bold text-[#f0f0f0] mt-1">{totalVentas}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total</p>
              <p className="text-xl font-bold text-[#e8c547] mt-1">{fmt(totalMonto)}</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            {filasFiltradas.length === 0 ? (
              <p className="p-8 text-center text-[#888]">No hay cajas para mostrar</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a]">
                    <tr>
                      {['Sucursal', 'Caja', 'Ventas', 'Monto vendido', ...(cajasInfoDisponible ? ['Saldo', 'Estado'] : [])].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap ${i === 2 || i === 3 || i === 4 ? 'text-right' : 'text-left'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {filasFiltradas.map((f, i) => (
                      <tr key={`${f.sucursal}-${f.caja}-${i}`} className="hover:bg-[#1a1a1a] transition-colors">
                        <td className="px-4 py-2.5 text-[#f0f0f0] font-medium">{f.sucursal}</td>
                        <td className="px-4 py-2.5 text-[#888]">{f.caja}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#888]">{f.ventas}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#f0f0f0] font-medium">{fmt(f.monto)}</td>
                        {cajasInfoDisponible && (
                          <>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#e8c547]">{f.saldo !== undefined ? fmt(f.saldo) : '—'}</td>
                            <td className="px-4 py-2.5 text-right text-[#888]">{f.estado ?? '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
