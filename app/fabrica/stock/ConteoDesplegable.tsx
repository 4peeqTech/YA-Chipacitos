'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularNecesidadYSugerido, type ModoCalculo, type Redondeo } from '@/lib/fabrica/calculoSugerido'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import Collapsible from '@/components/ui/Collapsible'
import { useToasts, ToastStack } from '@/components/ui/Toast'

const DIA_NOMBRE = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const PERIODO_ABREV = { semanal: 'sem', quincenal: 'quinc', mensual: 'mes' } as const

export interface ItemConteoUI {
  conteoItemId: string
  itemId: string
  nombre: string
  unidad: string
  cantidadPorUnidad: number
  cantidadPorMasa: number
  redondeo: Redondeo
  modoCalculo: ModoCalculo
  meta: number
  cantidadFija: number
  cantidad: number
}

export interface ConteoBorrador {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number
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

export interface DefinicionConDatos {
  id: string
  nombre: string
  icono: string | null
  diaSemana: number
  pideMasas: boolean
  periodicidad: 'semanal' | 'quincenal' | 'mensual'
  desdeTurno: 'manana' | 'tarde'
  hastaTurno: 'manana' | 'tarde'
  conteo: ConteoBorrador
  items: ItemConteoUI[]
  historial: ConteoHistorial[]
}

function formatearFechaConTurno(fecha: string, turno: 'manana' | 'tarde') {
  const d = new Date(fecha + 'T00:00:00')
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia} ${dd}/${mm} (${turno === 'tarde' ? 'tarde' : 'mañana'})`
}

function tileClass(falta: boolean) {
  return `rounded-xl border p-3 space-y-1.5 transition-colors ${
    falta ? 'border-red-800 bg-red-950/20' : 'border-[#2a2a2a] bg-[#111111]'
  }`
}

const tileInputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:border-[#e8c547] transition-colors"

export default function ConteoDesplegable({ definicion, usuarioId }: { definicion: DefinicionConDatos; usuarioId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [conteo, setConteo] = useState(definicion.conteo)
  const [items, setItems] = useState(definicion.items)
  const [historial] = useState(definicion.historial)
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const hoyIso = new Date().getDay() || 7
  const esHoy = hoyIso === definicion.diaSemana
  const cerradoEstaSemana = historial[0]?.semana_desde === conteo.semana_desde

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

  // Persistencia uniforme para cualquier ítem, sin importar su modo de
  // cálculo: stock persistente en compras_stock_actual (+ movimiento) y
  // espejo en fabrica_conteo_items.cantidad para el snapshot del cierre.
  function actualizarCantidad(itemId: string, conteoItemId: string, cantidad: number) {
    const anterior = items.find(i => i.itemId === itemId)?.cantidad ?? 0
    setItems(prev => prev.map(i => i.itemId === itemId ? { ...i, cantidad } : i))
    debounced(itemId, async () => {
      const delta = cantidad - anterior
      const { error: errStock } = await supabase.from('compras_stock_actual').upsert(
        { item_id: itemId, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
        { onConflict: 'item_id' }
      )
      if (errStock) { toast.error('No se pudo guardar el stock'); return }
      if (delta !== 0) {
        await supabase.from('compras_stock_movimientos').insert(
          { item_id: itemId, delta, tipo: 'ajuste_manual', creado_por: usuarioId }
        )
      }
      const { error: errItem } = await supabase.from('fabrica_conteo_items').update({ cantidad }).eq('id', conteoItemId)
      if (errItem) toast.error('No se pudo guardar la cantidad del conteo')
    })
  }

  const preview = useMemo(() => {
    const porItem = new Map(items.map(i => [i.itemId, calcularNecesidadYSugerido(
      {
        modoCalculo: i.modoCalculo,
        cantidadPorMasa: i.cantidadPorMasa,
        cantidadPorUnidad: i.cantidadPorUnidad,
        cantidadUnidades: i.cantidad,
        redondeo: i.redondeo,
        meta: i.meta,
        cantidadFija: i.cantidadFija,
      },
      conteo.masas_proyectadas
    )]))
    return porItem
  }, [items, conteo.masas_proyectadas])

  const faltantesTotal = items.filter(i => (preview.get(i.itemId)?.sugeridoUnidades ?? 0) > 0).length

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

  return (
    <Collapsible
      titulo={definicion.nombre}
      subtitulo={`Se hace los ${DIA_NOMBRE[definicion.diaSemana]}`}
      icono={definicion.icono ?? undefined}
      defaultOpen={esHoy}
      badge={
        <div className="flex items-center gap-1.5">
          {cerradoEstaSemana && <span className="text-[10px] font-bold text-[#56d68a]">✓ cerrado</span>}
          {faltantesTotal > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-950/40 text-red-400">
              {faltantesTotal}
            </span>
          )}
        </div>
      }
    >
      <div className="flex items-center justify-end -mt-1">
        <span className={`text-[11px] font-medium transition-opacity ${guardado === 'idle' ? 'opacity-0' : 'text-[#56d68a]'}`}>
          {guardado === 'guardando' ? 'Guardando...' : '✓ Guardado'}
        </span>
      </div>

      {!esHoy && (
        <p className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          <AlertTriangle size={12} /> Este conteo se hace los {DIA_NOMBRE[definicion.diaSemana]}
        </p>
      )}

      {definicion.pideMasas && (
        <Card className="p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#e8c547] uppercase tracking-wider">
            <TrendingUp size={14} /> Proyección {formatearFechaConTurno(conteo.semana_desde, definicion.desdeTurno)} → {formatearFechaConTurno(conteo.semana_hasta, definicion.hastaTurno)}
          </p>
          <div>
            <label className="flex items-center text-xs text-[#888] mb-1">
              Masas proyectadas esta semana
              <HelpTooltip text="Cuántas masas (batches de producción) proyectás hacer en esta ventana. Define cuánto de cada insumo hace falta." />
            </label>
            <InputNumero
              placeholder="0"
              value={conteo.masas_proyectadas === 0 ? null : conteo.masas_proyectadas}
              onChange={v => actualizarMasasProyectadas(v ?? 0)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
            />
          </div>
        </Card>
      )}

      {faltantesTotal > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-red-400 px-1">
          <AlertTriangle size={12} /> {faltantesTotal} ítem{faltantesTotal > 1 ? 's' : ''} por debajo de la necesidad
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map(i => {
          const calc = preview.get(i.itemId)
          const falta = (calc?.sugeridoUnidades ?? 0) > 0
          return (
            <div key={i.itemId} className={tileClass(falta)}>
              <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide leading-tight">{i.nombre}</p>
              <InputNumero
                placeholder="0"
                value={i.cantidad === 0 ? null : i.cantidad}
                onChange={v => actualizarCantidad(i.itemId, i.conteoItemId, v ?? 0)}
                className={`${tileInputClass} ${falta ? 'text-red-300' : 'text-[#f0f0f0]'}`}
              />
              <p className="text-[10px] text-[#666]">
                {i.unidad}
                {i.modoCalculo === 'meta_semanal' && i.meta > 0 && ` · meta ${i.meta}/${PERIODO_ABREV[definicion.periodicidad]}`}
                {i.modoCalculo === 'por_masa' && i.cantidadPorMasa > 0 && ` · ${i.cantidadPorMasa}/masa`}
              </p>
              {(calc?.necesidad ?? 0) > 0 && (
                falta ? (
                  <p className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                    <AlertTriangle size={10} /> sugerido {calc?.sugeridoUnidades}
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-[10px] text-[#56d68a] font-medium">
                    ✓ cubre con stock actual
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => setConfirmando(true)}
        className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all"
      >
        <Lock size={16} /> Cerrar control y pedir a Compras
      </button>

      <Modal open={confirmando} onClose={() => !cerrando && setConfirmando(false)} title={`Cerrar control — ${definicion.nombre}`} accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se calcula el sugerido de cada ítem con lo cargado
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

      <Modal open={eliminando} onClose={() => !borrando && setEliminando(false)} title={`Eliminar conteo — ${definicion.nombre}`} accent="red">
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

      <div className="flex justify-end pt-1">
        <button
          onClick={() => setEliminando(true)}
          className="flex items-center gap-1 text-xs text-[#666] hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} /> Eliminar conteo
        </button>
      </div>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </Collapsible>
  )
}
