'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconCircleCheck, IconPlayerPlay, IconProgress } from '@tabler/icons-react'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { calcularResumen, pendientesDe, ultimaCerrada, visitaEnCurso } from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { CLAVE_SUPERVISOR } from './ui'

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
  nombreUsuario: string
  toast: ReturnType<typeof useToasts>
}

const INPUT = 'w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function NuevaVisita({ sucursales, bloques, visitas, nombreUsuario, toast }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [sucursalId, setSucursalId] = useState<string | null>(null)
  const [supervisor, setSupervisor] = useState(nombreUsuario)
  const [encargado, setEncargado] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    // El último nombre que se escribió en este celular gana sobre el del usuario.
    try { const s = localStorage.getItem(CLAVE_SUPERVISOR); if (s) setSupervisor(s) } catch {} // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  const enCurso = sucursalId ? visitaEnCurso(visitas, sucursalId) : null
  const anterior = sucursalId ? ultimaCerrada(visitas, sucursalId) : null
  const pendientes = useMemo(() => pendientesDe(anterior, bloques), [anterior, bloques])

  // Agrupadas por zona, como en la recorrida.
  const zonas = useMemo(() => {
    const m = new Map<string, SucursalSupervision[]>()
    for (const s of sucursales) m.set(s.zona, [...(m.get(s.zona) ?? []), s])
    return [...m.entries()]
  }, [sucursales])

  async function comenzar() {
    if (!sucursalId) return
    const nombre = supervisor.trim()
    if (!nombre) { toast.error('Escribí el nombre del supervisor.'); return }
    setCreando(true)
    try { localStorage.setItem(CLAVE_SUPERVISOR, nombre) } catch {}
    const id = crypto.randomUUID()
    const { error } = await supabase.from('supervision_visitas').insert({
      id,
      sucursal_id: sucursalId,
      supervisor_nombre: nombre,
      encargado: encargado.trim() || null,
      anterior_id: anterior?.id ?? null,
      anterior_fecha: anterior?.fecha ?? null,
      pendientes_previos: pendientes.ids,
      obs_previas: pendientes.obs,
      resumen: calcularResumen({}, bloques),
    })
    if (error) {
      setCreando(false)
      toast.error(error.code === '42501'
        ? 'Tu usuario no tiene permiso para guardar visitas. Consultá con el administrador.'
        : 'No se pudo empezar la visita. Revisá la conexión y probá de nuevo.')
      return
    }
    router.push(`/admin/supervision/${id}/checklist`)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Elegí la sucursal y completá el checklist recorriendo el local. Las respuestas se guardan solas a medida que avanzás.
      </p>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sucursal</legend>
        {zonas.map(([zona, lista]) => (
          <div key={zona} className="space-y-1.5">
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">{zona}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {lista.map(s => {
                const activa = sucursalId === s.id
                const abierta = visitaEnCurso(visitas, s.id)
                return (
                  <button key={s.id} type="button" aria-pressed={activa} onClick={() => setSucursalId(s.id)}
                    className={`relative min-h-[52px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                      activa ? 'border-accent bg-accent text-black' : 'border-border bg-surface text-text hover:border-accent/60'
                    }`}>
                    {s.nombre}
                    {abierta && (
                      <span title="Tiene una visita en curso"
                        className={`absolute right-2 top-2 h-2 w-2 rounded-full ${activa ? 'bg-black' : 'bg-accent'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </fieldset>

      {enCurso && (
        <Aviso icono={<IconProgress size={18} className="text-accent" />} tono="border-accent/40 bg-accent-bg">
          Hay una visita en curso en esta sucursal desde el {fechaHora(enCurso.fecha)}. Podés continuarla o empezar una nueva.
        </Aviso>
      )}
      {anterior && (pendientes.ids.length > 0 ? (
        <Aviso icono={<IconAlertTriangle size={18} className="text-brand-red" />} tono="border-brand-red/40 bg-danger-bg">
          La última visita ({fechaHora(anterior.fecha)}) dejó <strong>{pendientes.ids.length} {pendientes.ids.length === 1 ? 'ítem' : 'ítems'} sin cumplir</strong>.
          Van a aparecer primero para que verifiques si se corrigieron.
        </Aviso>
      ) : (
        <Aviso icono={<IconCircleCheck size={18} className="text-success" />} tono="border-success/40 bg-green-bg">
          La última visita ({fechaHora(anterior.fecha)}) no dejó ítems pendientes.
        </Aviso>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Supervisor</span>
          <input className={INPUT} value={supervisor} onChange={e => setSupervisor(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Encargado presente en el local</span>
          <input className={INPUT} value={encargado} onChange={e => setEncargado(e.target.value)} placeholder="Nombre y apellido" />
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {enCurso && (
          <button type="button" onClick={() => router.push(`/admin/supervision/${enCurso.id}/checklist`)}
            className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90">
            Continuar visita en curso
          </button>
        )}
        <button type="button" onClick={comenzar} disabled={!sucursalId || creando}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            enCurso ? 'border border-border text-text hover:border-accent' : 'bg-accent text-black hover:opacity-90'
          }`}>
          <IconPlayerPlay size={16} aria-hidden />
          {creando ? 'Empezando…' : enCurso ? 'Empezar una nueva' : 'Comenzar visita'}
        </button>
      </div>
    </div>
  )
}

function Aviso({ icono, tono, children }: { icono: React.ReactNode; tono: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-card border px-4 py-3 text-sm text-text ${tono}`}>
      <span className="mt-0.5 shrink-0">{icono}</span>
      <p>{children}</p>
    </div>
  )
}
