'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Info, Loader2, Plus, TriangleAlert, X } from 'lucide-react'
import { Field, controlClass } from '@/components/ui/Field'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import EstadoBadge from '@/components/ui/EstadoBadge'
import { useToast } from '@/components/ui/ProveedorUI'
import { formatearMoneda } from '@/lib/formato'
import { guardarPedido } from './acciones'
import { conUnidad, type PedidoVista } from './modelo'
import type { ItemCatalogo, ProveedorPedido } from './datos'

interface Linea {
  /** Clave local estable para React (las líneas nuevas no tienen id). */
  clave: string
  id: string | null
  item_id: string | null
  descripcion: string
  unidad: string
  cantidad: number | null
}

let secuenciaClave = 0
const nuevaClave = () => `n${++secuenciaClave}`

function lineasDePedido(pedido: PedidoVista): Linea[] {
  return pedido.lineas.map(l => ({
    clave: l.pedido_item_id ?? nuevaClave(),
    id: l.pedido_item_id,
    item_id: l.item_id,
    descripcion: l.descripcion ?? '',
    unidad: l.unidad ?? '',
    cantidad: l.cantidad,
  }))
}

function huella(proveedorId: string, lineas: Linea[]): string {
  return JSON.stringify([proveedorId, lineas.map(l => [l.id, l.item_id, l.descripcion.trim(), l.unidad.trim(), l.cantidad])])
}

export default function PedidoEditor({
  pedido,
  proveedores,
  itemsCatalogo,
  stockPorItem,
  pedidosAbiertos,
  onGuardado,
  onCancelar,
  onCambios,
  onVerPedido,
}: {
  /** null = pedido nuevo. */
  pedido: PedidoVista | null
  proveedores: ProveedorPedido[]
  itemsCatalogo: ItemCatalogo[]
  stockPorItem: Record<string, number>
  /** Pedidos activos, para avisar si ya hay uno con el mismo proveedor (P4). */
  pedidosAbiertos: PedidoVista[]
  onGuardado: (r: { id: string; numero: number; nuevo: boolean; yaEnviado: boolean }) => void
  onCancelar: () => void
  onCambios: (hay: boolean) => void
  onVerPedido: (id: string) => void
}) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [proveedorId, setProveedorId] = useState(pedido?.fila.proveedor_id ?? '')
  const [lineas, setLineas] = useState<Linea[]>(() => (pedido ? lineasDePedido(pedido) : []))
  const [huellaInicial] = useState(() => huella(pedido?.fila.proveedor_id ?? '', pedido ? lineasDePedido(pedido) : []))
  const [intentoGuardar, setIntentoGuardar] = useState(false)

  const proveedor = proveedores.find(p => p.id === proveedorId) ?? null
  const hayCambios = huella(proveedorId, lineas) !== huellaInicial

  useEffect(() => { onCambios(hayCambios) }, [hayCambios, onCambios])

  // Cantidad ya recibida por línea: una línea con remitos no se puede quitar.
  const recibidoPorLinea = useMemo(
    () => Object.fromEntries((pedido?.lineas ?? []).map(l => [l.pedido_item_id ?? '', (l.remitos ?? 0) > 0 ? (l.recibido ?? 0) : null])),
    [pedido],
  )

  const catalogoProveedor = useMemo(() => {
    if (!proveedorId) return []
    return itemsCatalogo
      .map(i => ({ item: i, asociado: i.compras_item_proveedores.find(cp => cp.proveedor_id === proveedorId && cp.activo) }))
      .filter(x => !!x.asociado)
      .map(x => ({ ...x.item, precioRef: x.asociado?.precio_ref ?? null }))
  }, [itemsCatalogo, proveedorId])

  const idsEnPedido = new Set(lineas.map(l => l.item_id).filter(Boolean))
  const catalogoRestante = catalogoProveedor.filter(i => !idsEnPedido.has(i.id))
  const opcionesCatalogo: OpcionSelect[] = catalogoRestante.map(i => ({
    value: i.id,
    label: `${i.nombre}${i.unidad ? ` · ${i.unidad}` : ''}${i.precioRef != null ? ` · ref. ${formatearMoneda(i.precioRef)}` : ''}`,
  }))

  const abiertoMismoProveedor = !pedido && proveedorId
    ? pedidosAbiertos.find(p => p.fila.proveedor_id === proveedorId)
    : undefined

  function sugerida(item: ItemCatalogo): number {
    if (!proveedor?.maneja_stock) return 0
    return Math.max(0, item.stock_minimo - (stockPorItem[item.id] ?? 0))
  }

  function lineaDeItem(item: ItemCatalogo, cantidad: number | null): Linea {
    return { clave: nuevaClave(), id: null, item_id: item.id, descripcion: item.nombre, unidad: item.unidad ?? '', cantidad }
  }

  function elegirProveedor(id: string) {
    setProveedorId(id)
    // Arranca con lo que falta para llegar al stock mínimo (si el proveedor maneja stock).
    const prov = proveedores.find(p => p.id === id)
    const items = itemsCatalogo.filter(i => i.compras_item_proveedores.some(cp => cp.proveedor_id === id && cp.activo))
    setLineas(
      prov?.maneja_stock
        ? items
            .map(i => ({ i, c: Math.max(0, i.stock_minimo - (stockPorItem[i.id] ?? 0)) }))
            .filter(x => x.c > 0)
            .map(x => lineaDeItem(x.i, x.c))
        : [],
    )
  }

  function agregarDelCatalogo(itemId: string) {
    const item = catalogoProveedor.find(i => i.id === itemId)
    if (!item) return
    const c = sugerida(item)
    setLineas(prev => [...prev, lineaDeItem(item, c > 0 ? c : null)])
  }

  function agregarTodos() {
    setLineas(prev => [...prev, ...catalogoRestante.map(i => {
      const c = sugerida(i)
      return lineaDeItem(i, c > 0 ? c : null)
    })])
  }

  function actualizar(clave: string, cambios: Partial<Linea>) {
    setLineas(prev => prev.map(l => (l.clave === clave ? { ...l, ...cambios } : l)))
  }

  const invalidas = lineas.filter(l => !l.descripcion.trim() || !l.cantidad || l.cantidad <= 0)

  function guardar() {
    setIntentoGuardar(true)
    if (!proveedorId) { toast.error('Elegí un proveedor.'); return }
    if (lineas.length === 0) { toast.error('Agregá al menos un ítem.'); return }
    if (invalidas.length) { toast.error('Hay líneas sin descripción o sin cantidad. Completalas o quitalas.'); return }

    startTransition(async () => {
      const r = await guardarPedido({
        pedidoId: pedido?.fila.id ?? null,
        proveedorId,
        localFacturacionId: pedido ? pedido.fila.local_facturacion_id : (proveedor?.local_facturacion_id ?? null),
        lineas: lineas.map(l => ({
          id: l.id,
          item_id: l.item_id,
          descripcion: l.descripcion,
          unidad: l.unidad || null,
          cantidad: l.cantidad ?? 0,
        })),
      })
      if (!r.ok) { toast.error(r.error); return }
      onGuardado({
        ...r.data,
        nuevo: !pedido,
        yaEnviado: !!pedido && pedido.entrada.estado_recepcion !== 'sin_enviar',
      })
    })
  }

  return (
    <div className="space-y-5">
      {pedido ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-text">{pedido.proveedor}</p>
          <EstadoBadge dominio="compras_pedido" estado={pedido.visible} />
        </div>
      ) : (
        <Field label="Proveedor" obligatorio>
          <SelectBuscador
            value={proveedorId}
            onChange={elegirProveedor}
            opciones={proveedores.map(p => ({ value: p.id, label: p.nombre }))}
            placeholderVacio="Elegí un proveedor..."
          />
        </Field>
      )}

      {abiertoMismoProveedor && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning bg-warning-bg px-4 py-3">
          <TriangleAlert size={16} className="shrink-0 text-warning" />
          <p className="flex-1 text-sm text-text">
            Ya hay un pedido abierto con este proveedor: <span className="font-mono tabular-nums font-semibold">{abiertoMismoProveedor.codigo}</span> ({abiertoMismoProveedor.visible === 'sin_enviar' ? 'sin enviar' : 'esperando mercadería'}).
            Si es lo mismo, sumale los ítems a ese.
          </p>
          <button
            type="button"
            onClick={() => onVerPedido(abiertoMismoProveedor.fila.id)}
            className="min-h-11 rounded-xl border border-warning px-3 text-sm font-semibold text-warning hover:bg-surface transition-colors"
          >
            Ver {abiertoMismoProveedor.codigo}
          </button>
        </div>
      )}

      {pedido && pedido.entrada.estado_recepcion !== 'sin_enviar' && (
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Este pedido ya se envió. Al guardar vas a poder reenviarle el mensaje actualizado al proveedor.
        </p>
      )}

      {(proveedorId || pedido) && (
        <section className="space-y-3">
          {lineas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              {catalogoProveedor.length
                ? 'Todavía no hay ítems. Agregalos desde el catálogo del proveedor o con una línea libre.'
                : 'Este proveedor no tiene insumos asociados. Usá "Línea libre" para cargar lo que le pedís.'}
            </p>
          ) : (
            <ul className="space-y-3">
              <li className="hidden sm:grid grid-cols-[1fr_6.5rem_7rem_2.75rem] gap-2 px-0.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                <span>Descripción</span><span>Cantidad</span><span>Unidad</span><span />
              </li>
              {lineas.map(l => {
                const recibido = l.id ? recibidoPorLinea[l.id] : null
                const bloqueada = recibido != null
                const marcarError = intentoGuardar && (!l.descripcion.trim() || !l.cantidad || l.cantidad <= 0)
                return (
                  <li key={l.clave} className="grid grid-cols-[1fr_1fr_2.75rem] sm:grid-cols-[1fr_6.5rem_7rem_2.75rem] gap-2 border-b border-border pb-3 sm:border-0 sm:pb-0">
                    <input
                      type="text"
                      aria-label="Descripción"
                      placeholder="Descripción"
                      value={l.descripcion}
                      onChange={e => actualizar(l.clave, { descripcion: e.target.value })}
                      className={`${controlClass} col-span-3 sm:col-span-1 min-h-11 ${marcarError && !l.descripcion.trim() ? 'border-brand-red' : ''}`}
                    />
                    <InputNumero
                      placeholder="Cant."
                      value={l.cantidad}
                      onChange={v => actualizar(l.clave, { cantidad: v })}
                      min={0}
                      className={`${controlClass} min-h-11 text-right tabular-nums ${marcarError && (!l.cantidad || l.cantidad <= 0) ? 'border-brand-red' : ''}`}
                    />
                    <input
                      type="text"
                      aria-label="Unidad"
                      placeholder="Unidad"
                      value={l.unidad}
                      onChange={e => actualizar(l.clave, { unidad: e.target.value })}
                      className={`${controlClass} min-h-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setLineas(prev => prev.filter(x => x.clave !== l.clave))}
                      disabled={bloqueada}
                      title={bloqueada ? 'Ya tiene remitos cargados: no se puede quitar' : 'Quitar ítem'}
                      aria-label={bloqueada ? `${l.descripcion}: ya tiene remitos, no se puede quitar` : `Quitar ${l.descripcion || 'ítem'}`}
                      className="flex size-11 items-center justify-center rounded-xl text-muted hover:text-brand-red hover:bg-surface2 transition-colors disabled:opacity-30 disabled:hover:text-muted disabled:hover:bg-transparent"
                    >
                      <X size={16} />
                    </button>
                    {bloqueada && (
                      <p className="col-span-3 sm:col-span-4 -mt-1 text-2xs text-muted">
                        Ya llegaron {conUnidad(recibido, l.unidad || null)}: esta línea no se puede quitar.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {opcionesCatalogo.length > 0 && (
              <div className="w-full sm:w-80">
                <SelectBuscador
                  value=""
                  onChange={agregarDelCatalogo}
                  opciones={opcionesCatalogo}
                  placeholderVacio="Agregar insumo del proveedor..."
                />
              </div>
            )}
            {catalogoRestante.length > 1 && (
              <button
                type="button"
                onClick={agregarTodos}
                className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium text-muted hover:text-text hover:bg-surface2 transition-colors"
              >
                Agregar los {catalogoRestante.length} que faltan
              </button>
            )}
            <button
              type="button"
              onClick={() => setLineas(prev => [...prev, { clave: nuevaClave(), id: null, item_id: null, descripcion: '', unidad: '', cantidad: null }])}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted hover:text-text hover:bg-surface2 transition-colors"
            >
              <Plus size={15} /> Línea libre
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold text-muted hover:text-text transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={isPending || (!pedido && !proveedorId)}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          {pedido ? 'Guardar cambios' : 'Crear pedido'}
        </button>
      </div>
    </div>
  )
}
