'use client'

import { useState, useTransition } from 'react'
import { IconEye, IconWand } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Field'
import { Chip } from '@/components/ui/Chip'
import { useToast } from '@/components/ui/ProveedorUI'
import { UNIDADES, type Unidad } from '@/lib/nomenclador/tipos'
import type { DatosNomenclador } from './NomencladorClient'
import { botonPrimario, botonSecundario } from './comun'
import { generarVariantes, type FilaGenerador } from './acciones'

/**
 * Producto base × sabores × presentaciones. Primero muestra qué va a crear y
 * qué ya existe (simulación); recién al confirmar escribe. Volver a generar no
 * duplica: lo que existe se deja como está.
 */
export default function GeneradorModal({ datos, onCerrar, onCreados }: {
  datos: DatosNomenclador
  onCerrar: () => void
  onCreados: (ids: string[]) => void
}) {
  const toast = useToast()
  const [pendiente, startTransition] = useTransition()
  const chipa = datos.categorias.find(c => c.nombre.toLowerCase() === 'chipá')
  const [nombre, setNombre] = useState('Chipá')
  const [categoriaId, setCategoriaId] = useState(chipa?.id ?? '')
  const [unidadBase, setUnidadBase] = useState<Unidad>('kg')
  const [sabores, setSabores] = useState<string[]>([])
  const [presentaciones, setPresentaciones] = useState<string[]>([])
  const [vista, setVista] = useState<FilaGenerador[] | null>(null)

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) => {
    set(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id])
    setVista(null) // cualquier cambio invalida la vista previa
  }

  function ejecutar(simular: boolean) {
    startTransition(async () => {
      const r = await generarVariantes({ nombre, categoriaId: categoriaId || null, unidadBase, sabores, presentaciones, simular })
      if (!r.ok) { toast.error(r.error); return }
      if (simular) { setVista(r.data); return }
      const creados = r.data.filter(f => f.accion === 'crear')
      toast.success(creados.length ? `Se crearon ${creados.length} ítems` : 'No había nada nuevo para crear')
      onCreados(creados.map(f => f.id).filter((x): x is string => !!x))
      onCerrar()
    })
  }

  const aCrear = vista?.filter(f => f.accion === 'crear').length ?? 0
  const conflictos = vista?.filter(f => f.accion === 'conflicto').length ?? 0

  return (
    <Modal open onClose={onCerrar} size="xl" pantallaCompletaMobile title="Generar variantes">
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Crea el producto de cada sabor y, para cada presentación, el ítem de venta con su composición
          (producto × cantidad de la presentación). Lo que ya existe no se duplica.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Producto base" obligatorio ayuda='Ej. "Chipá" → "Chipá Jamón · 1/2 kg congelado".'>
            <Input value={nombre} onChange={e => { setNombre(e.target.value); setVista(null) }} maxLength={80} />
          </Field>
          <Field label="Categoría">
            <Select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setVista(null) }}>
              <option value="">Sin categoría</option>
              {datos.categorias.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Unidad del producto">
            <Select value={unidadBase} onChange={e => { setUnidadBase(e.target.value as Unidad); setVista(null) }}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>

        <Field label={`Sabores (${sabores.length})`}>
          <div className="flex flex-wrap gap-2">
            {datos.sabores.filter(s => s.activo).map(s => (
              <Chip key={s.id} active={sabores.includes(s.id)} onClick={() => alternar(sabores, setSabores, s.id)}>{s.nombre}</Chip>
            ))}
          </div>
        </Field>
        <Field label={`Presentaciones (${presentaciones.length})`}>
          <div className="flex flex-wrap gap-2">
            {datos.presentaciones.filter(p => p.activo).map(p => (
              <Chip key={p.id} active={presentaciones.includes(p.id)} onClick={() => alternar(presentaciones, setPresentaciones, p.id)}>{p.nombre}</Chip>
            ))}
          </div>
        </Field>

        {vista && (
          <div className="rounded-xl border border-border">
            <p className="border-b border-border px-3 py-2 text-sm">
              <strong className="text-text">{aCrear}</strong> para crear · <span className="text-muted">{vista.length - aCrear - conflictos} ya existen</span>
              {conflictos > 0 && <span className="text-warning"> · {conflictos} con el nombre ocupado por otro ítem (no se crean)</span>}
            </p>
            <ul className="max-h-64 divide-y divide-border overflow-y-auto text-sm">
              {vista.map((f, i) => (
                <li key={i} className={`flex items-center gap-3 px-3 py-1.5 ${f.accion === 'existe' ? 'text-muted' : ''}`}>
                  <span className={`w-16 shrink-0 text-2xs font-semibold uppercase ${f.accion === 'crear' ? 'text-success' : f.accion === 'conflicto' ? 'text-warning' : 'text-faint'}`}
                    title={f.accion === 'conflicto' ? 'Ya hay otro ítem activo con este nombre que no está vinculado a este producto y presentación.' : undefined}>
                    {f.accion === 'crear' ? 'Nuevo' : f.accion === 'conflicto' ? 'Conflicto' : 'Existe'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
                  {f.codigo && <span className="shrink-0 font-mono text-xs">{f.codigo}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button onClick={() => ejecutar(true)} disabled={pendiente} className={botonSecundario}>
            <IconEye size={16} /> Ver qué se crea
          </button>
          <button onClick={() => ejecutar(false)} disabled={pendiente || !vista || aCrear === 0} className={botonPrimario}>
            <IconWand size={16} /> {vista ? `Crear ${aCrear} ítems` : 'Crear'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
