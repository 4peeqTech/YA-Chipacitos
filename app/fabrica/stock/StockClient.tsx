'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, History, TrendingUp, AlertTriangle, ChevronRight, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularNecesidadYSugerido } from '@/lib/fabrica/calculoSugerido'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface MateriaPrimaConteo {
  conteoItemId: string
  materiaPrimaId: string
  nombre: string
  unidadCompra: string
  kgPorUnidad: number
  coeficiente: number
  cantidad: number
}

export interface ConteoBorrador {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  proyeccion_masa_kg: number
  estado: 'borrador' | 'cerrado'
}

export interface ConteoHistorial {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  proyeccion_masa_kg: number
  cerrado_en: string | null
}

interface DetalleItem {
  cantidad: number
  necesidad: number
  sugerido: number
  fabrica_materia_prima: { nombre: string; unidad_compra: string } | null
}

function formatearFechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function StockClient({
  conteoInicial,
  itemsIniciales,
  historialInicial,
}: {
  conteoInicial: ConteoBorrador
  itemsIniciales: MateriaPrimaConteo[]
  historialInicial: ConteoHistorial[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [conteo, setConteo] = useState(conteoInicial)
  const [items, setItems] = useState(itemsIniciales)
  const [historial] = useState(historialInicial)
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [detalle, setDetalle] = useState<ConteoHistorial | null>(null)
  const [detalleItems, setDetalleItems] = useState<DetalleItem[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloFaltantes, setSoloFaltantes] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function marcarGuardado() {
    setGuardado('guardando')
    setTimeout(() => setGuardado('guardado'), 300)
  }

  async function actualizarProyeccion(valor: number) {
    setConteo(prev => ({ ...prev, proyeccion_masa_kg: valor }))
    marcarGuardado()
    const { error } = await supabase.from('fabrica_conteos').update({ proyeccion_masa_kg: valor }).eq('id', conteo.id)
    if (error) toast.error('No se pudo guardar la proyección')
  }

  function actualizarCantidad(materiaPrimaId: string, cantidad: number) {
    setItems(prev => prev.map(i => i.materiaPrimaId === materiaPrimaId ? { ...i, cantidad } : i))

    if (timers.current[materiaPrimaId]) clearTimeout(timers.current[materiaPrimaId])
    timers.current[materiaPrimaId] = setTimeout(async () => {
      const item = items.find(i => i.materiaPrimaId === materiaPrimaId)
      if (!item?.conteoItemId) return
      marcarGuardado()
      const { error } = await supabase.from('fabrica_conteo_items').update({ cantidad }).eq('id', item.conteoItemId)
      if (error) toast.error('No se pudo guardar la cantidad')
    }, 500)
  }

  const preview = useMemo(() => {
    const porItem = new Map(items.map(i => [i.materiaPrimaId, calcularNecesidadYSugerido(
      { coeficiente: i.coeficiente, kgPorUnidad: i.kgPorUnidad, cantidadUnidades: i.cantidad },
      conteo.proyeccion_masa_kg
    )]))
    return porItem
  }, [items, conteo.proyeccion_masa_kg])

  const faltantes = items.filter(i => (preview.get(i.materiaPrimaId)?.sugeridoUnidades ?? 0) > 0).length

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return items.filter(i => {
      const matchBusqueda = !q || i.nombre.toLowerCase().includes(q)
      const matchFaltante = !soloFaltantes || (preview.get(i.materiaPrimaId)?.sugeridoUnidades ?? 0) > 0
      return matchBusqueda && matchFaltante
    })
  }, [items, busqueda, soloFaltantes, preview])

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
    setDetalleItems(null)
    const { data } = await supabase
      .from('fabrica_conteo_items')
      .select('cantidad, necesidad, sugerido, fabrica_materia_prima(nombre, unidad_compra)')
      .eq('conteo_id', c.id)
      .order('sugerido', { ascending: false })
    setDetalleItems((data as any) || [])
  }

  const numberInputClass = "w-20 shrink-0 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base text-right focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
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
            Kg de masa a producir
            <HelpTooltip text="Cuántos kg de masa proyectás producir desde hoy a la tarde hasta el viernes a la mañana. Define cuánto de cada materia prima hace falta." />
          </label>
          <input
            type="number" inputMode="decimal" step="0.01"
            value={conteo.proyeccion_masa_kg}
            onChange={e => actualizarProyeccion(Number(e.target.value))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
      </Card>

      <div className="space-y-2 sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar materia prima..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {([
            { key: false, label: 'Todos', count: items.length },
            { key: true, label: 'Faltantes', count: faltantes },
          ] as const).map(f => (
            <button
              key={f.label}
              onClick={() => setSoloFaltantes(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                soloFaltantes === f.key ? 'bg-[#e8c547] text-black' : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:text-[#f0f0f0]'
              }`}
            >
              {f.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${soloFaltantes === f.key ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-[#666]'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {itemsFiltrados.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Ninguna materia prima coincide con la búsqueda.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {itemsFiltrados.map(i => {
              const calc = preview.get(i.materiaPrimaId)
              const falta = (calc?.sugeridoUnidades ?? 0) > 0
              return (
                <div key={i.materiaPrimaId} className={`px-4 py-3 flex items-center gap-3 ${falta ? 'bg-red-950/20' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f0f0] font-medium truncate">{i.nombre}</p>
                    <p className={`text-xs mt-0.5 flex items-center gap-1 ${falta ? 'text-red-400' : 'text-[#666]'}`}>
                      {falta && <AlertTriangle size={11} />}
                      necesita {calc?.necesidadKg.toFixed(1)}kg · sugerido {calc?.sugeridoUnidades} {i.unidadCompra}{(calc?.sugeridoUnidades ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <input
                    type="number" inputMode="decimal" step="1"
                    value={i.cantidad}
                    onChange={e => actualizarCantidad(i.materiaPrimaId, Number(e.target.value))}
                    className={numberInputClass}
                  />
                </div>
              )
            })}
          </Card>
        )}
      </div>

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
                  <p className="text-xs text-[#666] mt-0.5">{c.proyeccion_masa_kg} kg de masa</p>
                </div>
                <ChevronRight size={16} className="text-[#666] shrink-0" />
              </button>
            ))}
          </Card>
        )}
      </div>

      <Modal open={confirmando} onClose={() => !cerrando && setConfirmando(false)} title="Cerrar conteo semanal" accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se calcula el sugerido de cada materia prima con la proyección actual
          {faltantes > 0 && <> — <span className="text-[#f0f0f0] font-medium">{faltantes} materia{faltantes > 1 ? 's' : ''} prima</span> por debajo de la necesidad</>}
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
        {!detalleItems ? (
          <p className="text-sm text-[#888] text-center py-8">Cargando...</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a] -mx-6">
            {detalleItems.map((it, idx) => (
              <div key={idx} className="px-6 py-2.5 flex items-center gap-3">
                <span className="flex-1 text-sm text-[#f0f0f0] truncate">{it.fabrica_materia_prima?.nombre ?? '—'}</span>
                <span className="text-xs text-[#666] shrink-0">contado {it.cantidad}</span>
                <span className={`text-xs font-medium shrink-0 ${it.sugerido > 0 ? 'text-red-400' : 'text-[#56d68a]'}`}>
                  sugerido {it.sugerido} {it.fabrica_materia_prima?.unidad_compra}
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
