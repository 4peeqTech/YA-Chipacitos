'use client'

import { useState } from 'react'
import { IconEdit, IconPlus } from '@tabler/icons-react'
import type { useToasts } from '@/components/ui/Toast'
import { equipoControlado } from '@/lib/supervision/calculos'
import {
  ESTADOS_EQUIPO, TIPOS_EQUIPO,
  type ControlEquipo, type EquipoSupervision, type LugarSupervision,
} from '@/lib/supervision/tipos'
import { EquipoModal, identificacion } from './EquiposSupervision'
import { FichaMayoristaModal } from './MayoristasSupervision'
import { textoDe } from './ui'

// Piezas de la visita a un cliente mayorista: el control de sus equipos de Ya!
// (alimenta el ítem mq1) y los atajos para corregir la ficha o registrar un
// equipo sin salir de la visita.

type Toast = ReturnType<typeof useToasts>

/** Sí / No con botones de 44 px. */
function SiNo({ etiqueta, valor, onCambiar, deshabilitado }: {
  etiqueta: string
  valor: boolean | undefined
  onCambiar: (v: boolean) => void
  deshabilitado?: boolean
}) {
  return (
    <div role="group" aria-label={etiqueta} className="space-y-1">
      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{etiqueta}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {[true, false].map(v => (
          <button key={String(v)} type="button" aria-pressed={valor === v} disabled={deshabilitado} onClick={() => onCambiar(v)}
            className={`min-h-[44px] rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40 ${
              valor === v ? (v ? 'border-success bg-success text-black' : 'border-brand-red bg-brand-red text-white') : 'border-border text-muted hover:text-text'
            }`}>
            {v ? 'Sí' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ControlEquipos({ equipos, control, editable, onCambiar }: {
  equipos: EquipoSupervision[]
  control: Record<string, ControlEquipo>
  editable: boolean
  onCambiar: (equipoId: string, cambios: ControlEquipo) => void
}) {
  if (!equipos.length) return <p className="text-sm text-muted">El cliente no tiene equipos de Ya! en uso.</p>
  return (
    <ul className="space-y-3">
      {equipos.map(e => {
        const c = control[e.id] ?? {}
        const listo = equipoControlado(c)
        return (
          <li key={e.id} className={`space-y-2.5 rounded-xl border p-3 ${listo ? 'border-border' : 'border-warning/50'}`}>
            <div>
              <p className="text-sm font-bold text-text">{textoDe(TIPOS_EQUIPO, e.tipo)}{e.marca_modelo && <span className="font-normal text-muted"> · {e.marca_modelo}</span>}</p>
              <p className="text-xs text-muted">{identificacion(e)}</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <SiNo etiqueta="Está en el local" valor={c.presente} deshabilitado={!editable}
                onCambiar={v => onCambiar(e.id, v ? { presente: true } : { presente: false, coincide: undefined, estado: undefined })} />
              <SiNo etiqueta="Coincide el número" valor={c.coincide} deshabilitado={!editable || c.presente !== true}
                onCambiar={v => onCambiar(e.id, { coincide: v })} />
              <div role="group" aria-label="Estado" className="space-y-1">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Estado</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {ESTADOS_EQUIPO.map(s => (
                    <button key={s.valor} type="button" aria-pressed={c.estado === s.valor} disabled={!editable || c.presente !== true}
                      onClick={() => onCambiar(e.id, { estado: s.valor })}
                      className={`min-h-[44px] rounded-xl border px-1 text-sm font-semibold transition-colors disabled:opacity-40 ${
                        c.estado === s.valor
                          ? s.valor === 'bueno' ? 'border-success bg-success text-black' : s.valor === 'malo' ? 'border-brand-red bg-brand-red text-white' : 'border-accent bg-accent text-black'
                          : 'border-border text-muted hover:text-text'
                      }`}>
                      {s.texto}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <input value={c.obs ?? ''} disabled={!editable} onChange={ev => onCambiar(e.id, { obs: ev.target.value })}
              placeholder="Observación (opcional)" aria-label="Observación del equipo"
              className="min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
          </li>
        )
      })}
    </ul>
  )
}

/** "Editar ficha" y "Agregar equipo": cambian los ítems de la visita en curso. */
export function AccionesMayorista({ cliente, onFicha, onEquipo, toast }: {
  cliente: LugarSupervision
  onFicha: (l: LugarSupervision) => void
  onEquipo: (e: EquipoSupervision) => void
  toast: Toast
}) {
  const [ficha, setFicha] = useState(false)
  const [equipo, setEquipo] = useState(false)
  const boton = 'inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-muted hover:border-accent hover:text-accent'
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setFicha(true)} className={boton}><IconEdit size={14} aria-hidden /> Editar ficha</button>
        <button type="button" onClick={() => setEquipo(true)} className={boton}><IconPlus size={14} aria-hidden /> Agregar equipo</button>
      </div>
      <FichaMayoristaModal abierto={ficha} cliente={cliente} onCerrar={() => setFicha(false)} onGuardado={onFicha} toast={toast} />
      <EquipoModal abierto={equipo} equipo={null} clientes={[cliente]} clienteFijo={cliente.id}
        onCerrar={() => setEquipo(false)} onGuardado={onEquipo} toast={toast} />
    </>
  )
}
