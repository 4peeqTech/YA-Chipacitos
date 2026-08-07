'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Factory, Repeat, Trash2, Pencil, ArrowRight,
  Package, Snowflake, Save, X as XIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { masaDesdeFecula } from '@/lib/fabrica/rendimiento'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface Parametro {
  id: string
  nombre: string
}

export type Destino = 'masa_locales' | 'congelado_embolsado'
export type Turno = 'manana' | 'tarde'

export interface ProduccionTurno {
  id: string
  fecha: string
  turno: Turno
  feculaKg: number
  masaKg: number
  saborId: string
  saborNombre: string
  destino: Destino
  tamanioId: string | null
  tamanioNombre: string | null
}

function turnoActualPorHora(): Turno {
  return new Date().getHours() < 13 ? 'manana' : 'tarde'
}

const chipBase = 'px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border'
const chipActive = 'bg-[#e8c547] text-black border-[#e8c547]'
const chipInactive = 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${chipBase} ${active ? chipActive : chipInactive}`}>
      {children}
    </button>
  )
}

const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"

export default function ProduccionClient({
  hoy,
  ayer,
  sabores,
  tamanios,
  rendimientoMasa,
  produccionesIniciales,
}: {
  hoy: string
  ayer: string
  sabores: Parametro[]
  tamanios: Parametro[]
  rendimientoMasa: number
  produccionesIniciales: ProduccionTurno[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [producciones, setProducciones] = useState(produccionesIniciales)
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy)
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno>(turnoActualPorHora())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saborId, setSaborId] = useState(sabores[0]?.id ?? '')
  const [destino, setDestino] = useState<Destino>('masa_locales')
  const [feculaKg, setFeculaKg] = useState(0)
  const [masaKg, setMasaKg] = useState(0)
  const [masaTocada, setMasaTocada] = useState(false)
  const [tamanioId, setTamanioId] = useState(tamanios[0]?.id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState<ProduccionTurno | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const listaTurno = useMemo(
    () => producciones.filter(p => p.fecha === diaSeleccionado && p.turno === turnoSeleccionado),
    [producciones, diaSeleccionado, turnoSeleccionado]
  )

  const hayCongeladoEnLista = useMemo(() => listaTurno.some(p => p.destino === 'congelado_embolsado'), [listaTurno])

  function resetFormulario() {
    setEditingId(null)
    setSaborId(sabores[0]?.id ?? '')
    setDestino('masa_locales')
    setFeculaKg(0)
    setMasaKg(0)
    setMasaTocada(false)
    setTamanioId(tamanios[0]?.id ?? '')
  }

  function onFeculaChange(valor: number) {
    setFeculaKg(valor)
    if (!masaTocada) setMasaKg(masaDesdeFecula(valor, rendimientoMasa))
  }

  function onMasaChange(valor: number) {
    setMasaKg(valor)
    setMasaTocada(true)
  }

  function cargarParaEditar(p: ProduccionTurno) {
    setEditingId(p.id)
    setDiaSeleccionado(p.fecha)
    setTurnoSeleccionado(p.turno)
    setSaborId(p.saborId)
    setDestino(p.destino)
    setFeculaKg(p.feculaKg)
    setMasaKg(p.masaKg)
    setMasaTocada(true)
    setTamanioId(p.tamanioId ?? tamanios[0]?.id ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function repetirUltima() {
    const ultima = listaTurno[0]
    if (!ultima) return
    setEditingId(null)
    setSaborId(ultima.saborId)
    setDestino(ultima.destino)
    setFeculaKg(ultima.feculaKg)
    setMasaKg(ultima.masaKg)
    setMasaTocada(true)
    setTamanioId(ultima.tamanioId ?? tamanios[0]?.id ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.success('Carga duplicada — revisá y guardá')
  }

  async function guardar() {
    if (destino === 'congelado_embolsado' && !tamanioId) {
      toast.error('Elegí un tamaño para el congelado')
      return
    }
    setGuardando(true)

    const { data: id, error } = await supabase.rpc('guardar_produccion_fabrica', {
      p_id: editingId,
      p_fecha: diaSeleccionado,
      p_turno: turnoSeleccionado,
      p_sabor_id: saborId,
      p_destino: destino,
      p_fecula_kg: feculaKg,
      p_masa_kg: masaKg,
      p_tamanio_id: destino === 'congelado_embolsado' ? tamanioId : null,
    })

    if (error) {
      toast.error(error.message || 'No se pudo guardar la producción')
      setGuardando(false)
      return
    }

    const saborNombre = sabores.find(s => s.id === saborId)?.nombre ?? '—'
    const tamanioNombre = destino === 'congelado_embolsado' ? (tamanios.find(t => t.id === tamanioId)?.nombre ?? null) : null
    const nuevaEntrada: ProduccionTurno = {
      id,
      fecha: diaSeleccionado,
      turno: turnoSeleccionado,
      feculaKg,
      masaKg,
      saborId,
      saborNombre,
      destino,
      tamanioId: destino === 'congelado_embolsado' ? tamanioId : null,
      tamanioNombre,
    }

    setProducciones(prev => editingId ? prev.map(p => p.id === editingId ? nuevaEntrada : p) : [nuevaEntrada, ...prev])
    toast.success(editingId ? 'Carga actualizada' : 'Carga guardada')
    resetFormulario()
    setGuardando(false)
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    const { error } = await supabase.rpc('eliminar_produccion_fabrica', { p_id: aEliminar.id })
    if (error) {
      toast.error(error.message || 'No se pudo eliminar')
      setEliminando(false)
      return
    }
    setProducciones(prev => prev.filter(p => p.id !== aEliminar.id))
    if (editingId === aEliminar.id) resetFormulario()
    toast.success('Carga eliminada')
    setAEliminar(null)
    setEliminando(false)
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-['Syne'] font-bold text-[#f0f0f0]">
            <Factory size={20} className="text-[#e8c547]" /> Producción
          </h1>
          <p className="text-[#888] text-xs mt-0.5">{editingId ? 'editando carga' : 'nueva carga'}</p>
        </div>
        {editingId && (
          <button
            onClick={resetFormulario}
            className="flex items-center gap-1 text-xs font-medium text-[#888] hover:text-[#f0f0f0] px-2.5 py-1.5 rounded-full border border-[#2a2a2a] transition-colors"
          >
            <XIcon size={12} /> Cancelar
          </button>
        )}
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <p className="text-xs text-[#888] mb-1.5">Día</p>
          <div className="flex gap-2">
            <Chip active={diaSeleccionado === hoy} onClick={() => setDiaSeleccionado(hoy)}>Hoy</Chip>
            <Chip active={diaSeleccionado === ayer} onClick={() => setDiaSeleccionado(ayer)}>Ayer</Chip>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Turno</p>
          <div className="flex gap-2">
            <Chip active={turnoSeleccionado === 'manana'} onClick={() => setTurnoSeleccionado('manana')}>Mañana</Chip>
            <Chip active={turnoSeleccionado === 'tarde'} onClick={() => setTurnoSeleccionado('tarde')}>Tarde</Chip>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Sabor</p>
          <div className="flex flex-wrap gap-2">
            {sabores.map(s => (
              <Chip key={s.id} active={saborId === s.id} onClick={() => setSaborId(s.id)}>{s.nombre}</Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Destino</p>
          <div className="flex gap-2">
            <Chip active={destino === 'masa_locales'} onClick={() => setDestino('masa_locales')}>
              <span className="flex items-center gap-1.5"><Package size={13} /> Masa a locales</span>
            </Chip>
            <Chip active={destino === 'congelado_embolsado'} onClick={() => setDestino('congelado_embolsado')}>
              <span className="flex items-center gap-1.5"><Snowflake size={13} /> Congelado</span>
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#888] mb-1 block">Fécula (kg)</label>
            <input
              type="number" inputMode="decimal" step="0.01" min={0}
              value={feculaKg}
              onChange={e => onFeculaChange(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">Masa (kg)</label>
            <input
              type="number" inputMode="decimal" step="0.01" min={0}
              value={masaKg}
              onChange={e => onMasaChange(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        {destino === 'congelado_embolsado' && (
          <div>
            <p className="text-xs text-[#888] mb-1.5">Tamaño</p>
            <div className="flex gap-2">
              {tamanios.map(t => (
                <Chip key={t.id} active={tamanioId === t.id} onClick={() => setTamanioId(t.id)}>{t.nombre}</Chip>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {!editingId && listaTurno.length > 0 && (
          <button
            onClick={repetirUltima}
            className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-semibold text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] transition-colors"
          >
            <Repeat size={15} /> Repetir última
          </button>
        )}
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex-1 flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all disabled:opacity-40"
        >
          <Save size={16} /> {guardando ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar carga'}
        </button>
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">
            {listaTurno.length} carga{listaTurno.length !== 1 ? 's' : ''} · {diaSeleccionado === hoy ? 'hoy' : 'ayer'} · turno {turnoSeleccionado === 'manana' ? 'mañana' : 'tarde'}
          </p>
          {hayCongeladoEnLista && (
            <Link
              href="/fabrica/embolsado"
              className="flex items-center gap-1 text-[11px] font-medium text-[#888] hover:text-[#e8c547] transition-colors shrink-0"
            >
              Ver embolsado <ArrowRight size={11} />
            </Link>
          )}
        </div>
        {listaTurno.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Todavía no hay cargas en este turno.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {listaTurno.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0] font-medium flex items-center gap-1.5">
                    {p.destino === 'congelado_embolsado' ? <Snowflake size={13} className="text-[#666]" /> : <Package size={13} className="text-[#666]" />}
                    {p.saborNombre}
                  </p>
                  <p className="text-xs text-[#666] mt-0.5">
                    {p.feculaKg} kg fécula → {p.masaKg} kg masa
                    {p.destino === 'congelado_embolsado' && p.tamanioNombre && <> · {p.tamanioNombre}</>}
                  </p>
                </div>
                <button
                  onClick={() => cargarParaEditar(p)}
                  aria-label="Editar"
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-[#666] hover:text-[#e8c547] rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setAEliminar(p)}
                  aria-label="Eliminar"
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-[#666] hover:text-red-400 rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal open={!!aEliminar} onClose={() => !eliminando && setAEliminar(null)} title="Eliminar carga" accent="red">
        <p className="text-sm text-[#888]">
          Se borra esta producción. No se puede deshacer.
        </p>
        <div className="flex gap-2 pt-4">
          <button onClick={() => setAEliminar(null)} disabled={eliminando} className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarEliminar} disabled={eliminando} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
            {eliminando ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
