'use client'

import { useState } from 'react'

type Tipo = 'expenses' | 'sales' | 'payments'

const SUCURSALES = ['YA! PARAGUAY']

const hoy = () => new Date().toISOString().split('T')[0]
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0]

function formatMonto(v: unknown) {
  const n = Number(v)
  return isNaN(n) ? '—' : `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function formatFecha(v: unknown) {
  if (!v) return '—'
  const s = String(v)
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getPaymentMethodName(item: Record<string, unknown>): string {
  const payments = item.payments
  if (Array.isArray(payments) && payments.length > 0) {
    const pm = (payments[0] as Record<string, unknown>)?.paymentMethod
    if (pm && typeof pm === 'object') return String((pm as Record<string, unknown>).name ?? '—')
  }
  const pm = item.paymentMethod
  if (pm && typeof pm === 'object') return String((pm as Record<string, unknown>).name ?? '—')
  return '—'
}

function getPaymentAmount(item: Record<string, unknown>): number {
  const payments = item.payments
  if (Array.isArray(payments)) {
    return payments.reduce((sum, p) => {
      const a = Number((p as Record<string, unknown>).amount ?? 0)
      return sum + (isNaN(a) ? 0 : a)
    }, 0)
  }
  return Number(item.amount ?? 0)
}

export default function FudoClient() {
  const [sucursal, setSucursal] = useState(SUCURSALES[0])
  const [tipo, setTipo] = useState<Tipo>('expenses')
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetched, setFetched] = useState(false)

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ sucursal, tipo, desde, hasta })
      const res = await fetch(`/api/fudo?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setItems(json.items ?? [])
      setFetched(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const total = items.reduce((sum, item) => sum + getPaymentAmount(item), 0)
  const cancelados = items.filter(i => i.canceled).length

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"

  const tipoLabels: Record<Tipo, string> = {
    expenses: 'Gastos / Egresos',
    sales: 'Ventas',
    payments: 'Movimientos de caja',
  }

  // Columnas según tipo
  const renderRow = (item: Record<string, unknown>, i: number) => {
    if (tipo === 'expenses') {
      const cat = item.expenseCategory as Record<string, unknown> | null
      const prov = item.provider as Record<string, unknown> | null
      return (
        <tr key={i} className={`hover:bg-[#1a1a1a] transition-colors ${item.canceled ? 'opacity-40' : ''}`}>
          <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{String(item.date ?? '').slice(0, 10)}</td>
          <td className="px-4 py-2.5 text-[#f0f0f0]">{String(item.description || '—')}</td>
          <td className="px-4 py-2.5 text-[#888]">{cat ? String(cat.name ?? '—') : '—'}</td>
          <td className="px-4 py-2.5 text-[#888]">{prov ? String(prov.name ?? '—') : '—'}</td>
          <td className="px-4 py-2.5 text-[#f0f0f0] font-medium text-right whitespace-nowrap">{formatMonto(item.amount)}</td>
          <td className="px-4 py-2.5 text-[#888]">{getPaymentMethodName(item)}</td>
          <td className="px-4 py-2.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              item.status === 'PAID' ? 'bg-green-900/50 text-green-300' :
              item.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-300' :
              'bg-[#2a2a2a] text-[#888]'
            }`}>{String(item.status ?? '—')}</span>
          </td>
        </tr>
      )
    }

    if (tipo === 'sales') {
      const caja = item.cashRegister as Record<string, unknown> | null
      return (
        <tr key={i} className="hover:bg-[#1a1a1a] transition-colors">
          <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{formatFecha(item.createdAt)}</td>
          <td className="px-4 py-2.5 text-[#888]">{caja ? String(caja.name ?? '—') : '—'}</td>
          <td className="px-4 py-2.5 text-[#888]">{String(item.saleType ?? '—')}</td>
          <td className="px-4 py-2.5 text-[#f0f0f0] font-medium text-right whitespace-nowrap">{formatMonto(item.total)}</td>
          <td className="px-4 py-2.5 text-[#888]">{getPaymentMethodName(item)}</td>
          <td className="px-4 py-2.5">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-300">
              {String(item.saleState ?? '—')}
            </span>
          </td>
        </tr>
      )
    }

    // payments
    const pm = item.paymentMethod as Record<string, unknown> | null
    return (
      <tr key={i} className={`hover:bg-[#1a1a1a] transition-colors ${item.canceled ? 'opacity-40' : ''}`}>
        <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{formatFecha(item.paidAt)}</td>
        <td className="px-4 py-2.5 text-[#f0f0f0] font-medium text-right whitespace-nowrap">{formatMonto(item.amount)}</td>
        <td className="px-4 py-2.5 text-[#888]">{pm ? String(pm.name ?? '—') : '—'}</td>
        <td className="px-4 py-2.5">
          {item.canceled
            ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/40 text-red-300">Cancelado</span>
            : <span className="px-2 py-0.5 rounded-full text-xs bg-green-900/50 text-green-300">OK</span>}
        </td>
      </tr>
    )
  }

  const headers: Record<Tipo, string[]> = {
    expenses: ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Monto', 'Forma pago', 'Estado'],
    sales: ['Fecha', 'Caja', 'Tipo', 'Total', 'Forma pago', 'Estado'],
    payments: ['Fecha', 'Monto', 'Forma pago', 'Estado'],
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Fudo — Caja por Local</h1>
        <p className="text-[#888] text-sm mt-0.5">Consultá gastos, ventas y movimientos de caja desde Fudo</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Sucursal</label>
          <select className={inputClass} value={sucursal} onChange={e => setSucursal(e.target.value)}>
            {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Tipo</label>
          <select className={inputClass} value={tipo} onChange={e => setTipo(e.target.value as Tipo)}>
            {(Object.entries(tipoLabels) as [Tipo, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Desde</label>
          <input type="date" className={inputClass} value={desde} onChange={e => setDesde(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Hasta</label>
          <input type="date" className={inputClass} value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-bold text-sm py-2 px-6 rounded-xl transition-all"
        >
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Stats */}
      {fetched && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[#888] text-xs uppercase tracking-wider">Registros</p>
            <p className="text-xl font-bold text-[#f0f0f0] mt-1">{items.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[#888] text-xs uppercase tracking-wider">Total</p>
            <p className="text-xl font-bold text-[#e8c547] mt-1">{formatMonto(total)}</p>
          </div>
          {cancelados > 0 && (
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-[#888] text-xs uppercase tracking-wider">Cancelados</p>
              <p className="text-xl font-bold text-red-400 mt-1">{cancelados}</p>
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      {fetched && (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2a2a]">
            <h2 className="text-sm font-bold text-[#f0f0f0]">{tipoLabels[tipo]} — {sucursal}</h2>
            <p className="text-xs text-[#888] mt-0.5">{desde} → {hasta}</p>
          </div>
          {items.length === 0 ? (
            <p className="p-8 text-center text-[#888]">No hay datos para el período seleccionado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#1a1a1a]">
                  <tr>
                    {headers[tipo].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wider whitespace-nowrap ${h === 'Monto' || h === 'Total' ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a2a]">
                  {items.map((item, i) => renderRow(item, i))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
