'use client'

import { useMemo, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { PedidoItem, Producto } from '@/lib/types'
import type { ItemEdicion } from '@/lib/pedidos/acciones'
import { formatoCantidad } from '@/lib/pedidos/estados'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { cantidadAEnviar } from './utiles'
import { Puntos } from '@/components/ui/Cargando'

// Edición de lo que se manda (pedido_editar_items): cambiar la cantidad
// enviada, sacar un producto (enviada 0) o agregar uno del catálogo activo.

interface Agregado { producto_id: string; nombre: string; cantidad: number | null }

interface Props {
  items: PedidoItem[]
  productos: Producto[]
  guardando: boolean
  onCancelar: () => void
  onGuardar: (cambios: ItemEdicion[]) => void
}

const inputClase = 'w-20 bg-surface2 border border-border text-text rounded-field px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent disabled:opacity-40'

export default function EditorItems({ items, productos, guardando, onCancelar, onGuardar }: Props) {
  const [valores, setValores] = useState<Record<string, number | null>>(
    () => Object.fromEntries(items.map(i => [i.id, cantidadAEnviar(i)])),
  )
  const [agregados, setAgregados] = useState<Agregado[]>([])
  const [productoNuevo, setProductoNuevo] = useState('')

  const enPedido = useMemo(() => new Set([...items.map(i => i.producto_id), ...agregados.map(a => a.producto_id)]), [items, agregados])
  const opciones = productos
    .filter(p => p.activo && !enPedido.has(p.id))
    .map(p => ({ value: p.id, label: p.nombre, grupo: p.categoria ?? undefined }))

  const cambios: ItemEdicion[] = [
    ...items
      .filter(i => valores[i.id] != null && Number(valores[i.id]) !== cantidadAEnviar(i))
      .map(i => ({ item_id: i.id, producto_id: i.producto_id, cantidad_enviada: Number(valores[i.id]) })),
    ...agregados
      .filter(a => a.cantidad != null && a.cantidad > 0)
      .map(a => ({ producto_id: a.producto_id, cantidad_enviada: Number(a.cantidad) })),
  ]
  const hayVacios = items.some(i => valores[i.id] == null) || agregados.some(a => a.cantidad == null || a.cantidad <= 0)

  function agregar(id: string) {
    const p = productos.find(x => x.id === id)
    if (!p) return
    setAgregados(prev => [...prev, { producto_id: p.id, nombre: p.nombre, cantidad: null }])
    setProductoNuevo('')
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-2xs font-semibold uppercase tracking-wider text-faint">
            <th className="py-1.5 text-left">Producto</th>
            <th className="py-1.5 text-right">Pedido</th>
            <th className="py-1.5 pl-3 text-right">Se manda</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map(i => {
            const v = valores[i.id]
            const quitado = v === 0
            const actual = cantidadAEnviar(i)
            const cambiado = v != null && Number(v) !== actual
            // Si ya venía en 0 (quitado antes), se vuelve a lo pedido; si no, a lo que se mandaba.
            const restaurar = actual > 0 ? actual : Number(i.cantidad) || null
            return (
              <tr key={i.id} className="border-b border-border/50 last:border-0">
                <td className={`py-2 pr-2 leading-tight ${quitado ? 'text-faint line-through' : 'text-text'}`}>
                  {i.producto_nombre}
                  {quitado && <span className="block text-2xs text-warning no-underline">No se manda</span>}
                </td>
                <td className="py-2 text-right text-muted tabular-nums">
                  {i.origen === 'despacho' ? '—' : formatoCantidad(i.cantidad)}
                </td>
                <td className="py-2 pl-3 text-right">
                  <InputNumero
                    cantidad
                    value={v}
                    min={0}
                    disabled={guardando}
                    onChange={n => setValores(prev => ({ ...prev, [i.id]: n }))}
                    className={`${inputClase} ${cambiado ? 'border-warning text-warning' : ''}`}
                  />
                </td>
                <td className="py-2 pl-1 text-right">
                  {quitado ? (
                    <button type="button" disabled={guardando} aria-label={`Volver a mandar ${i.producto_nombre}`} title="Volver a mandar"
                      onClick={() => setValores(prev => ({ ...prev, [i.id]: restaurar }))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text">
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <button type="button" disabled={guardando} aria-label={`Sacar ${i.producto_nombre}`} title="Sacar del pedido"
                      onClick={() => setValores(prev => ({ ...prev, [i.id]: 0 }))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-brand-red">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {agregados.map(a => (
            <tr key={a.producto_id} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-2 text-text leading-tight">
                {a.nombre}
                <span className="block text-2xs text-warning">Agregado al despachar</span>
              </td>
              <td className="py-2 text-right text-muted">—</td>
              <td className="py-2 pl-3 text-right">
                <InputNumero
                  cantidad
                  value={a.cantidad}
                  min={0}
                  autoFocus
                  disabled={guardando}
                  onChange={n => setAgregados(prev => prev.map(x => x.producto_id === a.producto_id ? { ...x, cantidad: n } : x))}
                  className={`${inputClase} border-warning`}
                />
              </td>
              <td className="py-2 pl-1 text-right">
                <button type="button" disabled={guardando} aria-label={`Quitar ${a.nombre}`}
                  onClick={() => setAgregados(prev => prev.filter(x => x.producto_id !== a.producto_id))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-brand-red">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-2">
        <Plus size={16} className="shrink-0 text-muted" aria-hidden />
        <SelectBuscador
          value={productoNuevo}
          onChange={agregar}
          opciones={opciones}
          placeholderVacio="Agregar un producto del catálogo…"
          disabled={guardando}
          className="flex-1"
        />
      </div>

      {hayVacios && <p className="text-xs text-warning">Completá la cantidad de cada producto (0 para no mandarlo).</p>}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} disabled={guardando}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-text">
          Descartar cambios
        </button>
        <button type="button" onClick={() => onGuardar(cambios)} disabled={guardando || hayVacios || cambios.length === 0}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40">
          {guardando ? <><Puntos className="mr-1.5" />Guardando</> : cambios.length ? `Guardar ${cambios.length} cambio${cambios.length === 1 ? '' : 's'}` : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
