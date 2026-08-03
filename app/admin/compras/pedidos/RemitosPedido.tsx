'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sugerirPedidoItem } from '@/lib/compras/matchRemito'

export interface RemitoItem {
  id: string
  remito_id: string
  pedido_item_id: string | null
  item_id: string | null
  descripcion: string
  cantidad: number
  precio: number | null
}

export interface Remito {
  id: string
  pedido_id: string
  numero: string
  fecha: string
  created_at: string
  compras_remito_items: RemitoItem[]
}

interface PedidoItemPD {
  id: string
  item_id: string | null
  descripcion: string
  cantidad: number
}

interface PedidoPD {
  id: string
  compras_pedido_items: PedidoItemPD[]
  compras_remitos: Remito[]
}

interface LineaEditor {
  descripcion: string
  cantidad: number
  precio: number | null
  pedidoItemId: string | null
  matchManual: boolean
}

function lineaVacia(): LineaEditor {
  return { descripcion: '', cantidad: 0, precio: null, pedidoItemId: null, matchManual: false }
}

export default function RemitosPedido({
  pedido,
  usuarioId,
  onRemitosChange,
}: {
  pedido: PedidoPD
  usuarioId: string
  onRemitosChange: (remitos: Remito[]) => void
}) {
  const supabase = createClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [remitoEditandoId, setRemitoEditandoId] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [lineas, setLineas] = useState<LineaEditor[]>([lineaVacia()])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const recibidoPorItem: Record<string, number> = {}
  for (const remito of pedido.compras_remitos) {
    for (const item of remito.compras_remito_items) {
      if (item.pedido_item_id) {
        recibidoPorItem[item.pedido_item_id] = (recibidoPorItem[item.pedido_item_id] ?? 0) + item.cantidad
      }
    }
  }

  function abrirForm() {
    setRemitoEditandoId(null)
    setNumero('')
    setFecha('')
    setLineas([lineaVacia()])
    setError('')
    setMostrarForm(true)
  }

  function abrirEdicion(remito: Remito) {
    setRemitoEditandoId(remito.id)
    setNumero(remito.numero)
    setFecha(remito.fecha)
    setLineas(
      remito.compras_remito_items.map(i => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio: i.precio,
        pedidoItemId: i.pedido_item_id,
        matchManual: true,
      }))
    )
    setError('')
    setMostrarForm(true)
  }

  function cerrarForm() {
    setMostrarForm(false)
    setRemitoEditandoId(null)
  }

  function agregarLinea() {
    setLineas(prev => [...prev, lineaVacia()])
  }

  function quitarLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  function actualizarDescripcion(idx: number, descripcion: string) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (l.matchManual) return { ...l, descripcion }
      const sugerido = sugerirPedidoItem(descripcion, pedido.compras_pedido_items)
      return { ...l, descripcion, pedidoItemId: sugerido }
    }))
  }

  function actualizarMatch(idx: number, pedidoItemId: string) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, pedidoItemId: pedidoItemId || null, matchManual: true } : l))
  }

  function actualizarCampo(idx: number, cambios: Partial<Pick<LineaEditor, 'cantidad' | 'precio'>>) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...cambios } : l))
  }

  async function sumarStock(itemId: string, delta: number) {
    const { data: actual } = await supabase
      .from('compras_stock_actual')
      .select('cantidad')
      .eq('item_id', itemId)
      .maybeSingle()

    const nuevaCantidad = (actual?.cantidad ?? 0) + delta
    await supabase.from('compras_stock_actual').upsert(
      { item_id: itemId, cantidad: nuevaCantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
      { onConflict: 'item_id' }
    )
  }

  async function revertirYBorrar(remitoId: string) {
    const remito = pedido.compras_remitos.find(r => r.id === remitoId)
    if (!remito) return
    for (const item of remito.compras_remito_items) {
      if (item.item_id) await sumarStock(item.item_id, -item.cantidad)
    }
    await supabase.from('compras_remitos').delete().eq('id', remitoId)
  }

  async function guardarRemito() {
    if (!numero.trim() || !fecha) { setError('Completá número y fecha'); return }
    const filas = lineas.filter(l => l.descripcion.trim() && l.cantidad > 0)
    if (!filas.length) { setError('Agregá al menos un ítem con cantidad'); return }

    let remitoAReemplazar = remitoEditandoId
    if (!remitoAReemplazar) {
      const existente = pedido.compras_remitos.find(r => r.numero === numero.trim())
      if (existente) {
        if (!confirm(`Ya existe el remito ${numero} en este pedido. ¿Sobrescribirlo?`)) return
        remitoAReemplazar = existente.id
      }
    }

    setError('')
    startTransition(async () => {
      if (remitoAReemplazar) await revertirYBorrar(remitoAReemplazar)

      const { data: remito, error: errRemito } = await supabase
        .from('compras_remitos')
        .insert([{ pedido_id: pedido.id, numero: numero.trim(), fecha, creado_por: usuarioId }])
        .select()
        .single()
      if (errRemito) { setError(errRemito.message); return }

      const filasInsert = filas.map(l => ({
        remito_id: remito.id,
        pedido_item_id: l.pedidoItemId,
        item_id: pedido.compras_pedido_items.find(pi => pi.id === l.pedidoItemId)?.item_id ?? null,
        descripcion: l.descripcion.trim(),
        cantidad: l.cantidad,
        precio: l.precio,
      }))

      const { data: itemsGuardados, error: errItems } = await supabase
        .from('compras_remito_items')
        .insert(filasInsert)
        .select()
      if (errItems) { setError(errItems.message); return }

      for (const item of itemsGuardados) {
        if (item.item_id) await sumarStock(item.item_id, item.cantidad)
      }

      const remitoCompleto: Remito = { ...remito, compras_remito_items: itemsGuardados }
      onRemitosChange([...pedido.compras_remitos.filter(r => r.id !== remitoAReemplazar), remitoCompleto])
      cerrarForm()
    })
  }

  async function borrarRemito(remito: Remito) {
    if (!confirm(`¿Borrar el remito ${remito.numero}?`)) return
    startTransition(async () => {
      await revertirYBorrar(remito.id)
      onRemitosChange(pedido.compras_remitos.filter(r => r.id !== remito.id))
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wider">Remitos</h3>
        {!mostrarForm && (
          <button onClick={abrirForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
            + Registrar remito
          </button>
        )}
      </div>

      {pedido.compras_pedido_items.length > 0 && (
        <div className="space-y-1">
          {pedido.compras_pedido_items.map(item => (
            <div key={item.id} className="flex items-center justify-between text-xs text-[#888]">
              <span>{item.descripcion}</span>
              <span>{recibidoPorItem[item.id] ?? 0} / {item.cantidad}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {mostrarForm && (
        <div className="border border-[#2a2a2a] rounded-lg p-3 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>N° Remito</label>
              <input type="text" className={inputClass} value={numero} onChange={e => setNumero(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Fecha</label>
              <input type="date" className={inputClass} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {lineas.map((linea, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Descripción (como figura en el remito)"
                  value={linea.descripcion}
                  onChange={e => actualizarDescripcion(idx, e.target.value)}
                />
                <select
                  className={`${inputClass} w-48`}
                  value={linea.pedidoItemId ?? ''}
                  onChange={e => actualizarMatch(idx, e.target.value)}
                >
                  <option value="">Sin corresponder</option>
                  {pedido.compras_pedido_items.map(item => (
                    <option key={item.id} value={item.id}>{item.descripcion}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  placeholder="Cant."
                  value={linea.cantidad || ''}
                  onChange={e => actualizarCampo(idx, { cantidad: Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="0.01"
                  className={`${inputClass} w-24`}
                  placeholder="Precio"
                  value={linea.precio ?? ''}
                  onChange={e => actualizarCampo(idx, { precio: e.target.value ? Number(e.target.value) : null })}
                />
                <button onClick={() => quitarLinea(idx)} className="text-[#888] hover:text-red-400 text-lg px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={agregarLinea} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              + Agregar línea
            </button>
            <button onClick={guardarRemito} disabled={isPending} className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              Guardar remito
            </button>
            <button onClick={cerrarForm} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pedido.compras_remitos.length > 0 && (
        <div className="space-y-1">
          {pedido.compras_remitos.map(remito => (
            <div key={remito.id} className="flex items-center justify-between text-xs text-[#888] border-t border-[#2a2a2a] pt-2">
              <span>N° {remito.numero} — {new Date(remito.fecha + 'T12:00:00').toLocaleDateString('es-AR')} ({remito.compras_remito_items.length} línea/s)</span>
              <div className="flex gap-2">
                <button onClick={() => abrirEdicion(remito)} className="hover:text-[#e8c547] transition-colors">Editar</button>
                <button onClick={() => borrarRemito(remito)} className="hover:text-red-400 transition-colors">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
