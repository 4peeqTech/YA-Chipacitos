'use client'

import { useState } from 'react'
import { IconArrowsExchange, IconChevronDown, IconDeviceFloppy, IconFridge, IconLoader2, IconPlus } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import type { useToasts } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { ultimoControl } from '@/lib/supervision/calculos'
import { fechaCorta } from '@/lib/supervision/formato'
import {
  MODALIDADES, MOVIMIENTOS, SITUACIONES, TIPOS_EQUIPO,
  type EquipoSupervision, type LugarSupervision, type ModalidadEquipo, type MovimientoEquipo, type SituacionEquipo,
  type TipoEquipo, type TipoMovimiento, type VisitaSupervision, ESTADOS_EQUIPO,
} from '@/lib/supervision/tipos'
import { ChipFiltro } from './Filtros'
import { textoDe } from './ui'

// Registro de los equipos que Ya! entrega a los mayoristas (exhibidoras,
// hornos, freezers, heladeras). Cada uno con número de serie, lote o código
// interno, y su historial. Cambiar de cliente, mandar a reparar o retirar pasa
// por supervision_mover_equipo(), que deja el movimiento registrado.

type Toast = ReturnType<typeof useToasts>
const CAMPO = 'min-h-[44px] w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'
const ETIQUETA = 'text-2xs font-semibold uppercase tracking-wider text-muted'
const BOTON = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold disabled:opacity-50'
const hoy = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10) // fecha en Argentina

const COLOR_SITUACION: Record<SituacionEquipo, string> = {
  en_uso: 'text-success',
  en_reparacion: 'text-warning',
  retirado: 'text-faint',
}

/** "Serie 123 · Código YA-014", lo que haya cargado. */
export function identificacion(e: Pick<EquipoSupervision, 'nro_serie' | 'nro_lote' | 'codigo_interno'>): string {
  return [
    e.codigo_interno && `Código ${e.codigo_interno}`,
    e.nro_serie && `Serie ${e.nro_serie}`,
    e.nro_lote && `Lote ${e.nro_lote}`,
  ].filter(Boolean).join(' · ')
}

interface DatosEquipo {
  tipo: TipoEquipo
  marca_modelo: string
  nro_serie: string
  nro_lote: string
  codigo_interno: string
  modalidad: ModalidadEquipo
  observaciones: string
}

const vacio: DatosEquipo = { tipo: 'freezer', marca_modelo: '', nro_serie: '', nro_lote: '', codigo_interno: '', modalidad: 'comodato', observaciones: '' }
const datosDe = (e: EquipoSupervision): DatosEquipo => ({
  tipo: e.tipo, marca_modelo: e.marca_modelo, nro_serie: e.nro_serie ?? '', nro_lote: e.nro_lote ?? '',
  codigo_interno: e.codigo_interno ?? '', modalidad: e.modalidad, observaciones: e.observaciones,
})
const limpio = (s: string) => s.trim() || null

function mensajeError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'No se pudo guardar.'
  if (error.code === '23505') return 'Ya hay un equipo con ese código interno.'
  if (error.code === '23514') return 'Cargá al menos el número de serie, el lote o el código interno.'
  if (error.code === '42501') return 'Tu usuario no puede guardar equipos. Consultá con el administrador.'
  return 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

/**
 * Alta o edición de los datos de un equipo. Con equipo = null es un alta; si
 * viene clienteFijo, se entrega a ese cliente (lo usa la visita).
 */
export function EquipoModal({ abierto, equipo, clientes, clienteFijo, onCerrar, onGuardado, toast }: {
  abierto: boolean
  equipo: EquipoSupervision | null
  clientes: LugarSupervision[]
  clienteFijo?: string
  onCerrar: () => void
  onGuardado: (e: EquipoSupervision) => void
  toast: Toast
}) {
  const [supabase] = useState(() => createClient())
  const [d, setD] = useState<DatosEquipo>(vacio)
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [guardando, setGuardando] = useState(false)
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) { setD(equipo ? datosDe(equipo) : vacio); setCliente(clienteFijo ?? ''); setFecha(hoy()) }
  }
  const cambiar = <K extends keyof DatosEquipo>(k: K, v: DatosEquipo[K]) => setD(prev => ({ ...prev, [k]: v }))

  async function guardar() {
    if (!d.nro_serie.trim() && !d.nro_lote.trim() && !d.codigo_interno.trim()) {
      toast.error('Cargá al menos el número de serie, el lote o el código interno.')
      return
    }
    const fila = {
      tipo: d.tipo, marca_modelo: d.marca_modelo.trim(), nro_serie: limpio(d.nro_serie), nro_lote: limpio(d.nro_lote),
      codigo_interno: limpio(d.codigo_interno), modalidad: d.modalidad, observaciones: d.observaciones.trim(),
    }
    setGuardando(true)
    // El alta con cliente queda "en uso" y registra la entrega (trigger); sin cliente, queda en el depósito como retirado.
    const { data, error } = equipo
      ? await supabase.from('supervision_equipos').update(fila).eq('id', equipo.id).select('*')
      : await supabase.from('supervision_equipos').insert({
        ...fila, lugar_id: cliente || null, situacion: cliente ? 'en_uso' : 'retirado', fecha_entrega: cliente ? fecha : null,
      }).select('*')
    setGuardando(false)
    if (error || !data?.length) { toast.error(mensajeError(error)); return }
    onGuardado(data[0] as EquipoSupervision)
    toast.success(equipo ? 'Equipo actualizado' : 'Equipo registrado')
    onCerrar()
  }

  return (
    <Modal open={abierto} onClose={onCerrar} title={equipo ? 'Datos del equipo' : 'Nuevo equipo'} size="lg" pantallaCompletaMobile>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={ETIQUETA}>Tipo</span>
          <select className={CAMPO} value={d.tipo} onChange={e => cambiar('tipo', e.target.value as TipoEquipo)}>
            {TIPOS_EQUIPO.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Marca y modelo</span>
          <input className={CAMPO} value={d.marca_modelo} onChange={e => cambiar('marca_modelo', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Código interno Ya!</span>
          <input className={CAMPO} value={d.codigo_interno} onChange={e => cambiar('codigo_interno', e.target.value)} placeholder="El de la etiqueta" />
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Número de serie</span>
          <input className={CAMPO} value={d.nro_serie} onChange={e => cambiar('nro_serie', e.target.value)} placeholder="El del fabricante" />
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Número de lote</span>
          <input className={CAMPO} value={d.nro_lote} onChange={e => cambiar('nro_lote', e.target.value)} placeholder="Si corresponde" />
        </label>
        <label className="space-y-1">
          <span className={ETIQUETA}>Modalidad</span>
          <select className={CAMPO} value={d.modalidad} onChange={e => cambiar('modalidad', e.target.value as ModalidadEquipo)}>
            {MODALIDADES.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>
        {!equipo && !clienteFijo && (
          <>
            <label className="space-y-1">
              <span className={ETIQUETA}>Cliente</span>
              <select className={CAMPO} value={cliente} onChange={e => setCliente(e.target.value)}>
                <option value="">Todavía sin cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            {cliente && (
              <label className="space-y-1">
                <span className={ETIQUETA}>Fecha de entrega</span>
                <input type="date" className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
              </label>
            )}
          </>
        )}
        <label className="space-y-1 sm:col-span-2">
          <span className={ETIQUETA}>Observaciones</span>
          <textarea className={CAMPO} rows={2} value={d.observaciones} onChange={e => cambiar('observaciones', e.target.value)} />
        </label>
        <p className="text-xs text-faint sm:col-span-2">Hace falta al menos uno: código interno, número de serie o lote.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className={`${BOTON} border border-border text-text hover:border-accent`}>Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando} className={`${BOTON} bg-accent text-black hover:opacity-90`}>
          {guardando && <IconLoader2 size={16} className="animate-spin" aria-hidden />}Guardar
        </button>
      </div>
    </Modal>
  )
}

/** Qué se puede hacer con el equipo según dónde está. */
const ACCIONES: Record<SituacionEquipo, TipoMovimiento[]> = {
  en_uso: ['traslado', 'reparacion', 'retiro'],
  en_reparacion: ['entrega', 'retiro'],
  retirado: ['entrega', 'reparacion'],
}

function MoverModal({ equipo, clientes, onCerrar, onMovido, toast }: {
  equipo: EquipoSupervision | null
  clientes: LugarSupervision[]
  onCerrar: () => void
  onMovido: () => Promise<void>
  toast: Toast
}) {
  const [supabase] = useState(() => createClient())
  const [accion, setAccion] = useState<TipoMovimiento>('traslado')
  const [destino, setDestino] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [responsable, setResponsable] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [antes, setAntes] = useState<string | null>(null)
  if ((equipo?.id ?? null) !== antes) {
    setAntes(equipo?.id ?? null)
    if (equipo) { setAccion(ACCIONES[equipo.situacion][0]); setDestino(''); setFecha(hoy()); setResponsable(''); setNota('') }
  }
  const conCliente = accion === 'entrega' || accion === 'traslado'

  async function mover() {
    if (!equipo) return
    if (conCliente && !destino) { toast.error('Elegí el cliente.'); return }
    setGuardando(true)
    const { error } = await supabase.rpc('supervision_mover_equipo', {
      p_equipo: equipo.id, p_tipo: accion, p_destino: conCliente ? destino : null, p_fecha: fecha,
      p_responsable: responsable, p_nota: nota,
    })
    if (error) {
      setGuardando(false)
      toast.error(error.code === '42501' ? 'Tu usuario no puede mover equipos.' : error.message || 'No se pudo registrar el movimiento.')
      return
    }
    await onMovido()
    setGuardando(false)
    toast.success(`${textoDe(MOVIMIENTOS, accion)} registrada`)
    onCerrar()
  }

  return (
    <Modal open={!!equipo} onClose={onCerrar} title="Registrar un movimiento" size="md">
      {equipo && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{textoDe(TIPOS_EQUIPO, equipo.tipo)} {equipo.marca_modelo} · {identificacion(equipo)}</p>
          <div role="group" aria-label="Movimiento" className="flex flex-wrap gap-1.5">
            {ACCIONES[equipo.situacion].map(a => (
              <button key={a} type="button" aria-pressed={accion === a} onClick={() => setAccion(a)}
                className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${accion === a ? 'border-accent bg-accent text-black' : 'border-border text-muted hover:text-text'}`}>
                {a === 'traslado' ? 'Trasladar a otro cliente' : a === 'entrega' ? 'Entregar a un cliente' : a === 'reparacion' ? 'Mandar a reparar' : 'Retirar'}
              </button>
            ))}
          </div>
          {conCliente && (
            <label className="block space-y-1">
              <span className={ETIQUETA}>Cliente</span>
              <select className={CAMPO} value={destino} onChange={e => setDestino(e.target.value)}>
                <option value="">Elegí un cliente</option>
                {clientes.filter(c => c.id !== equipo.lugar_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={ETIQUETA}>Fecha</span>
              <input type="date" className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className={ETIQUETA}>Responsable</span>
              <input className={CAMPO} value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Quién lo lleva o lo retira" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={ETIQUETA}>Nota</span>
            <input className={CAMPO} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={`${BOTON} border border-border text-text hover:border-accent`}>Cancelar</button>
            <button type="button" onClick={mover} disabled={guardando} className={`${BOTON} bg-accent text-black hover:opacity-90`}>
              {guardando ? <IconLoader2 size={16} className="animate-spin" aria-hidden /> : <IconDeviceFloppy size={16} aria-hidden />}Registrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const INICIAL = { cliente: 'todos', tipo: 'todos', situacion: 'todas' }

export default function EquiposSupervision({ equipos, movimientos, clientes, visitas, onGuardado, onRecargar, toast }: {
  equipos: EquipoSupervision[]
  movimientos: MovimientoEquipo[]
  /** Los clientes mayoristas activos. */
  clientes: LugarSupervision[]
  /** Para el último control de cada equipo. */
  visitas: VisitaSupervision[]
  onGuardado: (e: EquipoSupervision) => void
  /** Vuelve a traer equipos y movimientos (después de un movimiento). */
  onRecargar: () => Promise<void>
  toast: Toast
}) {
  const [f, setF] = useState(INICIAL)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<EquipoSupervision | null | 'nuevo'>(null)
  const [moviendo, setMoviendo] = useState<EquipoSupervision | null>(null)
  const cambiar = (k: keyof typeof INICIAL) => (v: string) => setF(prev => ({ ...prev, [k]: v }))
  const nombre = (id: string | null) => (id ? clientes.find(c => c.id === id)?.nombre ?? id : null)

  const lista = equipos.filter(e =>
    (f.cliente === 'todos' || e.lugar_id === f.cliente)
    && (f.tipo === 'todos' || e.tipo === f.tipo)
    && (f.situacion === 'todas' || e.situacion === f.situacion))
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(INICIAL)

  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="font-['Syne'] text-base font-bold text-text">Equipos entregados</h2>
        <p className="mt-0.5 text-xs text-muted">Exhibidoras, hornos, freezers y heladeras de Ya! en los clientes, con su historial.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditando('nuevo')} className={`${BOTON} border border-accent text-accent hover:bg-accent-bg`}>
          <IconPlus size={16} aria-hidden /> Nuevo equipo
        </button>
        <ChipFiltro nombre="Cliente" valor={f.cliente} porDefecto="todos"
          opciones={[{ valor: 'todos', texto: 'Todos los clientes' }, ...clientes.map(c => ({ valor: c.id, texto: c.nombre }))]} onChange={cambiar('cliente')} />
        <ChipFiltro nombre="Tipo" valor={f.tipo} porDefecto="todos"
          opciones={[{ valor: 'todos', texto: 'Todos' }, ...TIPOS_EQUIPO.map(t => ({ valor: t.valor as string, texto: t.texto }))]} onChange={cambiar('tipo')} />
        <ChipFiltro nombre="Situación" valor={f.situacion} porDefecto="todas"
          opciones={[{ valor: 'todas', texto: 'Todas' }, ...SITUACIONES.map(s => ({ valor: s.valor as string, texto: s.texto }))]} onChange={cambiar('situacion')} />
        {hayFiltros && <button type="button" onClick={() => setF(INICIAL)} className="px-1 text-xs font-semibold text-accent hover:underline">Limpiar</button>}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState icono={IconFridge} titulo={equipos.length === 0 ? 'Todavía no hay equipos registrados' : 'No hay equipos con estos filtros'} />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lista.map(e => {
            const historial = movimientos.filter(m => m.equipo_id === e.id)
            const control = ultimoControl(e.id, visitas)
            const esteAbierto = abierto === e.id
            return (
              <li key={e.id}>
                <button type="button" onClick={() => setAbierto(esteAbierto ? null : e.id)} aria-expanded={esteAbierto}
                  className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-bold text-text">{textoDe(TIPOS_EQUIPO, e.tipo)}{e.marca_modelo && <span className="font-normal text-muted"> · {e.marca_modelo}</span>}</p>
                    <p className="text-xs text-muted">{identificacion(e)}</p>
                    <p className="text-xs">
                      <span className={`font-semibold ${COLOR_SITUACION[e.situacion]}`}>{textoDe(SITUACIONES, e.situacion)}</span>
                      {e.lugar_id && <span className="text-text"> · {nombre(e.lugar_id)}</span>}
                      <span className="text-faint"> · {textoDe(MODALIDADES, e.modalidad)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Último control:{' '}
                      {!control ? <span className="text-faint">sin controlar</span> : (
                        <span className={!control.presente || control.estado === 'malo' ? 'font-semibold text-brand-red' : 'text-text'}>
                          {fechaCorta(control.fecha)} · {!control.presente ? 'no estaba en el local' : control.estado ? textoDe(ESTADOS_EQUIPO, control.estado) : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <IconChevronDown size={18} className={`mt-0.5 shrink-0 text-muted transition-transform ${esteAbierto ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {esteAbierto && (
                  <div className="space-y-3 border-t border-border bg-surface2/40 px-3 py-3">
                    {e.observaciones && <p className="text-sm text-muted">{e.observaciones}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMoviendo(e)} className={`${BOTON} bg-accent text-black hover:opacity-90`}>
                        <IconArrowsExchange size={16} aria-hidden /> Registrar un movimiento
                      </button>
                      <button type="button" onClick={() => setEditando(e)} className={`${BOTON} border border-border text-text hover:border-accent`}>
                        Editar datos
                      </button>
                    </div>
                    <div>
                      <p className={ETIQUETA}>Historial</p>
                      <ol className="mt-1 space-y-1">
                        {historial.map(m => (
                          <li key={m.id} className="text-sm text-text">
                            <span className="tabular-nums text-muted">{fechaCorta(m.fecha + 'T15:00:00Z')}</span>{' · '}
                            <b>{textoDe(MOVIMIENTOS, m.tipo)}</b>
                            {m.lugar_origen && m.tipo === 'traslado' && <> de {nombre(m.lugar_origen)}</>}
                            {m.lugar_destino && <> {m.tipo === 'traslado' ? 'a' : 'en'} {nombre(m.lugar_destino)}</>}
                            {m.responsable && <span className="text-muted"> · {m.responsable}</span>}
                            {m.nota && <span className="text-muted"> · {m.nota}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <EquipoModal abierto={editando !== null} equipo={editando === 'nuevo' ? null : editando} clientes={clientes}
        onCerrar={() => setEditando(null)} onGuardado={async eq => { onGuardado(eq); if (editando === 'nuevo') await onRecargar() }} toast={toast} />
      <MoverModal equipo={moviendo} clientes={clientes} onCerrar={() => setMoviendo(null)} onMovido={onRecargar} toast={toast} />
    </section>
  )
}
