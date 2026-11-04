'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconArrowLeft, IconBrandWhatsapp, IconCheck, IconCircleCheck, IconEdit, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { calcularResumen, diferenciaPuntos, pendientesResueltos, textoPct } from '@/lib/supervision/calculos'
import { fechaCorta, fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { BarraCumplimiento, ChipEnCurso, Porcentaje, Tarjeta, Tendencia } from './ui'

interface Props {
  visita: VisitaSupervision
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  esAdmin: boolean
  anterior: { id: string; fecha: string; pct: number | null } | null
  aviso: string | null
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export default function DetalleVisita({ visita: v, sucursales, bloques, esAdmin, anterior, aviso }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const confirm = useConfirm()
  const [eliminando, setEliminando] = useState(false)
  const [ocultarSinResponder, setOcultarSinResponder] = useState(false)

  const avisado = useRef(false)
  useEffect(() => {
    if (!aviso || avisado.current) return
    avisado.current = true
    toast.success(aviso)
    window.history.replaceState(null, '', pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sucursal = sucursales.find(s => s.id === v.sucursal_id)?.nombre ?? v.sucursal_id
  const r = calcularResumen(v.respuestas, bloques)
  const sinResponder = (r.sinResponder ?? 0) + r.sinResp
  const dif = anterior ? diferenciaPuntos(r.pct, anterior.pct) : null
  const items = new Map(bloques.flatMap(b => b.items.map(i => [i.id, { texto: i.texto, bloque: b.titulo }])))
  // En el orden del checklist.
  const incumplidos = bloques.flatMap(b => b.items)
    .map(it => [it.id, v.respuestas[it.id]] as const)
    .filter(([, a]) => a?.r === 'NC')
  const visibles = ocultarSinResponder ? incumplidos.filter(([, a]) => !a?.auto) : incumplidos
  const previos = new Set(v.pendientes_previos)
  const { corregidos, siguen } = pendientesResueltos(v)

  function compartir() {
    const lineas = [
      `*Visita a ${sucursal}*`,
      `${fechaHora(v.fecha)} · ${v.supervisor_nombre}${v.encargado ? ` · con ${v.encargado}` : ''}`,
      `Cumplimiento: *${textoPct(r.pct)}*${dif != null && anterior ? ` (${dif > 0 ? '+' : ''}${dif} pts vs. ${fechaCorta(anterior.fecha)})` : ''}`,
      '',
    ]
    const reales = incumplidos.filter(([, a]) => !a?.auto)
    if (reales.length) {
      lineas.push(`*No cumple (${reales.length}):*`)
      for (const [id, a] of reales) lineas.push(`• ${items.get(id)?.texto}${a?.obs ? ` — ${a.obs}` : ''}`)
    } else {
      lineas.push('Sin incumplimientos observados.')
    }
    if (sinResponder) lineas.push('', `Sin responder: ${sinResponder}`)
    if (v.pendientes_previos.length) lineas.push('', `De la visita anterior se corrigieron ${corregidos.length} de ${v.pendientes_previos.length}.`)
    if (v.obs_general) lineas.push('', `*Observaciones:* ${v.obs_general}`)
    const texto = lineas.join('\n')
    if (navigator.share) {
      navigator.share({ text: texto }).catch(() => {})
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    }
  }

  function pedirEliminar() {
    confirm.confirmar({
      titulo: '¿Eliminar esta visita?',
      mensaje: 'Se borra para siempre, junto con sus respuestas.',
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: async () => {
        setEliminando(true)
        const { data, error } = await supabase.from('supervision_visitas').delete().eq('id', v.id).select('id')
        if (error || !data?.length) {
          setEliminando(false)
          toast.error('No se pudo eliminar la visita.')
          return
        }
        router.replace('/admin/supervision?vista=visitas&aviso=eliminada')
      },
    })
  }

  const STATS = [
    { n: r.cumple, texto: 'Cumple', clase: 'text-success' },
    { n: r.noCumple - (r.sinResponder ?? 0), texto: 'No cumple', clase: 'text-brand-red' },
    { n: sinResponder, texto: 'Sin resp.', clase: 'text-warning' },
    { n: r.na, texto: 'N/A', clase: 'text-text' },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
      {confirm.dialog}

      <Link href="/admin/supervision?vista=visitas" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <IconArrowLeft size={16} aria-hidden /> Visitas
      </Link>

      <header>
        <h1 className="flex flex-wrap items-center gap-2 font-['Syne'] text-2xl font-bold text-text">
          {sucursal} {v.estado === 'en_curso' && <ChipEnCurso />}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {fechaHora(v.fecha)}{v.cierre ? ` → ${hora(v.cierre)}` : ''} · {v.supervisor_nombre}{v.encargado ? ` · con ${v.encargado}` : ''}
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-4 rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Porcentaje pct={r.pct} className="text-5xl leading-none" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-text">de cumplimiento</p>
                {anterior && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Tendencia dif={dif} /> vs. {fechaCorta(anterior.fecha)} ({textoPct(anterior.pct)})
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {STATS.map(s => (
                <div key={s.texto} className="rounded-xl bg-surface2 px-1 py-2 text-center">
                  <b className={`block font-['Syne'] text-lg ${s.clase}`}>{s.n}</b>
                  <span className="text-2xs text-muted">{s.texto}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={compartir}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90">
                <IconBrandWhatsapp size={18} aria-hidden /> Compartir
              </button>
              <Link href={`/admin/supervision/${v.id}/checklist`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold text-text hover:border-accent">
                {v.estado === 'en_curso' ? <IconPlayerPlay size={16} aria-hidden /> : <IconEdit size={16} aria-hidden />}
                {v.estado === 'en_curso' ? 'Continuar visita' : 'Editar respuestas'}
              </Link>
            </div>
          </section>

          <Tarjeta titulo={`No cumple (${incumplidos.length})`}>
            {incumplidos.some(([, a]) => a?.auto) && (
              <button type="button" aria-pressed={ocultarSinResponder} onClick={() => setOcultarSinResponder(o => !o)}
                className={`-mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  ocultarSinResponder ? 'border-accent bg-accent text-black' : 'border-border text-muted hover:text-text'
                }`}>
                {ocultarSinResponder && <IconCheck size={13} aria-hidden />}Ocultar sin responder
              </button>
            )}
            {visibles.length === 0 ? (
              <p className="text-sm text-muted">{incumplidos.length ? 'Solo quedan los sin responder.' : 'Ninguno. Todo en orden.'}</p>
            ) : (
              <ul className="divide-y divide-border">
                {visibles.map(([id, a]) => (
                  <li key={id} className="space-y-0.5 py-2.5 first:pt-0 last:pb-0">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-faint">{items.get(id)?.bloque}</p>
                    <p className="text-sm text-text">{items.get(id)?.texto}</p>
                    {a?.obs && <p className="border-l-2 border-brand-red/60 pl-2 text-sm text-muted">{a.obs}</p>}
                    {a?.auto && <p className="text-2xs font-bold uppercase tracking-wider text-warning">Sin responder</p>}
                    {!a?.auto && previos.has(id) && <p className="text-2xs font-bold uppercase tracking-wider text-brand-red">Sigue desde la visita anterior</p>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="space-y-4">
          {v.pendientes_previos.length > 0 && (
            <Tarjeta titulo="Pendientes de la visita anterior"
              descripcion={`${corregidos.length} de ${v.pendientes_previos.length} se corrigieron${siguen.length ? ` · siguen ${siguen.length}` : ''}.`}>
              {corregidos.length > 0 && (
                <ul className="space-y-1.5">
                  {corregidos.map(id => (
                    <li key={id} className="flex gap-2 text-sm text-text">
                      <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                      {items.get(id)?.texto}
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          <Tarjeta titulo="Cumplimiento por bloque">
            <div className="space-y-3">
              {bloques.map(b => <BarraCumplimiento key={b.id} titulo={b.titulo} pct={r.bloques[b.id] ?? null} />)}
            </div>
          </Tarjeta>

          {v.obs_general && (
            <Tarjeta titulo="Observaciones generales">
              <p className="whitespace-pre-wrap text-sm text-text">{v.obs_general}</p>
            </Tarjeta>
          )}

          {esAdmin && (
            <button type="button" onClick={pedirEliminar} disabled={eliminando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-red/50 px-4 py-3 text-sm font-bold text-brand-red hover:bg-danger-bg disabled:opacity-50">
              <IconTrash size={16} aria-hidden /> {eliminando ? 'Eliminando…' : 'Eliminar visita'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
