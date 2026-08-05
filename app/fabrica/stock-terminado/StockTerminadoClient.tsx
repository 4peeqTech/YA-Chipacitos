'use client'

import { useMemo, useState } from 'react'
import {
  Warehouse, Search, SlidersHorizontal, History, Factory, Truck,
  ClipboardCheck, ArrowUpRight, ArrowDownRight, PackageX, Boxes,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export type TipoMovimiento = 'produccion_embolsado' | 'salida_pedido' | 'ajuste_pedido' | 'ajuste_manual'

export interface ProductoTerminado {
  id: string
  nombre: string
  activo: boolean
  pesoKg: number
  presentacionNombre: string
  saborNombre: string
  tamanioNombre: string
  cantidadKg: number
  actualizadoEn: string | null
}

export interface Movimiento {
  id: string
  productoId: string
  productoNombre: string
  deltaKg: number
  tipo: TipoMovimiento
  createdAt: string
}

const TIPO_INFO: Record<TipoMovimiento, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  produccion_embolsado: { label: 'Producción', icon: Factory },
  salida_pedido: { label: 'Salida a pedido', icon: Truck },
  ajuste_pedido: { label: 'Ajuste por remito', icon: ClipboardCheck },
  ajuste_manual: { label: 'Ajuste manual', icon: SlidersHorizontal },
}

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} kg`
}

function bultosEquivalentes(cantidadKg: number, pesoKg: number) {
  if (!pesoKg) return null
  const bultos = cantidadKg / pesoKg
  return bultos.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function StockTerminadoClient({
  itemsIniciales,
  movimientosIniciales,
}: {
  itemsIniciales: ProductoTerminado[]
  movimientosIniciales: Movimiento[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [items, setItems] = useState(itemsIniciales)
  const [movimientos, setMovimientos] = useState(movimientosIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [ajustando, setAjustando] = useState<ProductoTerminado | null>(null)
  const [deltaInput, setDeltaInput] = useState('')
  const [guardando, setGuardando] = useState(false)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.nombre.toLowerCase().includes(q) ||
      i.saborNombre.toLowerCase().includes(q) ||
      i.presentacionNombre.toLowerCase().includes(q)
    )
  }, [items, busqueda])

  const totalKg = useMemo(() => items.reduce((acc, i) => acc + i.cantidadKg, 0), [items])

  function abrirAjuste(item: ProductoTerminado) {
    setAjustando(item)
    setDeltaInput('')
  }

  async function confirmarAjuste() {
    if (!ajustando) return
    const delta = Number(deltaInput.replace(',', '.'))
    if (!delta) {
      toast.error('Ingresá una cantidad distinta de cero')
      return
    }
    setGuardando(true)
    const { error } = await supabase.rpc('ajustar_stock_terminado_manual', {
      p_producto_id: ajustando.id,
      p_delta_kg: delta,
    })
    if (error) {
      toast.error(error.message || 'No se pudo ajustar el stock')
      setGuardando(false)
      return
    }
    setItems(prev => prev.map(i => i.id === ajustando.id ? { ...i, cantidadKg: i.cantidadKg + delta, actualizadoEn: new Date().toISOString() } : i))
    setMovimientos(prev => [{
      id: `local-${Date.now()}`, productoId: ajustando.id, productoNombre: ajustando.nombre,
      deltaKg: delta, tipo: 'ajuste_manual', createdAt: new Date().toISOString(),
    }, ...prev])
    toast.success(`Stock de ${ajustando.nombre} ${delta > 0 ? 'aumentado' : 'reducido'} en ${formatKg(Math.abs(delta))}`)
    setAjustando(null)
    setDeltaInput('')
    setGuardando(false)
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-['Syne'] font-bold text-[#f0f0f0]">
            <Warehouse size={20} className="text-[#e8c547]" /> Stock terminado
          </h1>
          <p className="text-[#888] text-xs mt-0.5">
            {items.length} producto{items.length !== 1 ? 's' : ''} con terna asignada · {formatKg(totalKg)} en total
          </p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar producto, sabor o presentación..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
        />
      </div>

      {filtrados.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <PackageX size={28} className="mx-auto text-[#444]" />
          <p className="text-sm text-[#888]">
            {items.length === 0
              ? 'Todavía no hay productos con terna asignada. Se configuran en Admin → Catálogo.'
              : 'Ningún producto coincide con la búsqueda.'}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
          {filtrados.map(item => {
            const bultos = bultosEquivalentes(item.cantidadKg, item.pesoKg)
            return (
              <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.activo ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f0] font-medium truncate">{item.nombre}</p>
                  <p className="text-xs text-[#666] mt-0.5 flex items-center gap-1">
                    <Boxes size={11} /> {item.presentacionNombre} · {item.saborNombre} · {item.tamanioNombre}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${item.cantidadKg < 0 ? 'text-red-400' : 'text-[#f0f0f0]'}`}>{formatKg(item.cantidadKg)}</p>
                  {bultos && <p className="text-[11px] text-[#666]">≈ {bultos} bultos</p>}
                </div>
                <button
                  onClick={() => abrirAjuste(item)}
                  aria-label="Ajustar stock"
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-[#666] hover:text-[#e8c547] rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <SlidersHorizontal size={15} />
                </button>
              </div>
            )
          })}
        </Card>
      )}

      <div className="space-y-2 pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
          <History size={14} /> Movimientos recientes
        </p>
        {movimientos.length === 0 ? (
          <p className="text-sm text-[#666] px-1">Todavía no hay movimientos de stock terminado.</p>
        ) : (
          <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
            {movimientos.slice(0, 40).map(m => {
              const info = TIPO_INFO[m.tipo]
              const Icon = info.icon
              const positivo = m.deltaKg >= 0
              return (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a1a1a] text-[#888]">
                    <Icon size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#f0f0f0] truncate">{m.productoNombre}</p>
                    <p className="text-[11px] text-[#666]">{info.label} · {formatFecha(m.createdAt)}</p>
                  </div>
                  <span className={`flex items-center gap-0.5 text-xs font-semibold shrink-0 ${positivo ? 'text-[#56d68a]' : 'text-red-400'}`}>
                    {positivo ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {formatKg(Math.abs(m.deltaKg))}
                  </span>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      <Modal open={!!ajustando} onClose={() => !guardando && setAjustando(null)} title={`Ajustar stock · ${ajustando?.nombre ?? ''}`}>
        <p className="text-sm text-[#888]">
          Stock actual: <span className="text-[#f0f0f0] font-medium">{ajustando ? formatKg(ajustando.cantidadKg) : ''}</span>
        </p>
        <div>
          <label className="flex items-center text-xs text-[#888] mb-1.5">
            Cantidad a sumar o restar (kg)
            <HelpTooltip text="Usá un número positivo para sumar stock y uno negativo para restar. Por ejemplo -5 para corregir 5 kg que no estaban." />
          </label>
          <input
            type="number" inputMode="decimal" step="0.1" autoFocus
            value={deltaInput}
            onChange={e => setDeltaInput(e.target.value)}
            placeholder="Ej: -5 o 10"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-[#e8c547] transition-colors"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => setAjustando(null)} disabled={guardando}
            className="flex-1 py-2.5 border border-[#2a2a2a] rounded-xl text-sm font-medium text-[#888] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={confirmarAjuste} disabled={guardando || !deltaInput}
            className="flex-1 py-2.5 bg-[#e8c547] hover:opacity-90 text-black rounded-xl text-sm font-['Syne'] font-bold disabled:opacity-40 transition-all">
            {guardando ? 'Guardando...' : 'Confirmar ajuste'}
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
