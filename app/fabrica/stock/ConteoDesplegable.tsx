'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, TrendingUp, AlertTriangle, Trash2, TriangleAlert, PackagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcularNecesidadYSugerido, calcularSobrestock, type ModoCalculo, type Redondeo } from '@/lib/fabrica/calculoSugerido'
import { formatearNumero } from '@/lib/formato'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import Collapsible from '@/components/ui/Collapsible'
import { useToasts, ToastStack } from '@/components/ui/Toast'
import { mensajeError } from '@/lib/errores'

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
  /** Fábrica ya cargó la cantidad. Sin contar = al cerrar toma el stock del sistema (A1). */
  contado: boolean
  /** Tope opcional de los insumos de reposición a demanda (unidades de compra). */
  stockMaximo: number | null
  /** Marca "Se pide a demanda" del insumo (compras_items.a_demanda). */
  aDemanda: boolean
}

export interface ConteoBorrador {
  id: string
  fecha: string
  semana_desde: string
  semana_hasta: string
  masas_proyectadas: number
  estado: 'borrador' | 'cerrado' | 'descartado'
}

export interface ConteoRechazo {
  motivoDescarte: string | null
  descartadoEn: string
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
  rechazo: ConteoRechazo | null
}

function formatearFechaConTurno(fecha: string, turno: 'manana' | 'tarde') {
  const d = new Date(fecha + 'T00:00:00')
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia} ${dd}/${mm} (${turno === 'tarde' ? 'tarde' : 'mañana'})`
}

type TonoTile = 'falta' | 'sobra' | 'normal'

function tileClass(tono: TonoTile) {
  return `rounded-xl border p-3 space-y-1.5 transition-colors ${
    tono === 'falta' ? 'border-red-800 bg-red-950/20'
      : tono === 'sobra' ? 'border-warning bg-warning-bg'
      : 'border-[#2a2a2a] bg-[#111111]'
  }`
}

const tileInputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:border-[#e8c547] transition-colors"

export default function ConteoDesplegable({ definicion, umbralSobrestock }: { definicion: DefinicionConDatos; umbralSobrestock: number }) {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToasts()

  const [conteo, setConteo] = useState(definicion.conteo)
  const [items, setItems] = useState(definicion.items)
  const [historial] = useState(definicion.historial)
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle')
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Guardados programados (debounce) y en vuelo: "Cerrar" espera a que terminen,
  // así lo último que se cargó entra al cierre y no queda "sin contar".
  const programados = useRef(new Map<string, () => Promise<boolean>>())
  const enVuelo = useRef(new Set<Promise<boolean>>())
  const [pendientes, setPendientes] = useState(0)

  const hoyIso = new Date().getDay() || 7
  const esHoy = hoyIso === definicion.diaSemana
  const cerradoEstaSemana = historial[0]?.semana_desde === conteo.semana_desde
  const rechazoPendiente = !cerradoEstaSemana ? definicion.rechazo : null

  function debounced(key: string, fn: () => Promise<boolean>) {
    if (timers.current[key]) clearTimeout(timers.current[key])
    else setPendientes(n => n + 1)
    programados.current.set(key, fn)
    timers.current[key] = setTimeout(() => { correr(key) }, 500)
  }

  function correr(key: string): Promise<boolean> {
    const fn = programados.current.get(key)
    clearTimeout(timers.current[key])
    delete timers.current[key]
    programados.current.delete(key)
    if (!fn) return Promise.resolve(true)
    setGuardado('guardando')
    const p = fn().finally(() => {
      enVuelo.current.delete(p)
      setPendientes(n => n - 1)
    })
    enVuelo.current.add(p)
    return p
  }

  /** Corre ya los guardados programados y espera los que están en vuelo. */
  async function guardarTodo(): Promise<boolean> {
    for (const key of [...programados.current.keys()]) correr(key)
    const resultados = await Promise.all([...enVuelo.current])
    return resultados.every(Boolean)
  }

  async function actualizarMasasProyectadas(valor: number) {
    setConteo(prev => ({ ...prev, masas_proyectadas: valor }))
    setGuardado('guardando')
    const { error } = await supabase.from('fabrica_conteos').update({ masas_proyectadas: valor }).eq('id', conteo.id)
    if (error) {
      setGuardado('error')
      toast.error('No se pudo guardar la proyección')
    } else {
      setGuardado('guardado')
    }
  }

  // A1: el conteo guarda solo lo contado — no toca el stock. Compras compara
  // con el sistema al cerrar y decide. null = el campo quedó vacío ("Sin contar").
  function actualizarCantidad(conteoItemId: string, valor: number | null) {
    setItems(prev => prev.map(i => i.conteoItemId === conteoItemId ? { ...i, cantidad: valor ?? 0, contado: valor != null } : i))
    debounced(conteoItemId, async () => {
      const { error } = await supabase.rpc('fabrica_guardar_cantidad_conteo', {
        p_conteo_item_id: conteoItemId,
        ...(valor != null ? { p_cantidad: valor } : {}),
      })
      if (error) {
        setGuardado('error')
        toast.error(mensajeError(error, 'No se guardó lo contado'))
        return false
      }
      setGuardado('guardado')
      return true
    })
  }

  const contados = items.filter(i => i.contado)
  const sinContar = items.filter(i => !i.contado)

  const preview = useMemo(() => {
    const porItem = new Map(items.filter(i => i.contado).map(i => {
      const catalogo = {
        modoCalculo: i.modoCalculo,
        cantidadPorMasa: i.cantidadPorMasa,
        cantidadPorUnidad: i.cantidadPorUnidad,
        cantidadUnidades: i.cantidad,
        redondeo: i.redondeo,
        meta: i.meta,
        cantidadFija: i.cantidadFija,
      }
      return [i.itemId, {
        ...calcularNecesidadYSugerido(catalogo, conteo.masas_proyectadas),
        ...calcularSobrestock(catalogo, conteo.masas_proyectadas, umbralSobrestock, { aDemanda: i.aDemanda, stockMaximo: i.stockMaximo }),
      }]
    }))
    return porItem
  }, [items, conteo.masas_proyectadas, umbralSobrestock])

  // Solo cuentan los ítems contados: de los demás Fábrica no ve el stock.
  const faltantesTotal = contados.filter(i => (preview.get(i.itemId)?.sugeridoUnidades ?? 0) > 0).length
  // Lo que se le va a avisar a Compras al cerrar (mismo cálculo que el RPC).
  const sobrantes = contados.filter(i => preview.get(i.itemId)?.sobrestock)

  async function confirmarCierre() {
    setCerrando(true)
    if (!(await guardarTodo())) {
      toast.error('Hay cantidades que no se guardaron: revisalas antes de cerrar.')
      setCerrando(false)
      return
    }
    const { data: solicitudId, error } = await supabase.rpc('cerrar_conteo_fabrica', { p_conteo_id: conteo.id })
    if (error) {
      toast.error(mensajeError(error, 'No se pudo cerrar el conteo'))
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
      toast.error(mensajeError(error, 'No se pudo eliminar el conteo'))
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
      defaultOpen={esHoy || !!rechazoPendiente}
      badge={
        <div className="flex items-center gap-1.5">
          {cerradoEstaSemana && <span className="text-[10px] font-bold text-[#56d68a]">✓ cerrado</span>}
          {sinContar.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#222] text-[#aaa]">
              {sinContar.length} sin contar
            </span>
          )}
          {faltantesTotal > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-950/40 text-red-400" title={`${faltantesTotal} por debajo de la necesidad`}>
              {faltantesTotal}
            </span>
          )}
          {sobrantes.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning-bg text-warning" title={`${sobrantes.length} con sobrestock`}>
              +{sobrantes.length}
            </span>
          )}
        </div>
      }
    >
      <div className="flex items-center justify-end -mt-1">
        <span
          role="status"
          className={`text-[11px] font-medium transition-opacity ${
            guardado === 'idle' ? 'opacity-0' : guardado === 'error' ? 'text-red-400' : 'text-[#56d68a]'
          }`}
        >
          {guardado === 'guardando' ? 'Guardando...' : guardado === 'error' ? 'No se guardó' : '✓ Guardado'}
        </span>
      </div>

      {!esHoy && (
        <p className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          <AlertTriangle size={12} /> Este conteo se hace los {DIA_NOMBRE[definicion.diaSemana]}
        </p>
      )}

      {rechazoPendiente && (
        <p className="flex items-start gap-2 text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2.5">
          <TriangleAlert size={16} className="shrink-0 mt-0.5 text-red-400" />
          <span>
            Compras descartó este conteo. Corregí lo que esté mal y volvé a cerrarlo.
            {rechazoPendiente.motivoDescarte && (
              <span className="block text-red-400/90 mt-0.5">Motivo: {rechazoPendiente.motivoDescarte}</span>
            )}
          </span>
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

      {sobrantes.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning px-1">
          <PackagePlus size={12} /> {sobrantes.length} ítem{sobrantes.length > 1 ? 's' : ''} con sobrestock: se le avisa a Compras al cerrar
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map(i => {
          const calc = preview.get(i.itemId)
          const falta = (calc?.sugeridoUnidades ?? 0) > 0
          const sobra = !!calc?.sobrestock
          return (
            <div key={i.itemId} className={tileClass(falta ? 'falta' : sobra ? 'sobra' : 'normal')}>
              <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide leading-tight">{i.nombre}</p>
              <InputNumero
                placeholder="—"
                min={0}
                ariaLabel={`Cantidad contada de ${i.nombre}`}
                value={i.contado ? i.cantidad : null}
                onChange={v => actualizarCantidad(i.conteoItemId, v)}
                className={`${tileInputClass} ${falta ? 'text-red-300' : 'text-[#f0f0f0]'}`}
              />
              <p className="text-[10px] text-[#666]">
                {i.unidad}
                {i.modoCalculo === 'meta_semanal' && i.meta > 0 && ` · meta ${i.meta}/${PERIODO_ABREV[definicion.periodicidad]}`}
                {i.modoCalculo === 'por_masa' && i.cantidadPorMasa > 0 && ` · ${i.cantidadPorMasa}/masa`}
              </p>
              {!i.contado ? (
                <p className="text-[10px] text-[#888] font-medium">Sin contar</p>
              ) : sobra ? (
                <p className="flex items-center gap-1 text-[10px] text-warning font-semibold">
                  <PackagePlus size={10} /> Sobrestock +{formatearNumero(calc!.exceso!, 1)} {i.unidad}
                </p>
              ) : calc?.aDemanda ? (
                <p className="text-[10px] text-[#888] font-medium">
                  A demanda{i.stockMaximo != null && ` · tope ${formatearNumero(i.stockMaximo, 1)} ${i.unidad}`}
                </p>
              ) : (calc?.necesidad ?? 0) > 0 && (
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
        disabled={pendientes > 0}
        className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all disabled:opacity-50"
      >
        {pendientes > 0
          ? <><Loader2 size={16} className="animate-spin" /> Guardando lo contado…</>
          : <><Lock size={16} /> Cerrar control y pedir a Compras</>}
      </button>

      <Modal open={confirmando} onClose={() => !cerrando && setConfirmando(false)} title={`Cerrar control — ${definicion.nombre}`} accent="red">
        <p className="text-sm text-[#888]">
          Esta acción no se puede deshacer. Se calcula el sugerido de cada ítem con lo cargado
          {faltantesTotal > 0 && <> — <span className="text-[#f0f0f0] font-medium">{faltantesTotal} ítem{faltantesTotal > 1 ? 's' : ''}</span> por debajo de la necesidad</>}
          , y se crea una solicitud de compra complementaria para que Compras la revise.
        </p>
        <p className="mt-2 text-sm text-[#888]">
          Lo que contaste <span className="text-[#f0f0f0] font-medium">no cambia el stock</span>: Compras compara con el sistema y decide.
        </p>
        {sinContar.length > 0 && (
          <p className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#ccc]">
            Quedan {sinContar.length} sin contar ({sinContar.slice(0, 3).map(i => i.nombre).join(', ')}{sinContar.length > 3 ? '…' : ''}): para esos se usa el stock del sistema.
          </p>
        )}
        {sobrantes.length > 0 && (
          <div className="mt-3 rounded-lg border border-warning bg-warning-bg px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <PackagePlus size={14} /> Vas a avisar a Compras que sobran:
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-text">
              {sobrantes.map(i => (
                <li key={i.itemId}>{i.nombre}: +{formatearNumero(preview.get(i.itemId)!.exceso!, 1)} {i.unidad}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2 pt-4">
          <button onClick={() => setConfirmando(false)} disabled={cerrando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarCierre} disabled={cerrando || pendientes > 0} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {cerrando ? 'Cerrando...' : pendientes > 0 ? 'Guardando…' : 'Cerrar y pedir'}
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
