'use client'

import { useState, useTransition } from 'react'
import { IconPlus, IconTrash, IconArrowUpRight } from '@tabler/icons-react'
import { Input } from '@/components/ui/Field'
import ListaBuscable from '@/components/ui/ListaBuscable'
import { useToast } from '@/components/ui/ProveedorUI'
import { UNIDADES, type ItemNom, type ComponenteNom, type Unidad } from '@/lib/nomenclador/tipos'
import { botonPrimario, botonSecundario, opcionesItems } from './comun'
import { guardarComposicion } from './acciones'

interface Linea { key: number; componenteId: string; cantidad: string; unidad: Unidad | ''; merma: string; notas: string | null }

const num = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : null)

/** Edita "se hace con": componentes con cantidad, unidad y merma opcionales, y el rendimiento. */
export default function ComposicionEditor({
  item, items, componentes, onAbrir,
}: {
  item: ItemNom
  items: ItemNom[]
  componentes: ComponenteNom[]
  onAbrir: (id: string) => void
}) {
  const toast = useToast()
  const [pendiente, startTransition] = useTransition()
  const iniciales = componentes.filter(c => c.item_id === item.id)
  const [lineas, setLineas] = useState<Linea[]>(() => iniciales.map((c, i) => ({
    key: i, componenteId: c.componente_id,
    cantidad: c.cantidad != null ? String(c.cantidad) : '', unidad: c.unidad ?? '',
    merma: c.merma_pct != null ? String(c.merma_pct) : '', notas: c.notas,
  })))
  const [rinde, setRinde] = useState(item.rinde_cantidad != null ? String(item.rinde_cantidad) : '')
  const [sigKey, setSigKey] = useState(iniciales.length)

  const porId = new Map(items.map(i => [i.id, i]))
  // Conceptos y archivados no pueden ser componentes (la base lo rechaza igual).
  // Un componente ya cargado que después se archivó se sigue mostrando (marcado),
  // para que se vea y se pueda quitar; la base no deja agregar archivados nuevos.
  const yaCargados = new Set(iniciales.map(c => c.componente_id))
  const opciones = opcionesItems(items.filter(i =>
    i.id !== item.id && i.tipo !== 'concepto' && (i.estado === 'activo' || yaCargados.has(i.id))))

  const cambiar = (key: number, cambios: Partial<Linea>) =>
    setLineas(ls => ls.map(l => (l.key === key ? { ...l, ...cambios } : l)))

  function agregar() {
    setLineas(ls => [...ls, { key: sigKey, componenteId: '', cantidad: '', unidad: '', merma: '', notas: null }])
    setSigKey(k => k + 1)
  }

  function guardar() {
    const vacias = lineas.filter(l => !l.componenteId)
    if (vacias.length) { toast.error('Elegí el ítem de cada línea o quitá las vacías.'); return }
    const datos = lineas.map(l => ({ componenteId: l.componenteId, cantidad: num(l.cantidad), unidad: l.unidad || null, mermaPct: num(l.merma), notas: l.notas }))
    if (datos.some(d => (d.cantidad != null && !Number.isFinite(d.cantidad)) || (d.mermaPct != null && !Number.isFinite(d.mermaPct)))) {
      toast.error('Las cantidades y la merma tienen que ser números.'); return
    }
    const r = num(rinde)
    if (r != null && !Number.isFinite(r)) { toast.error('El rendimiento tiene que ser un número.'); return }
    startTransition(async () => {
      const res = await guardarComposicion({ itemId: item.id, rinde: r, componentes: datos })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Composición guardada')
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-fg">Se hace con</h3>
          <p className="mt-0.5 text-xs text-muted">Cantidad, unidad y merma son opcionales: se completan cuando estén definidas.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Rinde
          <Input inputMode="decimal" value={rinde} onChange={e => setRinde(e.target.value)} placeholder="—" className="w-24" aria-label="Rendimiento" />
          <span>{item.unidad_base ?? ''}</span>
        </label>
      </div>

      {lineas.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">Todavía no tiene componentes.</p>}

      <ul className="space-y-2">
        {lineas.map(l => {
          const comp = porId.get(l.componenteId)
          return (
            <li key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border p-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_5.5rem_auto] sm:items-center">
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <ListaBuscable value={l.componenteId} onChange={v => cambiar(l.key, { componenteId: v, unidad: porId.get(v)?.unidad_base ?? '' })}
                  placeholder="Elegí un ítem…" aria-label="Componente" opciones={opciones} className="min-w-0 flex-1" />
                {comp && (
                  <button onClick={() => onAbrir(comp.id)} title="Abrir su ficha" className="rounded-lg p-2 text-muted hover:text-text">
                    <IconArrowUpRight size={16} />
                  </button>
                )}
              </div>
              <Input inputMode="decimal" value={l.cantidad} onChange={e => cambiar(l.key, { cantidad: e.target.value })} placeholder="Cantidad" aria-label="Cantidad" />
              <ListaBuscable value={l.unidad} onChange={v => cambiar(l.key, { unidad: v as Unidad | '' })} vacio="Unidad" aria-label="Unidad"
                opciones={UNIDADES.map(u => ({ value: u, label: u }))} />
              <Input inputMode="decimal" value={l.merma} onChange={e => cambiar(l.key, { merma: e.target.value })} placeholder="Merma %" aria-label="Merma %" />
              <button onClick={() => setLineas(ls => ls.filter(x => x.key !== l.key))} aria-label="Quitar componente"
                className="justify-self-end rounded-lg p-2 text-muted hover:bg-danger-bg hover:text-brand-red">
                <IconTrash size={16} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button onClick={agregar} className={botonSecundario}><IconPlus size={16} /> Agregar componente</button>
        <button onClick={guardar} disabled={pendiente} className={`${botonPrimario} sm:ml-auto`}>Guardar composición</button>
      </div>
    </section>
  )
}
