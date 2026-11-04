'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconCheck, IconChevronDown, IconCloudCheck, IconCloudOff, IconHistory, IconLoader2, IconLock, IconMessagePlus,
} from '@tabler/icons-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { calcularResumen, textoPct } from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, ItemSupervision, Resultado, VisitaSupervision } from '@/lib/supervision/tipos'
import { CLAVE_BORRADOR, Porcentaje } from './ui'

// Checklist de una visita. Cada cambio se guarda en el celular al instante
// (respaldo si se corta la conexión) y en la base a los 700 ms; si falla, se
// reintenta con el próximo cambio, al volver la conexión o al salir.

type EstadoGuardado = 'ok' | 'pendiente' | 'error' | 'sinPermiso' | 'local'

const GUARDADO: Record<EstadoGuardado, { texto: string; icono: React.ReactNode; clase: string }> = {
  ok:         { texto: 'Guardado', icono: <IconCloudCheck size={14} />, clase: 'text-success' },
  pendiente:  { texto: 'Guardando…', icono: <IconLoader2 size={14} className="animate-spin" />, clase: 'text-muted' },
  error:      { texto: 'No se pudo guardar; se reintenta con el próximo cambio', icono: <IconAlertTriangle size={14} />, clase: 'text-brand-red' },
  sinPermiso: { texto: 'Tu usuario no tiene permiso para guardar', icono: <IconLock size={14} />, clase: 'text-brand-red' },
  local:      { texto: 'Sin conexión: guardado solo en este celular', icono: <IconCloudOff size={14} />, clase: 'text-warning' },
}

const OPCIONES: { valor: Resultado; texto: string; activo: string }[] = [
  { valor: 'C', texto: 'Cumple', activo: 'border-success bg-success text-black' },
  { valor: 'NC', texto: 'No cumple', activo: 'border-brand-red bg-brand-red text-white' },
  { valor: 'NA', texto: 'N/A', activo: 'border-muted bg-surface2 text-text' },
]

interface Props {
  inicial: VisitaSupervision
  sucursal: string
  bloques: BloqueSupervision[]
}

/** Pausa antes de reintentar un guardado, con algo de azar para no chocar con otro reintento. */
const pausaReintento = () => new Promise(r => setTimeout(r, 800 + Math.random() * 800))

export default function ChecklistVisita({ inicial, sucursal, bloques }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const confirm = useConfirm()
  const [visita, setVisita] = useState(inicial)
  const [guardado, setGuardado] = useState<EstadoGuardado>('ok')
  const [conObs, setConObs] = useState<Set<string>>(() => new Set())
  const [saliendo, setSaliendo] = useState(false)
  const [altoHeader, setAltoHeader] = useState(56)

  // Debajo del header de la app si queda fijo al bajar (escritorio). En el celular su
  // contenedor lo envuelve solo a él, así que se va con el scroll: ahí, arriba de todo.
  useEffect(() => {
    const header = () => [...document.querySelectorAll('header')].find(h => h.offsetParent !== null && getComputedStyle(h).position === 'sticky')
    const medir = () => {
      const h = header()
      if (!h) { setAltoHeader(0); return }
      const alto = h.getBoundingClientRect().height
      const fijo = (h.parentElement?.getBoundingClientRect().height ?? 0) > alto + 1
      setAltoHeader(fijo ? alto : 0)
    }
    medir()
    const obs = new ResizeObserver(medir)
    document.querySelectorAll('header').forEach(h => obs.observe(h))
    return () => obs.disconnect()
  }, [])

  const visitaRef = useRef(visita)
  const sucio = useRef(false)
  const enVuelo = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useMemo(() => new Map(bloques.flatMap(b => b.items.map(i => [i.id, i]))), [bloques])
  const total = items.size
  const pendientes = useMemo(() => visita.pendientes_previos.filter(id => items.has(id)), [visita.pendientes_previos, items])
  const resumen = calcularResumen(visita.respuestas, bloques)
  const respondidos = total - resumen.sinResp

  // Secciones: primero los pendientes de la visita anterior, después cada bloque sin esos ítems.
  const secciones = useMemo(() => {
    const enPendientes = new Set(pendientes)
    const lista: { id: string; titulo: string; referencia: string; items: ItemSupervision[]; previa?: boolean }[] = []
    if (pendientes.length) {
      lista.push({
        id: 'previa', previa: true, titulo: 'Pendientes de la visita anterior',
        referencia: `Visita del ${fechaHora(visita.anterior_fecha)}: verificá si se corrigieron`,
        items: pendientes.map(id => items.get(id)!),
      })
    }
    for (const b of bloques) {
      const its = b.items.filter(i => !enPendientes.has(i.id))
      if (its.length) lista.push({ id: b.id, titulo: b.titulo, referencia: b.referencia, items: its })
    }
    return lista
  }, [bloques, pendientes, items, visita.anterior_fecha])

  const contestados = (its: ItemSupervision[]) => its.filter(i => visita.respuestas[i.id]?.r).length

  // Abierta al entrar: los pendientes si hay; si no, el primer bloque incompleto.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => {
    const primera = secciones.find(s => s.previa) ?? secciones.find(s => contestados(s.items) < s.items.length)
    return new Set(primera ? [primera.id] : [])
  })

  function guardarBorrador(v: VisitaSupervision) {
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ visita: v, guardadoLocal: new Date().toISOString() })) } catch {}
  }
  function borrarBorrador() {
    try {
      const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null')
      if (!b || b.visita?.id === inicial.id) localStorage.removeItem(CLAVE_BORRADOR)
    } catch {}
  }

  async function guardar(): Promise<boolean> {
    sucio.current = false
    const snap = visitaRef.current
    const fila = {
      respuestas: snap.respuestas,
      obs_general: snap.obs_general,
      estado: snap.estado,
      cierre: snap.cierre,
      resumen: calcularResumen(snap.respuestas, bloques),
    }
    const intentar = () => supabase.from('supervision_visitas').update(fila).eq('id', snap.id).select('id')
    let { data, error } = await intentar()
    if (error && !error.code) { await pausaReintento(); ({ data, error } = await intentar()) }
    if (error || !data?.length) {
      sucio.current = true
      // Sin filas y sin error: la RLS no dejó tocarla.
      setGuardado(!error || error.code === '42501' ? 'sinPermiso' : navigator.onLine ? 'error' : 'local')
      return false
    }
    if (!sucio.current) { setGuardado('ok'); borrarBorrador() }
    return true
  }

  /** Guarda ya lo pendiente (esperando lo que esté en vuelo). true si quedó todo en la base. */
  async function guardarAhora(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current)
    while (enVuelo.current) await enVuelo.current
    if (!sucio.current) return true
    if (!navigator.onLine) { setGuardado('local'); return false }
    const p = guardar()
    enVuelo.current = p
    const ok = await p
    enVuelo.current = null
    return ok
  }

  function cambiar(fn: (v: VisitaSupervision) => VisitaSupervision) {
    const nueva = fn(visitaRef.current)
    visitaRef.current = nueva
    setVisita(nueva)
    guardarBorrador(nueva)
    sucio.current = true
    setGuardado(navigator.onLine ? 'pendiente' : 'local')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(guardarAhora, 700)
  }

  useEffect(() => {
    // Cambios que quedaron solo en este celular y son más nuevos que lo de la base.
    try {
      const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null')
      if (b?.visita?.id === inicial.id) {
        if (Date.parse(b.guardadoLocal) > Date.parse(inicial.updated_at)) {
          visitaRef.current = b.visita
          setVisita(b.visita) // eslint-disable-line react-hooks/set-state-in-effect
          sucio.current = true
          setGuardado('pendiente')
          guardarAhora()
          toast.success('Se recuperaron los cambios guardados en este celular')
        } else {
          localStorage.removeItem(CLAVE_BORRADOR)
        }
      }
    } catch {}

    const alVolver = () => { if (sucio.current) guardarAhora() }
    const alSalir = (e: BeforeUnloadEvent) => { if (sucio.current || enVuelo.current) e.preventDefault() }
    window.addEventListener('online', alVolver)
    window.addEventListener('beforeunload', alSalir)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('beforeunload', alSalir)
      if (timer.current) clearTimeout(timer.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function responder(id: string, valor: Resultado) {
    cambiar(v => {
      const previa = v.respuestas[id] ?? {}
      const r = previa.r === valor ? null : valor // tocar de nuevo desmarca
      const respuestas = { ...v.respuestas }
      if (!r && !previa.obs) delete respuestas[id]
      else respuestas[id] = { ...previa, r }
      return { ...v, respuestas }
    })
  }

  function observar(id: string, obs: string) {
    cambiar(v => ({ ...v, respuestas: { ...v.respuestas, [id]: { ...(v.respuestas[id] ?? {}), obs } } }))
  }

  function alternar(id: string) {
    setAbiertas(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  async function salir() {
    setSaliendo(true)
    await guardarAhora()
    // Si no se pudo, queda el respaldo en el celular y la pantalla de inicio lo ofrece.
    router.push('/admin/supervision?vista=visitas')
  }

  function pedirCierre() {
    confirm.confirmar({
      titulo: '¿Cerrar la visita?',
      mensaje: (
        <>
          {resumen.sinResp
            ? <>Quedan <strong className="text-text">{resumen.sinResp} ítems sin responder</strong>; no cuentan en el porcentaje.</>
            : 'Respondiste todos los ítems.'}{' '}
          Cumplimiento: <strong className="text-text">{textoPct(resumen.pct)}</strong>.
        </>
      ),
      textoConfirmar: 'Cerrar visita',
      textoCancelar: 'Seguir completando',
      onConfirmar: async () => {
        setSaliendo(true)
        cambiar(v => ({ ...v, estado: 'cerrada', cierre: new Date().toISOString() }))
        if (await guardarAhora()) {
          router.push(`/admin/supervision/${inicial.id}?aviso=cerrada`)
        } else {
          setSaliendo(false)
          toast.error('No se pudo cerrar en la base. Quedó guardada en este celular; probá de nuevo con conexión.')
        }
      },
    })
  }

  const g = GUARDADO[guardado]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
      {confirm.dialog}

      {/* Cabecera fija, justo debajo del header de la app (debajo de los modales, z-50). */}
      <div style={{ top: altoHeader }}
        className="sticky z-40 -mx-4 border-b border-border bg-bg/95 px-4 pb-3 pt-3 backdrop-blur lg:-mx-6 lg:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-['Syne'] text-lg font-bold text-text">{sucursal}</h1>
            <p className="truncate text-xs text-muted">
              {visita.supervisor_nombre}{visita.encargado ? ` con ${visita.encargado}` : ''} · {fechaHora(visita.fecha)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Porcentaje pct={resumen.pct} className="block text-2xl leading-none" />
            <span className="text-2xs uppercase tracking-wider text-muted">cumplimiento</span>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={respondidos} aria-label="Ítems respondidos">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? (respondidos * 100) / total : 0}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted">{respondidos} de {total} ítems</span>
          <span className={`inline-flex min-w-0 items-center gap-1 ${g.clase}`} role="status">
            {g.icono}<span className="truncate">{g.texto}</span>
          </span>
        </div>
      </div>

      {secciones.map(s => {
        const n = contestados(s.items)
        const completa = n === s.items.length
        const abierta = abiertas.has(s.id)
        return (
          <section key={s.id} className={`overflow-hidden rounded-card border bg-surface ${s.previa ? 'border-brand-red/50' : 'border-border'}`}>
            <button type="button" onClick={() => alternar(s.id)} aria-expanded={abierta}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2">
              {s.previa && <IconHistory size={18} className="shrink-0 text-brand-red" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block font-['Syne'] text-sm font-bold text-text">{s.titulo}</span>
                {s.referencia && <span className="block text-xs text-muted">{s.referencia}</span>}
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                completa ? 'bg-green-bg text-success' : 'bg-surface2 text-muted'
              }`}>
                {completa && <IconCheck size={12} aria-hidden />}{n}/{s.items.length}
              </span>
              <IconChevronDown size={18} className={`shrink-0 text-muted transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            {abierta && (
              <ul className="divide-y divide-border border-t border-border">
                {s.items.map(it => {
                  const a = visita.respuestas[it.id] ?? {}
                  const verObs = a.r === 'NC' || !!a.obs || conObs.has(it.id)
                  const obsPrevia = s.previa ? visita.obs_previas?.[it.id] : null
                  return (
                    <li key={it.id} className="space-y-2.5 px-4 py-3.5">
                      <p className="text-sm leading-snug text-text">{it.texto}</p>
                      {obsPrevia && <p className="border-l-2 border-brand-red/60 pl-2 text-xs text-muted">La vez pasada: {obsPrevia}</p>}
                      <div role="group" aria-label="Resultado" className="grid grid-cols-3 gap-1.5">
                        {OPCIONES.map(o => (
                          <button key={o.valor} type="button" aria-pressed={a.r === o.valor} onClick={() => responder(it.id, o.valor)}
                            className={`min-h-[44px] rounded-xl border px-2 text-sm font-semibold transition-colors ${
                              a.r === o.valor ? o.activo : 'border-border text-muted hover:border-accent/60 hover:text-text'
                            }`}>
                            {o.texto}
                          </button>
                        ))}
                      </div>
                      {verObs ? (
                        <textarea value={a.obs ?? ''} onChange={e => observar(it.id, e.target.value)} rows={2}
                          autoFocus={conObs.has(it.id) && !a.obs}
                          placeholder="Observación: qué viste, a quién se le indicó"
                          className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
                      ) : (
                        <button type="button" onClick={() => setConObs(prev => new Set(prev).add(it.id))}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-accent">
                          <IconMessagePlus size={14} aria-hidden /> Agregar observación
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      <label className="block space-y-1.5 pt-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Observaciones generales de la visita</span>
        <textarea value={visita.obs_general} onChange={e => cambiar(v => ({ ...v, obs_general: e.target.value }))} rows={3}
          placeholder="Comentarios del encargado, acuerdos, próximos pasos"
          className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
      </label>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={salir} disabled={saliendo}
          className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-text hover:border-accent disabled:opacity-50">
          Salir y seguir después
        </button>
        <button type="button" onClick={pedirCierre} disabled={saliendo || guardado === 'sinPermiso'}
          className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
          {visita.estado === 'cerrada' ? 'Guardar y cerrar' : 'Cerrar visita'}
        </button>
      </div>
    </div>
  )
}
