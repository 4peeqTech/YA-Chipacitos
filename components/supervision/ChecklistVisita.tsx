'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconArrowLeft, IconCheck, IconChevronLeft, IconChevronRight, IconCircleDashed, IconCloudCheck,
  IconCloudOff, IconHistory, IconListSearch, IconLoader2, IconLock, IconMessagePlus, IconX,
} from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { calcularResumen, completarSinResponder, idsSinResponder, textoPct } from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, ItemSupervision, RequerimientoSupervision, Respuestas, Resultado, VisitaSupervision } from '@/lib/supervision/tipos'
import RequerimientosVisita from './RequerimientosVisita'
import { CLAVE_BORRADOR, Porcentaje } from './ui'

// Checklist de una visita. Cada cambio se guarda en el celular al instante
// (respaldo si se corta la conexión) y en la base a los 700 ms; si falla, se
// reintenta con el próximo cambio, al volver la conexión o al salir.
// Celular: un bloque por vez (chips arriba, Anterior / Siguiente abajo).
// Compu: la lista de bloques a la izquierda. El último paso es el cierre.

type EstadoGuardado = 'ok' | 'pendiente' | 'error' | 'sinPermiso' | 'local'

const GUARDADO: Record<EstadoGuardado, { texto: string; icono: React.ReactNode; clase: string }> = {
  ok:         { texto: 'Guardado', icono: <IconCloudCheck size={14} />, clase: 'text-success' },
  pendiente:  { texto: 'Guardando…', icono: <IconLoader2 size={14} className="animate-spin" />, clase: 'text-muted' },
  error:      { texto: 'No se pudo guardar; se reintenta', icono: <IconAlertTriangle size={14} />, clase: 'text-brand-red' },
  sinPermiso: { texto: 'Sin permiso para guardar', icono: <IconLock size={14} />, clase: 'text-brand-red' },
  local:      { texto: 'Sin conexión: guardado en el celular', icono: <IconCloudOff size={14} />, clase: 'text-warning' },
}

const OPCIONES: { valor: Resultado; texto: string; icono?: React.ReactNode; activo: string }[] = [
  { valor: 'C', texto: 'Cumple', icono: <IconCheck size={16} aria-hidden />, activo: 'border-success bg-success text-black' },
  { valor: 'NC', texto: 'No cumple', icono: <IconX size={16} aria-hidden />, activo: 'border-brand-red bg-brand-red text-white' },
  { valor: 'NA', texto: 'N/A', activo: 'border-muted bg-surface2 text-text' },
]

interface Seccion { id: string; titulo: string; corto: string; referencia: string; items: ItemSupervision[]; previa?: boolean }

interface Props {
  inicial: VisitaSupervision
  sucursal: string
  bloques: BloqueSupervision[]
  /** Los de esta visita; null si el tipo de visita no lleva requerimientos (mayoristas). */
  requerimientos: RequerimientoSupervision[] | null
}

/** Pausa antes de reintentar un guardado, con algo de azar para no chocar con otro reintento. */
const pausaReintento = () => new Promise(r => setTimeout(r, 800 + Math.random() * 800))
const corto = (titulo: string) => titulo.split(' ')[0].replace(/[,.]$/, '')
const CIERRE = 'cierre'

export default function ChecklistVisita({ inicial, sucursal, bloques, requerimientos }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const [visita, setVisita] = useState(inicial)
  const [guardado, setGuardado] = useState<EstadoGuardado>('ok')
  const [conObs, setConObs] = useState<Set<string>>(() => new Set())
  const [saliendo, setSaliendo] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [altoHeader, setAltoHeader] = useState(56)
  const [altoBarra, setAltoBarra] = useState(120)
  const barra = useRef<HTMLDivElement>(null)

  const visitaRef = useRef(visita)
  const sucio = useRef(false)
  const enVuelo = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useMemo(() => new Map(bloques.flatMap(b => b.items.map(i => [i.id, i]))), [bloques])
  const total = items.size
  const pendientes = useMemo(() => visita.pendientes_previos.filter(id => items.has(id)), [visita.pendientes_previos, items])
  const resumen = calcularResumen(visita.respuestas, bloques)
  const faltan = idsSinResponder(visita.respuestas, bloques)
  const respondidos = total - faltan.length

  // Pasos: los pendientes de la visita anterior, cada bloque sin esos ítems y el cierre.
  const secciones = useMemo(() => {
    const enPendientes = new Set(pendientes)
    const lista: Seccion[] = []
    if (pendientes.length) {
      lista.push({
        id: 'previa', previa: true, titulo: 'Pendientes de la visita anterior', corto: 'Pendientes',
        referencia: `Visita del ${fechaHora(visita.anterior_fecha)}: verificá si se corrigieron`,
        items: pendientes.map(id => items.get(id)!),
      })
    }
    for (const b of bloques) {
      const its = b.items.filter(i => !enPendientes.has(i.id))
      if (its.length) lista.push({ id: b.id, titulo: b.titulo, corto: corto(b.titulo), referencia: b.referencia, items: its })
    }
    return lista
  }, [bloques, pendientes, items, visita.anterior_fecha])

  const contestados = (its: ItemSupervision[]) => its.filter(i => visita.respuestas[i.id]?.r).length
  const pasos = [...secciones.map(s => s.id), CIERRE]
  const [paso, setPaso] = useState(() => secciones.find(s => contestados(s.items) < s.items.length)?.id ?? secciones[0]?.id ?? CIERRE)
  const indice = pasos.indexOf(paso)
  const seccion = secciones.find(s => s.id === paso) ?? null

  function irA(id: string) {
    setPaso(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById(`chip-${id}`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }

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

  // La barra va debajo del header de la app si queda fijo al bajar (compu). En el
  // celular su contenedor lo envuelve solo a él y se va con el scroll: ahí, arriba de todo.
  useEffect(() => {
    const header = () => [...document.querySelectorAll('header')].find(h => h.offsetParent !== null && getComputedStyle(h).position === 'sticky')
    const medir = () => {
      const h = header()
      const alto = h?.getBoundingClientRect().height ?? 0
      const fijo = !!h && (h.parentElement?.getBoundingClientRect().height ?? 0) > alto + 1
      setAltoHeader(fijo ? alto : 0)
      if (barra.current) setAltoBarra(barra.current.getBoundingClientRect().height)
    }
    medir()
    const obs = new ResizeObserver(medir)
    document.querySelectorAll('header').forEach(h => obs.observe(h))
    if (barra.current) obs.observe(barra.current)
    return () => obs.disconnect()
  }, [])

  function responder(id: string, valor: Resultado) {
    cambiar(v => {
      const previa = v.respuestas[id] ?? {}
      const r = previa.r === valor && !previa.auto ? null : valor // tocar de nuevo desmarca
      const respuestas: Respuestas = { ...v.respuestas }
      // Responder a mano saca la marca de "sin responder".
      if (!r && !previa.obs && previa.monto == null) delete respuestas[id]
      else respuestas[id] = { ...(previa.obs ? { obs: previa.obs } : {}), ...(previa.monto != null ? { monto: previa.monto } : {}), r }
      return { ...v, respuestas }
    })
  }

  function observar(id: string, obs: string) {
    cambiar(v => ({ ...v, respuestas: { ...v.respuestas, [id]: { ...(v.respuestas[id] ?? {}), obs } } }))
  }

  /** Diferencia de arqueo: se guarda tal cual para el análisis; vacío la borra. */
  function anotarMonto(id: string, texto: string) {
    const n = texto.trim() === '' ? null : Number(texto)
    if (n != null && !Number.isFinite(n)) return
    cambiar(v => {
      const resto = { ...(v.respuestas[id] ?? {}) }
      delete resto.monto
      return { ...v, respuestas: { ...v.respuestas, [id]: n == null ? resto : { ...resto, monto: n } } }
    })
  }

  async function salir() {
    setSaliendo(true)
    await guardarAhora()
    // Si no se pudo, queda el respaldo en el celular y la pantalla de inicio lo ofrece.
    router.push('/admin/supervision?vista=visitas')
  }

  async function cerrar() {
    setSaliendo(true)
    cambiar(v => ({ ...v, respuestas: completarSinResponder(v.respuestas, bloques), estado: 'cerrada', cierre: new Date().toISOString() }))
    if (await guardarAhora()) {
      router.push(`/admin/supervision/${inicial.id}?aviso=cerrada`)
    } else {
      setSaliendo(false)
      setCerrando(false)
      toast.error('No se pudo cerrar en la base. Quedó guardada en este celular; probá de nuevo con conexión.')
    }
  }

  function responderFaltantes() {
    setCerrando(false)
    const primera = secciones.find(s => s.items.some(i => !visita.respuestas[i.id]?.r))
    if (primera) irA(primera.id)
  }

  const g = GUARDADO[guardado]
  const final = calcularResumen(completarSinResponder(visita.respuestas, bloques), bloques)
  const siTodoCumple = calcularResumen(
    { ...visita.respuestas, ...Object.fromEntries(faltan.map(id => [id, { r: 'C' as const }])) }, bloques,
  ).pct
  const anteriorPaso = indice > 0 ? pasos[indice - 1] : null
  const siguientePaso = indice < pasos.length - 1 ? pasos[indice + 1] : null
  const nombrePaso = (id: string) => id === CIERRE ? 'Cierre' : secciones.find(s => s.id === id)?.corto ?? ''
  const textoCerrar = visita.estado === 'cerrada' ? 'Guardar y cerrar' : 'Cerrar visita'

  return (
    <div className="w-full pb-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Barra fija: sucursal, porcentaje, avance y guardado; en el celular, los chips de bloques. */}
      <div ref={barra} style={{ top: altoHeader }}
        className="sticky z-40 -mx-4 border-b border-border bg-bg/95 backdrop-blur lg:-mx-6">
        <div className="space-y-2 px-4 pb-2.5 pt-3 lg:flex lg:items-center lg:gap-6 lg:space-y-0 lg:px-6 lg:py-4">
          <div className="flex min-w-0 items-center gap-3 lg:flex-1">
            <button type="button" onClick={salir} disabled={saliendo} aria-label="Salir y seguir después" title="Salir y seguir después"
              className="-ml-1 shrink-0 p-1 text-muted hover:text-accent lg:hidden">
              <IconArrowLeft size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-['Syne'] text-lg font-bold text-text lg:text-xl">{sucursal}</h1>
              <p className="truncate text-xs text-muted lg:text-sm">
                {visita.encargado ? `Con ${visita.encargado} · ` : ''}{visita.supervisor_nombre} · {fechaHora(visita.fecha)}
              </p>
            </div>
            <div className="shrink-0 text-right lg:hidden">
              <Porcentaje pct={resumen.pct} className="block text-2xl leading-none" />
              <span className="text-2xs uppercase tracking-wider text-faint">cumplimiento</span>
            </div>
          </div>

          <div className="space-y-1.5 lg:w-80">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">
                {respondidos} de {total}{faltan.length > 0 && <> · <b className="text-warning">faltan {faltan.length}</b></>}
              </span>
              <span className={`inline-flex min-w-0 items-center gap-1 ${g.clase}`} role="status">
                {g.icono}<span className="truncate">{g.texto}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar"
              aria-valuemin={0} aria-valuemax={total} aria-valuenow={respondidos} aria-label="Ítems respondidos">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? (respondidos * 100) / total : 0}%` }} />
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-4 lg:flex">
            <div className="text-right">
              <Porcentaje pct={resumen.pct} className="block text-3xl leading-none" />
              <span className="text-2xs uppercase tracking-wider text-faint">cumplimiento</span>
            </div>
            <button type="button" onClick={salir} disabled={saliendo}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text hover:border-accent disabled:opacity-50">
              Salir
            </button>
            <button type="button" onClick={() => setCerrando(true)} disabled={saliendo || guardado === 'sinPermiso'}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
              {textoCerrar}
            </button>
          </div>
        </div>

        <nav aria-label="Bloques" className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2.5 [scrollbar-width:none]! lg:hidden [&::-webkit-scrollbar]:hidden">
          {pasos.map(id => {
            const s = secciones.find(x => x.id === id)
            const n = s ? contestados(s.items) : 0
            const completa = !!s && n === s.items.length
            const activa = id === paso
            return (
              <button key={id} id={`chip-${id}`} type="button" onClick={() => irA(id)} aria-current={activa ? 'step' : undefined}
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activa ? 'border-accent bg-accent text-black' : completa ? 'border-border bg-surface text-success' : 'border-border bg-surface text-text'
                }`}>
                {completa && !activa && <IconCheck size={13} aria-hidden />}
                {s ? `${s.corto} ${n}/${s.items.length}` : 'Cierre'}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Compu: lista de bloques. */}
        <nav aria-label="Bloques" className="sticky hidden space-y-1 lg:block" style={{ top: altoHeader + altoBarra + 16 }}>
          <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Bloques</p>
          {pasos.map(id => {
            const s = secciones.find(x => x.id === id)
            const n = s ? contestados(s.items) : 0
            const completa = !!s && n === s.items.length
            const activa = id === paso
            return (
              <button key={id} type="button" onClick={() => irA(id)} aria-current={activa ? 'step' : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  activa ? 'bg-surface2 font-semibold text-text ring-1 ring-inset ring-border' : 'text-muted hover:bg-surface hover:text-text'
                }`}>
                <span className="flex min-w-0 items-center gap-2">
                  {s?.previa && <IconHistory size={15} className="shrink-0 text-brand-red" aria-hidden />}
                  <span className="truncate">{s ? (s.previa ? 'Pendientes anteriores' : s.titulo) : 'Cierre de la visita'}</span>
                </span>
                {s && (
                  <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums ${completa ? 'text-success' : ''}`}>
                    {completa && <IconCheck size={13} aria-hidden />}{n}/{s.items.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sin overflow-hidden: anularía el sticky de la barra Anterior / Siguiente. */}
        <section className={`rounded-card border bg-surface ${seccion?.previa ? 'border-brand-red/50' : 'border-border'}`}>
          {seccion ? (
            <>
              <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-['Syne'] text-base font-bold text-text lg:text-lg">
                    {seccion.previa && <IconHistory size={18} className="shrink-0 text-brand-red" aria-hidden />}{seccion.titulo}
                  </h2>
                  {seccion.referencia && <p className="text-xs text-faint">{seccion.referencia}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {indice + 1} de {pasos.length - 1} · {contestados(seccion.items)}/{seccion.items.length}
                </span>
              </header>

              <ul className="divide-y divide-border">
                {seccion.items.map(it => {
                  const a = visita.respuestas[it.id] ?? {}
                  const verObs = a.r === 'NC' || !!a.obs || conObs.has(it.id)
                  const obsPrevia = seccion.previa ? visita.obs_previas?.[it.id] : null
                  return (
                    <li key={it.id} className="grid grid-cols-1 gap-2.5 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-center 2xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-5 lg:px-5">
                      <div className="space-y-1">
                        <p className="text-sm leading-snug text-text">{it.texto}</p>
                        {obsPrevia && <p className="border-l-2 border-brand-red/60 pl-2 text-xs text-muted">La vez pasada: {obsPrevia}</p>}
                        {!a.r && (
                          <p className="inline-flex items-center gap-1 text-2xs font-semibold text-warning">
                            <IconCircleDashed size={12} aria-hidden /> Sin responder
                          </p>
                        )}
                        {a.auto && <p className="text-2xs font-semibold text-warning">Quedó sin responder al cerrar</p>}
                      </div>
                      <div role="group" aria-label="Resultado" className="grid grid-cols-3 gap-1.5">
                        {OPCIONES.map(o => {
                          const marcado = a.r === o.valor
                          return (
                            <button key={o.valor} type="button" aria-pressed={marcado} onClick={() => responder(it.id, o.valor)}
                              className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-1 text-sm font-semibold transition-colors ${
                                marcado ? (a.auto ? 'border-warning bg-warning-bg text-warning' : o.activo) : 'border-border text-muted hover:border-accent/60 hover:text-text'
                              }`}>
                              {o.icono}{o.texto}
                            </button>
                          )
                        })}
                      </div>
                      {verObs ? (
                        <textarea value={a.obs ?? ''} onChange={e => observar(it.id, e.target.value)} rows={2}
                          autoFocus={conObs.has(it.id) && !a.obs}
                          placeholder="Qué viste, a quién se le indicó"
                          className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none lg:col-span-2" />
                      ) : (
                        <button type="button" onClick={() => setConObs(prev => new Set(prev).add(it.id))}
                          className="inline-flex items-center gap-1.5 justify-self-start text-xs font-medium text-muted hover:text-accent lg:col-span-2">
                          <IconMessagePlus size={14} aria-hidden /> Agregar observación
                        </button>
                      )}
                      {it.con_monto && (
                        <label className="flex flex-wrap items-center gap-2 lg:col-span-2">
                          <span className="text-xs font-medium text-muted">
                            Diferencia detectada ($) <span className="text-faint">(opcional)</span>
                          </span>
                          <input type="number" inputMode="decimal" step="any" value={a.monto ?? ''}
                            onChange={e => anotarMonto(it.id, e.target.value)} placeholder="0"
                            className="min-h-[44px] w-36 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm tabular-nums text-text placeholder:text-faint focus:border-accent focus:outline-none" />
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <div className="space-y-4 p-4 lg:p-5">
              <h2 className="font-['Syne'] text-base font-bold text-text lg:text-lg">Cierre de la visita</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface2 py-2"><b className="block font-['Syne'] text-lg text-text">{respondidos}</b><span className="text-2xs text-muted">respondidos</span></div>
                <div className="rounded-xl bg-surface2 py-2"><b className={`block font-['Syne'] text-lg ${faltan.length ? 'text-warning' : 'text-success'}`}>{faltan.length}</b><span className="text-2xs text-muted">sin responder</span></div>
                <div className="rounded-xl bg-surface2 py-2"><Porcentaje pct={resumen.pct} className="block text-lg" /><span className="text-2xs text-muted">cumplimiento</span></div>
              </div>
              {faltan.length > 0 && (
                <button type="button" onClick={responderFaltantes}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                  <IconListSearch size={16} aria-hidden /> Ir al primero sin responder
                </button>
              )}
              {requerimientos && (
                <RequerimientosVisita visitaId={inicial.id} lugarId={inicial.lugar_id} enCurso={visita.estado === 'en_curso'}
                  iniciales={requerimientos} toast={toast} />
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Observaciones generales</span>
                <textarea value={visita.obs_general} onChange={e => cambiar(v => ({ ...v, obs_general: e.target.value }))} rows={4}
                  placeholder="Comentarios del encargado, acuerdos, próximos pasos"
                  className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
              </label>
            </div>
          )}

          {/* Anterior / Siguiente: fijo abajo en el celular, al pie de la tarjeta en la compu. */}
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-10 grid grid-cols-[1fr_1.4fr] gap-2 rounded-b-card border-t border-border bg-bg/95 px-4 py-2.5 backdrop-blur lg:static lg:flex lg:justify-between lg:bg-transparent lg:px-5 lg:py-3.5 lg:backdrop-blur-none">
            {anteriorPaso ? (
              <button type="button" onClick={() => irA(anteriorPaso)}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-3 text-sm font-semibold text-text hover:border-accent">
                <IconChevronLeft size={16} className="shrink-0" aria-hidden /><span className="truncate">{nombrePaso(anteriorPaso)}</span>
              </button>
            ) : <span />}
            {siguientePaso ? (
              <button type="button" onClick={() => irA(siguientePaso)}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-3 text-sm font-bold text-black hover:opacity-90">
                <span className="truncate">{nombrePaso(siguientePaso)}</span><IconChevronRight size={16} className="shrink-0" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={() => setCerrando(true)} disabled={saliendo || guardado === 'sinPermiso'}
                className="rounded-xl bg-accent px-3 py-3 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
                {textoCerrar}
              </button>
            )}
          </div>
        </section>
      </div>

      <Modal open={cerrando} onClose={() => setCerrando(false)} title="¿Cerrar la visita?">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Porcentaje pct={final.pct} className="text-5xl leading-none" />
            <p className="text-sm text-muted">
              de cumplimiento<br />
              {final.cumple} cumple · {final.noCumple} no cumple{faltan.length ? ` (${faltan.length} sin responder)` : ''} · {final.na} N/A
            </p>
          </div>
          {faltan.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-bg p-3 text-sm">
              <p className="flex items-start gap-2 font-semibold text-warning">
                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                {faltan.length} {faltan.length === 1 ? 'ítem sin responder va a quedar' : 'ítems sin responder van a quedar'} como No cumple
              </p>
              <ul className="space-y-1 text-muted">
                {faltan.slice(0, 2).map(id => <li key={id} className="truncate">• {items.get(id)?.texto}</li>)}
                {faltan.length > 2 && <li>• y {faltan.length - 2} más</li>}
              </ul>
              <p className="text-xs text-faint">
                Si los respondieras todos como Cumple, llegaría a {textoPct(siTodoCumple)}. En el detalle quedan marcados “sin responder”.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Respondiste todos los ítems.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {faltan.length > 0 ? (
              <button type="button" onClick={responderFaltantes}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text hover:border-accent">
                <IconListSearch size={16} aria-hidden /> Responder los que faltan
              </button>
            ) : (
              <button type="button" onClick={() => setCerrando(false)}
                className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted hover:text-text">
                Seguir completando
              </button>
            )}
            <button type="button" onClick={cerrar} disabled={saliendo}
              className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
              {saliendo ? 'Cerrando…' : faltan.length ? 'Cerrar igual' : 'Cerrar visita'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
