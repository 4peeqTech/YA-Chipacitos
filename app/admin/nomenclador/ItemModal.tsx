'use client'

import { useMemo, useState, useTransition } from 'react'
import { IconForms, IconPlugConnected, IconHierarchy2, IconArchive, IconRestore, IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Pestanas, { panelDe } from '@/components/ui/Pestanas'
import { Field, Input, Textarea } from '@/components/ui/Field'
import ListaBuscable from '@/components/ui/ListaBuscable'
import { useToast, useConfirmar } from '@/components/ui/ProveedorUI'
import {
  TIPOS, TIPO_INFO, UNIDADES, SISTEMA_LABEL, SIN_COMPOSICION, UNIDAD_OPCIONAL,
  type TipoItem, type Unidad,
} from '@/lib/nomenclador/tipos'
import type { DatosNomenclador } from './NomencladorClient'
import { CodigoChip, BadgeRevisar, BadgeArchivado, ItemLinea, botonPrimario, botonSecundario, botonPeligro, opcionesItems } from './comun'
import { guardarItem, archivarItem, marcarRevisado, asignarExterno } from './acciones'
import ComposicionEditor from './ComposicionEditor'

type Tab = 'datos' | 'externos' | 'composicion'
const ID_BASE = 'ficha-item'

export default function ItemModal({
  itemId, datos, onCerrar, onAbrirOtro,
}: {
  itemId: string | null
  datos: DatosNomenclador
  onCerrar: () => void
  onAbrirOtro: (id: string) => void
}) {
  const { items, externos, componentes, categorias, sabores, presentaciones } = datos
  const item = itemId ? items.find(i => i.id === itemId) ?? null : null
  const toast = useToast()
  const confirmar = useConfirmar()
  const [pendiente, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('datos')

  const [form, setForm] = useState({
    tipo: (item?.tipo ?? 'materia_prima') as TipoItem,
    nombre: item?.nombre ?? '',
    alternativos: (item?.nombres_alternativos ?? []).join('\n'),
    categoriaId: item?.categoria_id ?? '',
    saborId: item?.sabor_id ?? '',
    presentacionId: item?.presentacion_id ?? '',
    varianteDe: item?.variante_de ?? '',
    unidadBase: (item ? item.unidad_base ?? '' : 'kg') as Unidad | '',
    notas: item?.notas ?? '',
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const tipoEditable = !item || item.a_revisar
  const cambiaTipo = !!item && form.tipo !== item.tipo
  const porId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const susExternos = item ? externos.filter(e => e.item_id === item.id) : []
  const sinMapear = externos.filter(e => e.activo && !e.item_id)
  const seHaceCon = item ? componentes.filter(c => c.item_id === item.id) : []
  const seUsaEn = item ? componentes.filter(c => c.componente_id === item.id) : []
  const variantes = item ? items.filter(i => i.variante_de === item.id) : []

  function guardar() {
    startTransition(async () => {
      const r = await guardarItem({
        itemId: item?.id ?? null,
        datos: {
          tipo: form.tipo,
          nombre: form.nombre,
          nombresAlternativos: form.alternativos.split('\n').map(s => s.trim()).filter(Boolean),
          categoriaId: form.categoriaId || null,
          saborId: form.saborId || null,
          presentacionId: form.presentacionId || null,
          varianteDe: form.varianteDe || null,
          unidadBase: form.unidadBase || null,
          notas: form.notas.trim() || null,
        },
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(item ? (cambiaTipo ? `Guardado. Nuevo código: ${r.data.codigo}` : 'Cambios guardados') : `Creado ${r.data.codigo}`)
      onCerrar()
    })
  }

  function cambiarArchivo() {
    if (!item) return
    const archivar = item.estado === 'activo'
    confirmar({
      titulo: archivar ? `Archivar ${item.codigo}` : `Reactivar ${item.codigo}`,
      mensaje: archivar
        ? 'Deja de aparecer en la lista y no se puede usar en composiciones nuevas. Sus códigos de Posberry y Fudo siguen asignados. Se puede reactivar.'
        : 'Vuelve a aparecer en la lista.',
      textoConfirmar: archivar ? 'Archivar' : 'Reactivar',
      peligroso: archivar,
      onConfirmar: () => startTransition(async () => {
        const r = await archivarItem({ itemId: item.id, archivar })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(archivar ? 'Archivado' : 'Reactivado')
        onCerrar()
      }),
    })
  }

  function cambiarRevision() {
    if (!item) return
    startTransition(async () => {
      const r = await marcarRevisado({ ids: [item.id], revisado: item.a_revisar })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(item.a_revisar ? 'Marcado como revisado' : 'Vuelve a quedar "a revisar"')
    })
  }

  function asignar(externoId: string, destino: string | null) {
    startTransition(async () => {
      const r = await asignarExterno({ externoId, itemId: destino })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(destino ? 'Código asignado' : 'Código quitado: queda sin mapear')
    })
  }

  const productosBase = items.filter(i => i.tipo === 'producto_terminado' && i.estado === 'activo' && i.id !== item?.id)

  return (
    <Modal
      open
      onClose={onCerrar}
      size="2xl"
      pantallaCompletaMobile
      title={item ? item.nombre : 'Nuevo ítem'}
      encabezado={item && (
        <span className="block">
          <span className="block">{item.nombre}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-normal">
            <CodigoChip codigo={item.codigo} tipo={item.tipo} />
            <span className="text-xs text-muted">{TIPO_INFO[item.tipo].label}</span>
            {item.a_revisar && <BadgeRevisar />}
            {item.estado === 'archivado' && <BadgeArchivado />}
          </span>
        </span>
      )}
    >
      <div className="space-y-4">
        {item && (
          <Pestanas
            idBase={ID_BASE}
            etiqueta="Ficha del ítem"
            activa={tab}
            onCambiar={id => setTab(id as Tab)}
            items={[
              { id: 'datos', label: 'Datos', icon: <IconForms size={16} /> },
              { id: 'externos', label: 'Posberry / Fudo', icon: <IconPlugConnected size={16} />, contador: susExternos.length || undefined },
              { id: 'composicion', label: 'Composición', icon: <IconHierarchy2 size={16} />, contador: seHaceCon.length || undefined },
            ]}
          />
        )}

        {/* Datos */}
        <div {...panelDe(ID_BASE, 'datos')} hidden={tab !== 'datos'} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" obligatorio ayuda={!tipoEditable ? 'Ya está revisado: el tipo (y el código) quedan fijos.' : undefined}>
              <ListaBuscable value={form.tipo} disabled={!tipoEditable} onChange={v => set('tipo', v as TipoItem)} aria-label="Tipo"
                opciones={TIPOS.map(t => ({ value: t, label: TIPO_INFO[t].label, prefijo: <span className={`rounded px-1.5 font-mono text-2xs font-semibold ${TIPO_INFO[t].color}`}>{TIPO_INFO[t].prefijo}</span> }))} />
            </Field>
            <Field label="Nombre" obligatorio>
              <Input value={form.nombre} onChange={e => set('nombre', e.target.value)} maxLength={160} />
            </Field>
          </div>
          {cambiaTipo && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-bg p-3 text-sm text-warning">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              Al guardar cambia el código: deja de ser {item!.codigo} y pasa a ser {TIPO_INFO[form.tipo].prefijo}-…
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Categoría">
              <ListaBuscable value={form.categoriaId} onChange={v => set('categoriaId', v)} vacio="Sin categoría" aria-label="Categoría"
                opciones={categorias.filter(c => c.activo || c.id === form.categoriaId).map(c => ({ value: c.id, label: c.nombre }))} />
            </Field>
            <Field label="Unidad base" obligatorio={!UNIDAD_OPCIONAL.includes(form.tipo)} ayuda="En la que se cuenta el stock y las recetas.">
              <ListaBuscable value={form.unidadBase} onChange={v => set('unidadBase', v as Unidad | '')} aria-label="Unidad base"
                vacio={UNIDAD_OPCIONAL.includes(form.tipo) ? 'Sin unidad' : null} placeholder="Elegí una unidad"
                opciones={UNIDADES.map(u => ({ value: u, label: u }))} />
            </Field>
            <Field label="Sabor">
              <ListaBuscable value={form.saborId} onChange={v => set('saborId', v)} vacio="Sin sabor" aria-label="Sabor"
                opciones={sabores.filter(s => s.activo || s.id === form.saborId).map(s => ({ value: s.id, label: s.nombre, buscar: s.nombres_alternativos.join(' ') }))} />
            </Field>
          </div>
          {(form.tipo === 'presentacion' || form.presentacionId || form.varianteDe) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Presentación">
                <ListaBuscable value={form.presentacionId} onChange={v => set('presentacionId', v)} vacio="Sin presentación" aria-label="Presentación"
                  opciones={presentaciones.filter(p => p.activo || p.id === form.presentacionId).map(p => ({ value: p.id, label: p.nombre, descripcion: p.cantidad != null ? `${p.cantidad} ${p.unidad}` : undefined }))} />
              </Field>
              <Field label="Producto base" ayuda="El producto terminado del que sale esta presentación.">
                <ListaBuscable value={form.varianteDe} onChange={v => set('varianteDe', v)} vacio="Sin producto base" aria-label="Producto base"
                  opciones={opcionesItems(productosBase)} />
              </Field>
            </div>
          )}
          <Field label="También se lo conoce como" ayuda="Un nombre por renglón (nombres de pedido, de Compras, Roquefort = Queso Azul…). Entran en la búsqueda.">
            <Textarea rows={3} value={form.alternativos} onChange={e => set('alternativos', e.target.value)} />
          </Field>
          <Field label="Notas">
            <Textarea rows={3} value={form.notas} onChange={e => set('notas', e.target.value)} maxLength={2000} />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            {item && (
              <>
                <button onClick={cambiarArchivo} disabled={pendiente} className={item.estado === 'activo' ? botonPeligro : botonSecundario}>
                  {item.estado === 'activo' ? <><IconArchive size={16} /> Archivar</> : <><IconRestore size={16} /> Reactivar</>}
                </button>
                <button onClick={cambiarRevision} disabled={pendiente} className={botonSecundario}>
                  {item.a_revisar ? <><IconCheck size={16} /> Marcar revisado</> : <>Volver a &quot;a revisar&quot;</>}
                </button>
              </>
            )}
            <button onClick={guardar} disabled={pendiente} className={`${botonPrimario} sm:ml-auto`}>
              {item ? 'Guardar cambios' : 'Crear ítem'}
            </button>
          </div>
        </div>

        {/* Códigos externos */}
        {item && (
          <div {...panelDe(ID_BASE, 'externos')} hidden={tab !== 'externos'} className="space-y-4">
            {susExternos.length === 0
              ? <p className="text-sm text-muted">Este ítem no tiene códigos de Posberry ni de Fudo.</p>
              : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {susExternos.map(e => (
                    <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-20 shrink-0 text-xs text-muted">{SISTEMA_LABEL[e.sistema]}</span>
                      <span className="w-14 shrink-0 font-mono text-sm">{e.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={e.nombre}>{e.nombre}</span>
                      <button onClick={() => asignar(e.id, null)} disabled={pendiente} aria-label={`Quitar ${e.codigo}`}
                        className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-brand-red">
                        <IconX size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            <Field label="Asignar un código sin mapear" ayuda="Para mover un código que ya tiene ítem, quitalo primero desde su ítem o desde Códigos externos.">
              <ListaBuscable value="" onChange={v => v && asignar(v, item.id)} aria-label="Código sin mapear"
                placeholder={sinMapear.length ? 'Elegí un código de Posberry o Fudo…' : 'No hay códigos sin mapear'}
                disabled={!sinMapear.length || pendiente}
                opciones={sinMapear.map(e => ({ value: e.id, label: e.nombre, grupo: SISTEMA_LABEL[e.sistema], buscar: e.codigo,
                  prefijo: <span className="w-10 shrink-0 font-mono text-xs text-muted">{e.codigo}</span> }))} />
            </Field>
          </div>
        )}

        {/* Composición */}
        {item && (
          <div {...panelDe(ID_BASE, 'composicion')} hidden={tab !== 'composicion'} className="space-y-5">
            {SIN_COMPOSICION.includes(item.tipo)
              ? <p className="text-sm text-muted">{TIPO_INFO[item.tipo].plural} no llevan composición.</p>
              : <ComposicionEditor item={item} items={items} componentes={componentes} onAbrir={onAbrirOtro} />}
            {(seUsaEn.length > 0 || variantes.length > 0) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-fg">Se usa en</h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {[...new Set([...seUsaEn.map(c => c.item_id), ...variantes.map(v => v.id)])].map(id => {
                    const it = porId.get(id)
                    if (!it) return null
                    return (
                      <li key={id}>
                        <button onClick={() => onAbrirOtro(id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface2">
                          <ItemLinea item={it} extra={it.estado === 'archivado' ? <BadgeArchivado /> : undefined} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
