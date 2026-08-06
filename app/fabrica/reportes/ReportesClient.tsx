'use client'

import { useMemo, useState } from 'react'
import { BarChart3, CalendarRange, Package, Gauge, Target } from 'lucide-react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import { calcularCumplimientoProyeccion, type ProduccionFila, type ConteoSemana } from '@/lib/fabrica/reportes'
import ProduccionResumen from './ProduccionResumen'
import EmbolsadoResumen from './EmbolsadoResumen'
import RendimientoPorOperario from './RendimientoPorOperario'
import CumplimientoProyeccion from './CumplimientoProyeccion'

export type ProduccionFilaUI = ProduccionFila
export interface EmbolsadoFilaUI {
  fecha: string
  presentacionNombre: string
  cantidadKg: number
}
export type ConteoSemanaUI = ConteoSemana

type Tab = 'produccion' | 'embolsado' | 'rendimiento' | 'cumplimiento'
type PresetUI = PresetRango | 'personalizado'

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'produccion', label: 'Producción', icon: BarChart3 },
  { key: 'embolsado', label: 'Embolsado', icon: Package },
  { key: 'rendimiento', label: 'Rendimiento', icon: Gauge },
  { key: 'cumplimiento', label: 'Cumplimiento', icon: Target },
]

const PRESETS: { key: PresetUI; label: string }[] = [
  { key: 'mes_actual', label: 'Mes actual' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: 'personalizado', label: 'Personalizado' },
]

export default function ReportesClient({
  produccionesIniciales,
  embolsadosIniciales,
  conteosIniciales,
}: {
  produccionesIniciales: ProduccionFilaUI[]
  embolsadosIniciales: EmbolsadoFilaUI[]
  conteosIniciales: ConteoSemanaUI[]
}) {
  const [tab, setTab] = useState<Tab>('produccion')
  const [preset, setPreset] = useState<PresetUI>('mes_actual')
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))

  const rango: RangoFechas = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return calcularRangoPreset(preset, new Date())
  }, [preset, rangoPersonalizado])

  const producciones = useMemo(
    () => produccionesIniciales.filter(p => fechaEnRango(p.fecha, rango)),
    [produccionesIniciales, rango]
  )
  const embolsados = useMemo(
    () => embolsadosIniciales.filter(e => fechaEnRango(e.fecha, rango)),
    [embolsadosIniciales, rango]
  )
  const conteos = useMemo(
    () => conteosIniciales.filter(c => fechaEnRango(c.semanaDesde, rango)),
    [conteosIniciales, rango]
  )

  const cumplimiento = useMemo(
    () => calcularCumplimientoProyeccion(conteos, produccionesIniciales, embolsadosIniciales),
    [conteos, produccionesIniciales, embolsadosIniciales]
  )

  const inputClass = "bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-['Syne'] font-bold text-[#f0f0f0]">
          <BarChart3 size={20} className="text-[#e8c547]" /> Reportes
        </h1>
        <p className="text-[#888] text-xs mt-0.5">Producción, embolsado, rendimiento y cumplimiento del período elegido.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4">
        {TABS.map(t => {
          const Icon = t.icon
          const activo = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activo ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange size={14} className="text-[#666]" />
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              preset === p.key ? 'bg-[#2a2a2a] text-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={rangoPersonalizado.desde}
            onChange={e => setRangoPersonalizado(prev => ({ ...prev, desde: e.target.value }))}
            className={`${inputClass} flex-1 min-w-[132px]`}
          />
          <span className="text-[#666] text-xs shrink-0">al</span>
          <input
            type="date"
            value={rangoPersonalizado.hasta}
            onChange={e => setRangoPersonalizado(prev => ({ ...prev, hasta: e.target.value }))}
            className={`${inputClass} flex-1 min-w-[132px]`}
          />
        </div>
      )}

      {tab === 'produccion' && <ProduccionResumen filas={producciones} />}
      {tab === 'embolsado' && <EmbolsadoResumen filas={embolsados} />}
      {tab === 'rendimiento' && <RendimientoPorOperario filas={producciones} />}
      {tab === 'cumplimiento' && <CumplimientoProyeccion semanas={cumplimiento} />}
    </div>
  )
}
