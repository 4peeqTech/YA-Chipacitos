'use client'

import { Package, Wheat, Gauge, Snowflake, Undo2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import type { KpisFabrica as KpisFabricaData } from '@/lib/fabrica/reportes'

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

function Tile({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <Card className="p-3 space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] text-[#888]">
        <Icon size={12} /> {label}
      </p>
      <p className="text-sm font-semibold text-[#f0f0f0] truncate">{value}</p>
    </Card>
  )
}

export default function KpisFabrica({ kpis }: { kpis: KpisFabricaData }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile icon={Package} label="Masa" value={formatKg(kpis.masaKg)} />
      <Tile icon={Wheat} label="Fécula" value={formatKg(kpis.feculaKg)} />
      <Tile
        icon={Gauge}
        label="Rendimiento"
        value={kpis.rendimiento != null ? kpis.rendimiento.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
      />
      <Tile icon={Snowflake} label="Congelados" value={formatKg(kpis.congeladosKg)} />
      <Tile icon={Undo2} label="Devuelto" value={formatKg(kpis.devueltoKg)} />
      <Tile
        icon={Undo2}
        label="% devolución"
        value={kpis.pctDevolucionSobreProducido != null ? `${kpis.pctDevolucionSobreProducido.toFixed(1)}%` : '—'}
      />
    </div>
  )
}
