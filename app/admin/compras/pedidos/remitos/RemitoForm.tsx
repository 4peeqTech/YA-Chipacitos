'use client'

import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sugerirPedidoItem } from '@/lib/compras/matchRemito'
import { sumarStock, revertirYBorrar } from '@/lib/compras/stockRemito'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Remito } from '@/lib/compras/tipos'

interface PedidoItemPD {
  id: string
  item_id: string | null
  descripcion: string
  cantidad: number
}

export interface PedidoConItems {
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

function lineasDesdeRemito(remito: Remito): LineaEditor[] {
  return remito.compras_remito_items.map(i => ({
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precio: i.precio,
    pedidoItemId: i.pedido_item_id,
    matchManual: true,
  }))
}

export default function RemitoForm({
  pedido,
  usuarioId,
  remitoEditando,
  onGuardado,
  onCancelar,
}: {
  pedido: PedidoConItems
  usuarioId: string
  remitoEditando: Remito | null
  onGuardado: (remito: Remito, reemplazoId: string | null) => void
  onCancelar: () => void
}) {
  const supabase = createClient()
  const { confirmar, dialog: confirmDialog } = useConfirm()
  const [numero, setNumero] = useState(remitoEditando?.numero ?? '')
  const [fecha, setFecha] = useState(remitoEditando?.fecha ?? '')
  const [lineas, setLineas] = useState<LineaEditor[]>(remitoEditando ? lineasDesdeRemito(remitoEditando) : [lineaVacia()])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setNumero(remitoEditando?.numero ?? '')
    setFecha(remitoEditando?.fecha ?? '')
    setLineas(remitoEditando ? lineasDesdeRemito(remitoEditando) : [lineaVacia()])
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remitoEditando?.id])

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

  function guardarRemito() {
    if (!numero.trim() || !fecha) { setError('Completá número y fecha'); return }
    const filas = lineas.filter(l => l.descripcion.trim() && l.cantidad > 0)
    if (!filas.length) { setError('Agregá al menos un ítem con cantidad'); return }

    const remitoAReemplazar = remitoEditando?.id ?? null
    if (!remitoAReemplazar) {
      const existente = pedido.compras_remitos.find(r => r.numero === numero.trim())
      if (existente) {
        confirmar({
          titulo: 'Remito duplicado',
          mensaje: `Ya existe el remito ${numero} en este pedido. ¿Sobrescribirlo?`,
          textoConfirmar: 'Sobrescribir',
          peligroso: true,
          onConfirmar: () => ejecutarGuardado(existente.id),
        })
        return
      }
    }
    ejecutarGuardado(remitoAReemplazar)
  }

  function ejecutarGuardado(remitoAReemplazar: string | null) {
    const filas = lineas.filter(l => l.descripcion.trim() && l.cantidad > 0)
    setError('')
    startTransition(async () => {
      if (remitoAReemplazar) {
        const remitoExistente = pedido.compras_remitos.find(r => r.id === remitoAReemplazar)
        if (remitoExistente) await revertirYBorrar(supabase, remitoExistente, usuarioId)
      }

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
        if (item.item_id) await sumarStock(supabase, item.item_id, item.cantidad, remito.id, usuarioId)
      }

      const remitoCompleto: Remito = { ...remito, compras_remito_items: itemsGuardados }
      onGuardado(remitoCompleto, remitoAReemplazar)
    })
  }

  const inputClass = "w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
  const labelClass = "block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1"

  return (
    <div className="space-y-4">
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

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[1fr_14rem_5.5rem_6.5rem_2rem] gap-2 px-0.5">
          <span className={labelClass}>Descripción</span>
          <span className={labelClass}>Corresponde a</span>
          <span className={labelClass}>Cant.</span>
          <span className={labelClass}>Precio</span>
          <span />
        </div>
        {lineas.map((linea, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_14rem_5.5rem_6.5rem_2rem] gap-2">
            <input
              type="text"
              className={inputClass}
              placeholder="Descripción (como figura en el remito)"
              value={linea.descripcion}
              onChange={e => actualizarDescripcion(idx, e.target.value)}
            />
            <select
              className={inputClass}
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
              className={inputClass}
              placeholder="Cant."
              value={linea.cantidad || ''}
              onChange={e => actualizarCampo(idx, { cantidad: Number(e.target.value) })}
            />
            <input
              type="number"
              step="0.01"
              className={inputClass}
              placeholder="Precio"
              value={linea.precio ?? ''}
              onChange={e => actualizarCampo(idx, { precio: e.target.value ? Number(e.target.value) : null })}
            />
            <button onClick={() => quitarLinea(idx)} title="Quitar línea" aria-label="Quitar línea" className="text-[#888] hover:text-red-400 flex items-center justify-center">
              <X size={15} />
            </button>
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
        <button onClick={onCancelar} className="bg-[#2a2a2a] hover:bg-[#333] text-[#f0f0f0] font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
          Cancelar
        </button>
      </div>

      {confirmDialog}
    </div>
  )
}
