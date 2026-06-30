'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import SelectBuscador from '@/components/ui/SelectBuscador'

interface Props { urlInicial: string }

interface SyncResult {
  importados: number; porLocal: Record<string, number>
  noMapeados: string[]; fechasCubiertas?: number; mensaje: string
}

interface FilaConciliacion {
  id: string; fecha: string; local_nombre: string; producto_nombre: string
  vendido: number; pedido: number; diferencia: number; tiene_alerta: boolean
  profiles?: { local_nombre: string | null; nombre: string } | null
}

type Modo = 'dia' | 'rango'

export default function ImportarClient({ urlInicial }: Props) {
  const hoy = new Date().toISOString().split('T')[0]

  const [scriptUrl, setScriptUrl] = useState(urlInicial)
  const [urlInput, setUrlInput]   = useState(urlInicial)
  const [guardandoUrl, setGuardandoUrl] = useState(false)
  const [showSetup, setShowSetup] = useState(!urlInicial)

  const [modo, setModo]               = useState<Modo>('dia')
  const [fecha, setFecha]             = useState(hoy)
  const [fechaDesde, setFechaDesde]   = useState(hoy)
  const [fechaHasta, setFechaHasta]   = useState(hoy)

  const [estado, setEstado]           = useState<'idle'|'cargando'|'ok'|'error'>('idle')
  const [resultado, setResultado]     = useState<SyncResult | null>(null)
  const [conciliacion, setConciliacion] = useState<FilaConciliacion[]>([])
  const [error, setError]             = useState('')
  const [filtroLocal, setFiltroLocal] = useState('todos')
  const [soloAlertas, setSoloAlertas] = useState(false)

  const supabase = createClient()

  async function guardarUrl() {
    if (!urlInput.includes('script.google.com')) { setError('URL inválida'); return }
    setGuardandoUrl(true); setError('')
    const { error: err } = await supabase.from('config').upsert({
      key: 'apps_script_url', value: urlInput.trim(), updated_at: new Date().toISOString()
    })
    if (err) { setError(err.message); setGuardandoUrl(false); return }
    setScriptUrl(urlInput.trim()); setShowSetup(false); setGuardandoUrl(false)
  }

  async function sincronizar() {
    const desde = modo === 'dia' ? fecha : fechaDesde
    const hasta  = modo === 'dia' ? fecha : fechaHasta
    if (desde > hasta) { setError('La fecha inicio no puede ser mayor al fin'); return }

    setEstado('cargando'); setError(''); setResultado(null); setConciliacion([])
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 120_000)

    try {
      const res = await fetch('/api/sync-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaDesde: desde, fechaHasta: hasta }),
        signal: controller.signal,
      })
      clearTimeout(tid)
      const text = await res.text()
      let data: SyncResult & { error?: string }
      try { data = JSON.parse(text) }
      catch { throw new Error('Error interno del servidor.') }
      if (!res.ok) throw new Error(data.error || 'Error')
      setResultado(data); setEstado('ok')
      await cargarConciliacion(desde, hasta)
    } catch (e) {
      clearTimeout(tid)
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('abort') ? 'Tardó demasiado. Probá con un rango más corto.' : msg)
      setEstado('error')
    }
  }

  async function cargarConciliacion(desde: string, hasta: string) {
    const { data } = await supabase
      .from('conciliaciones')
      .select('*, profiles(nombre, local_nombre)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('tiene_alerta', { ascending: false })
      .order('producto_nombre')
    setConciliacion(data || [])
    setFiltroLocal('todos'); setSoloAlertas(false)
  }

  function toSheet(iso: string) {
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`
  }

  const desde = modo === 'dia' ? fecha : fechaDesde
  const hasta  = modo === 'dia' ? fecha : fechaHasta
  const dias = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000) + 1)

  const localesUnicos = ['todos', ...new Set(
    conciliacion.map(c => c.profiles?.local_nombre || c.profiles?.nombre || '').filter(Boolean)
  )]

  const concFiltrada = conciliacion.filter(c => {
    const nom = c.profiles?.local_nombre || c.profiles?.nombre || ''
    if (filtroLocal !== 'todos' && nom !== filtroLocal) return false
    if (soloAlertas && !c.tiene_alerta) return false
    return true
  })

  const totalVendido = concFiltrada.reduce((s, c) => s + c.vendido, 0)
  const totalPedido  = concFiltrada.reduce((s, c) => s + c.pedido, 0)
  const cantAlertas  = concFiltrada.filter(c => c.tiene_alerta).length

  return (
    <div className="space-y-4">

      {/* Conexión */}
      {scriptUrl && !showSetup ? (
        <div className="flex items-center justify-between bg-[#E8F5EE] rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[#2E7D52] font-bold">✓</span>
            <p className="text-sm text-[#2E7D52] font-medium">Conectado al sheet BD</p>
          </div>
          <button onClick={() => setShowSetup(true)} className="text-xs text-[#888] underline">Cambiar URL</button>
        </div>
      ) : (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold">URL del Apps Script</p>
          <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D73211] bg-[#0a0a0a]" />
          <div className="flex gap-2">
            {scriptUrl && <button onClick={() => setShowSetup(false)} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm text-[#888]">Cancelar</button>}
            <button onClick={guardarUrl} disabled={guardandoUrl}
              className="flex-1 py-2.5 bg-[#D73211] text-white rounded-xl text-sm font-medium disabled:opacity-60">
              {guardandoUrl ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Card>
      )}

      {/* Layout principal: panel izq + tabla derecha en desktop */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* Panel de sincronización — fijo en desktop */}
        <div className="w-full lg:w-72 lg:shrink-0">
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold text-[#f0f0f0]">Sincronizar ventas</p>

            <div className="flex bg-[#0a0a0a] rounded-lg p-0.5 gap-0.5">
              {(['dia', 'rango'] as Modo[]).map(m => (
                <button key={m} onClick={() => { setModo(m); setResultado(null); setError('') }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${modo === m ? 'bg-[#111111] text-[#f0f0f0] shadow-sm' : 'text-[#888]'}`}>
                  {m === 'dia' ? 'Un día' : 'Rango'}
                </button>
              ))}
            </div>

            {modo === 'dia' ? (
              <div>
                <label className="block text-xs font-medium text-[#f0f0f0] mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setResultado(null); setConciliacion([]) }}
                  className="w-full border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-[#f0f0f0] [color-scheme:dark] focus:outline-none focus:border-[#e8c547]" />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-[#f0f0f0] mb-1">Desde</label>
                  <input type="date" value={fechaDesde} max={fechaHasta}
                    onChange={e => { setFechaDesde(e.target.value); setResultado(null); setConciliacion([]) }}
                    className="w-full border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-[#f0f0f0] [color-scheme:dark] focus:outline-none focus:border-[#e8c547]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#f0f0f0] mb-1">Hasta</label>
                  <input type="date" value={fechaHasta} min={fechaDesde}
                    onChange={e => { setFechaHasta(e.target.value); setResultado(null); setConciliacion([]) }}
                    className="w-full border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-[#f0f0f0] [color-scheme:dark] focus:outline-none focus:border-[#e8c547]" />
                </div>
                <p className="text-[11px] text-[#888] text-center">{dias} día{dias !== 1 ? 's' : ''}</p>
              </div>
            )}

            {estado === 'cargando' && (
              <div className="bg-[#0a0a0a] rounded-lg px-3 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block animate-spin text-[#D73211]">↻</span>
                  <p className="text-xs text-[#f0f0f0] font-medium">Conectando con el sheet...</p>
                </div>
                <div className="w-full h-1 bg-[#E5E5E0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#D73211] rounded-full animate-pulse" style={{ width: '70%' }} />
                </div>
              </div>
            )}

            {estado === 'error' && (
              <div className="bg-[#FCEBEB] border-l-4 border-[#A32D2D] rounded-r-lg px-3 py-2 text-xs text-[#A32D2D]">
                <p className="font-medium mb-0.5">Error</p><p>{error}</p>
              </div>
            )}

            {estado === 'ok' && resultado && (
              <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${resultado.importados > 0 ? 'bg-[#E8F5EE] text-[#2E7D52]' : 'bg-[#F1EFE8] text-[#888]'}`}>
                {resultado.mensaje}
              </div>
            )}

            {resultado?.noMapeados && resultado.noMapeados.length > 0 && (
              <div className="bg-[#FAEEDA] border-l-4 border-[#EF9F27] rounded-r-lg px-3 py-2">
                <p className="text-[11px] font-semibold text-[#633806]">Sin usuario:</p>
                {resultado.noMapeados.map(n => <p key={n} className="text-[11px] text-[#633806]">• {n}</p>)}
              </div>
            )}

            <button onClick={sincronizar} disabled={estado === 'cargando'}
              className="w-full bg-[#D73211] text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#c02d0f] transition-colors">
              {estado === 'cargando'
                ? <><span className="animate-spin">↻</span> Procesando...</>
                : <><span>🔄</span> {estado === 'ok' ? 'Sincronizar de nuevo' : 'Sincronizar'}</>
              }
            </button>
            <p className="text-[10px] text-center text-[#888]">Datos en tiempo real · Sin descargar nada</p>
          </Card>
        </div>

        {/* Tabla de conciliación — ocupa el resto del espacio */}
        <div className="flex-1 min-w-0">
          {conciliacion.length > 0 ? (
            <div className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <p className="text-xl font-black text-[#f0f0f0]">{totalVendido}</p>
                  <p className="text-xs text-[#888]">Vendido</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xl font-black text-[#f0f0f0]">{totalPedido}</p>
                  <p className="text-xs text-[#888]">Pedido</p>
                </Card>
                <Card className={`p-3 text-center ${cantAlertas > 0 ? 'bg-[rgba(232,66,16,.1)]' : 'bg-[rgba(86,214,138,.1)]'}`}>
                  <p className={`text-xl font-black ${cantAlertas > 0 ? 'text-[#e84210]' : 'text-[#56d68a]'}`}>{cantAlertas}</p>
                  <p className="text-xs text-[#888]">Alertas</p>
                </Card>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[160px]">
                  <SelectBuscador
                    value={filtroLocal}
                    onChange={setFiltroLocal}
                    opciones={localesUnicos.filter(l => l !== 'todos').map(l => ({ value: l, label: l }))}
                    placeholderVacio="Todos los locales"
                  />
                </div>
                <button onClick={() => setSoloAlertas(!soloAlertas)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${soloAlertas ? 'bg-[rgba(232,66,16,.1)] text-white' : 'bg-[#111111] border border-[#2a2a2a] text-[#888]'}`}>
                  ⚠️ Solo alertas
                </button>
              </div>

              {/* Tabla */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#0a0a0a] border-b border-[#2a2a2a]">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wide">Local</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wide">Producto</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wide">Vendido</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wide">Pedido</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-[#e8c547] uppercase tracking-wide">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {concFiltrada.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#888]">Sin datos con ese filtro.</td></tr>
                      ) : (
                        concFiltrada.map((c, i) => {
                          const localNom = c.profiles?.local_nombre || c.profiles?.nombre || ''
                          const diff = c.diferencia
                          return (
                            <tr key={c.id}
                              className={`border-b border-black/[0.04] ${c.tiene_alerta ? 'bg-[rgba(232,66,16,.1)]/70' : i % 2 === 1 ? 'bg-[#0a0a0a]/40' : ''}`}>
                              <td className="px-4 py-2.5 text-sm text-[#888] whitespace-nowrap">
                                {localNom.replace('Suc. ', '')}
                              </td>
                              <td className="px-4 py-2.5 text-sm font-medium text-[#f0f0f0]">
                                {c.producto_nombre}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-right tabular-nums">{c.vendido || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-right tabular-nums">{c.pedido || '—'}</td>
                              <td className={`px-4 py-2.5 text-sm text-right font-bold tabular-nums ${diff < 0 ? 'text-[#e84210]' : diff > 0 ? 'text-[#56d68a]' : 'text-[#888]'}`}>
                                {diff > 0 ? `+${diff}` : diff === 0 ? '0' : diff}
                                {c.tiene_alerta ? ' ⚠️' : ''}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                    {concFiltrada.length > 0 && (
                      <tfoot>
                        <tr className="bg-[#0a0a0a] border-t-2 border-[#2a2a2a]">
                          <td colSpan={2} className="px-4 py-3 font-bold text-[#f0f0f0] text-sm">Total</td>
                          <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{totalVendido}</td>
                          <td className="px-4 py-3 text-right font-bold text-sm tabular-nums">{totalPedido}</td>
                          <td className={`px-4 py-3 text-right font-bold text-sm tabular-nums ${
                            totalVendido - totalPedido < 0 ? 'text-[#e84210]' : totalVendido - totalPedido > 0 ? 'text-[#56d68a]' : 'text-[#888]'
                          }`}>
                            {totalVendido - totalPedido > 0 ? `+${totalVendido - totalPedido}` : totalVendido - totalPedido}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
              <p className="text-xs text-[#888]">{concFiltrada.length} filas · Diferencia = Vendido − Pedido</p>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-sm font-medium text-[#f0f0f0]">Sincronizá para ver la conciliación</p>
              <p className="text-xs text-[#888] mt-1">La tabla detallada aparece acá después de cada sincronización</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
