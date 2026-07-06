'use client'

import { useState, useMemo, useCallback } from 'react'
import Card from '@/components/ui/Card'

interface Resumen {
  nombre: string
  posberry: { monto: number; ventas: number } | null
  fudo: { monto: number; ventas: number } | null
  fudoError?: string
}

interface Detalle {
  fuente: 'Posberry' | 'Fudo'
  sucursal: string
  fecha: string
  descripcion: string
  monto: number
}

const PAGE_SIZE = 50
const hoy = () => new Date().toISOString().split('T')[0]

function fmt(n: number) {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default function VentasIntegracionClient() {
  const [desde, setDesde] = useState(hoy())
  const [hasta, setHasta] = useState(hoy())
  const [resumen, setResumen] = useState<Resumen[]>([])
  const [detalle, setDetalle] = useState<Detalle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cargado, setCargado] = useState(false)

  const [fuenteFiltro, setFuenteFiltro] = useState<'todos' | 'Posberry' | 'Fudo'>('todos')
  const [busSucursal, setBusSucursal] = useState('')
  const [pagina, setPagina] = useState(1)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ desde, hasta })
      const res = await fetch(`/api/integraciones/ventas?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setResumen(json.resumen ?? [])
      setDetalle(json.detalle ?? [])
      setCargado(true)
      setPagina(1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  const detalleFiltrado = useMemo(() => {
    return detalle.filter(d => {
      if (fuenteFiltro !== 'todos' && d.fuente !== fuenteFiltro) return false
      if (busSucursal && !d.sucursal.toLowerCase().includes(busSucursal.toLowerCase())) return false
      return true
    })
  }, [detalle, fuenteFiltro, busSucursal])

  const totalPaginas = Math.max(1, Math.ceil(detalleFiltrado.length / PAGE_SIZE))
  const paginadas = detalleFiltrado.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  const totalPosberry = resumen.reduce((s, r) => s + (r.posberry?.monto ?? 0), 0)
  const totalFudo = resumen.reduce((s, r) => s + (r.fudo?.monto ?? 0), 0)
  const errores = resumen.filter(r => r.fudoError)

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Integraciones — Ventas</h1>
        <p className="text-[#888] text-sm mt-0.5">Ventas de Posberry y de las 5 cuentas Fudo, unificadas por local</p>
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
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {cargado && (
        <>
          {errores.length > 0 && (
            <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-xl px-4 py-3 text-sm text-[#f0a849]">
              ⚠️ No se pudo consultar Fudo para: {errores.map(e => `${e.nombre} (${e.fudoError})`).join(', ')}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total Posberry</p>
              <p className="text-xl font-bold text-[#38bdf8] mt-1">{fmt(totalPosberry)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total Fudo</p>
              <p className="text-xl font-bold text-[#e8c547] mt-1">{fmt(totalFudo)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Total combinado</p>
              <p className="text-xl font-bold text-[#56d68a] mt-1">{fmt(totalPosberry + totalFudo)}</p>
            </Card>
          </div>

          {/* Resumen por local */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <h2 className="text-sm font-bold text-[#f0f0f0]">Resumen por local</h2>
            </div>
            {resumen.length === 0 ? (
              <p className="p-8 text-center text-[#888]">Sin datos para el período seleccionado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a]">
                    <tr>
                      {['Local', 'Vtas. Posberry', '$ Posberry', 'Vtas. Fudo', '$ Fudo', '$ Total'].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap ${i > 0 ? 'text-right' : 'text-left'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {resumen.map(r => (
                      <tr key={r.nombre} className="hover:bg-[#1a1a1a] transition-colors">
                        <td className="px-4 py-2.5 text-[#f0f0f0] font-medium">{r.nombre}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#888]">{r.posberry?.ventas ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#38bdf8]">{r.posberry ? fmt(r.posberry.monto) : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#888]">
                          {r.fudoError ? <span className="text-red-400 text-xs">error</span> : r.fudo?.ventas ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#e8c547]">{r.fudo ? fmt(r.fudo.monto) : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#f0f0f0]">
                          {fmt((r.posberry?.monto ?? 0) + (r.fudo?.monto ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Detalle combinado */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider flex-1">Detalle combinado</h2>
              {(['todos', 'Posberry', 'Fudo'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setFuenteFiltro(f); setPagina(1) }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    fuenteFiltro === f ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0]'
                  }`}
                >
                  {f === 'todos' ? 'Todas las fuentes' : f}
                </button>
              ))}
              <input
                type="text"
                placeholder="Buscar sucursal..."
                value={busSucursal}
                onChange={e => { setBusSucursal(e.target.value); setPagina(1) }}
                className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#e8c547] placeholder:text-[#555] w-44"
              />
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a]">
                    <tr>
                      {['Fecha', 'Sucursal', 'Fuente', 'Descripción', 'Monto'].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap ${i === 4 ? 'text-right' : 'text-left'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {paginadas.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-[#888]">Sin resultados para los filtros aplicados</td></tr>
                    ) : paginadas.map((d, i) => (
                      <tr key={`${d.fuente}-${i}`} className="hover:bg-[#1a1a1a] transition-colors">
                        <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{d.fecha}</td>
                        <td className="px-4 py-2.5 text-[#f0f0f0]">{d.sucursal}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.fuente === 'Posberry' ? 'bg-[rgba(56,189,248,.15)] text-[#38bdf8]' : 'bg-[rgba(232,197,71,.15)] text-[#e8c547]'
                          }`}>{d.fuente}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[#888] max-w-[240px] truncate">{d.descripcion}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#f0f0f0] font-medium">{fmt(d.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2a2a]">
                  <span className="text-[#888] text-xs">Página {pagina} de {totalPaginas} · {detalleFiltrado.length.toLocaleString('es-AR')} registros</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                      className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg text-xs disabled:opacity-30 hover:border-[#e8c547] transition-colors">
                      ← Anterior
                    </button>
                    <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                      className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg text-xs disabled:opacity-30 hover:border-[#e8c547] transition-colors">
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
