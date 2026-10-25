'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { avisar, confirmarRecepcion, type ItemRecepcion, type ItemRecepcionNuevo } from '@/lib/pedidos/acciones'
import { formatoCantidad } from '@/lib/pedidos/estados'
import { parseDecimal } from '@/lib/numeros'
import { cantidadATexto as aTexto, parseCantidad } from '../cantidad'
import { useToast } from '@/components/ui/ProveedorUI'
import type { Pedido, Producto } from '@/lib/types'
import { Puntos } from '@/components/ui/Cargando'

// "Hubo diferencias" (D11): la lista arranca con lo enviado. Se corrige lo
// que llegó, el $ es opcional, y se puede sumar un producto que llegó sin
// pedirse.

interface Fila { recibida: string; valor: string }
interface Nuevo { producto: Pick<Producto, 'id' | 'nombre' | 'codigo' | 'unidad'>; recibida: string; valor: string }

const campo = 'h-10 w-full rounded-xl border border-border bg-bg px-2 text-right text-sm tabular-nums text-text focus:border-accent focus:outline-none'

function limpiar(v: string) {
  return v.replace(/[^\d.,]/g, '')
}

export default function RecepcionDiferencias({ pedido, onListo, onVolver }: {
  pedido: Pedido
  onListo: () => void
  onVolver: () => void
}) {
  const toast = useToast()
  const items = useMemo(() => (pedido.pedido_items ?? []).filter(i => i.origen !== 'recepcion'), [pedido.pedido_items])
  const [filas, setFilas] = useState<Record<string, Fila>>(() =>
    Object.fromEntries(items.map(i => [i.id, { recibida: aTexto(Number(i.cantidad_enviada ?? i.cantidad)), valor: '' }])),
  )
  const [nuevos, setNuevos] = useState<Nuevo[]>([])
  const [nota, setNota] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [catalogo, setCatalogo] = useState<Nuevo['producto'][]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    createClient()
      .from('productos')
      .select('id, nombre, codigo, unidad')
      .eq('destino', pedido.destino)
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) toast.error('No se pudo cargar la lista de productos para agregar.')
        else setCatalogo(data ?? [])
      })
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.destino])

  const yaEnPedido = new Set([...items.map(i => i.producto_id), ...nuevos.map(n => n.producto.id)])
  const q = busqueda.trim().toLowerCase()
  const opciones = q
    ? catalogo.filter(p => !yaEnPedido.has(p.id) && (p.nombre.toLowerCase().includes(q) || String(p.codigo ?? '') === q)).slice(0, 8)
    : []

  function setFila(id: string, cambio: Partial<Fila>) {
    setFilas(prev => ({ ...prev, [id]: { ...prev[id], ...cambio } }))
  }

  async function guardar() {
    const payload: ItemRecepcion[] = []
    for (const i of items) {
      const f = filas[i.id]
      // Cantidad: coma/punto siempre decimal. El $ sí admite puntos de miles.
      const recibida = parseCantidad(f.recibida)
      const valor = f.valor.trim() ? parseDecimal(f.valor) : null
      if (recibida == null) return toast.error(`Revisá la cantidad recibida de ${i.producto_nombre}.`)
      if (f.valor.trim() && (valor == null || valor < 0)) return toast.error(`Revisá el $ de ${i.producto_nombre}.`)
      payload.push({ id: i.id, cantidad_recibida: recibida, valor_total: valor })
    }
    const payloadNuevos: ItemRecepcionNuevo[] = []
    for (const n of nuevos) {
      const recibida = parseCantidad(n.recibida)
      const valor = n.valor.trim() ? parseDecimal(n.valor) : null
      if (recibida == null || recibida <= 0) return toast.error(`La cantidad de ${n.producto.nombre} tiene que ser mayor a 0.`)
      if (n.valor.trim() && (valor == null || valor < 0)) return toast.error(`Revisá el $ de ${n.producto.nombre}.`)
      payloadNuevos.push({ producto_id: n.producto.id, cantidad_recibida: recibida, valor_total: valor })
    }

    setGuardando(true)
    const notaLimpia = nota.trim() || null
    const r = await confirmarRecepcion(pedido.id, { items: payload, itemsNuevos: payloadNuevos, nota: notaLimpia })
    if (!r.ok) {
      setGuardando(false)
      return toast.error(r.error)
    }
    let advertencia = r.advertencia
    if (r.data.con_diferencias) {
      toast.success(`Recepción del pedido #${pedido.numero} guardada. Le avisamos al mayorista de las diferencias.`)
    } else if (notaLimpia) {
      // Sin diferencias, confirmarRecepcion no avisa: la nota igual tiene que llegarle al mayorista.
      const avisado = await avisar(pedido.id, 'recibido')
      toast.success(`Recepción del pedido #${pedido.numero} confirmada: coincidió con lo enviado. Le pasamos tu nota al mayorista.`)
      if (!avisado) advertencia = 'Se guardó, pero no se pudo avisar al mayorista de tu nota. Si es urgente, avisá por otro medio.'
    } else {
      toast.success(`Recepción del pedido #${pedido.numero} confirmada: coincidió con lo enviado.`)
    }
    setGuardando(false)
    if (advertencia) toast.error(advertencia)
    onListo()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Corregí lo que llegó de cada producto. El $ es opcional.</p>

      <ul className="space-y-2">
        {items.map(i => {
          const enviada = Number(i.cantidad_enviada ?? i.cantidad)
          const f = filas[i.id]
          const distinta = parseCantidad(f.recibida) !== enviada
          return (
            <li key={i.id} className={`rounded-xl border p-3 ${distinta ? 'border-warning/60 bg-warning-bg' : 'border-border bg-surface2'}`}>
              <p className="text-sm font-medium leading-snug text-text break-words">{i.producto_nombre}</p>
              <div className="mt-2 grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
                <div>
                  <p className="text-2xs uppercase tracking-wider text-faint">Enviado</p>
                  <p className="h-10 flex items-center text-sm font-semibold tabular-nums text-muted">{formatoCantidad(enviada)}</p>
                </div>
                <label className="block">
                  <span className="text-2xs uppercase tracking-wider text-faint">Llegó</span>
                  <input
                    type="text" inputMode="decimal" value={f.recibida}
                    onChange={e => setFila(i.id, { recibida: limpiar(e.target.value) })}
                    onFocus={e => e.currentTarget.select()}
                    className={campo}
                  />
                </label>
                <label className="block">
                  <span className="text-2xs uppercase tracking-wider text-faint">$ (opcional)</span>
                  <input
                    type="text" inputMode="decimal" value={f.valor} placeholder="—"
                    onChange={e => setFila(i.id, { valor: limpiar(e.target.value) })}
                    className={campo}
                  />
                </label>
              </div>
            </li>
          )
        })}

        {nuevos.map(n => (
          <li key={n.producto.id} className="rounded-xl border border-warning/60 bg-warning-bg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-text break-words">{n.producto.nombre}</p>
                <p className="text-2xs text-warning">Llegó sin pedirse</p>
              </div>
              <button
                type="button"
                onClick={() => setNuevos(prev => prev.filter(x => x.producto.id !== n.producto.id))}
                aria-label={`Quitar ${n.producto.nombre}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:text-brand-red"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-2xs uppercase tracking-wider text-faint">Llegó</span>
                <input
                  type="text" inputMode="decimal" value={n.recibida}
                  onChange={e => setNuevos(prev => prev.map(x => x.producto.id === n.producto.id ? { ...x, recibida: limpiar(e.target.value) } : x))}
                  className={campo}
                />
              </label>
              <label className="block">
                <span className="text-2xs uppercase tracking-wider text-faint">$ (opcional)</span>
                <input
                  type="text" inputMode="decimal" value={n.valor} placeholder="—"
                  onChange={e => setNuevos(prev => prev.map(x => x.producto.id === n.producto.id ? { ...x, valor: limpiar(e.target.value) } : x))}
                  className={campo}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Agregar un producto que llegó sin pedirse"
            aria-label="Buscar producto para agregar"
            className="w-full rounded-xl border border-border bg-surface2 py-2.5 pl-9 pr-3 text-sm text-text focus:border-accent focus:outline-none"
          />
        </div>
        {q && (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-surface2 p-1">
            {opciones.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-faint">Sin resultados</p>
            ) : opciones.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setNuevos(prev => [...prev, { producto: p, recibida: '1', valor: '' }]); setBusqueda('') }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text hover:bg-surface"
              >
                <Plus size={14} className="shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 break-words">
                  {p.codigo != null && <span className="text-accent">{p.codigo} · </span>}{p.nombre}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <textarea
        value={nota}
        onChange={e => setNota(e.target.value)}
        placeholder="Nota para el mayorista (opcional)"
        aria-label="Nota de la recepción"
        rows={2}
        maxLength={500}
        className="w-full resize-none rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onVolver}
          disabled={guardando}
          className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted hover:text-text disabled:opacity-40"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-black disabled:opacity-50"
        >
          {guardando ? <><Puntos className="mr-1.5" />Guardando</> : 'Guardar recepción'}
        </button>
      </div>
    </div>
  )
}
