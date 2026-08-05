'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, History, TrendingUp, AlertTriangle, ChevronRight, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularNecesidadYSugerido, BaseCalculo } from '@/lib/fabrica/calculoSugerido'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface InsumoConteo {
  conteoItemId: string
  itemId: string
  nombre: string
  unidad: string
  orden: number
  categoriaNombre: string
  categoriaOrden: number
  baseCalculo: BaseCalculo
  coeficiente: number | null
  metaSemanal: number
  cantidad: number
}

export interface ConteoBorrador {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  proyeccion_masa_kg: number
  proyeccion_embolsado_kg: number
  estado: 'borrador' | 'cerrado'
}

export interface ConteoHistorial {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  proyeccion_masa_kg: number
  proyeccion_embolsado_kg: number
  cerrado_en: string | null
}

interface DetalleItem {
  cantidad: number
  necesidad: number
  sugerido: number
  compras_items: { nombre: string; unidad: string } | null
}

function formatearFechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function StockClient({
  conteoInicial,
  insumosIniciales,
  historialInicial,
}: {
  conteoInicial: ConteoBorrador
  insumosIniciales: InsumoConteo[]
  historialInicial: ConteoHistorial[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [conteo, setConteo] = useState(conteoInicial)
  const [insumos, setInsumos] = useState(insumosIniciales)
  const [historial] = useState(historialInicial)
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [confirmando, setConfirmando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [detalle, setDetalle] = useState<ConteoHistorial | null>(null)
  const [detalleItems, setDetalleItems] = useState<DetalleItem[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloFaltantes, setSoloFaltantes] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function marcarGuardado() {
    setGuardado('guardando')
    setTimeout(() => setGuardado('guardado'), 300)
  }

  async function actualizarProyeccion(campo: 'proyeccion_masa_kg' | 'proyeccion_embolsado_kg', valor: number) {
    setConteo(prev => ({ ...prev, [campo]: valor }))
    marcarGuardado()
    const { error } = await supabase.from('fabrica_conteos').update({ [campo]: valor }).eq('id', conteo.id)
    if (error) toast.error('No se pudo guardar la proyección')
  }

  function actualizarCantidad(itemId: string, cantidad: number) {
    setInsumos(prev => prev.map(i => i.itemId === itemId ? { ...i, cantidad } : i))

    if (timers.current[itemId]) clearTimeout(timers.current[itemId])
    timers.current[itemId] = setTimeout(async () => {
      const insumo = insumos.find(i => i.itemId === itemId)
      if (!insumo?.conteoItemId) return
      marcarGuardado()
      const { error } = await supabase.from('fabrica_conteo_items').update({ cantidad }).eq('id', insumo.conteoItemId)
      if (error) toast.error('No se pudo guardar la cantidad')
    }, 500)
  }

  const preview = useMemo(() => {
    const porItem = new Map(insumos.map(i => [i.itemId, calcularNecesidadYSugerido(
      { baseCalculo: i.baseCalculo, coeficiente: i.coeficiente, metaSemanal: i.metaSemanal, cantidad: i.cantidad },
      conteo.proyeccion_masa_kg,
      conteo.proyeccion_embolsado_kg
    )]))
    return porItem
  }, [insumos, conteo.proyeccion_masa_kg, conteo.proyeccion_embolsado_kg])

  const faltantes = insumos.filter(i => (preview.get(i.itemId)?.sugerido ?? 0) > 0).length

  const insumosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return insumos.filter(i => {
      const matchBusqueda = !q || i.nombre.toLowerCase().includes(q)
      const matchFaltante = !soloFaltantes || (preview.get(i.itemId)?.sugerido ?? 0) > 0
      return matchBusqueda && matchFaltante
    })
  }, [insumos, busqueda, soloFaltantes, preview])

  const grupos = useMemo(() => {
    const mapa = new Map<string, InsumoConteo[]>()
    for (const i of insumosFiltrados) {
      if (!mapa.has(i.categoriaNombre)) mapa.set(i.categoriaNombre, [])
      mapa.get(i.categoriaNombre)!.push(i)
    }
    return [...mapa.entries()]
  }, [insumosFiltrados])

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

  async function verDetalle(c: ConteoHistorial) {
    setDetalle(c)
    setDetalleItems(null)
    const { data } = await supabase
      .from('fabrica_conteo_items')
      .select('cantidad, necesidad, sugerido, compras_items(nombre, unidad)')
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center text-xs text-[#888] mb-1">
              Kg de masa
              <HelpTooltip text="Cuántos kg de masa proyectás producir desde hoy a la tarde hasta el viernes a la mañana. Define el sugerido de los insumos con base de cálculo 'Kg de masa'." />
            </label>
            <input
              type="number" inputMode="decimal" step="0.01"
              value={conteo.proyeccion_masa_kg}
              onChange={e => actualizarProyeccion('proyeccion_masa_kg', Number(e.target.value))}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
            />
          </div>
          <div>
            <label className="flex items-center text-xs text-[#888] mb-1">
              Kg a embolsar
              <HelpTooltip text="Cuántos kg pensás embolsar (congelado) en el mismo período. Define el sugerido de los insumos con base de cálculo 'Kg embolsado' (por ejemplo, bolsas)." />
            </label>
            <input
              type="number" inputMode="decimal" step="0.01"
              value={conteo.proyeccion_embolsado_kg}
              onChange={e => actualizarProyeccion('proyeccion_embolsado_kg', Number(e.target.value))}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
            />
          </div>
        </div>
      </Card>

      <div className="space-y-2 sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar insumo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {([
            { key: false, label: 'Todos', count: insumos.length },
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

      <div className="space-y-4">
        {grupos.length === 0 && (
          <p className="text-sm text-[#666] text-center py-8">Ningún insumo coincide con la búsqueda.</p>
        )}
        {grupos.map(([categoria, items]) => (
          <div key={categoria} className="space-y-2">
            <p className="text-xs font-semibold text-[#888] uppercase tracking-wider px-1">{categoria}</p>
            <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
              {items.map(i => {
                const calc = preview.get(i.itemId)
                const falta = (calc?.sugerido ?? 0) > 0
                return (
                  <div key={i.itemId} className={`px-4 py-3 flex items-center gap-3 ${falta ? 'bg-red-950/20' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#f0f0f0] font-medium truncate">{i.nombre}</p>
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${falta ? 'text-red-400' : 'text-[#666]'}`}>
                        {falta && <AlertTriangle size={11} />}
                        necesita {calc?.necesidad.toFixed(1)} · sugerido {calc?.sugerido.toFixed(1)} {i.unidad}
                      </p>
                    </div>
                    <input
                      type="number" inputMode="decimal" step="0.01"
                      value={i.cantidad}
                      onChange={e => actualizarCantidad(i.itemId, Number(e.target.value))}
                      className={numberInputClass}
                    />
                  </div>
                )
              })}
            </Card>
          </div>
        ))}
      </div>

      <button
        onClick={() => setConfirmando(true)}
        className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all"
      >
        <Lock size={16} /> Cerrar conteo y pedir a Compras
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
                  <p className="text-xs text-[#666] mt-0.5">{c.proyeccion_masa_kg} kg masa · {c.proyeccion_embolsado_kg} kg embolsado</p>
                </div>
                <ChevronRight size={16} className="text-[#666] shrink-0" />
              </button>
            ))}
          </Card>
        )}
      </div>

      <Modal open={confirmando} onClose={() => !cerrando && setConfirmando(false)} title="Cerrar conteo semanal" accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se calcula el sugerido de cada insumo con la proyección actual
          {faltantes > 0 && <> — <span className="text-[#f0f0f0] font-medium">{faltantes} insumo{faltantes > 1 ? 's' : ''}</span> por debajo de la meta</>}
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

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title={detalle ? `Conteo del ${formatearFechaCorta(detalle.semana_desde)}` : ''} size="lg">
        {!detalleItems ? (
          <p className="text-sm text-[#888] text-center py-8">Cargando...</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a] -mx-6">
            {detalleItems.map((it, idx) => (
              <div key={idx} className="px-6 py-2.5 flex items-center gap-3">
                <span className="flex-1 text-sm text-[#f0f0f0] truncate">{it.compras_items?.nombre ?? '—'}</span>
                <span className="text-xs text-[#666] shrink-0">contado {it.cantidad}</span>
                <span className={`text-xs font-medium shrink-0 ${it.sugerido > 0 ? 'text-red-400' : 'text-[#56d68a]'}`}>
                  sugerido {it.sugerido} {it.compras_items?.unidad}
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
