'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sugerirPedidoItem } from '@/lib/compras/matchRemito'
import { sumarStock, revertirYBorrar } from '@/lib/compras/stockRemito'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { controlClass } from '@/components/ui/Field'
import InputNumero from '@/components/ui/InputNumero'
import { mensajeError } from '@/lib/errores'
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
  cantidad: number | null
  precio: number | null
  pedidoItemId: string | null
  matchManual: boolean
}

function lineaVacia(): LineaEditor {
  return { descripcion: '', cantidad: null, precio: null, pedidoItemId: null, matchManual: false }
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
  const confirmar = useConfirmar()
  const toast = useToast()
  const [numero, setNumero] = useState(remitoEditando?.numero ?? '')
  const [fecha, setFecha] = useState(remitoEditando?.fecha ?? '')
  const [lineas, setLineas] = useState<LineaEditor[]>(remitoEditando ? lineasDesdeRemito(remitoEditando) : [lineaVacia()])
  const [isPending, startTransition] = useTransition()

  // RemitosClient lo monta con key={remito o pedido}: cambiar de remito remonta el form.

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
    if (!numero.trim() || !fecha) { toast.error('Completá número y fecha'); return }
    const filas = lineas.filter(l => l.descripcion.trim() && (l.cantidad ?? 0) > 0)
    if (!filas.length) { toast.error('Agregá al menos un ítem con cantidad'); return }

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
    const filas = lineas.filter(l => l.descripcion.trim() && (l.cantidad ?? 0) > 0)
    // Interino hasta F3 (remitos por RPC): el estado del pedido se recalcula acá,
    // también si el guardado falla a mitad de camino (ya se pudo haber borrado el remito viejo).
    async function recalcularEstado(): Promise<boolean> {
      const { error } = await supabase.rpc('compras_recalcular_estado_pedido', { p_pedido_id: pedido.id })
      if (error) console.error(error)
      return !error
    }
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
      if (errRemito) { await recalcularEstado(); toast.error(mensajeError(errRemito, 'No se pudo guardar el remito')); return }

      const filasInsert = filas.map(l => ({
        remito_id: remito.id,
        pedido_item_id: l.pedidoItemId,
        item_id: pedido.compras_pedido_items.find(pi => pi.id === l.pedidoItemId)?.item_id ?? null,
        descripcion: l.descripcion.trim(),
        cantidad: l.cantidad ?? 0,
        precio: l.precio,
      }))

      const { data: itemsGuardados, error: errItems } = await supabase
        .from('compras_remito_items')
        .insert(filasInsert)
        .select()
      if (errItems) { await recalcularEstado(); toast.error(mensajeError(errItems, 'No se pudieron guardar los ítems del remito')); return }

      for (const item of itemsGuardados) {
        if (item.item_id) await sumarStock(supabase, item.item_id, item.cantidad, remito.id, usuarioId)
      }

      if (!(await recalcularEstado())) toast.error('El remito se guardó, pero no se pudo actualizar el estado del pedido. Recargá la página.')

      const remitoCompleto: Remito = { ...remito, compras_remito_items: itemsGuardados }
      toast.success(remitoAReemplazar ? 'Remito actualizado' : 'Remito guardado')
      onGuardado(remitoCompleto, remitoAReemplazar)
    })
  }

  const labelClass = 'block text-xs font-semibold text-accent uppercase tracking-wider mb-1'

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelClass}>N° Remito</label>
          <input type="text" className={controlClass} value={numero} onChange={e => setNumero(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className={labelClass}>Fecha</label>
          <input type="date" className={controlClass} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>

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
              className={controlClass}
              placeholder="Descripción (como figura en el remito)"
              value={linea.descripcion}
              onChange={e => actualizarDescripcion(idx, e.target.value)}
            />
            <select
              className={controlClass}
              value={linea.pedidoItemId ?? ''}
              onChange={e => actualizarMatch(idx, e.target.value)}
            >
              <option value="">Sin corresponder</option>
              {pedido.compras_pedido_items.map(item => (
                <option key={item.id} value={item.id}>{item.descripcion}</option>
              ))}
            </select>
            <InputNumero
              placeholder="Cant."
              className={controlClass}
              value={linea.cantidad}
              onChange={v => actualizarCampo(idx, { cantidad: v })}
              min={0}
            />
            <InputNumero
              placeholder="Precio"
              className={controlClass}
              value={linea.precio}
              onChange={v => actualizarCampo(idx, { precio: v })}
              min={0}
            />
            <button onClick={() => quitarLinea(idx)} title="Quitar línea" aria-label="Quitar línea" className="text-muted hover:text-red-400 flex items-center justify-center">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={agregarLinea} className="bg-border hover:opacity-80 text-text font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
          + Agregar línea
        </button>
        <button onClick={guardarRemito} disabled={isPending} className="bg-accent hover:opacity-90 disabled:opacity-40 text-black font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
          Guardar remito
        </button>
        <button onClick={onCancelar} className="bg-border hover:opacity-80 text-text font-semibold text-xs py-1.5 px-3 rounded-lg transition-all">
          Cancelar
        </button>
      </div>
    </div>
  )
}
