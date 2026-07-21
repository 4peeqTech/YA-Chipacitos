'use client'

import { useState, useDeferredValue, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Conciliacion, Profile } from '@/lib/types'
import Card from '@/components/ui/Card'
import { BadgeOk, BadgeDiff } from '@/components/ui/Badge'
import SelectBuscador from '@/components/ui/SelectBuscador'

interface ConciliacionConPerfil extends Conciliacion {
  profiles?: { nombre: string; local_nombre: string | null } | null
}

interface Props {
  conciliacionesIniciales: ConciliacionConPerfil[]
  locales: Pick<Profile, 'id' | 'nombre' | 'local_nombre'>[]
  ventasHoy: number
  fechaInicial: string
  mapaProductos: Record<string, string>
}

export default function ConciliacionClient({ conciliacionesIniciales, locales, ventasHoy, fechaInicial, mapaProductos }: Props) {
  const [desde, setDesde] = useState(fechaInicial)
  const [hasta, setHasta] = useState(fechaInicial)
  const [conc, setConc] = useState(conciliacionesIniciales)
  const [cargando, setCargando] = useState(false)
  const [filtroLocal, setFiltroLocal] = useState('todos')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [soloSinConfirmar, setSoloSinConfirmar] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [recalculando, setRecalculando] = useState(false)
  const [supabase] = useState(() => createClient())

  async function cargarPeriodo(d: string, h: string) {
    setCargando(true)
    const { data } = await supabase
      .from('conciliaciones')
      .select('*, profiles(nombre, local_nombre)')
      .gte('fecha', d)
      .lte('fecha', h)
      .order('tiene_alerta', { ascending: false })
      .order('fecha', { ascending: false })
    setConc(data || [])
    setCargando(false)
  }

  function handleDesde(v: string) { setDesde(v); cargarPeriodo(v, hasta) }
  function handleHasta(v: string) { setHasta(v); cargarPeriodo(desde, v) }

  async function recalcular() {
    setRecalculando(true)
    // Obtener todos los locales con ventas o pedidos en el período
    // Argentina = UTC-3: medianoche ARG = 03:00 UTC, fin de día ARG = 03:00 UTC del día siguiente
    const desdeUTC = `${desde}T03:00:00`
    const hastaNextDay = new Date(hasta)
    hastaNextDay.setDate(hastaNextDay.getDate() + 1)
    const hastaUTC = `${hastaNextDay.toISOString().split('T')[0]}T03:00:00`

    const [{ data: ventas }, { data: pedidos }] = await Promise.all([
      supabase.from('ventas_posberry').select('local_id, fecha').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('pedidos').select('local_id, created_at')
        .gte('created_at', desdeUTC).lte('created_at', hastaUTC),
    ])

    const pares = new Set<string>()
    ;(ventas || []).forEach(v => pares.add(`${v.local_id}__${v.fecha}`))
    ;(pedidos || []).forEach(p => {
      // Convertir created_at UTC a fecha Argentina (UTC-3)
      const dt = new Date(p.created_at as string)
      dt.setHours(dt.getHours() - 3)
      const fechaArg = dt.toISOString().split('T')[0]
      pares.add(`${p.local_id}__${fechaArg}`)
    })

    // Batching: máximo 50 RPCs en paralelo para no saturar Supabase
    const paresArr = [...pares]
    const BATCH = 50
    for (let i = 0; i < paresArr.length; i += BATCH) {
      await Promise.all(
        paresArr.slice(i, i + BATCH).map(par => {
          const [lid, fecha] = par.split('__')
          return supabase.rpc('recalcular_conciliacion', { p_fecha: fecha, p_local_id: lid })
        })
      )
    }

    await cargarPeriodo(desde, hasta)
    setRecalculando(false)
  }

  async function confirmar(id: string) {
    setConfirmando(id)
    const { data } = await supabase
      .from('conciliaciones')
      .update({ confirmado: true, confirmado_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (data) setConc(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
    setConfirmando(null)
  }

  async function desconfirmar(id: string) {
    setConfirmando(id)
    const { data } = await supabase
      .from('conciliaciones')
      .update({ confirmado: false, confirmado_at: null })
      .eq('id', id)
      .select()
      .single()
    if (data) setConc(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
    setConfirmando(null)
  }

  // Filtros — useDeferredValue para que los controles respondan al instante
  // mientras la tabla pesada se actualiza en background
  const dFiltroLocal = useDeferredValue(filtroLocal)
  const dSoloAlertas = useDeferredValue(soloAlertas)
  const dSoloSinConfirmar = useDeferredValue(soloSinConfirmar)
  const dConc = useDeferredValue(conc)

  const localesUnicos = useMemo(() => ['todos', ...new Set(
    conc.map(c => c.profiles?.local_nombre || c.profiles?.nombre || '').filter(Boolean)
  )], [conc])

  const concFiltrada = useMemo(() => dConc.filter(c => {
    const nom = c.profiles?.local_nombre || c.profiles?.nombre || ''
    if (dFiltroLocal !== 'todos' && nom !== dFiltroLocal) return false
    if (dSoloAlertas && !c.tiene_alerta) return false
    if (dSoloSinConfirmar && c.confirmado) return false
    return true
  }), [dConc, dFiltroLocal, dSoloAlertas, dSoloSinConfirmar])

  // Resumen agrupado por producto (suma de todas las filas filtradas)
  const resumenPorProducto = useMemo(() => {
    const mapa = new Map<string, {
      producto_nombre: string
      vendido: number
      pedido: number
      monto_vendido: number
      monto_remito: number
      tieneAlerta: boolean
      totalFilas: number
      filasConfirmadas: number
    }>()
    for (const c of concFiltrada) {
      const key = c.producto_nombre
      const prev = mapa.get(key) ?? {
        producto_nombre: key,
        vendido: 0, pedido: 0, monto_vendido: 0, monto_remito: 0,
        tieneAlerta: false, totalFilas: 0, filasConfirmadas: 0,
      }
      mapa.set(key, {
        ...prev,
        vendido: prev.vendido + (c.vendido || 0),
        pedido: prev.pedido + (c.pedido || 0),
        monto_vendido: prev.monto_vendido + (c.monto_vendido || 0),
        monto_remito: prev.monto_remito + (c.monto_remito || 0),
        tieneAlerta: prev.tieneAlerta || c.tiene_alerta,
        totalFilas: prev.totalFilas + 1,
        filasConfirmadas: prev.filasConfirmadas + (c.confirmado ? 1 : 0),
      })
    }
    return [...mapa.values()].sort((a, b) => b.vendido - a.vendido)
  }, [concFiltrada])

  // Stats
  const alertas = conc.filter(c => c.tiene_alerta)
  const confirmados = conc.filter(c => c.confirmado)
  const sinConfirmar = conc.filter(c => !c.confirmado)
  const totalVendido = concFiltrada.reduce((s, c) => s + (c.vendido || 0), 0)
  const totalPedido = concFiltrada.reduce((s, c) => s + (c.pedido || 0), 0)
  const totalMontoVendido = concFiltrada.reduce((s, c) => s + (c.monto_vendido || 0), 0)
  const totalMontoRemito = concFiltrada.reduce((s, c) => s + (c.monto_remito || 0), 0)

  // Resumen por local
  const porLocal = useMemo(() => locales.map(l => {
    const filas = conc.filter(c => c.local_id === l.id)
    const tieneDiff = filas.some(c => c.tiene_alerta || c.diferencia !== 0)
    const todoConfirmado = filas.length > 0 && filas.every(c => c.confirmado)
    return { local: l, tieneDiff, todoConfirmado, filas: filas.length }
  }).filter(x => x.filas > 0), [locales, conc])

  const nombreLocal = (l: Pick<Profile, 'nombre' | 'local_nombre'>) =>
    l.local_nombre || l.nombre

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Conciliación</h1>
          <p className="text-sm text-[#888] mt-1">Ventas Posberry vs remitos recibidos, por período y local</p>
        </div>
        {/* Selector de período + recalcular */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-[#111111] border border-[#2a2a2a] rounded-xl px-3 py-2">
            <span className="text-xs text-[#e8c547] font-semibold uppercase tracking-wider">Desde</span>
            <input type="date" value={desde} onChange={e => handleDesde(e.target.value)}
              className="text-sm focus:outline-none bg-transparent text-[#f0f0f0] [color-scheme:dark]" />
          </div>
          <span className="text-[#f0f0f0]">→</span>
          <div className="flex items-center gap-2 bg-[#111111] border border-[#2a2a2a] rounded-xl px-3 py-2">
            <span className="text-xs text-[#e8c547] font-semibold uppercase tracking-wider">Hasta</span>
            <input type="date" value={hasta} onChange={e => handleHasta(e.target.value)}
              className="text-sm focus:outline-none bg-transparent text-[#f0f0f0] [color-scheme:dark]" />
          </div>
          <button
            onClick={recalcular}
            disabled={recalculando}
            className="flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 hover:border-[#e8c547] hover:text-[#e8c547] transition-colors whitespace-nowrap"
          >
            {recalculando ? '⏳ Recalculando...' : '⟳ Recalcular'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-black text-[#f0f0f0]">${ventasHoy.toLocaleString('es-AR')}</p>
          <p className="text-xs text-[#888] mt-1">Vendido (Posberry)</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-black text-[#f0f0f0]">{totalPedido}</p>
          <p className="text-xs text-[#888] mt-1">Total remito</p>
        </Card>
        <Card className={`p-4 ${alertas.length > 0 ? 'border-t-[3px] border-t-[#e84210]' : 'border-t-[3px] border-t-[#56d68a]'}`}>
          <p className={`text-2xl font-black ${alertas.length > 0 ? 'text-[#e84210]' : 'text-[#56d68a]'}`}>{alertas.length}</p>
          <p className="text-xs text-[#888] mt-1">Alertas</p>
        </Card>
        <Card className={`p-4 ${sinConfirmar.length > 0 ? 'border-t-[3px] border-t-[#f0a849]' : 'border-t-[3px] border-t-[#56d68a]'}`}>
          <p className={`text-2xl font-black ${sinConfirmar.length > 0 ? 'text-[#f0a849]' : 'text-[#56d68a]'}`}>{confirmados.length}/{conc.length}</p>
          <p className="text-xs text-[#888] mt-1">Confirmados</p>
        </Card>
      </div>

      {alertas.length > 0 && (
        <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-xl px-4 py-3 text-sm text-[#f0a849]">
          ⚠️ {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} de diferencia entre ventas y remitos.
          {alertas.length > 0 && ` Primer caso: ${alertas[0].profiles?.local_nombre || alertas[0].profiles?.nombre} — ${alertas[0].producto_nombre}`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">

        {/* Columna lateral: resumen por local */}
        <div>
          <h2 className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-2">Por local</h2>
          <Card>
            {/* Opción "Todos" */}
            <div
              onClick={() => setFiltroLocal('todos')}
              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-[#0a0a0a] transition-colors border-b border-[#2a2a2a] ${filtroLocal === 'todos' ? 'bg-[#0a0a0a]' : ''}`}>
              <span className="text-sm font-medium text-[#f0f0f0]">Todos los locales</span>
              <span className="text-xs text-[#888]">{conc.length}</span>
            </div>
            {porLocal.length === 0
              ? <p className="text-xs text-[#888] text-center py-4">Sin datos.</p>
              : porLocal.map((item, i) => (
                <div key={item.local.id}
                  onClick={() => setFiltroLocal(filtroLocal === nombreLocal(item.local) ? 'todos' : nombreLocal(item.local))}
                  className={`flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-[#0a0a0a] transition-colors ${i < porLocal.length - 1 ? 'border-b border-[#2a2a2a]' : ''} ${filtroLocal === nombreLocal(item.local) ? 'bg-[#0a0a0a]' : ''}`}>
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-medium text-[#f0f0f0] truncate">{nombreLocal(item.local)}</p>
                    <p className="text-[11px] text-[#888]">
                      {item.todoConfirmado ? '✓ Confirmado' : `${conc.filter(c => c.local_id === item.local.id && c.confirmado).length}/${conc.filter(c => c.local_id === item.local.id).length} conf.`}
                    </p>
                  </div>
                  {item.todoConfirmado
                    ? <span className="text-[11px] font-medium text-[#56d68a] bg-[rgba(86,214,138,.1)] px-2 py-0.5 rounded-full shrink-0">OK</span>
                    : item.tieneDiff
                      ? <span className="text-[11px] font-medium text-[#e84210] bg-[rgba(232,66,16,.1)] px-2 py-0.5 rounded-full shrink-0">Dif.</span>
                      : <span className="text-[11px] font-medium text-[#888] bg-[#1a1a1a] px-2 py-0.5 rounded-full shrink-0">Pend.</span>
                  }
                </div>
              ))
            }
          </Card>
        </div>

        {/* Tabla principal */}
        <div>
          {/* Barra de filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold text-[#e8c547] uppercase tracking-wider flex-1">
              Detalle {filtroLocal !== 'todos' ? `— ${filtroLocal}` : ''}
              {desde !== hasta ? ` · ${desde} → ${hasta}` : ` · ${desde}`}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <div className="lg:hidden w-40">
                <SelectBuscador
                  value={filtroLocal}
                  onChange={setFiltroLocal}
                  opciones={localesUnicos.filter(l => l !== 'todos').map(l => ({ value: l, label: l }))}
                  placeholderVacio="Todos los locales"
                />
              </div>
              <button onClick={() => setSoloAlertas(!soloAlertas)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${soloAlertas ? 'bg-[#A32D2D] text-white' : 'bg-[#111111] border border-[#2a2a2a] text-[#888]'}`}>
                ⚠️ Solo alertas
              </button>
              <button onClick={() => setSoloSinConfirmar(!soloSinConfirmar)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${soloSinConfirmar ? 'bg-[#1A1A1A] text-white' : 'bg-[#111111] border border-[#2a2a2a] text-[#888]'}`}>
                ○ Sin confirmar
              </button>
            </div>
          </div>

          {cargando
            ? <Card className="p-8 text-center text-sm text-[#888]">Cargando...</Card>
            : dConc !== conc || dFiltroLocal !== filtroLocal || dSoloAlertas !== soloAlertas || dSoloSinConfirmar !== soloSinConfirmar
              ? <Card className="p-8 text-center text-sm text-[#888]">Filtrando...</Card>
            : concFiltrada.length === 0
              ? <Card className="p-8 text-center text-sm text-[#888]">Sin datos para este período.</Card>
              : (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#0a0a0a] border-b border-[#2a2a2a]">
                          <th className="text-left px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">Posberry</th>
                          <th className="text-left px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">Sistema</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">Vend. Ud.</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">Rem. Ud.</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">Dif. Ud.</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">$ Vendido</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">$ Remito</th>
                          <th className="text-right px-4 py-3 font-semibold text-[#e8c547] text-xs uppercase tracking-wider">$ Dif.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumenPorProducto.map((r, i) => {
                          const difUd = r.vendido - r.pedido
                          const difMonto = Math.round((r.monto_vendido - r.monto_remito) * 100) / 100
                          return (
                            <tr key={r.producto_nombre}
                              className={`border-b border-[#1a1a1a] transition-colors ${
                                r.tieneAlerta ? 'bg-[rgba(232,66,16,.06)]' :
                                i % 2 === 1 ? 'bg-[#0a0a0a]' : ''
                              }`}>
                              <td className="px-4 py-2.5 text-sm text-[#888]">{r.producto_nombre}</td>
                              <td className="px-4 py-2.5 font-medium text-[#f0f0f0]">
                                {mapaProductos[r.producto_nombre] || <span className="text-[#555] text-xs italic">sin mapear</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{r.vendido || '—'}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{r.pedido || '—'}</td>
                              <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${difUd < 0 ? 'text-[#e84210]' : difUd > 0 ? 'text-[#56d68a]' : 'text-[#888]'}`}>
                                {difUd > 0 ? `+${difUd}` : difUd === 0 ? '0' : difUd}{r.tieneAlerta ? ' ⚠️' : ''}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-[#aaa]">
                                {r.monto_vendido ? `$${r.monto_vendido.toLocaleString('es-AR')}` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-[#aaa]">
                                {r.monto_remito ? `$${r.monto_remito.toLocaleString('es-AR')}` : '—'}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${difMonto < 0 ? 'text-[#e84210]' : difMonto > 0 ? 'text-[#56d68a]' : 'text-[#888]'}`}>
                                {difMonto > 0 ? `+$${difMonto.toLocaleString('es-AR')}` : difMonto === 0 ? '$0' : `-$${Math.abs(difMonto).toLocaleString('es-AR')}`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#0a0a0a] border-t-2 border-[#2a2a2a]">
                          <td colSpan={2} className="px-4 py-3 font-bold text-[#f0f0f0] text-sm">Total</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{totalVendido}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{totalPedido}</td>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${totalVendido-totalPedido < 0 ? 'text-[#e84210]' : totalVendido-totalPedido > 0 ? 'text-[#56d68a]' : 'text-[#888]'}`}>
                            {totalVendido-totalPedido > 0 ? `+${totalVendido-totalPedido}` : totalVendido-totalPedido}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">${totalMontoVendido.toLocaleString('es-AR')}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">${totalMontoRemito.toLocaleString('es-AR')}</td>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${totalMontoVendido-totalMontoRemito < 0 ? 'text-[#e84210]' : totalMontoVendido-totalMontoRemito > 0 ? 'text-[#56d68a]' : 'text-[#888]'}`}>
                            {(() => { const d = Math.round((totalMontoVendido-totalMontoRemito)*100)/100; return d > 0 ? `+$${d.toLocaleString('es-AR')}` : d === 0 ? '$0' : `-$${Math.abs(d).toLocaleString('es-AR')}` })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[11px] text-[#888] px-4 py-2 border-t border-[#2a2a2a]">
                    {resumenPorProducto.length} productos · Dif. Ud. = Vendido − Remito · Dif. $ = $ Vendido − $ Remito · Confirmados: {concFiltrada.filter(c => c.confirmado).length}/{concFiltrada.length}
                  </p>
                </Card>
              )
          }
        </div>
      </div>
    </div>
  )
}
