'use client'

import { useState } from 'react'
import { IconEdit, IconLoader2, IconPlus, IconUsers } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { atributosEfectivos } from '@/lib/supervision/calculos'
import {
  DUENOS_EQUIPO, PERFILES, RUBROS, TIPOS_EQUIPO,
  type AtributosLugar, type EquipoSupervision, type LugarSupervision, type RubroMayorista,
} from '@/lib/supervision/tipos'
import { Tarjeta, textoDe } from './ui'

// Lista de clientes mayoristas de supervisión (sin relación con los pedidos
// mayoristas). Cada local de una cadena es un cliente distinto. La ficha se
// carga una vez y se corrige cuando cambia; la usan el admin y el supervisor.

type Toast = ReturnType<typeof useToasts>
const CAMPO = 'min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'
const ETIQUETA = 'text-2xs font-semibold uppercase tracking-wider text-muted'

interface Ficha {
  nombre: string
  direccion: string
  rubro: RubroMayorista
  perfil: 'cocina' | 'congelado'
  freezer: 'ya' | 'cliente'
  horno: 'ya' | 'cliente'
  contacto: string
}

function fichaDe(l: LugarSupervision | null): Ficha {
  const a = l?.atributos ?? {}
  return {
    nombre: l?.nombre ?? '',
    direccion: (a.direccion as string | undefined) ?? '',
    rubro: a.rubro ?? 'supermercado',
    perfil: a.perfil ?? 'congelado',
    freezer: a.freezer === 'ya' ? 'ya' : 'cliente',
    horno: a.horno === 'ya' ? 'ya' : 'cliente',
    contacto: (a.contacto as string | undefined) ?? '',
  }
}

/**
 * Alta o edición de la ficha de un cliente. Se usa desde Lugares y, en la
 * visita, desde "Editar ficha".
 */
export function FichaMayoristaModal({ abierto, cliente, onCerrar, onGuardado, toast }: {
  abierto: boolean
  /** null = cliente nuevo. */
  cliente: LugarSupervision | null
  onCerrar: () => void
  onGuardado: (l: LugarSupervision) => void
  toast: Toast
}) {
  const [supabase] = useState(() => createClient())
  const [f, setF] = useState<Ficha>(() => fichaDe(cliente))
  const [guardando, setGuardando] = useState(false)
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  // Al abrir, arranca de la ficha actual del cliente.
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) setF(fichaDe(cliente))
  }
  const cambiar = <K extends keyof Ficha>(k: K, v: Ficha[K]) => setF(prev => ({ ...prev, [k]: v }))

  async function guardar() {
    const nombre = f.nombre.trim()
    if (!nombre) { toast.error('Escribí el nombre del cliente.'); return }
    // Se conservan otros atributos que pueda tener; el horno solo si cocina.
    const atributos: AtributosLugar = { ...(cliente?.atributos ?? {}) }
    atributos.direccion = f.direccion.trim()
    atributos.rubro = f.rubro
    atributos.perfil = f.perfil
    atributos.freezer = f.freezer
    atributos.contacto = f.contacto.trim()
    if (f.perfil === 'cocina') atributos.horno = f.horno
    else delete atributos.horno
    delete atributos.equipos
    setGuardando(true)
    const campos = 'id, nombre, zona, orden, tipo, encargado, atributos'
    const { data, error } = cliente
      ? await supabase.from('supervision_lugares').update({ nombre, atributos }).eq('id', cliente.id).select(campos)
      : await supabase.from('supervision_lugares')
        .insert({ id: `may_${crypto.randomUUID().slice(0, 8)}`, nombre, tipo: 'mayorista', orden: 100, atributos })
        .select(campos)
    setGuardando(false)
    if (error || !data?.length) {
      toast.error(error?.code === '42501' || (!error && !data?.length)
        ? 'Tu usuario no puede guardar clientes. Consultá con el administrador.'
        : 'No se pudo guardar el cliente. Revisá la conexión y probá de nuevo.')
      return
    }
    onGuardado(data[0] as LugarSupervision)
    toast.success(`${nombre}: guardado`)
    onCerrar()
  }

  return (
    <Modal open={abierto} onClose={onCerrar} title={cliente ? `Ficha de ${cliente.nombre}` : 'Nuevo cliente mayorista'} size="lg" pantallaCompletaMobile>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className={ETIQUETA}>Nombre</span>
          <input className={CAMPO} value={f.nombre} onChange={e => cambiar('nombre', e.target.value)} placeholder="Por ejemplo: Supermax Junín" />
          <span className="block text-xs text-faint">Si es una cadena, cargá cada local por separado.</span>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={ETIQUETA}>Dirección</span>
          <input className={CAMPO} value={f.direccion} onChange={e => cambiar('direccion', e.target.value)} placeholder="Calle y número" />
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Tipo de local</span>
          <select className={CAMPO} value={f.rubro} onChange={e => cambiar('rubro', e.target.value as RubroMayorista)}>
            {RUBROS.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Perfil</span>
          <select className={CAMPO} value={f.perfil} onChange={e => cambiar('perfil', e.target.value as Ficha['perfil'])}>
            {PERFILES.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Freezer</span>
          <select className={CAMPO} value={f.freezer} onChange={e => cambiar('freezer', e.target.value as Ficha['freezer'])}>
            {DUENOS_EQUIPO.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
        {f.perfil === 'cocina' && (
          <label className="space-y-1">
            <span className={ETIQUETA}>Horno</span>
            <select className={CAMPO} value={f.horno} onChange={e => cambiar('horno', e.target.value as Ficha['horno'])}>
              {DUENOS_EQUIPO.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 sm:col-span-2">
          <span className={ETIQUETA}>Contacto o encargado</span>
          <input className={CAMPO} value={f.contacto} onChange={e => cambiar('contacto', e.target.value)} placeholder="Nombre y teléfono" />
        </label>
        <p className="text-xs text-faint sm:col-span-2">
          Si el cliente tiene un freezer u horno de Ya! en el registro de equipos, cuenta como de Ya! aunque acá diga otra cosa.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-semibold text-text hover:border-accent">Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {guardando && <IconLoader2 size={16} className="animate-spin" aria-hidden />}Guardar
        </button>
      </div>
    </Modal>
  )
}

export default function MayoristasSupervision({ mayoristas, equipos, onGuardado, toast }: {
  mayoristas: LugarSupervision[]
  equipos: EquipoSupervision[]
  onGuardado: (l: LugarSupervision) => void
  toast: Toast
}) {
  const [editando, setEditando] = useState<LugarSupervision | null | 'nuevo'>(null)

  return (
    <Tarjeta titulo="Clientes mayoristas" descripcion="La ficha de cada cliente decide qué ítems se ven en su visita: si cocina, de quién es el freezer y el horno.">
      <button type="button" onClick={() => setEditando('nuevo')}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-accent px-4 text-sm font-bold text-accent hover:bg-accent-bg">
        <IconPlus size={16} aria-hidden /> Nuevo cliente
      </button>
      {mayoristas.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState icono={IconUsers} titulo="Todavía no hay clientes mayoristas cargados" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {mayoristas.map(l => {
            const a = atributosEfectivos(l, equipos)
            const suyos = equipos.filter(e => e.lugar_id === l.id && e.situacion === 'en_uso')
            return (
              <li key={l.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-bold text-text">{l.nombre}</p>
                  <p className="text-xs text-muted">
                    {[a.direccion, a.rubro && textoDe(RUBROS, a.rubro)].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-muted">
                    {a.perfil ? textoDe(PERFILES, a.perfil) : 'Sin perfil'}
                    {' · '}Freezer {a.freezer === 'ya' ? 'de Ya!' : 'del cliente'}
                    {a.perfil === 'cocina' && <> · Horno {a.horno === 'ya' ? 'de Ya!' : 'del cliente'}</>}
                  </p>
                  {suyos.length > 0 && (
                    <p className="text-xs text-faint">
                      Equipos de Ya!: {suyos.map(e => textoDe(TIPOS_EQUIPO, e.tipo)).join(', ')}
                    </p>
                  )}
                  {a.contacto && <p className="text-xs text-faint">Contacto: {a.contacto as string}</p>}
                </div>
                <button type="button" onClick={() => setEditando(l)} aria-label={`Editar la ficha de ${l.nombre}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-accent">
                  <IconEdit size={18} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <FichaMayoristaModal abierto={editando !== null} cliente={editando === 'nuevo' ? null : editando}
        onCerrar={() => setEditando(null)} onGuardado={onGuardado} toast={toast} />
    </Tarjeta>
  )
}
