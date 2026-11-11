'use client'

import { useState } from 'react'
import { IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { AtributosLugar, LugarSupervision } from '@/lib/supervision/tipos'
import { Tarjeta } from './ui'

// Atributos de cada sucursal: deciden qué ítems ve el supervisor (la forma de
// cargar el horno, el jugo preparado) y precargan el encargado en la visita.
// Los edita el admin; el supervisor los ve. La RLS lo hace cumplir.

interface Props {
  sucursales: LugarSupervision[]
  esAdmin: boolean
  onGuardado: (l: LugarSupervision) => void
  toast: ReturnType<typeof useToasts>
}

type Horno = '' | 'rotativo' | 'convector'
type Jugo = '' | 'si' | 'no'
interface Borrador { horno: Horno; jugo: Jugo; encargado: string }

const HORNOS: { valor: Horno; texto: string }[] = [
  { valor: 'rotativo', texto: 'Rotativo' },
  { valor: 'convector', texto: 'Convector' },
  { valor: '', texto: 'Sin dato' },
]
const JUGOS: { valor: Jugo; texto: string }[] = [
  { valor: 'si', texto: 'Sí' },
  { valor: 'no', texto: 'No' },
  { valor: '', texto: 'Sin dato' },
]

const CAMPO = 'min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-60'

function desde(l: LugarSupervision): Borrador {
  const a = l.atributos ?? {}
  return {
    horno: a.horno === 'rotativo' || a.horno === 'convector' ? a.horno : '',
    jugo: a.jugo === true ? 'si' : a.jugo === false ? 'no' : '',
    encargado: l.encargado ?? '',
  }
}

const igual = (a: Borrador, b: Borrador) => a.horno === b.horno && a.jugo === b.jugo && a.encargado.trim() === b.encargado.trim()
const textoDe = <T extends string>(opciones: { valor: T; texto: string }[], v: T) => opciones.find(o => o.valor === v)?.texto ?? ''

export default function LugaresSupervision({ sucursales, esAdmin, onGuardado, toast }: Props) {
  const [supabase] = useState(() => createClient())
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const editar = (l: LugarSupervision, cambios: Partial<Borrador>) =>
    setBorradores(prev => ({ ...prev, [l.id]: { ...(prev[l.id] ?? desde(l)), ...cambios } }))

  async function guardar(l: LugarSupervision) {
    const b = borradores[l.id]
    if (!b) return
    // Se conservan los demás atributos; "Sin dato" saca la clave (el ítem se muestra).
    const atributos: AtributosLugar = { ...(l.atributos ?? {}) }
    if (b.horno) atributos.horno = b.horno
    else delete atributos.horno
    if (b.jugo) atributos.jugo = b.jugo === 'si'
    else delete atributos.jugo
    setGuardando(l.id)
    const { data, error } = await supabase.from('supervision_lugares')
      .update({ atributos, encargado: b.encargado.trim() || null }).eq('id', l.id)
      .select('id, nombre, zona, orden, tipo, encargado, atributos')
    setGuardando(null)
    if (error || !data?.length) {
      toast.error(!error || error.code === '42501'
        ? 'Tu usuario no puede cambiar los datos de las sucursales. Lo hace un administrador.'
        : 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
      return
    }
    onGuardado(data[0] as LugarSupervision)
    setBorradores(prev => { const n = { ...prev }; delete n[l.id]; return n })
    toast.success(`${l.nombre}: guardado`)
  }

  return (
    <Tarjeta titulo="Sucursales"
      descripcion={esAdmin
        ? 'El horno y el jugo deciden qué ítems ve el supervisor. Los cambios valen para las visitas que empiecen desde ahora.'
        : 'Los datos de cada sucursal los carga un administrador. Deciden qué ítems ves en la visita.'}>
      <ul className="divide-y divide-border">
        {sucursales.map(l => {
          const original = desde(l)
          const b = borradores[l.id] ?? original
          const cambio = !igual(b, original)
          return (
            <li key={l.id} className="grid grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_150px_120px_minmax(0,1fr)_auto] md:items-end">
              <div className="min-w-0 md:self-center">
                <p className="truncate text-sm font-bold text-text">{l.nombre}</p>
                {l.zona && <p className="truncate text-xs text-muted">{l.zona}</p>}
              </div>
              {esAdmin ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:contents">
                    <label className="space-y-1">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Horno</span>
                      <select className={CAMPO} value={b.horno} onChange={e => editar(l, { horno: e.target.value as Horno })}>
                        {HORNOS.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Jugo preparado</span>
                      <select className={CAMPO} value={b.jugo} onChange={e => editar(l, { jugo: e.target.value as Jugo })}>
                        {JUGOS.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="space-y-1">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Encargado</span>
                    <input className={CAMPO} value={b.encargado} placeholder="Nombre y apellido"
                      onChange={e => editar(l, { encargado: e.target.value })} />
                  </label>
                  <button type="button" onClick={() => guardar(l)} disabled={!cambio || guardando === l.id}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-faint">
                    {guardando === l.id ? <IconLoader2 size={16} className="animate-spin" aria-hidden /> : <IconDeviceFloppy size={16} aria-hidden />}
                    Guardar
                  </button>
                </>
              ) : (
                <dl className="grid grid-cols-3 gap-3 text-sm md:col-span-4 md:grid-cols-[150px_120px_minmax(0,1fr)]">
                  <Dato titulo="Horno" valor={textoDe(HORNOS, original.horno)} />
                  <Dato titulo="Jugo preparado" valor={textoDe(JUGOS, original.jugo)} />
                  <Dato titulo="Encargado" valor={original.encargado || 'Sin dato'} />
                </dl>
              )}
            </li>
          )
        })}
      </ul>
    </Tarjeta>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">{titulo}</dt>
      <dd className={`truncate ${valor === 'Sin dato' ? 'text-faint' : 'text-text'}`}>{valor}</dd>
    </div>
  )
}
