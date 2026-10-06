'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Wallet, ClipboardList, Inbox, TriangleAlert, Package, Scale, Loader2 } from 'lucide-react'
import { calcularRangoPreset, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
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

function presetDe(rango: RangoFechas, ahora: Date): PresetUI {
  for (const p of ['mes_actual', 'mes_anterior'] as const) {
    const r = calcularRangoPreset(p, ahora)
    if (r.desde === rango.desde && r.hasta === rango.hasta) return p
  }
  return 'personalizado'
}

export default function ReportesClient({
  rango,
  remitos: remitosFiltrados,
  pedidos: pedidosFiltrados,
  pedidosPorFacturar,
  movimientos: movimientosFiltrados,
  stockInicial,
  solicitudItemsIniciales,
  pedidoItemsIniciales,
  proveedorPorItem,
  stockMinimoPorItem,
  facturas: facturasFiltradas,
  facturasDePedidos,
  esAdmin,
}: {
  /** El período: ya viene filtrado desde el servidor (B3). */
  rango: RangoFechas
  remitos: RemitoReporte[]
  pedidos: PedidoReporte[]
  /** Recibidos sin factura de cualquier fecha: cómo está hoy. */
  pedidosPorFacturar: PedidoReporte[]
  movimientos: MovimientoReporte[]
  stockInicial: StockActualRow[]
  solicitudItemsIniciales: SolicitudItemReporte[]
  pedidoItemsIniciales: PedidoItemRecibidoReporte[]
  proveedorPorItem: Record<string, string>
  stockMinimoPorItem: Record<string, number>
  /** Facturas confirmadas del período. */
  facturas: FacturaReporte[]
  /** Facturas confirmadas de los pedidos del período (para el Historial), de cualquier fecha. */
  facturasDePedidos: FacturaReporte[]
  /** El gasto sale de las facturas, que solo ve un administrador. */
  esAdmin: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [cargando, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('gasto')
  const [preset, setPreset] = useState<PresetUI>(() => presetDe(rango, new Date()))

  // Cambiar el período vuelve a pedir la página con ?desde=&hasta=.
  function irA(r: RangoFechas) {
    startTransition(() => router.replace(`${pathname}?desde=${r.desde}&hasta=${r.hasta}`, { scroll: false }))
  }
  function elegirPreset(p: PresetUI) {
    setPreset(p)
    if (p !== 'personalizado') irA(calcularRangoPreset(p, new Date()))
  }

  const stockActualPorItem = useMemo(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s.cantidad])),
    [stockInicial]
  )

  const gastoTotalPeriodo = useMemo(
    () => facturasFiltradas.reduce((total, f) => total + (f.tipo_comprobante === 'nota_credito' ? -1 : 1) * (f.total ?? 0), 0),
    [facturasFiltradas]
  )
  const sinFacturar = useMemo(() => pedidosPorFacturar.filter(recibidoSinFacturar).length, [pedidosPorFacturar])
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
        <ChipGroup opciones={presets} value={preset} onChange={elegirPreset} />

        {preset === 'personalizado' && (
          <DateRangePicker
            atajos={false}
            limpiable={false}
            desde={rango.desde}
            hasta={rango.hasta}
            onChange={(desde, hasta) => { if (desde && hasta && desde <= hasta) irA({ desde, hasta }) }}
          />
        )}

        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          {cargando && <Loader2 size={13} className="animate-spin" />}
          Período: {rango.desde} al {rango.hasta}
        </span>
      </div>
      )}

      <div className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {tab === 'gasto' && <GastoPorProveedor facturas={facturasFiltradas} pedidos={pedidosPorFacturar} esAdmin={esAdmin} />}
      {tab === 'historial' && <HistorialPedidos pedidos={pedidosFiltrados} facturas={facturasDePedidos} esAdmin={esAdmin} />}
      {tab === 'stock' && <MovimientoStock movimientos={movimientosFiltrados} stockActualPorItem={stockActualPorItem} proveedorPorItem={proveedorPorItem} />}
      {tab === 'sugerido' && <SugeridoVsRecibido solicitudItems={solicitudItemsIniciales} pedidoItems={pedidoItemsIniciales} />}
      </div>
      </div>
    </div>
  )
}
