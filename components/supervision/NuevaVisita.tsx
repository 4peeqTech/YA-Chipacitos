'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconChevronRight, IconCircleCheck, IconPlayerPlay, IconProgress } from '@tabler/icons-react'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import {
  calcularResumen, diasDesde, idsSinResponder, nivelCumplimiento, pendientesDe, textoPct, ultimaCerrada, visitaEnCurso,
} from '@/lib/supervision/calculos'
import { COLOR_NIVEL, fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { CLAVE_SUPERVISOR, Porcentaje } from './ui'

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
  nombreUsuario: string
  ahora: number
  toast: ReturnType<typeof useToasts>
}

const INPUT = 'w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function NuevaVisita({ sucursales, bloques, visitas, nombreUsuario, ahora, toast }: Props) {
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

  const total = bloques.reduce((n, b) => n + b.items.length, 0)
  const enCursoTodas = useMemo(
    () => visitas.filter(v => v.estado === 'en_curso').sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [visitas],
  )
  const recientes = useMemo(
    () => visitas.filter(v => v.estado === 'cerrada').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6),
    [visitas],
  )
  const sucursal = sucursales.find(s => s.id === sucursalId) ?? null
  const enCurso = sucursalId ? visitaEnCurso(visitas, sucursalId) : null
  const anterior = sucursalId ? ultimaCerrada(visitas, sucursalId) : null
  const pendientes = useMemo(() => pendientesDe(anterior, bloques), [anterior, bloques])
  const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? id

  async function comenzar() {
    if (!sucursalId) return
    const nombreSupervisor = supervisor.trim()
    if (!nombreSupervisor) { toast.error('Escribí el nombre del supervisor.'); return }
    setCreando(true)
    try { localStorage.setItem(CLAVE_SUPERVISOR, nombreSupervisor) } catch {}
    const id = crypto.randomUUID()
    const { error } = await supabase.from('supervision_visitas').insert({
      id,
      sucursal_id: sucursalId,
      supervisor_nombre: nombreSupervisor,
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
    // Compu ancha: sucursales a la izquierda y la visita a empezar en un panel fijo a la derecha.
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0 space-y-5">
        {enCursoTodas.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {enCursoTodas.map(v => (
              <Link key={v.id} href={`/admin/supervision/${v.id}/checklist`}
                className="flex items-center gap-3 rounded-card border border-accent/40 bg-accent-bg px-4 py-3 transition-colors hover:border-accent">
                <IconProgress size={22} className="shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text">Seguir visita en {nombre(v.sucursal_id)}</p>
                  <p className="truncate text-xs text-muted">
                    Empezada {fechaHora(v.fecha)} · {total - idsSinResponder(v.respuestas, bloques).length} de {total} respondidos
                  </p>
                </div>
                <IconChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
              </Link>
            ))}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">¿Qué sucursal visitás?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {sucursales.map(s => {
              const activa = sucursalId === s.id
              const abierta = visitaEnCurso(visitas, s.id)
              const ultima = ultimaCerrada(visitas, s.id)
              const pct = ultima?.resumen?.pct ?? null
              const nivel = nivelCumplimiento(pct)
              const dias = ultima ? diasDesde(ultima.fecha, ahora) : null
              return (
                <button key={s.id} type="button" aria-pressed={activa} onClick={() => setSucursalId(s.id)}
                  className={`grid min-h-[60px] content-center xl:min-h-[76px] xl:px-4 gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    activa ? 'border-accent bg-accent-bg shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'border-border bg-surface hover:border-accent/60'
                  }`}>
                  <span className="truncate text-sm font-bold text-text">{s.nombre}</span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                    {abierta ? (
                      <><span className="h-2 w-2 shrink-0 rounded-full bg-accent" />en curso</>
                    ) : ultima ? (
                      <>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${nivel ? COLOR_NIVEL[nivel].fondo : 'bg-faint'}`} />
                        {dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`} · {textoPct(pct)}
                      </>
                    ) : <span className="text-faint">sin visitas</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Compu: aprovecha el espacio con las últimas visitas cerradas. */}
        {recientes.length > 0 && (
          <section className="hidden space-y-2 lg:block">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Últimas visitas cerradas</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {recientes.map(v => (
                <li key={v.id}>
                  <Link href={`/admin/supervision/${v.id}`}
                    className="grid grid-cols-[minmax(0,1.2fr)_160px_minmax(0,1fr)_70px_16px] items-center gap-4 px-4 py-2.5 transition-colors hover:bg-surface2">
                    <span className="truncate text-sm font-semibold text-text">{nombre(v.sucursal_id)}</span>
                    <span className="text-sm tabular-nums text-muted">{fechaHora(v.fecha)}</span>
                    <span className="truncate text-sm text-muted">{v.supervisor_nombre}</span>
                    <Porcentaje pct={v.resumen?.pct} className="text-right text-base" />
                    <IconChevronRight size={16} className="text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-[81px] xl:rounded-card xl:border xl:border-border xl:bg-surface xl:p-5">
        <div className="hidden xl:block">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Visita a</p>
          <p className="font-['Syne'] text-xl font-bold text-text">{sucursal?.nombre ?? 'Elegí una sucursal'}</p>
          <p className="text-xs text-muted">{sucursal ? sucursal.zona : 'Tocá una de la lista para ver su última visita y empezar.'}</p>
        </div>

        {sucursal && enCurso && (
          <Aviso icono={<IconProgress size={18} className="text-accent" />} tono="border-accent/40 bg-accent-bg">
            Ya hay una visita en curso en {sucursal.nombre} desde el {fechaHora(enCurso.fecha)}. Podés seguirla o empezar una nueva.
          </Aviso>
        )}
        {sucursal && anterior && (pendientes.ids.length > 0 ? (
          <Aviso icono={<IconAlertTriangle size={18} className="text-brand-red" />} tono="border-brand-red/40 bg-danger-bg">
            La última visita ({fechaHora(anterior.fecha)}) dejó <strong>{pendientes.ids.length} {pendientes.ids.length === 1 ? 'ítem' : 'ítems'} sin cumplir</strong>.
            Van a aparecer primero para que verifiques si se corrigieron.
          </Aviso>
        ) : (
          <Aviso icono={<IconCircleCheck size={18} className="text-success" />} tono="border-success/40 bg-green-bg">
            La última visita ({fechaHora(anterior.fecha)}) no dejó ítems pendientes.
          </Aviso>
        ))}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Supervisor</span>
            <input className={INPUT} value={supervisor} onChange={e => setSupervisor(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Encargado presente <span className="normal-case tracking-normal text-faint">(opcional)</span>
            </span>
            <input className={INPUT} value={encargado} onChange={e => setEncargado(e.target.value)} placeholder="Nombre y apellido" />
          </label>
        </div>

        {/* Fijo abajo en el celular (encima de la barra de navegación). */}
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none xl:flex-col">
          {enCurso && (
            <Link href={`/admin/supervision/${enCurso.id}/checklist`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90">
              Seguir la visita en curso
            </Link>
          )}
          <button type="button" onClick={comenzar} disabled={!sucursalId || creando}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              enCurso ? 'border border-border text-text hover:border-accent' : 'bg-accent text-black hover:opacity-90'
            }`}>
            <IconPlayerPlay size={16} aria-hidden />
            {creando ? 'Empezando…' : !sucursal ? 'Elegí una sucursal' : enCurso ? 'Empezar una nueva' : `Comenzar visita en ${sucursal.nombre}`}
          </button>
        </div>
      </aside>
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
