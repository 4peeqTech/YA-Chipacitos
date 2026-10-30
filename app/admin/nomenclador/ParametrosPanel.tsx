'use client'

import { useState, useTransition, type ComponentType } from 'react'
import { IconCategory2, IconCheese, IconPackage, IconPlus } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { TIPOS, TIPO_INFO, UNIDADES, type TipoItem, type Unidad } from '@/lib/nomenclador/tipos'
import type { DatosNomenclador } from './NomencladorClient'
import { botonPrimario, botonSecundario } from './comun'
import { guardarParametro } from './acciones'

type Tabla = 'categoria' | 'sabor' | 'presentacion'
interface Fila { id: string; nombre: string; detalle?: string; activo: boolean; usos: number }
interface Editando { tabla: Tabla; id: string | null }
const NUEVO: Record<Tabla, string> = { categoria: 'Nueva categoría', sabor: 'Nuevo sabor', presentacion: 'Nueva presentación' }

const TITULOS: Record<Tabla, { titulo: string; singular: string; icono: ComponentType<{ size?: number }>; ayuda: string }> = {
  categoria: { titulo: 'Categorías', singular: 'categoría', icono: IconCategory2, ayuda: 'Para agrupar y filtrar la lista.' },
  sabor: { titulo: 'Sabores', singular: 'sabor', icono: IconCheese, ayuda: 'Se usan en los productos y en el generador de variantes.' },
  presentacion: { titulo: 'Presentaciones', singular: 'presentación', icono: IconPackage, ayuda: 'Formatos de venta: 1/2 kg congelado, 100 gr horneado, 12 unidades…' },
}

export default function ParametrosPanel({ datos }: { datos: DatosNomenclador }) {
  const { items, categorias, sabores, presentaciones } = datos
  const [editando, setEditando] = useState<Editando | null>(null)
  const usos = (campo: 'categoria_id' | 'sabor_id' | 'presentacion_id', id: string) =>
    items.filter(i => i[campo] === id && i.estado === 'activo').length

  const listas: Record<Tabla, Fila[]> = {
    categoria: categorias.map(c => ({
      id: c.id, nombre: c.nombre, activo: c.activo, usos: usos('categoria_id', c.id),
      detalle: c.tipo ? `Solo ${TIPO_INFO[c.tipo].plural.toLowerCase()}` : undefined,
    })),
    sabor: sabores.map(s => ({
      id: s.id, nombre: s.nombre, activo: s.activo, usos: usos('sabor_id', s.id),
      detalle: s.nombres_alternativos.length ? `También: ${s.nombres_alternativos.join(', ')}` : undefined,
    })),
    presentacion: presentaciones.map(p => ({
      id: p.id, nombre: p.nombre, activo: p.activo, usos: usos('presentacion_id', p.id),
      detalle: p.cantidad != null ? `${p.cantidad} ${p.unidad}` : 'Sin cantidad',
    })),
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {(Object.keys(TITULOS) as Tabla[]).map(tabla => {
        const { titulo, icono: Icono, ayuda, singular } = TITULOS[tabla]
        return (
          <section key={tabla} className="rounded-2xl border border-border bg-surface p-4">
            <header className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-text"><Icono size={18} /> {titulo}</h2>
                <p className="mt-0.5 text-xs text-muted">{ayuda}</p>
              </div>
              <button onClick={() => setEditando({ tabla, id: null })} aria-label={`Agregar ${singular}`}
                className="rounded-lg border border-border p-2 text-muted hover:border-accent hover:text-text">
                <IconPlus size={16} />
              </button>
            </header>
            <ul className="divide-y divide-border">
              {listas[tabla].map(f => (
                <li key={f.id}>
                  <button onClick={() => setEditando({ tabla, id: f.id })}
                    className={`flex w-full items-center gap-2 py-2 text-left text-sm hover:text-accent-fg ${f.activo ? '' : 'opacity-50'}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-text">{f.nombre}{!f.activo && ' (inactivo)'}</span>
                      {f.detalle && <span className="block truncate text-xs text-muted">{f.detalle}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted" title="Ítems activos que lo usan">{f.usos}</span>
                  </button>
                </li>
              ))}
              {listas[tabla].length === 0 && <li className="py-2 text-sm text-muted">Todavía no hay {titulo.toLowerCase()}.</li>}
            </ul>
          </section>
        )
      })}
      {editando && <ParametroModal key={`${editando.tabla}-${editando.id}`} editando={editando} datos={datos} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

function ParametroModal({ editando, datos, onCerrar }: { editando: Editando; datos: DatosNomenclador; onCerrar: () => void }) {
  const toast = useToast()
  const [pendiente, startTransition] = useTransition()
  const { tabla, id } = editando
  const cat = tabla === 'categoria' ? datos.categorias.find(c => c.id === id) : undefined
  const sab = tabla === 'sabor' ? datos.sabores.find(s => s.id === id) : undefined
  const pre = tabla === 'presentacion' ? datos.presentaciones.find(p => p.id === id) : undefined
  const actual = cat ?? sab ?? pre

  const [nombre, setNombre] = useState(actual?.nombre ?? '')
  const [activo, setActivo] = useState(actual?.activo ?? true)
  const [tipo, setTipo] = useState<TipoItem | ''>(cat?.tipo ?? '')
  const [alternativos, setAlternativos] = useState((sab?.nombres_alternativos ?? []).join('\n'))
  const [cantidad, setCantidad] = useState(pre?.cantidad != null ? String(pre.cantidad) : '')
  const [unidad, setUnidad] = useState<Unidad | ''>(pre?.unidad ?? '')

  function guardar() {
    const cant = cantidad.trim() ? Number(cantidad.replace(',', '.')) : null
    if (cant != null && !Number.isFinite(cant)) { toast.error('La cantidad tiene que ser un número.'); return }
    startTransition(async () => {
      const r = await guardarParametro({
        tabla, id,
        datos: {
          nombre, activo,
          ...(tabla === 'categoria' && { tipo: tipo || null }),
          ...(tabla === 'sabor' && { nombresAlternativos: alternativos.split('\n').map(s => s.trim()).filter(Boolean) }),
          ...(tabla === 'presentacion' && { cantidad: cant, unidad: unidad || null }),
          ...(!id && { orden: 999 }),
        },
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(id ? 'Guardado' : 'Creado')
      onCerrar()
    })
  }

  const { singular } = TITULOS[tabla]
  return (
    <Modal open onClose={onCerrar} title={id ? `Editar ${singular}` : NUEVO[tabla]}>
      <div className="space-y-4">
        <Field label="Nombre" obligatorio>
          <Input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} autoFocus />
        </Field>
        {tabla === 'categoria' && (
          <Field label="Solo para el tipo" ayuda="Opcional: limita la categoría a un tipo de ítem al filtrar.">
            <Select value={tipo} onChange={e => setTipo(e.target.value as TipoItem | '')}>
              <option value="">Cualquier tipo</option>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_INFO[t].label}</option>)}
            </Select>
          </Field>
        )}
        {tabla === 'sabor' && (
          <Field label="También se lo conoce como" ayuda="Un nombre por renglón (ej. Roquefort para Queso Azul).">
            <Textarea rows={3} value={alternativos} onChange={e => setAlternativos(e.target.value)} />
          </Field>
        )}
        {tabla === 'presentacion' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cantidad" ayuda="La usa el generador para armar la composición.">
              <Input inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="0,5" />
            </Field>
            <Field label="Unidad">
              <Select value={unidad} onChange={e => setUnidad(e.target.value as Unidad | '')}>
                <option value="">—</option>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
          </div>
        )}
        {id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="size-4 accent-accent" />
            Activo (si se desactiva, deja de ofrecerse al elegir; los ítems que lo usan no cambian)
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button onClick={onCerrar} className={botonSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={pendiente} className={botonPrimario}>{id ? 'Guardar' : 'Crear'}</button>
        </div>
      </div>
    </Modal>
  )
}
