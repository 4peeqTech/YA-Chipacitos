'use client'

import { useMemo, useState } from 'react'
import { BarChart3, CalendarRange, Package, Gauge, Snowflake, Undo2, Target, Download } from 'lucide-react'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import {
  calcularCumplimientoProyeccion, calcularKpisFabrica, calcularRendimientoPorOperario,
  type ProduccionFila, type EmbolsadoFila, type DevolucionFila, type ConteoSemana,
} from '@/lib/fabrica/reportes'
import { descargarCsv } from '@/lib/csv'
import KpiCard from '@/components/ui/KpiCard'
import ProduccionResumen from '@/components/fabrica/reportes/ProduccionResumen'
import EmbolsadoResumen from '@/components/fabrica/reportes/EmbolsadoResumen'
import DevolucionesResumen from '@/components/fabrica/reportes/DevolucionesResumen'
import RendimientoPorOperario from '@/components/fabrica/reportes/RendimientoPorOperario'
import CumplimientoProyeccion from '@/components/fabrica/reportes/CumplimientoProyeccion'

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

// A partir de este % de devolución sobre lo producido, el KPI se marca en alerta.
const UMBRAL_ALERTA_DEVOLUCION_PCT = 5

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

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

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

  function exportarTabActual() {
    const rangoLabel = `${rango.desde}_al_${rango.hasta}`
    if (tab === 'produccion') {
      descargarCsv(`fabrica_produccion_${rangoLabel}.csv`,
        ['Fecha', 'Turno', 'Operario', 'Sabor', 'Fécula (kg)', 'Masa (kg)'],
        producciones.map(p => [p.fecha, p.turno === 'manana' ? 'Mañana' : 'Tarde', p.operarioNombre, p.saborNombre, p.feculaKg, p.masaKg]))
    } else if (tab === 'embolsado') {
      descargarCsv(`fabrica_congelados_${rangoLabel}.csv`,
        ['Fecha', 'Presentación', 'Sabor', 'Tamaño', 'Operario', 'Cantidad (kg)'],
        embolsados.map(e => [e.fecha, e.presentacionNombre, e.saborNombre, e.tamanioNombre, e.operarioNombre, e.cantidadKg]))
    } else if (tab === 'devoluciones') {
      descargarCsv(`fabrica_devoluciones_${rangoLabel}.csv`,
        ['Fecha', 'Motivo', 'Destino', 'Sabor', 'Tamaño', 'Presentación', 'Cantidad (kg)', 'Notas'],
        devolucionesRango.map(d => [d.fecha, d.motivoNombre, d.destino === 'reinsercion' ? 'Reinserción' : 'Pérdida', d.saborNombre, d.tamanioNombre, d.presentacionNombre, d.cantidadKg, d.notas ?? '']))
    } else if (tab === 'rendimiento') {
      descargarCsv(`fabrica_rendimiento_${rangoLabel}.csv`,
        ['Operario', 'Fécula (kg)', 'Masa (kg)', 'Rendimiento', 'Cargas'],
        calcularRendimientoPorOperario(producciones).map(r => [r.operarioNombre, r.feculaKg, r.masaKg, r.rendimiento?.toFixed(2) ?? '', r.cargas]))
    } else {
      descargarCsv(`fabrica_cumplimiento_${rangoLabel}.csv`,
        ['Semana desde', 'Semana hasta', 'Masas proyectadas', 'Masas reales', '% masa', 'Embolsado proyectado (kg)', 'Embolsado real (kg)', '% embolsado'],
        cumplimiento.map(c => [c.semanaDesde, c.semanaHasta, c.masasProyectadas, c.masasReales, c.cumplimientoMasaPct?.toFixed(1) ?? '', c.proyeccionEmbolsadoKg, c.embolsadoRealKg, c.cumplimientoEmbolsadoPct?.toFixed(1) ?? '']))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><BarChart3 size={22} className="text-accent" /> Reportes de fábrica</h1>
          <p className="text-muted text-sm mt-0.5">Producción, congelados, devoluciones, rendimiento y cumplimiento del período elegido.</p>
        </div>
        <button
          onClick={exportarTabActual}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-xs font-medium text-[#f0f0f0] hover:border-[#e8c547] transition-colors shrink-0"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Package size={18} />} label="Masa producida" value={formatKg(kpis.masaKg)} tono="neutro" />
        <KpiCard icon={<Gauge size={18} />} label="Rendimiento" value={kpis.rendimiento != null ? kpis.rendimiento.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'} tono="neutro" />
        <KpiCard icon={<Snowflake size={18} />} label="Congelados" value={formatKg(kpis.congeladosKg)} tono="neutro" />
        <KpiCard
          icon={<Undo2 size={18} />}
          label="Devuelto"
          value={formatKg(kpis.devueltoKg)}
          detalle={kpis.pctDevolucionSobreProducido != null ? `${kpis.pctDevolucionSobreProducido.toFixed(1)}% de lo producido` : undefined}
          tono={(kpis.pctDevolucionSobreProducido ?? 0) > UMBRAL_ALERTA_DEVOLUCION_PCT ? 'alerta' : 'neutro'}
        />
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
