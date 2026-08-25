'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Snowflake, Repeat, Trash2, Pencil, ArrowRight, Save, X as XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import SelectorDia from '@/components/fabrica/SelectorDia'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import InputNumero from '@/components/ui/InputNumero'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface Parametro {
  id: string
  nombre: string
}

export interface Congelado {
  id: string
  fecha: string
  tamanioId: string
  saborId: string
  presentacionId: string
  presentacionNombre: string
  cantidadKg: number
  operarioId: string | null
  operarioNombre: string | null
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

export default function CongeladosClient({
  dia,
  hoy,
  ayer,
  sabores,
  tamanios,
  presentaciones,
  operarios,
  congeladosIniciales,
}: {
  dia: string
  hoy: string
  ayer: string
  sabores: Parametro[]
  tamanios: Parametro[]
  presentaciones: Parametro[]
  operarios: Parametro[]
  congeladosIniciales: Congelado[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [congelados, setCongelados] = useState(congeladosIniciales)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tamanioId, setTamanioId] = useState(tamanios[0]?.id ?? '')
  const [saborId, setSaborId] = useState(sabores[0]?.id ?? '')
  const [presentacionId, setPresentacionId] = useState(presentaciones[0]?.id ?? '')
  const [cantidadKg, setCantidadKg] = useState(0)
  const [operarioId, setOperarioId] = useState(operarios[0]?.id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState<Congelado | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const nombreTamanio = (id: string) => tamanios.find(t => t.id === id)?.nombre ?? '—'
  const nombreSabor = (id: string) => sabores.find(s => s.id === id)?.nombre ?? '—'

  function resetFormulario() {
    setEditingId(null)
    setTamanioId(tamanios[0]?.id ?? '')
    setSaborId(sabores[0]?.id ?? '')
    setPresentacionId(presentaciones[0]?.id ?? '')
    setCantidadKg(0)
    setOperarioId(operarios[0]?.id ?? '')
  }

  function cargarParaEditar(c: Congelado) {
    setEditingId(c.id)
    setTamanioId(c.tamanioId)
    setSaborId(c.saborId)
    setPresentacionId(c.presentacionId)
    setCantidadKg(c.cantidadKg)
    setOperarioId(c.operarioId ?? operarios[0]?.id ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function repetirUltima() {
    const ultima = congelados[0]
    if (!ultima) return
    setEditingId(null)
    setTamanioId(ultima.tamanioId)
    setSaborId(ultima.saborId)
    setPresentacionId(ultima.presentacionId)
    setCantidadKg(ultima.cantidadKg)
    setOperarioId(ultima.operarioId ?? operarios[0]?.id ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.success('Carga duplicada — revisá y guardá')
  }

  async function guardar() {
    if (!operarioId) {
      toast.error('Elegí un operario')
      return
    }
    if (!cantidadKg || cantidadKg <= 0) {
      toast.error('La cantidad debe ser mayor a cero')
      return
    }
    setGuardando(true)

    const { data: id, error } = await supabase.rpc('guardar_congelado_fabrica', {
      p_id: editingId,
      p_fecha: dia,
      p_tamanio_id: tamanioId,
      p_sabor_id: saborId,
      p_presentacion_id: presentacionId,
      p_cantidad_kg: cantidadKg,
      p_operario_fabrica_id: operarioId,
    })

    if (error) {
      toast.error(error.message || 'No se pudo guardar el congelado')
      setGuardando(false)
      return
    }

    const nuevaEntrada: Congelado = {
      id,
      fecha: dia,
      tamanioId,
      saborId,
      presentacionId,
      presentacionNombre: presentaciones.find(p => p.id === presentacionId)?.nombre ?? '—',
      cantidadKg,
      operarioId,
      operarioNombre: operarios.find(o => o.id === operarioId)?.nombre ?? null,
    }

    setCongelados(prev => editingId ? prev.map(c => c.id === editingId ? nuevaEntrada : c) : [nuevaEntrada, ...prev])
    toast.success(editingId ? 'Carga actualizada' : 'Carga guardada')
    resetFormulario()
    setGuardando(false)
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    const { error } = await supabase.rpc('eliminar_congelado_fabrica', { p_id: aEliminar.id })
    if (error) {
      toast.error(error.message || 'No se pudo eliminar')
      setEliminando(false)
      return
    }
    setCongelados(prev => prev.filter(c => c.id !== aEliminar.id))
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
            <Snowflake size={20} className="text-[#e8c547]" /> Congelados
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

      <div className="sticky top-0 z-10 bg-[#0a0a0a] py-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <SelectorDia dia={dia} hoy={hoy} ayer={ayer} />
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <p className="text-xs text-[#888] mb-1.5">Tamaño</p>
          <div className="flex gap-2">
            {tamanios.map(t => (
              <Chip key={t.id} active={tamanioId === t.id} onClick={() => setTamanioId(t.id)}>{t.nombre}</Chip>
            ))}
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
          <p className="text-xs text-[#888] mb-1.5">Presentación</p>
          <div className="flex flex-wrap gap-2">
            {presentaciones.map(p => (
              <Chip key={p.id} active={presentacionId === p.id} onClick={() => setPresentacionId(p.id)}>{p.nombre}</Chip>
            ))}
          </div>
        </div>

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
          <p className="text-xs text-[#888] mb-1.5">Operario</p>
          <div className="flex flex-wrap gap-2">
            {operarios.map(o => (
              <Chip key={o.id} active={operarioId === o.id} onClick={() => setOperarioId(o.id)}>{o.nombre}</Chip>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        {!editingId && congelados.length > 0 && (
          <button
            onClick={repetirUltima}
            className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-semibold text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] transition-colors"
          >
            <Repeat size={15} /> Repetir última
          </button>
        )}
        <button
          onClick={guardar}
          disabled={guardando || !operarioId}
          className="flex-1 flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3.5 rounded-xl transition-all disabled:opacity-40"
        >
          <Save size={16} /> {guardando ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar carga'}
        </button>
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">
            {congelados.length} carga{congelados.length !== 1 ? 's' : ''} · {dia === hoy ? 'hoy' : dia === ayer ? 'ayer' : dia}
          </p>
          <Link
            href="/fabrica/registro/produccion"
            className="flex items-center gap-1 text-[11px] font-medium text-[#888] hover:text-[#e8c547] transition-colors shrink-0"
          >
            Ver producción <ArrowRight size={11} />
          </Link>
        </div>
        {congelados.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Todavía no hay congelados cargados este día.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {congelados.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0] font-medium flex items-center gap-1.5">
                    <Snowflake size={13} className="text-[#666]" />
                    {nombreTamanio(c.tamanioId)} · {nombreSabor(c.saborId)}
                  </p>
                  <p className="text-xs text-[#666] mt-0.5">
                    {c.cantidadKg} kg · {c.presentacionNombre}
                    {c.operarioNombre && <> · {c.operarioNombre}</>}
                  </p>
                </div>
                <button
                  onClick={() => cargarParaEditar(c)}
                  aria-label="Editar"
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-[#666] hover:text-[#e8c547] rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setAEliminar(c)}
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
          Se borra este congelado. No se puede deshacer.
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
