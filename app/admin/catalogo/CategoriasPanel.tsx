'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { IconCategory, IconChevronDown, IconChevronUp, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import type { DestinoProducto } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import type { useConfirm } from '@/components/ui/ConfirmDialog'
import type { useToasts } from '@/components/ui/Toast'
import {
  CLAVES_COLOR, CLAVES_ICONO, COLORES, ICONOS, esClaveIcono, estiloCategoria, indexarCategorias,
  type CategoriaCatalogo, type ClaveColor,
} from '@/lib/pedidos/categorias'

// Pestaña Categorías de Admin → Catálogo: crear, renombrar, ordenar, elegir
// ícono y color, y desactivar. El orden es el que ven los locales en Pedir y
// el mayorista en su Catálogo. Desactivada = nadie la puede pedir (no se borra
// nada). Renombrar renombra la de sus productos (FK on update cascade).

const FORM_VACIO = { nombre: '', icono: '', color: 'gris' as ClaveColor, activa: true, sugerida: false }
type FormCategoria = typeof FORM_VACIO

const campo = 'w-full rounded-field border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none'
const etiqueta = 'mb-1.5 block text-xs font-medium text-muted'

function mensajeError(error: { code?: string; message: string }, nombre: string, destino: DestinoProducto) {
  if (error.code === '23505') return `Ya hay una categoría "${nombre}" en ${destino === 'fabrica' ? 'Fábrica' : 'Depósito'}.`
  return error.message || 'No se pudo guardar la categoría.'
}

interface Props {
  destino: DestinoProducto
  categorias: CategoriaCatalogo[]
  setCategorias: Dispatch<SetStateAction<CategoriaCatalogo[]>>
  /** Productos por categoría, con clave `destino|nombre`. */
  conteo: Record<string, number>
  onRenombrada: (destino: DestinoProducto, anterior: string, nuevo: string) => void
  toast: ReturnType<typeof useToasts>
  confirmar: ReturnType<typeof useConfirm>['confirmar']
}

export default function CategoriasPanel({ destino, categorias, setCategorias, conteo, onRenombrada, toast, confirmar }: Props) {
  const [supabase] = useState(() => createClient())
  const [modal, setModal] = useState<'nueva' | CategoriaCatalogo | null>(null)
  const [form, setForm] = useState<FormCategoria>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)

  const lista = categorias.filter(c => c.destino === destino).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  const cantidad = (c: CategoriaCatalogo) => conteo[`${c.destino}|${c.nombre}`] ?? 0
  const editando = modal && modal !== 'nueva' ? modal : null
  const esFabrica = destino === 'fabrica'

  function reemplazar(actualizadas: CategoriaCatalogo[]) {
    const porId = new Map(actualizadas.map(c => [c.id, c]))
    setCategorias(prev => prev.map(c => porId.get(c.id) ?? c))
  }

  async function mover(i: number, delta: -1 | 1) {
    const a = lista[i], b = lista[i + delta]
    if (!a || !b || ocupada) return
    setOcupada(a.id)
    reemplazar([{ ...a, orden: b.orden }, { ...b, orden: a.orden }])
    const [r1, r2] = await Promise.all([
      supabase.from('catalogo_categorias').update({ orden: b.orden }).eq('id', a.id),
      supabase.from('catalogo_categorias').update({ orden: a.orden }).eq('id', b.id),
    ])
    setOcupada(null)
    if (r1.error || r2.error) {
      reemplazar([a, b])
      toast.error('No se pudo cambiar el orden. Revisá la conexión y probá de nuevo.')
    }
  }

  async function guardarActiva(c: CategoriaCatalogo, activa: boolean) {
    setOcupada(c.id)
    const { error } = await supabase.from('catalogo_categorias').update({ activa }).eq('id', c.id)
    setOcupada(null)
    if (error) return toast.error(`No se pudo cambiar ${c.nombre}. Probá de nuevo.`)
    reemplazar([{ ...c, activa }])
    toast.success(activa ? `${c.nombre} activada. Ya se puede pedir.` : `${c.nombre} desactivada. Ya no se puede pedir.`)
  }

  function cambiarActiva(c: CategoriaCatalogo) {
    if (!c.activa) return guardarActiva(c, true)
    const n = cantidad(c)
    confirmar({
      titulo: `¿Desactivar ${c.nombre}?`,
      mensaje: `${n === 1 ? 'Su producto deja' : `Sus ${n} productos dejan`} de aparecer en Pedir de los locales y en el Catálogo del mayorista. Los pedidos ya hechos no cambian y no se borra nada: la podés volver a activar cuando quieras.`,
      textoConfirmar: 'Sí, desactivar',
      peligroso: true,
      onConfirmar: () => guardarActiva(c, false),
    })
  }

  function abrirNueva() {
    setForm(FORM_VACIO)
    setErrorForm(null)
    setModal('nueva')
  }

  function abrirEdicion(c: CategoriaCatalogo) {
    setForm({
      nombre: c.nombre, icono: c.icono ?? '', color: (CLAVES_COLOR as string[]).includes(c.color) ? c.color as ClaveColor : 'gris',
      activa: c.activa, sugerida: c.sugerida,
    })
    setErrorForm(null)
    setModal(c)
  }

  function cerrarModal() { if (!guardando) setModal(null) }

  async function guardar() {
    const nombre = form.nombre.trim().replace(/\s+/g, ' ')
    if (!nombre || !modal) return
    setGuardando(true)
    setErrorForm(null)
    const datos = { nombre, icono: form.icono || null, color: form.color, activa: form.activa, sugerida: esFabrica && form.sugerida }
    const orden = Math.max(0, ...lista.map(c => c.orden)) + 1
    const { data, error } = modal === 'nueva'
      ? await supabase.from('catalogo_categorias').insert({ ...datos, destino, orden }).select().single()
      : await supabase.from('catalogo_categorias').update(datos).eq('id', modal.id).select().single()
    setGuardando(false)
    if (error || !data) return setErrorForm(mensajeError(error ?? { message: '' }, nombre, destino))
    const guardada = data as CategoriaCatalogo
    if (modal === 'nueva') {
      setCategorias(prev => [...prev, guardada])
      toast.success(`${guardada.nombre} agregada.`)
    } else {
      reemplazar([guardada])
      if (modal.nombre !== guardada.nombre) onRenombrada(destino, modal.nombre, guardada.nombre)
      toast.success(`${guardada.nombre} guardada.`)
    }
    setModal(null)
  }

  function pedirEliminar(c: CategoriaCatalogo) {
    confirmar({
      titulo: `Eliminar ${c.nombre}`,
      mensaje: 'Se borra de la lista de categorías. Solo se puede si no tiene productos.',
      textoConfirmar: 'Sí, eliminar',
      peligroso: true,
      onConfirmar: async () => {
        setGuardando(true)
        const { error } = await supabase.from('catalogo_categorias').delete().eq('id', c.id)
        setGuardando(false)
        if (!error) {
          setCategorias(prev => prev.filter(x => x.id !== c.id))
          setModal(null)
          toast.success(`${c.nombre} eliminada.`)
        } else if (error.code === '23503') {
          toast.error(`${c.nombre} tiene productos y no se puede borrar. Pasalos a otra categoría o desactivala.`)
        } else {
          toast.error(`No se pudo eliminar ${c.nombre}. Probá de nuevo.`)
        }
      },
    })
  }

  // Vista previa del ícono y el color que se están eligiendo.
  const previa = estiloCategoria(
    indexarCategorias([{ id: '', destino, nombre: '_', orden: 0, icono: form.icono || null, color: form.color, activa: true, sugerida: false }]),
    destino, '_',
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          El orden de esta lista es el que ven los locales en <span className="font-medium text-text">Pedir</span> y el mayorista en su <span className="font-medium text-text">Catálogo</span>.
        </p>
        <button type="button" onClick={abrirNueva}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-black hover:opacity-90">
          <IconPlus size={16} aria-hidden /> Nueva categoría
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState icono={IconCategory} titulo="Todavía no hay categorías" descripcion='Tocá "Nueva categoría" para crear la primera.' />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {lista.map((c, i) => {
            const { icono: Icono, clase } = estiloCategoria(indexarCategorias([c]), destino, c.nombre)
            const n = cantidad(c)
            const bloqueada = ocupada !== null
            return (
              <li key={c.id} className="flex min-h-14 items-center gap-2 py-1.5 pl-1.5 pr-1.5 sm:gap-3 sm:pl-2 sm:pr-3">
                <div className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || bloqueada} aria-label={`Subir ${c.nombre}`}
                    className="flex h-[22px] w-8 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-text disabled:opacity-25">
                    <IconChevronUp size={16} aria-hidden />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1 || bloqueada} aria-label={`Bajar ${c.nombre}`}
                    className="flex h-[22px] w-8 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-text disabled:opacity-25">
                    <IconChevronDown size={16} aria-hidden />
                  </button>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${clase} ${c.activa ? '' : 'opacity-50'}`} aria-hidden>
                  <Icono size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${c.activa ? 'text-text' : 'text-muted'}`}>{c.nombre}</p>
                  <p className="text-2xs text-muted">
                    {n} producto{n === 1 ? '' : 's'}
                    {c.sugerida && <span className="text-accent-fg"> · Sugerida a locales nuevos</span>}
                    {!c.activa && <span className="text-warning"> · Desactivada, nadie la puede pedir</span>}
                  </p>
                </div>
                <button type="button" role="switch" aria-checked={c.activa} onClick={() => cambiarActiva(c)} disabled={bloqueada}
                  aria-label={`Se puede pedir ${c.nombre}`}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1 disabled:opacity-60">
                  <span className="hidden text-xs text-muted sm:inline">Se puede pedir</span>
                  <span className={`relative h-[26px] w-11 rounded-full border transition-colors ${c.activa ? 'border-success bg-green-bg' : 'border-border bg-surface2'}`}>
                    <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${c.activa ? 'left-[21px] bg-success' : 'left-[3px] bg-muted'}`} />
                  </span>
                </button>
                <button type="button" onClick={() => abrirEdicion(c)} aria-label={`Editar ${c.nombre}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text">
                  <IconPencil size={18} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={modal !== null} onClose={cerrarModal} size="lg"
        title={editando ? `Editar categoría` : `Nueva categoría · ${esFabrica ? 'Fábrica' : 'Depósito'}`}>
        <form onSubmit={e => { e.preventDefault(); guardar() }} className="space-y-4">
          <label className="block">
            <span className={etiqueta}>Nombre *</span>
            <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className={campo} placeholder={esFabrica ? 'Toppings' : 'Insumos General'} autoFocus={modal === 'nueva'} />
            {editando && cantidad(editando) > 0 && (
              <span className="mt-1.5 block text-2xs text-muted">
                Si le cambiás el nombre, se cambia en sus {cantidad(editando)} producto{cantidad(editando) === 1 ? '' : 's'}.
              </span>
            )}
          </label>

          <div>
            <span className={etiqueta}>Ícono</span>
            <div className="mb-2 flex items-center gap-2.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${previa.clase}`} aria-hidden>
                <previa.icono size={20} />
              </span>
              <p className="text-xs text-muted">
                {esClaveIcono(form.icono) ? ICONOS[form.icono].etiqueta : 'Genérico'}. Los productos sin ícono propio toman este si su nombre no dice qué son.
              </p>
            </div>
            <div role="radiogroup" aria-label="Ícono de la categoría" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {CLAVES_ICONO.map(clave => {
                const { icono: Icono, etiqueta: texto } = ICONOS[clave]
                const elegido = form.icono === clave
                return (
                  <button key={clave} type="button" role="radio" aria-checked={elegido} aria-label={texto} title={texto}
                    onClick={() => setForm(f => ({ ...f, icono: elegido ? '' : clave }))}
                    className={`flex h-10 items-center justify-center rounded-lg border transition-colors ${
                      elegido ? 'border-accent bg-accent-bg text-accent' : 'border-border bg-surface2 text-muted hover:border-accent/50 hover:text-text'
                    }`}>
                    <Icono size={18} aria-hidden />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className={etiqueta}>Color</span>
            <div role="radiogroup" aria-label="Color de la categoría" className="flex flex-wrap gap-2">
              {CLAVES_COLOR.map(clave => {
                const elegido = form.color === clave
                return (
                  <button key={clave} type="button" role="radio" aria-checked={elegido} aria-label={COLORES[clave].etiqueta} title={COLORES[clave].etiqueta}
                    onClick={() => setForm(f => ({ ...f, color: clave }))}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 ${COLORES[clave].clase} ${elegido ? 'border-accent' : 'border-transparent'}`}>
                    <previa.icono size={18} aria-hidden />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className={etiqueta}>Estado</span>
            <div role="radiogroup" aria-label="Estado" className="inline-flex gap-1 rounded-xl border border-border bg-surface2 p-1">
              {([true, false] as const).map(valor => {
                const elegido = form.activa === valor
                return (
                  <button key={String(valor)} type="button" role="radio" aria-checked={elegido}
                    onClick={() => setForm(f => ({ ...f, activa: valor }))}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      elegido ? valor ? 'bg-green-bg text-success' : 'bg-warning-bg text-warning' : 'text-muted hover:text-text'
                    }`}>
                    {valor ? 'Activa' : 'Desactivada'}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-2xs text-muted">
              {form.activa
                ? 'Se puede pedir.'
                : 'Los locales no la ven en Pedir y el mayorista no la ve en su Catálogo. No se borra nada.'}
            </p>
          </div>

          {esFabrica && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface2 p-3">
              <input type="checkbox" checked={form.sugerida} onChange={e => setForm(f => ({ ...f, sugerida: e.target.checked }))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium text-text">Sugerir a locales sin pedidos</span>
                <span className="mt-0.5 block text-2xs text-muted">
                  Si un local todavía no pidió nada, sus productos le aparecen en «Tus habituales» para pedir más rápido.
                </span>
              </span>
            </label>
          )}

          {errorForm && <p role="alert" className="text-xs text-brand-red">{errorForm}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            {editando && (
              <button type="button" onClick={() => pedirEliminar(editando)} disabled={guardando || cantidad(editando) > 0}
                title={cantidad(editando) > 0 ? 'Tiene productos: pasalos a otra categoría o desactivala.' : undefined}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:border-brand-red/50 hover:text-brand-red disabled:opacity-40 sm:mr-auto">
                <IconTrash size={16} aria-hidden /> Eliminar
              </button>
            )}
            <button type="button" onClick={cerrarModal} disabled={guardando}
              className={`rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-text ${editando ? '' : 'sm:ml-auto'}`}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando || !form.nombre.trim()}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
