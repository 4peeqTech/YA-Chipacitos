'use client'

import { useMemo, useState } from 'react'
import { Undo2, Recycle, Trash2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import InputNumero from '@/components/ui/InputNumero'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface Parametro {
  id: string
  nombre: string
}

export type Destino = 'reinsercion' | 'perdida'

export interface DevolucionRegistro {
  id: string
  fecha: string
  cantidadKg: number
  destino: Destino
  notas: string | null
  saborNombre: string
  tamanioNombre: string
  presentacionNombre: string
  motivoNombre: string
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

export default function DevolucionClient({
  hoy,
  ayer,
  sabores,
  tamanios,
  presentaciones,
  motivos,
  devolucionesIniciales,
}: {
  hoy: string
  ayer: string
  sabores: Parametro[]
  tamanios: Parametro[]
  presentaciones: Parametro[]
  motivos: Parametro[]
  devolucionesIniciales: DevolucionRegistro[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [devoluciones, setDevoluciones] = useState(devolucionesIniciales)
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy)
  const [saborId, setSaborId] = useState(sabores[0]?.id ?? '')
  const [tamanioId, setTamanioId] = useState(tamanios[0]?.id ?? '')
  const [presentacionId, setPresentacionId] = useState(presentaciones[0]?.id ?? '')
  const [cantidadKg, setCantidadKg] = useState(0)
  const [motivoId, setMotivoId] = useState(motivos[0]?.id ?? '')
  const [destino, setDestino] = useState<Destino>('reinsercion')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState<DevolucionRegistro | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const listaDia = useMemo(
    () => devoluciones.filter(d => d.fecha === diaSeleccionado),
    [devoluciones, diaSeleccionado]
  )

  function resetFormulario() {
    setSaborId(sabores[0]?.id ?? '')
    setTamanioId(tamanios[0]?.id ?? '')
    setPresentacionId(presentaciones[0]?.id ?? '')
    setCantidadKg(0)
    setMotivoId(motivos[0]?.id ?? '')
    setDestino('reinsercion')
    setNotas('')
  }

  async function guardar() {
    if (!cantidadKg || cantidadKg <= 0) {
      toast.error('Cargá una cantidad mayor a cero')
      return
    }
    setGuardando(true)

    const { data: id, error } = await supabase.rpc('guardar_devolucion_fabrica', {
      p_id: null,
      p_fecha: diaSeleccionado,
      p_sabor_id: saborId,
      p_tamanio_id: tamanioId,
      p_presentacion_id: presentacionId,
      p_cantidad_kg: cantidadKg,
      p_motivo_id: motivoId,
      p_destino: destino,
      p_notas: notas.trim() || null,
    })

    if (error) {
      toast.error(error.message || 'No se pudo guardar la devolución')
      setGuardando(false)
      return
    }

    const nuevaEntrada: DevolucionRegistro = {
      id,
      fecha: diaSeleccionado,
      cantidadKg,
      destino,
      notas: notas.trim() || null,
      saborNombre: sabores.find(s => s.id === saborId)?.nombre ?? '—',
      tamanioNombre: tamanios.find(t => t.id === tamanioId)?.nombre ?? '—',
      presentacionNombre: presentaciones.find(p => p.id === presentacionId)?.nombre ?? '—',
      motivoNombre: motivos.find(m => m.id === motivoId)?.nombre ?? '—',
    }

    setDevoluciones(prev => [nuevaEntrada, ...prev])
    toast.success('Devolución guardada')
    resetFormulario()
    setGuardando(false)
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    const { error } = await supabase.rpc('eliminar_devolucion_fabrica', { p_id: aEliminar.id })
    if (error) {
      toast.error(error.message || 'No se pudo eliminar')
      setEliminando(false)
      return
    }
    setDevoluciones(prev => prev.filter(d => d.id !== aEliminar.id))
    toast.success('Devolución eliminada')
    setAEliminar(null)
    setEliminando(false)
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-['Syne'] font-bold text-[#f0f0f0]">
          <Undo2 size={20} className="text-[#e8c547]" /> Devolución
        </h1>
        <p className="text-[#888] text-xs mt-0.5">Producto devuelto — reinsertá la masa o registrá la pérdida.</p>
      </div>

      <div className="sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#888]">Viendo</span>
          <Chip active={diaSeleccionado === ayer} onClick={() => setDiaSeleccionado(ayer)}>Ayer</Chip>
          <Chip active={diaSeleccionado === hoy} onClick={() => setDiaSeleccionado(hoy)}>Hoy</Chip>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <p className="text-xs text-[#888] mb-1.5">Sabor</p>
          <div className="flex flex-wrap gap-2">
            {sabores.map(s => (
              <Chip key={s.id} active={saborId === s.id} onClick={() => setSaborId(s.id)}>{s.nombre}</Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Tamaño</p>
          <div className="flex flex-wrap gap-2">
            {tamanios.map(t => (
              <Chip key={t.id} active={tamanioId === t.id} onClick={() => setTamanioId(t.id)}>{t.nombre}</Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Presentación</p>
          <div className="flex flex-wrap gap-2">
            {presentaciones.map(p => (
              <Chip key={p.id} active={presentacionId === p.id} onClick={() => setPresentacionId(p.id)}>{p.nombre}</Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#888] mb-1 block">Cantidad (kg)</label>
            <InputNumero
              min={0}
              placeholder="0"
              value={cantidadKg === 0 ? null : cantidadKg}
              onChange={v => setCantidadKg(v ?? 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-1 block">Motivo</label>
            <select
              value={motivoId}
              onChange={e => setMotivoId(e.target.value)}
              className={inputClass}
            >
              {motivos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#888] mb-1.5">Destino</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDestino('reinsercion')}
              className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold border transition-all ${
                destino === 'reinsercion' ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'
              }`}
            >
              <Recycle size={18} /> Reinserción
            </button>
            <button
              type="button"
              onClick={() => setDestino('perdida')}
              className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold border transition-all ${
                destino === 'perdida' ? 'bg-[#e8c547] text-black border-[#e8c547]' : 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'
              }`}
            >
              <Trash2 size={18} /> Pérdida
            </button>
          </div>
          {destino === 'reinsercion' && (
            <p className="text-[11px] text-[#666] mt-1.5">La masa vuelve al pool del día en Embolsado.</p>
          )}
        </div>

        <div>
          <label className="text-xs text-[#888] mb-1 block">Notas (opcional)</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>
      </Card>

      <button
        onClick={guardar}
        disabled={guardando}
        className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all disabled:opacity-40"
      >
        <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar devolución'}
      </button>

      <div className="space-y-2 pt-2">
        <p className="text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
          {listaDia.length} devolución{listaDia.length !== 1 ? 'es' : ''} · {diaSeleccionado === hoy ? 'hoy' : 'ayer'}
        </p>
        {listaDia.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Todavía no hay devoluciones este día.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {listaDia.map(d => (
              <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0] font-medium flex items-center gap-1.5">
                    {d.destino === 'reinsercion' ? <Recycle size={13} className="text-[#666]" /> : <Trash2 size={13} className="text-[#666]" />}
                    {d.tamanioNombre} · {d.saborNombre}
                  </p>
                  <p className="text-xs text-[#666] mt-0.5">
                    {d.cantidadKg} kg · {d.presentacionNombre} · {d.motivoNombre}
                  </p>
                </div>
                <button
                  onClick={() => setAEliminar(d)}
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

      <Modal open={!!aEliminar} onClose={() => !eliminando && setAEliminar(null)} title="Eliminar devolución" accent="red">
        <p className="text-sm text-[#888]">
          Se borra este registro. No se puede deshacer.
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
