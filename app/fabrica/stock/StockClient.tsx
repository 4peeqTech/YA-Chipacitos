'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, History, TrendingUp, AlertTriangle, ChevronRight, Search, Trash2, Package, Wheat, Egg } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularNecesidadYSugerido, faltanteBolsaplast, calcularHuevos, type Redondeo } from '@/lib/fabrica/calculoSugerido'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface BolsaplastItem {
  itemId: string
  nombre: string
  unidad: string
  metaSemanal: number
  cantidad: number
}

export interface MateriaPrimaConteo {
  conteoItemId: string
  materiaPrimaId: string
  nombre: string
  unidadCompra: string
  kgPorUnidad: number
  kgPorMasa: number
  redondeo: Redondeo
  cantidad: number
}

export interface ConteoBorrador {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number
  huevos_cajones_disponibles: number
  estado: 'borrador' | 'cerrado'
}

export interface ConteoHistorial {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number
  cerrado_en: string | null
}

interface DetalleLinea {
  descripcion: string
  unidad: string | null
  cantidad_sugerida: number
}

function formatearFechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function tileClass(falta: boolean) {
  return `rounded-xl border p-3 space-y-1.5 transition-colors ${
    falta ? 'border-red-800 bg-red-950/20' : 'border-[#2a2a2a] bg-[#111111]'
  }`
}

const tileInputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:border-[#e8c547] transition-colors"

export default function StockClient({
  conteoInicial,
  bolsaplastIniciales,
  materiaPrimaIniciales,
  historialInicial,
  usuarioId,
}: {
  conteoInicial: ConteoBorrador
  bolsaplastIniciales: BolsaplastItem[]
  materiaPrimaIniciales: MateriaPrimaConteo[]
  historialInicial: ConteoHistorial[]
  usuarioId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [conteo, setConteo] = useState(conteoInicial)
  const [bolsaplast, setBolsaplast] = useState(bolsaplastIniciales)
  const [materiaPrima, setMateriaPrima] = useState(materiaPrimaIniciales)
  const [historial] = useState(historialInicial)
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [detalle, setDetalle] = useState<ConteoHistorial | null>(null)
  const [detalleLineas, setDetalleLineas] = useState<DetalleLinea[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function marcarGuardado() {
    setGuardado('guardando')
    setTimeout(() => setGuardado('guardado'), 300)
  }

  function debounced(key: string, fn: () => Promise<void>) {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => { marcarGuardado(); fn() }, 500)
  }

  async function actualizarMasasProyectadas(valor: number) {
    setConteo(prev => ({ ...prev, masas_proyectadas: valor }))
    marcarGuardado()
    const { error } = await supabase.from('fabrica_conteos').update({ masas_proyectadas: valor }).eq('id', conteo.id)
    if (error) toast.error('No se pudo guardar la proyección')
  }

  async function actualizarHuevosCajones(valor: number) {
    setConteo(prev => ({ ...prev, huevos_cajones_disponibles: valor }))
    marcarGuardado()
    const { error } = await supabase.from('fabrica_conteos').update({ huevos_cajones_disponibles: valor }).eq('id', conteo.id)
    if (error) toast.error('No se pudo guardar los cajones de huevos')
  }

  function actualizarCantidadBolsaplast(itemId: string, cantidad: number) {
    const anterior = bolsaplast.find(i => i.itemId === itemId)?.cantidad ?? 0
    setBolsaplast(prev => prev.map(i => i.itemId === itemId ? { ...i, cantidad } : i))
    debounced(`bp-${itemId}`, async () => {
      const delta = cantidad - anterior
      const { error } = await supabase.from('compras_stock_actual').upsert(
        { item_id: itemId, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
        { onConflict: 'item_id' }
      )
      if (error) { toast.error('No se pudo guardar el stock'); return }
      if (delta !== 0) {
        await supabase.from('compras_stock_movimientos').insert(
          { item_id: itemId, delta, tipo: 'ajuste_manual', creado_por: usuarioId }
        )
      }
    })
  }

  function actualizarCantidadMateriaPrima(materiaPrimaId: string, cantidad: number) {
    setMateriaPrima(prev => prev.map(i => i.materiaPrimaId === materiaPrimaId ? { ...i, cantidad } : i))
    debounced(`mp-${materiaPrimaId}`, async () => {
      const item = materiaPrima.find(i => i.materiaPrimaId === materiaPrimaId)
      if (!item?.conteoItemId) return
      const { error } = await supabase.from('fabrica_conteo_items').update({ cantidad }).eq('id', item.conteoItemId)
      if (error) toast.error('No se pudo guardar la cantidad')
    })
  }

  const previewMateriaPrima = useMemo(() => {
    const porItem = new Map(materiaPrima.map(i => [i.materiaPrimaId, calcularNecesidadYSugerido(
      { kgPorMasa: i.kgPorMasa, kgPorUnidad: i.kgPorUnidad, cantidadUnidades: i.cantidad, redondeo: i.redondeo },
      conteo.masas_proyectadas
    )]))
    return porItem
  }, [materiaPrima, conteo.masas_proyectadas])

  const previewHuevos = useMemo(
    () => calcularHuevos(conteo.masas_proyectadas, conteo.huevos_cajones_disponibles),
    [conteo.masas_proyectadas, conteo.huevos_cajones_disponibles]
  )

  const q = busqueda.trim().toLowerCase()
  const bolsaplastFiltrado = bolsaplast.filter(i => !q || i.nombre.toLowerCase().includes(q))
  const materiaPrimaFiltrada = materiaPrima.filter(i => !q || i.nombre.toLowerCase().includes(q))

  const faltantesBolsaplast = bolsaplast.filter(i => faltanteBolsaplast(i.metaSemanal, i.cantidad) > 0).length
  const faltantesMateriaPrima = materiaPrima.filter(i => (previewMateriaPrima.get(i.materiaPrimaId)?.sugeridoUnidades ?? 0) > 0).length
  const faltantesTotal = faltantesBolsaplast + faltantesMateriaPrima + (previewHuevos.cajonesFaltantes > 0 ? 1 : 0)

  async function confirmarCierre() {
    setCerrando(true)
    const { data: solicitudId, error } = await supabase.rpc('cerrar_conteo_fabrica', { p_conteo_id: conteo.id })
    if (error) {
      toast.error(error.message || 'No se pudo cerrar el conteo')
      setCerrando(false)
      return
    }
    fetch('/api/fabrica/solicitudes/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitudId }),
    }).catch(() => { /* notificación best-effort */ })

    toast.success('Conteo cerrado. Se avisó a Compras.')
    setConfirmando(false)
    setCerrando(false)
    router.refresh()
  }

  async function confirmarEliminar() {
    setBorrando(true)
    const { error } = await supabase.rpc('eliminar_conteo_fabrica', { p_id: conteo.id })
    setBorrando(false)
    if (error) {
      toast.error(error.message || 'No se pudo eliminar el conteo')
      return
    }
    toast.success('Conteo eliminado')
    setEliminando(false)
    router.refresh()
  }

  async function verDetalle(c: ConteoHistorial) {
    setDetalle(c)
    setDetalleLineas(null)
    const { data } = await supabase
      .from('compras_solicitudes')
      .select('compras_solicitud_items(descripcion, unidad, cantidad_sugerida)')
      .eq('conteo_id', c.id)
      .eq('tipo', 'complementario')
      .maybeSingle()
    const lineas = ((data?.compras_solicitud_items as DetalleLinea[] | undefined) ?? [])
      .slice()
      .sort((a, b) => b.cantidad_sugerida - a.cantidad_sugerida)
    setDetalleLineas(lineas)
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-['Syne'] font-bold text-[#f0f0f0]">Conteo semanal</h1>
          <p className="text-[#888] text-xs mt-0.5">
            {formatearFechaCorta(conteo.semana_desde)} → {formatearFechaCorta(conteo.semana_hasta)}
          </p>
        </div>
        <span className={`text-[11px] font-medium transition-opacity ${guardado === 'idle' ? 'opacity-0' : 'text-[#56d68a]'}`}>
          {guardado === 'guardando' ? 'Guardando...' : '✓ Guardado'}
        </span>
      </div>

      <Card className="p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">
          <TrendingUp size={14} /> Proyección hasta el viernes
        </p>
        <div>
          <label className="flex items-center text-xs text-[#888] mb-1">
            Masas proyectadas esta semana
            <HelpTooltip text="Cuántas masas (batches de producción) proyectás hacer desde hoy hasta el viernes. Define cuánto de cada materia prima hace falta y cuántos huevos se necesitan." />
          </label>
          <input
            type="number" inputMode="decimal" step="1"
            value={conteo.masas_proyectadas}
            onChange={e => actualizarMasasProyectadas(Number(e.target.value))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
      </Card>

      <div className="sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
      </div>

      {faltantesTotal > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-red-400 px-1">
          <AlertTriangle size={12} /> {faltantesTotal} ítem{faltantesTotal > 1 ? 's' : ''} por debajo de la necesidad
        </p>
      )}

      {/* Bolsaplast */}
      {bolsaplastFiltrado.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
            <Package size={13} /> Bolsaplast <span className="text-[#555]">· consumo semanal fijo</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {bolsaplastFiltrado.map(i => {
              const falta = faltanteBolsaplast(i.metaSemanal, i.cantidad) > 0
              return (
                <div key={i.itemId} className={tileClass(falta)}>
                  <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide leading-tight">{i.nombre}</p>
                  <input
                    type="number" inputMode="decimal" step="1"
                    value={i.cantidad}
                    onChange={e => actualizarCantidadBolsaplast(i.itemId, Number(e.target.value))}
                    className={`${tileInputClass} ${falta ? 'text-red-300' : 'text-[#f0f0f0]'}`}
                  />
                  <p className="text-[10px] text-[#666]">
                    {i.unidad} {i.metaSemanal > 0 ? `· meta ${i.metaSemanal}/sem` : '· según necesidad'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Global — materia prima */}
      {materiaPrimaFiltrada.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
            <Wheat size={13} /> Global — Materias primas <span className="text-[#555]">· en unidades de compra</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {materiaPrimaFiltrada.map(i => {
              const calc = previewMateriaPrima.get(i.materiaPrimaId)
              const falta = (calc?.sugeridoUnidades ?? 0) > 0
              return (
                <div key={i.materiaPrimaId} className={tileClass(falta)}>
                  <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide leading-tight">{i.nombre}</p>
                  <input
                    type="number" inputMode="decimal" step="1"
                    value={i.cantidad}
                    onChange={e => actualizarCantidadMateriaPrima(i.materiaPrimaId, Number(e.target.value))}
                    className={`${tileInputClass} ${falta ? 'text-red-300' : 'text-[#f0f0f0]'}`}
                  />
                  <p className="text-[10px] text-[#666]">
                    {i.unidadCompra} × {i.kgPorUnidad}kg{i.kgPorMasa > 0 ? ` | ${i.kgPorMasa}kg/masa` : ' | stock extra'}
                  </p>
                  {falta && (
                    <p className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                      <AlertTriangle size={10} /> sugerido {calc?.sugeridoUnidades}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Huevos */}
      {!q && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
            <Egg size={13} /> Huevos — Huevo Campo
          </p>
          <Card className="p-4 space-y-3">
            <p className="text-[11px] text-[#666]">
              1 cajón = 12 maples × 30 huevos = 360 u. · Receta: 90 huevos/masa → 1 cajón c/4 masas
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#888] mb-1">Cajones disponibles</label>
                <input
                  type="number" inputMode="decimal" step="1"
                  value={conteo.huevos_cajones_disponibles}
                  onChange={e => actualizarHuevosCajones(Number(e.target.value))}
                  className={`${tileInputClass} ${previewHuevos.cajonesFaltantes > 0 ? 'text-red-300' : 'text-[#f0f0f0]'}`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#888] mb-1">Cajones necesarios</label>
                <div className={`${tileInputClass} flex items-center justify-center text-[#888]`}>{previewHuevos.cajonesNecesarios}</div>
              </div>
            </div>
            {previewHuevos.cajonesFaltantes > 0 && (
              <p className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                <AlertTriangle size={11} /> faltan {previewHuevos.cajonesFaltantes} cajón{previewHuevos.cajonesFaltantes > 1 ? 'es' : ''}
              </p>
            )}
          </Card>
        </div>
      )}

      <button
        onClick={() => setConfirmando(true)}
        className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all"
      >
        <Lock size={16} /> Cerrar conteo y pedir a Compras
      </button>

      <button
        onClick={() => setEliminando(true)}
        className="w-full flex items-center justify-center gap-2 border border-[#2a2a2a] hover:border-red-800 hover:text-red-400 text-[#888] font-semibold text-sm py-2.5 rounded-xl transition-all"
      >
        <Trash2 size={14} /> Eliminar conteo
      </button>

      <div className="space-y-2 pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
          <History size={14} /> Historial de conteos cerrados
        </p>
        {historial.length === 0 ? (
          <p className="text-sm text-[#666] px-1">Todavía no hay conteos cerrados.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {historial.map(c => (
              <button
                key={c.id}
                onClick={() => verDetalle(c)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0]">{formatearFechaCorta(c.semana_desde)} → {formatearFechaCorta(c.semana_hasta)}</p>
                  <p className="text-xs text-[#666] mt-0.5">{c.masas_proyectadas} masas proyectadas</p>
                </div>
                <ChevronRight size={16} className="text-[#666] shrink-0" />
              </button>
            ))}
          </Card>
        )}
      </div>

      <Modal open={confirmando} onClose={() => !cerrando && setConfirmando(false)} title="Cerrar conteo semanal" accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se calcula el sugerido de cada ítem con la proyección actual
          {faltantesTotal > 0 && <> — <span className="text-[#f0f0f0] font-medium">{faltantesTotal} ítem{faltantesTotal > 1 ? 's' : ''}</span> por debajo de la necesidad</>}
          , y se crea una solicitud de compra complementaria para que Compras la revise.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setConfirmando(false)} disabled={cerrando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarCierre} disabled={cerrando} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {cerrando ? 'Cerrando...' : 'Cerrar y pedir'}
          </button>
        </div>
      </Modal>

      <Modal open={eliminando} onClose={() => !borrando && setEliminando(false)} title="Eliminar conteo" accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se borran las cantidades cargadas y se arranca un conteo nuevo desde cero.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setEliminando(false)} disabled={borrando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarEliminar} disabled={borrando} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {borrando ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title={detalle ? `Conteo del ${formatearFechaCorta(detalle.semana_desde)}` : ''} size="lg">
        {!detalleLineas ? (
          <p className="text-sm text-[#888] text-center py-8">Cargando...</p>
        ) : detalleLineas.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Este conteo no generó ninguna línea sugerida.</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a] -mx-6">
            {detalleLineas.map((it, idx) => (
              <div key={idx} className="px-6 py-2.5 flex items-center gap-3">
                <span className="flex-1 text-sm text-[#f0f0f0] truncate">{it.descripcion}</span>
                <span className={`text-xs font-medium shrink-0 ${it.cantidad_sugerida > 0 ? 'text-red-400' : 'text-[#56d68a]'}`}>
                  sugerido {it.cantidad_sugerida} {it.unidad}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
