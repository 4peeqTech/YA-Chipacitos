'use client'

import { useMemo, useState } from 'react'
import { BarChart3, Wallet, ClipboardList, Inbox, TriangleAlert, Package, Scale } from 'lucide-react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import { calcularGastoPorProveedor, type RemitoReporte, type PedidoReporte, type MovimientoReporte, type SolicitudItemReporte, type PedidoItemCompradoReporte } from '@/lib/compras/reportes'
import KpiCard from '@/components/ui/KpiCard'
import GastoPorProveedor from './GastoPorProveedor'
import HistorialPedidos from './HistorialPedidos'
import MovimientoStock from './MovimientoStock'
import SugeridoVsComprado from './SugeridoVsComprado'

type Tab = 'gasto' | 'historial' | 'stock' | 'sugerido'
type PresetUI = PresetRango | 'personalizado'

interface StockActualRow {
  item_id: string
  cantidad: number
}

function money(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export default function ReportesClient({
  remitosIniciales,
  pedidosIniciales,
  movimientosIniciales,
  stockInicial,
  solicitudItemsIniciales,
  pedidoItemsIniciales,
  proveedorPorItem,
  stockMinimoPorItem,
}: {
  remitosIniciales: RemitoReporte[]
  pedidosIniciales: PedidoReporte[]
  movimientosIniciales: MovimientoReporte[]
  stockInicial: StockActualRow[]
  solicitudItemsIniciales: SolicitudItemReporte[]
  pedidoItemsIniciales: PedidoItemCompradoReporte[]
  proveedorPorItem: Record<string, string>
  stockMinimoPorItem: Record<string, number>
}) {
  const [tab, setTab] = useState<Tab>('gasto')
  const [preset, setPreset] = useState<PresetUI>('mes_actual')
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))

  const rango: RangoFechas = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return calcularRangoPreset(preset, new Date())
  }, [preset, rangoPersonalizado])

  const remitosFiltrados = useMemo(
    () => remitosIniciales.filter(r => fechaEnRango(r.fecha, rango)),
    [remitosIniciales, rango]
  )
  const pedidosFiltrados = useMemo(
    () => pedidosIniciales.filter(p => fechaEnRango(p.created_at, rango)),
    [pedidosIniciales, rango]
  )
  const movimientosFiltrados = useMemo(
    () => movimientosIniciales.filter(m => fechaEnRango(m.created_at, rango)),
    [movimientosIniciales, rango]
  )
  const stockActualPorItem = useMemo(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad])),
    [stockInicial]
  )

  const gastoTotalPeriodo = useMemo(
    () => calcularGastoPorProveedor(remitosFiltrados).reduce((total, f) => total + f.gastoTotal, 0),
    [remitosFiltrados]
  )
  const insumosConStockBajo = useMemo(
    () => Object.entries(stockMinimoPorItem).filter(([itemId, minimo]) => (stockActualPorItem[itemId] ?? 0) < minimo).length,
    [stockMinimoPorItem, stockActualPorItem]
  )

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'gasto', label: 'Gasto por proveedor', icon: <Wallet size={14} /> },
    { key: 'historial', label: 'Historial de pedidos y remitos', icon: <ClipboardList size={14} /> },
    { key: 'stock', label: 'Movimiento de stock', icon: <Package size={14} /> },
    { key: 'sugerido', label: 'Sugerido vs. comprado', icon: <Scale size={14} /> },
  ]

  const presets: { key: PresetUI; label: string }[] = [
    { key: 'mes_actual', label: 'Mes actual' },
    { key: 'mes_anterior', label: 'Mes anterior' },
    { key: 'personalizado', label: 'Personalizado' },
  ]

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><BarChart3 size={22} className="text-accent" /> Reportes</h1>
        <p className="text-muted text-sm mt-0.5">Gasto, historial de pedidos/remitos y movimiento de stock del período elegido.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Wallet size={18} />} label="Gasto del período" value={`$${money(gastoTotalPeriodo)}`} tono="neutro" />
        <KpiCard icon={<ClipboardList size={18} />} label="Pedidos del período" value={String(pedidosFiltrados.length)} detalle={`${pedidosFiltrados.filter(p => p.estado === 'cerrado').length} cerrados`} tono="neutro" />
        <KpiCard icon={<Inbox size={18} />} label="Remitos del período" value={String(remitosFiltrados.length)} tono="neutro" />
        <KpiCard
          icon={<TriangleAlert size={18} />}
          label="Insumos con stock bajo"
          value={String(insumosConStockBajo)}
          detalle="ahora, no solo el período"
          tono={insumosConStockBajo > 0 ? 'alerta' : 'exito'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'sugerido' && (
      <div className="flex flex-wrap items-center gap-3">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.key ? 'bg-[#2a2a2a] text-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'}`}
          >
            {p.label}
          </button>
        ))}

        {preset === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={inputClass}
              value={rangoPersonalizado.desde}
              onChange={e => setRangoPersonalizado(prev => ({ ...prev, desde: e.target.value }))}
            />
            <span className="text-[#888] text-xs">al</span>
            <input
              type="date"
              className={inputClass}
              value={rangoPersonalizado.hasta}
              onChange={e => setRangoPersonalizado(prev => ({ ...prev, hasta: e.target.value }))}
            />
          </div>
        )}

        <span className="text-xs text-[#888]">Período: {rango.desde} al {rango.hasta}</span>
      </div>
      )}

      {tab === 'gasto' && <GastoPorProveedor remitos={remitosFiltrados} />}
      {tab === 'historial' && <HistorialPedidos pedidos={pedidosFiltrados} />}
      {tab === 'stock' && <MovimientoStock movimientos={movimientosFiltrados} stockActualPorItem={stockActualPorItem} proveedorPorItem={proveedorPorItem} />}
      {tab === 'sugerido' && <SugeridoVsComprado solicitudItems={solicitudItemsIniciales} pedidoItems={pedidoItemsIniciales} />}
    </div>
  )
}
