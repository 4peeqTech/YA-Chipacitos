'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconArrowLeft, IconCircleCheck, IconEdit, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastStack, useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { calcularResumen, pendientesResueltos } from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { BarraCumplimiento, ChipEnCurso, Porcentaje, Tarjeta } from './ui'

interface Props {
  visita: VisitaSupervision
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  esAdmin: boolean
  aviso: string | null
}

export default function DetalleVisita({ visita: v, sucursales, bloques, esAdmin, aviso }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const confirm = useConfirm()
  const [eliminando, setEliminando] = useState(false)

  const avisado = useRef(false)
  useEffect(() => {
    if (!aviso || avisado.current) return
    avisado.current = true
    toast.success(aviso)
    window.history.replaceState(null, '', pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sucursal = sucursales.find(s => s.id === v.sucursal_id)?.nombre ?? v.sucursal_id
  const r = calcularResumen(v.respuestas, bloques)
  const items = new Map(bloques.flatMap(b => b.items.map(i => [i.id, { texto: i.texto, bloque: b.titulo }])))
  const incumplidos = Object.entries(v.respuestas ?? {}).filter(([id, a]) => a?.r === 'NC' && items.has(id))
  const { corregidos, siguen } = pendientesResueltos(v)

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
      {confirm.dialog}

      <Link href="/admin/supervision?vista=visitas" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <IconArrowLeft size={16} aria-hidden /> Visitas
      </Link>

      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 font-['Syne'] text-2xl font-bold text-text">
          {sucursal} {v.estado === 'en_curso' && <ChipEnCurso />}
        </h1>
        <p className="text-sm text-muted">
          {fechaHora(v.fecha)} · Supervisor: {v.supervisor_nombre}
          {v.encargado && <><br />Encargado presente: {v.encargado}</>}
        </p>
      </header>

      <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
        <Porcentaje pct={r.pct} className="text-5xl leading-none" />
        <div className="text-sm">
          <p className="font-semibold text-text">de cumplimiento</p>
          <p className="text-xs text-muted">
            {r.cumple} cumple, {r.noCumple} no cumple, {r.na} N/A{r.sinResp ? `, ${r.sinResp} sin responder` : ''}
          </p>
        </div>
      </div>

      {v.pendientes_previos.length > 0 && (
        <Tarjeta titulo="Respecto de la visita anterior"
          descripcion={`${corregidos.length} de ${v.pendientes_previos.length} pendientes se corrigieron.`}>
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
          {siguen.length > 0 && <p className="text-sm font-semibold text-brand-red">Siguen sin cumplirse: {siguen.length}</p>}
        </Tarjeta>
      )}

      <Tarjeta titulo="Cumplimiento por bloque">
        <div className="space-y-3">
          {bloques.map(b => <BarraCumplimiento key={b.id} titulo={b.titulo} pct={r.bloques[b.id] ?? null} />)}
        </div>
      </Tarjeta>

      <Tarjeta titulo={`Ítems que no se cumplen (${incumplidos.length})`}>
        {incumplidos.length === 0 ? (
          <p className="text-sm text-muted">Ninguno. Todo en orden.</p>
        ) : (
          <ul className="divide-y divide-border">
            {incumplidos.map(([id, a]) => (
              <li key={id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="text-2xs font-semibold uppercase tracking-wider text-faint">{items.get(id)?.bloque}</p>
                <p className="text-sm text-text">{items.get(id)?.texto}</p>
                {a.obs && <p className="mt-1 border-l-2 border-brand-red/60 pl-2 text-sm text-muted">{a.obs}</p>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {v.obs_general && (
        <Tarjeta titulo="Observaciones generales">
          <p className="whitespace-pre-wrap text-sm text-text">{v.obs_general}</p>
        </Tarjeta>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/admin/supervision/${v.id}/checklist`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black hover:opacity-90">
          {v.estado === 'en_curso' ? <IconPlayerPlay size={16} aria-hidden /> : <IconEdit size={16} aria-hidden />}
          {v.estado === 'en_curso' ? 'Continuar visita' : 'Editar respuestas'}
        </Link>
        {esAdmin && (
          <button type="button" onClick={pedirEliminar} disabled={eliminando}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-red/50 px-4 py-3 text-sm font-bold text-brand-red hover:bg-danger-bg disabled:opacity-50 sm:ml-auto">
            <IconTrash size={16} aria-hidden /> {eliminando ? 'Eliminando…' : 'Eliminar visita'}
          </button>
        )}
      </div>
    </div>
  )
}
