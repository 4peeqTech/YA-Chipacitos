'use client'

import { useMemo, useState } from 'react'
import {
  ClipboardList, Factory, Snowflake, Undo2, Recycle, Package,
  MessageSquareText, User, CalendarRange, Download,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { calcularRangoPreset, fechaEnRango, type PresetRango, type RangoFechas } from '@/lib/compras/rangoFechas'
import { rendimientoFeculaMasa } from '@/lib/fabrica/rendimiento'
import { descargarCsv } from '@/lib/csv'

export interface ProduccionRegistro {
  id: string
  fecha: string
  turno: 'manana' | 'tarde'
  operarioNombre: string
  saborNombre: string
  tamanioNombre: string | null
  feculaKg: number
  masaKg: number
  destino: 'masa_locales' | 'congelado_embolsado'
  cargadoPor: string | null
  createdAt: string
}

export interface EmbolsadoRegistro {
  id: string
  fecha: string
  presentacionNombre: string
  saborNombre: string
  tamanioNombre: string
  operarioNombre: string
  cantidadKg: number
  cargadoPor: string | null
  createdAt: string
}

export interface DevolucionRegistro {
  id: string
  fecha: string
  motivoNombre: string
  destino: 'reinsercion' | 'perdida'
  saborNombre: string | null
  tamanioNombre: string | null
  presentacionNombre: string | null
  cantidadKg: number | null
  notas: string | null
  cargadoPor: string | null
  createdAt: string
}

export interface OperarioUI {
  id: string
  nombre: string
}

type Tab = 'produccion' | 'embolsado' | 'devoluciones'
type PresetUI = PresetRango | 'personalizado'
type Detalle = { tipo: Tab; item: ProduccionRegistro | EmbolsadoRegistro | DevolucionRegistro }

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'produccion', label: 'Producción', icon: Factory },
  { key: 'embolsado', label: 'Congelados', icon: Snowflake },
  { key: 'devoluciones', label: 'Devoluciones', icon: Undo2 },
]

const PRESETS: { key: PresetUI; label: string }[] = [
  { key: 'mes_actual', label: 'Mes actual' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: 'personalizado', label: 'Personalizado' },
]

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

function formatFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function RegistrosClient({
  produccionesIniciales,
  embolsadosIniciales,
  devolucionesIniciales,
  operarios,
}: {
  produccionesIniciales: ProduccionRegistro[]
  embolsadosIniciales: EmbolsadoRegistro[]
  devolucionesIniciales: DevolucionRegistro[]
  operarios: OperarioUI[]
}) {
  const [tab, setTab] = useState<Tab>('produccion')
  const [preset, setPreset] = useState<PresetUI>('mes_actual')
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>(() => calcularRangoPreset('mes_actual', new Date()))
  const [operarioNombre, setOperarioNombre] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle] = useState<Detalle | null>(null)

  const rango: RangoFechas = useMemo(() => {
    if (preset === 'personalizado') return rangoPersonalizado
    return calcularRangoPreset(preset, new Date())
  }, [preset, rangoPersonalizado])

  const hayFiltros = operarioNombre !== 'todos' || !!busqueda

  function limpiarFiltros() {
    setOperarioNombre('todos')
    setBusqueda('')
  }

  const q = busqueda.trim().toLowerCase()

  const producciones = useMemo(() => produccionesIniciales.filter(p =>
    fechaEnRango(p.fecha, rango) &&
    (operarioNombre === 'todos' || p.operarioNombre === operarioNombre) &&
    (!q || p.saborNombre.toLowerCase().includes(q) || p.operarioNombre.toLowerCase().includes(q))
  ), [produccionesIniciales, rango, operarioNombre, q])

  const embolsados = useMemo(() => embolsadosIniciales.filter(e =>
    fechaEnRango(e.fecha, rango) &&
    (operarioNombre === 'todos' || e.operarioNombre === operarioNombre) &&
    (!q || e.saborNombre.toLowerCase().includes(q) || e.operarioNombre.toLowerCase().includes(q) || e.presentacionNombre.toLowerCase().includes(q))
  ), [embolsadosIniciales, rango, operarioNombre, q])

  // Devolución no tiene atribución de operario — el filtro por operario solo se aplica a Producción/Congelados.
  const devoluciones = useMemo(() => devolucionesIniciales.filter(d =>
    fechaEnRango(d.fecha, rango) &&
    (!q || d.motivoNombre.toLowerCase().includes(q) || (d.saborNombre?.toLowerCase().includes(q) ?? false))
  ), [devolucionesIniciales, rango, q])

  const totalProduccionMasa = useMemo(() => producciones.reduce((acc, p) => acc + p.masaKg, 0), [producciones])
  const totalEmbolsadoKg = useMemo(() => embolsados.reduce((acc, e) => acc + e.cantidadKg, 0), [embolsados])
  const totalDevolucionKg = useMemo(() => devoluciones.reduce((acc, d) => acc + (d.cantidadKg ?? 0), 0), [devoluciones])

  function exportar() {
    const rangoLabel = `${rango.desde}_al_${rango.hasta}`
    if (tab === 'produccion') {
      descargarCsv(`fabrica_registros_produccion_${rangoLabel}.csv`,
        ['Fecha', 'Turno', 'Operario', 'Sabor', 'Fécula (kg)', 'Masa (kg)', 'Rendimiento', 'Cargado por'],
        producciones.map(p => [p.fecha, p.turno === 'manana' ? 'Mañana' : 'Tarde', p.operarioNombre, p.saborNombre, p.feculaKg, p.masaKg, rendimientoFeculaMasa(p.feculaKg, p.masaKg)?.toFixed(2) ?? '', p.cargadoPor ?? '']))
    } else if (tab === 'embolsado') {
      descargarCsv(`fabrica_registros_congelados_${rangoLabel}.csv`,
        ['Fecha', 'Operario', 'Sabor', 'Tamaño', 'Presentación', 'Cantidad (kg)', 'Cargado por'],
        embolsados.map(e => [e.fecha, e.operarioNombre, e.saborNombre, e.tamanioNombre, e.presentacionNombre, e.cantidadKg, e.cargadoPor ?? '']))
    } else {
      descargarCsv(`fabrica_registros_devoluciones_${rangoLabel}.csv`,
        ['Fecha', 'Motivo', 'Destino', 'Sabor', 'Tamaño', 'Presentación', 'Cantidad (kg)', 'Notas', 'Cargado por'],
        devoluciones.map(d => [d.fecha, d.motivoNombre, d.destino === 'reinsercion' ? 'Reinserción' : 'Pérdida', d.saborNombre ?? '', d.tamanioNombre ?? '', d.presentacionNombre ?? '', d.cantidadKg ?? '', d.notas ?? '', d.cargadoPor ?? '']))
    }
  }

  const inputClass = "bg-surface2 border border-border text-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><ClipboardList size={22} className="text-accent" /> Registros de fábrica</h1>
          <p className="text-muted text-sm mt-0.5">Historial crudo y auditable: cada carga de producción, congelados y devoluciones.</p>
        </div>
        <button
          onClick={exportar}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface2 border border-border text-xs font-medium text-text hover:border-accent transition-colors shrink-0"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon
          const activo = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activo ? 'bg-accent text-black' : 'bg-surface2 text-muted hover:text-text'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por sabor, operario..." className="w-64" />
        <div className="flex items-center gap-2">
          <CalendarRange size={14} className="text-muted" />
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.key ? 'bg-surface2 text-accent' : 'bg-surface text-muted hover:text-text border border-border'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {tab !== 'devoluciones' && (
          <select value={operarioNombre} onChange={e => setOperarioNombre(e.target.value)} className={inputClass}>
            <option value="todos">Todos los operarios</option>
            {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </select>
        )}
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      {preset === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={rangoPersonalizado.desde} onChange={e => setRangoPersonalizado(prev => ({ ...prev, desde: e.target.value }))} className={`${inputClass} [color-scheme:dark]`} />
          <span className="text-muted text-xs">al</span>
          <input type="date" value={rangoPersonalizado.hasta} onChange={e => setRangoPersonalizado(prev => ({ ...prev, hasta: e.target.value }))} className={`${inputClass} [color-scheme:dark]`} />
        </div>
      )}

      {tab === 'produccion' && (
        <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface2 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Turno</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Operario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Sabor</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-accent uppercase tracking-wider">Fécula</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-accent uppercase tracking-wider">Masa</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-accent uppercase tracking-wider hidden sm:table-cell">Rendimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {producciones.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-muted">Ningún registro coincide con los filtros.</td></tr>
              ) : producciones.map(p => (
                <tr key={p.id} onClick={() => setDetalle({ tipo: 'produccion', item: p })} className="hover:bg-surface2 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-text text-sm">{formatFecha(p.fecha)}</td>
                  <td className="px-4 py-3 text-muted text-sm">{p.turno === 'manana' ? 'Mañana' : 'Tarde'}</td>
                  <td className="px-4 py-3 text-muted text-sm">{p.operarioNombre}</td>
                  <td className="px-4 py-3 text-text text-sm">{p.saborNombre}</td>
                  <td className="px-4 py-3 text-muted text-sm text-right whitespace-nowrap">{formatKg(p.feculaKg)}</td>
                  <td className="px-4 py-3 text-text text-sm font-medium text-right whitespace-nowrap">{formatKg(p.masaKg)}</td>
                  <td className="px-4 py-3 text-muted text-sm text-right hidden sm:table-cell">{rendimientoFeculaMasa(p.feculaKg, p.masaKg)?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            {producciones.length > 0 && (
              <tfoot className="bg-surface2 border-t border-border">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-xs text-muted">{producciones.length} registro{producciones.length !== 1 ? 's' : ''}</td>
                  <td colSpan={2} className="px-4 py-2.5 text-sm text-text font-semibold text-right">{formatKg(totalProduccionMasa)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {tab === 'embolsado' && (
        <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface2 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Operario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Sabor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden sm:table-cell">Tamaño</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden md:table-cell">Presentación</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-accent uppercase tracking-wider">Kg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {embolsados.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-muted">Ningún registro coincide con los filtros.</td></tr>
              ) : embolsados.map(e => (
                <tr key={e.id} onClick={() => setDetalle({ tipo: 'embolsado', item: e })} className="hover:bg-surface2 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-text text-sm">{formatFecha(e.fecha)}</td>
                  <td className="px-4 py-3 text-muted text-sm">{e.operarioNombre}</td>
                  <td className="px-4 py-3 text-text text-sm">{e.saborNombre}</td>
                  <td className="px-4 py-3 text-muted text-sm hidden sm:table-cell">{e.tamanioNombre}</td>
                  <td className="px-4 py-3 text-muted text-sm hidden md:table-cell">{e.presentacionNombre}</td>
                  <td className="px-4 py-3 text-text text-sm font-medium text-right whitespace-nowrap">{formatKg(e.cantidadKg)}</td>
                </tr>
              ))}
            </tbody>
            {embolsados.length > 0 && (
              <tfoot className="bg-surface2 border-t border-border">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-xs text-muted">{embolsados.length} registro{embolsados.length !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-2.5 text-sm text-text font-semibold text-right">{formatKg(totalEmbolsadoKg)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {tab === 'devoluciones' && (
        <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface2 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider">Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden sm:table-cell">Destino</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-accent uppercase tracking-wider hidden md:table-cell">Producto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-accent uppercase tracking-wider">Kg</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-accent uppercase tracking-wider">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devoluciones.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-muted">Ningún registro coincide con los filtros.</td></tr>
              ) : devoluciones.map(d => (
                <tr key={d.id} onClick={() => setDetalle({ tipo: 'devoluciones', item: d })} className="hover:bg-surface2 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-text text-sm">{formatFecha(d.fecha)}</td>
                  <td className="px-4 py-3 text-text text-sm">{d.motivoNombre}</td>
                  <td className="px-4 py-3 text-muted text-sm hidden sm:table-cell">
                    <span className="flex items-center gap-1">{d.destino === 'reinsercion' ? <Recycle size={13} /> : <Package size={13} />} {d.destino === 'reinsercion' ? 'Reinserción' : 'Pérdida'}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-sm hidden md:table-cell">{d.saborNombre ? `${d.tamanioNombre} · ${d.saborNombre}` : '—'}</td>
                  <td className="px-4 py-3 text-text text-sm font-medium text-right whitespace-nowrap">{d.cantidadKg != null ? formatKg(d.cantidadKg) : '—'}</td>
                  <td className="px-4 py-3 text-center">{d.notas && <MessageSquareText size={14} className="inline text-accent" />}</td>
                </tr>
              ))}
            </tbody>
            {devoluciones.length > 0 && (
              <tfoot className="bg-surface2 border-t border-border">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-muted">{devoluciones.length} registro{devoluciones.length !== 1 ? 's' : ''}</td>
                  <td colSpan={2} className="px-4 py-2.5 text-sm text-text font-semibold text-right">{formatKg(totalDevolucionKg)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle del registro" size="md">
        {detalle?.tipo === 'produccion' && (() => {
          const p = detalle.item as ProduccionRegistro
          return (
            <div className="space-y-2 text-sm">
              <p className="text-text font-semibold">{formatFecha(p.fecha)} · {p.turno === 'manana' ? 'Mañana' : 'Tarde'}</p>
              <p className="text-muted flex items-center gap-1.5"><User size={13} /> {p.operarioNombre}</p>
              <p className="text-muted">{p.saborNombre}</p>
              <p className="text-muted">{formatKg(p.feculaKg)} fécula → {formatKg(p.masaKg)} masa · rendimiento {rendimientoFeculaMasa(p.feculaKg, p.masaKg)?.toFixed(2) ?? '—'}</p>
              <p className="text-muted text-xs pt-2 border-t border-border">Cargado por {p.cargadoPor ?? '—'} · {formatFechaHora(p.createdAt)}</p>
            </div>
          )
        })()}
        {detalle?.tipo === 'embolsado' && (() => {
          const e = detalle.item as EmbolsadoRegistro
          return (
            <div className="space-y-2 text-sm">
              <p className="text-text font-semibold">{formatFecha(e.fecha)}</p>
              <p className="text-muted flex items-center gap-1.5"><User size={13} /> {e.operarioNombre}</p>
              <p className="text-muted">{e.tamanioNombre} · {e.saborNombre} · {e.presentacionNombre}</p>
              <p className="text-text font-medium">{formatKg(e.cantidadKg)}</p>
              <p className="text-muted text-xs pt-2 border-t border-border">Cargado por {e.cargadoPor ?? '—'} · {formatFechaHora(e.createdAt)}</p>
            </div>
          )
        })()}
        {detalle?.tipo === 'devoluciones' && (() => {
          const d = detalle.item as DevolucionRegistro
          return (
            <div className="space-y-2 text-sm">
              <p className="text-text font-semibold">{formatFecha(d.fecha)} · {d.motivoNombre}</p>
              <p className="text-muted flex items-center gap-1.5">
                {d.destino === 'reinsercion' ? <Recycle size={14} /> : <Package size={14} />}
                {d.destino === 'reinsercion' ? 'Reinserción' : 'Pérdida'}
                {d.cantidadKg != null && ` · ${formatKg(d.cantidadKg)}`}
              </p>
              {d.saborNombre && <p className="text-muted">{d.tamanioNombre} · {d.saborNombre} · {d.presentacionNombre}</p>}
              {d.notas && (
                <div className="rounded-xl bg-surface2 border border-border p-3">
                  <p className="text-xs text-muted mb-1">Comentario</p>
                  <p className="text-sm text-text whitespace-pre-wrap">{d.notas}</p>
                </div>
              )}
              <p className="text-muted text-xs pt-2 border-t border-border">Cargado por {d.cargadoPor ?? '—'} · {formatFechaHora(d.createdAt)}</p>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
