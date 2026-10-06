'use client'

import { useMemo, useState } from 'react'
import { BarChart3, Wallet, ClipboardList, Inbox, TriangleAlert, Package, Scale } from 'lucide-react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import { contarPorEstado, recibidoSinFacturar, type FacturaReporte, type RemitoReporte, type PedidoReporte, type MovimientoReporte, type SolicitudItemReporte, type PedidoItemRecibidoReporte } from '@/lib/compras/reportes'
import KpiCard from '@/components/ui/KpiCard'
import Pestanas, { panelDe } from '@/components/ui/Pestanas'
import { ChipGroup } from '@/components/ui/Chip'
import GastoPorProveedor from './GastoPorProveedor'
import HistorialPedidos from './HistorialPedidos'
import MovimientoStock from './MovimientoStock'
import SugeridoVsRecibido from './SugeridoVsRecibido'
import DateRangePicker from '@/components/ui/DateRangePicker'

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
  facturasIniciales,
  esAdmin,
}: {
  remitosIniciales: RemitoReporte[]
  pedidosIniciales: PedidoReporte[]
  movimientosIniciales: MovimientoReporte[]
  stockInicial: StockActualRow[]
  solicitudItemsIniciales: SolicitudItemReporte[]
  pedidoItemsIniciales: PedidoItemRecibidoReporte[]
  proveedorPorItem: Record<string, string>
  stockMinimoPorItem: Record<string, number>
  facturasIniciales: FacturaReporte[]
  /** El gasto sale de las facturas, que solo ve un administrador. */
  esAdmin: boolean
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
  const facturasFiltradas = useMemo(
    () => facturasIniciales.filter(f => f.fecha != null && fechaEnRango(f.fecha, rango)),
    [facturasIniciales, rango]
  )
  const stockActualPorItem = useMemo(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad])),
    [stockInicial]
  )

  const gastoTotalPeriodo = useMemo(
    () => facturasFiltradas.reduce((total, f) => total + (f.tipo_comprobante === 'nota_credito' ? -1 : 1) * (f.total ?? 0), 0),
    [facturasFiltradas]
  )
  const sinFacturar = useMemo(() => pedidosIniciales.filter(recibidoSinFacturar).length, [pedidosIniciales])
  // B3: el KPI de pedidos con el estado visible (por recibir = enviado o parcial).
  const pedidosPeriodo = useMemo(() => {
    const c = contarPorEstado(pedidosFiltrados)
    return { porRecibir: c.enviado + c.parcial, porFacturar: pedidosFiltrados.filter(recibidoSinFacturar).length }
  }, [pedidosFiltrados])
  const insumosConStockBajo = useMemo(
    () => Object.entries(stockMinimoPorItem).filter(([itemId, minimo]) => (stockActualPorItem[itemId] ?? 0) < minimo).length,
    [stockMinimoPorItem, stockActualPorItem]
  )

  const tabs = [
    { id: 'gasto', label: 'Gasto por proveedor', icon: <Wallet size={14} /> },
    { id: 'historial', label: 'Historial de pedidos y remitos', icon: <ClipboardList size={14} /> },
    { id: 'stock', label: 'Movimiento de stock', icon: <Package size={14} /> },
    { id: 'sugerido', label: 'Sugerido vs. recibido', icon: <Scale size={14} /> },
  ]

  const presets: { value: PresetUI; label: string }[] = [
    { value: 'mes_actual', label: 'Mes actual' },
    { value: 'mes_anterior', label: 'Mes anterior' },
    { value: 'personalizado', label: 'Personalizado' },
  ]


  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><BarChart3 size={22} className="text-accent" /> Reportes</h1>
        <p className="text-muted text-sm mt-0.5">Gasto, historial de pedidos/remitos y movimiento de stock del período elegido.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Wallet size={18} />}
          label="Gasto del período"
          value={esAdmin ? `$${money(gastoTotalPeriodo)}` : '—'}
          detalle={esAdmin
            ? (sinFacturar > 0 ? `facturas con IVA · ${sinFacturar} recibido${sinFacturar === 1 ? '' : 's'} sin facturar` : 'facturas con IVA')
            : 'lo ve un administrador'}
          tono={esAdmin && sinFacturar > 0 ? 'alerta' : 'neutro'}
        />
        <KpiCard
          icon={<ClipboardList size={18} />}
          label="Pedidos del período"
          value={String(pedidosFiltrados.length)}
          detalle={`${pedidosPeriodo.porRecibir} por recibir · ${pedidosPeriodo.porFacturar} por facturar`}
          tono="neutro"
        />
        <KpiCard icon={<Inbox size={18} />} label="Remitos del período" value={String(remitosFiltrados.length)} tono="neutro" />
        <KpiCard
          icon={<TriangleAlert size={18} />}
          label="Insumos con stock bajo"
          value={String(insumosConStockBajo)}
          detalle="ahora, no solo el período"
          tono={insumosConStockBajo > 0 ? 'alerta' : 'exito'}
        />
      </div>

      <Pestanas items={tabs} activa={tab} onCambiar={id => setTab(id as Tab)} etiqueta="Reportes" idBase="reportes" />

      <div {...panelDe('reportes', tab)} className="space-y-6">
      {tab !== 'sugerido' && (
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup opciones={presets} value={preset} onChange={setPreset} />

        {preset === 'personalizado' && (
          <DateRangePicker
            atajos={false}
            limpiable={false}
            desde={rangoPersonalizado.desde}
            hasta={rangoPersonalizado.hasta}
            onChange={(desde, hasta) => setRangoPersonalizado(prev => ({ ...prev, desde, hasta }))}
          />
        )}

        <span className="text-xs text-muted">Período: {rango.desde} al {rango.hasta}</span>
      </div>
      )}

      {tab === 'gasto' && <GastoPorProveedor facturas={facturasFiltradas} pedidos={pedidosIniciales} esAdmin={esAdmin} />}
      {tab === 'historial' && <HistorialPedidos pedidos={pedidosFiltrados} facturas={facturasIniciales} esAdmin={esAdmin} />}
      {tab === 'stock' && <MovimientoStock movimientos={movimientosFiltrados} stockActualPorItem={stockActualPorItem} proveedorPorItem={proveedorPorItem} />}
      {tab === 'sugerido' && <SugeridoVsRecibido solicitudItems={solicitudItemsIniciales} pedidoItems={pedidoItemsIniciales} />}
      </div>
    </div>
  )
}
