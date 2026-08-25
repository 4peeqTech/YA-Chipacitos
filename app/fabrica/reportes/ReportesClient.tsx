'use client'

import { useMemo, useState } from 'react'
import { BarChart3, CalendarRange, Snowflake, Gauge, Target, Undo2 } from 'lucide-react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import {
  calcularCumplimientoProyeccion, calcularKpisFabrica,
  type ProduccionFila, type EmbolsadoFila, type DevolucionFila, type ConteoSemana,
} from '@/lib/fabrica/reportes'
import KpisFabrica from './KpisFabrica'
import ProduccionResumen from './ProduccionResumen'
import EmbolsadoResumen from './EmbolsadoResumen'
import DevolucionesResumen from './DevolucionesResumen'
import RendimientoPorOperario from './RendimientoPorOperario'
import CumplimientoProyeccion from './CumplimientoProyeccion'

export type ProduccionFilaUI = ProduccionFila
export type EmbolsadoFilaUI = EmbolsadoFila
export type DevolucionFilaUI = DevolucionFila
export type ConteoSemanaUI = ConteoSemana

export interface OperarioUI {
  id: string
  nombre: string
}

type Tab = 'produccion' | 'embolsado' | 'devoluciones' | 'rendimiento' | 'cumplimiento'
type PresetUI = PresetRango | 'personalizado'

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'produccion', label: 'Producción', icon: BarChart3 },
  { key: 'embolsado', label: 'Congelados', icon: Snowflake },
  { key: 'devoluciones', label: 'Devoluciones', icon: Undo2 },
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
  devolucionesIniciales,
  conteosIniciales,
  operarios,
}: {
  produccionesIniciales: ProduccionFilaUI[]
  embolsadosIniciales: EmbolsadoFilaUI[]
  devolucionesIniciales: DevolucionFilaUI[]
  conteosIniciales: ConteoSemanaUI[]
  operarios: OperarioUI[]
}) {
  const [tab, setTab] = useState<Tab>('produccion')
  const [preset, setPreset] = useState<PresetUI>('mes_actual')
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))
  const [operarioId, setOperarioId] = useState<string>('todos')

  const rango: RangoFechas = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return calcularRangoPreset(preset, new Date())
  }, [preset, rangoPersonalizado])

  const produccionesRango = useMemo(
    () => produccionesIniciales.filter(p => fechaEnRango(p.fecha, rango)),
    [produccionesIniciales, rango]
  )
  const embolsadosRango = useMemo(
    () => embolsadosIniciales.filter(e => fechaEnRango(e.fecha, rango)),
    [embolsadosIniciales, rango]
  )
  const devolucionesRango = useMemo(
    () => devolucionesIniciales.filter(d => fechaEnRango(d.fecha, rango)),
    [devolucionesIniciales, rango]
  )
  const conteos = useMemo(
    () => conteosIniciales.filter(c => fechaEnRango(c.semanaDesde, rango)),
    [conteosIniciales, rango]
  )

  // El filtro por operario solo aplica a Producción/Congelados — Devolución no
  // tiene atribución de operario (decisión del plan: solo Producción y Congelados).
  const producciones = useMemo(
    () => operarioId === 'todos' ? produccionesRango : produccionesRango.filter(p => p.operarioId === operarioId),
    [produccionesRango, operarioId]
  )
  const embolsados = useMemo(
    () => operarioId === 'todos' ? embolsadosRango : embolsadosRango.filter(e => e.operarioId === operarioId),
    [embolsadosRango, operarioId]
  )

  const kpis = useMemo(
    () => calcularKpisFabrica(producciones, embolsados, devolucionesRango),
    [producciones, embolsados, devolucionesRango]
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
        <p className="text-[#888] text-xs mt-0.5">Producción, congelados, devoluciones, rendimiento y cumplimiento del período elegido.</p>
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
        <select
          value={operarioId}
          onChange={e => setOperarioId(e.target.value)}
          className={`${inputClass} w-full sm:w-auto sm:ml-auto`}
        >
          <option value="todos">Todos los operarios</option>
          {operarios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
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

      <KpisFabrica kpis={kpis} />

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon
          const activo = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activo ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0]'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'produccion' && <ProduccionResumen filas={producciones} />}
      {tab === 'embolsado' && <EmbolsadoResumen filas={embolsados} />}
      {tab === 'devoluciones' && <DevolucionesResumen filas={devolucionesRango} />}
      {tab === 'rendimiento' && <RendimientoPorOperario filas={producciones} />}
      {tab === 'cumplimiento' && <CumplimientoProyeccion semanas={cumplimiento} />}
    </div>
  )
}
