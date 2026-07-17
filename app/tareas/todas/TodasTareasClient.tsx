'use client'

import { useMemo, useState } from 'react'
import { VistaTabla, type PerfilLite } from '../TareasClient'
import { PRIORIDAD_META, ESTADO_META, fmtRelativoFecha, nombrePerfil } from '../helpers'
import type { Tarea } from '@/lib/types'

interface TodasTareasClientProps {
  userId: string
  tareas: Tarea[]
  perfiles: PerfilLite[]
}

export default function TodasTareasClient({ userId, tareas, perfiles }: TodasTareasClientProps) {
  const [filtroAsignador, setFiltroAsignador] = useState('')
  const [filtroReceptor, setFiltroReceptor] = useState('')
  const [detalle, setDetalle] = useState<Tarea | null>(null)

  const filtradas = useMemo(() => tareas.filter(t =>
    (!filtroAsignador || t.creado_por === filtroAsignador) &&
    (!filtroReceptor || (Array.isArray(t.asignado_a) && t.asignado_a.includes(filtroReceptor)))
  ), [tareas, filtroAsignador, filtroReceptor])

  const selectClass = 'bg-[#111111] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-[#f0f0f0]'

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-5">
      <div className="flex items-baseline gap-2.5 flex-wrap mb-1">
        <h1 className="font-['Syne'] text-2xl font-extrabold text-[#f0f0f0] m-0">Todas las tareas</h1>
        <p className="text-sm text-[#888] m-0">{filtradas.length} de {tareas.length}</p>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap items-center">
        <select className={selectClass} value={filtroAsignador} onChange={e => setFiltroAsignador(e.target.value)}>
          <option value="">Asignado por: todos</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        <select className={selectClass} value={filtroReceptor} onChange={e => setFiltroReceptor(e.target.value)}>
          <option value="">Asignado a: todos</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        {(filtroAsignador || filtroReceptor) && (
          <button
            onClick={() => { setFiltroAsignador(''); setFiltroReceptor('') }}
            className="text-xs text-[#888] hover:text-[#e8c547] bg-transparent border-none cursor-pointer"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      <div className="mt-4">
        <VistaTabla
          tareas={filtradas}
          userId={userId}
          perfiles={perfiles}
          puedeCrear={false}
          onEditar={t => setDetalle(t)}
          onCambiarEstado={() => {}}
          onEliminar={() => {}}
        />
      </div>

      {detalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDetalle(null)}>
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl max-w-[480px] w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-[#f0f0f0] m-0">{detalle.titulo}</h2>
              <button onClick={() => setDetalle(null)} className="bg-transparent border-none text-[#888] cursor-pointer text-lg">✕</button>
            </div>

            <div className="flex gap-2 mt-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: PRIORIDAD_META[detalle.prioridad].bg, color: PRIORIDAD_META[detalle.prioridad].color }}>
                {PRIORIDAD_META[detalle.prioridad].label.toUpperCase()}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ESTADO_META[detalle.estado].bg, color: ESTADO_META[detalle.estado].color }}>
                {ESTADO_META[detalle.estado].label}
              </span>
            </div>

            {detalle.descripcion && <p className="text-sm text-[#ccc] mt-3">{detalle.descripcion}</p>}

            <div className="text-xs text-[#888] mt-4 flex flex-col gap-1">
              <div>Vence: {detalle.fecha_limite ? fmtRelativoFecha(detalle.fecha_limite) : '—'}</div>
              <div>Creada por: {nombrePerfil(detalle.creado_por, perfiles)}</div>
              <div>Asignada a: {detalle.asignado_a?.length ? detalle.asignado_a.map(id => nombrePerfil(id, perfiles)).join(', ') : '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
