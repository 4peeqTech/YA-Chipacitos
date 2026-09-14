'use client'

import { useMemo, useState } from 'react'
import {
  Boxes, History, Factory, Truck, ClipboardCheck, SlidersHorizontal,
  ArrowUpRight, ArrowDownRight, PackageX, Download,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import SearchInput from '@/components/ui/SearchInput'
import { descargarCsv } from '@/lib/csv'

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
  return (cantidadKg / pesoKg).toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function StockTerminadoAdminClient({
  itemsIniciales,
  movimientosIniciales,
}: {
  itemsIniciales: ProductoTerminado[]
  movimientosIniciales: Movimiento[]
}) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return itemsIniciales
    return itemsIniciales.filter(i =>
      i.nombre.toLowerCase().includes(q) ||
      i.saborNombre.toLowerCase().includes(q) ||
      i.presentacionNombre.toLowerCase().includes(q)
    )
  }, [itemsIniciales, busqueda])

  const totalKg = useMemo(() => itemsIniciales.reduce((acc, i) => acc + i.cantidadKg, 0), [itemsIniciales])

  function exportar() {
    descargarCsv('fabrica_stock_terminado.csv',
      ['Producto', 'Presentación', 'Sabor', 'Tamaño', 'Stock (kg)', 'Actualizado'],
      filtrados.map(i => [i.nombre, i.presentacionNombre, i.saborNombre, i.tamanioNombre, i.cantidadKg, i.actualizadoEn ?? '']))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-['Syne'] font-bold text-text"><Boxes size={22} className="text-accent" /> Stock terminado</h1>
          <p className="text-muted text-sm mt-0.5">
            {itemsIniciales.length} producto{itemsIniciales.length !== 1 ? 's' : ''} con terna asignada · {formatKg(totalKg)} en total · solo lectura
          </p>
        </div>
        <button
          onClick={exportar}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface2 border border-border text-xs font-medium text-text hover:border-accent transition-colors shrink-0"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar producto, sabor o presentación..." className="max-w-md" />

      {filtrados.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <PackageX size={28} className="mx-auto text-muted" />
          <p className="text-sm text-muted">
            {itemsIniciales.length === 0
              ? 'Todavía no hay productos con terna asignada. Se configuran en Catálogo.'
              : 'Ningún producto coincide con la búsqueda.'}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtrados.map(item => {
            const bultos = bultosEquivalentes(item.cantidadKg, item.pesoKg)
            return (
              <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.activo ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text font-medium truncate">{item.nombre}</p>
                  <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                    <Boxes size={11} /> {item.presentacionNombre} · {item.saborNombre} · {item.tamanioNombre}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${item.cantidadKg < 0 ? 'text-red-400' : 'text-text'}`}>{formatKg(item.cantidadKg)}</p>
                  {bultos && <p className="text-[11px] text-muted">≈ {bultos} bultos</p>}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <div className="space-y-2 pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider px-1">
          <History size={14} /> Movimientos recientes
        </p>
        {movimientosIniciales.length === 0 ? (
          <p className="text-sm text-muted px-1">Todavía no hay movimientos de stock terminado.</p>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {movimientosIniciales.map(m => {
              const info = TIPO_INFO[m.tipo]
              const Icon = info.icon
              const positivo = m.deltaKg >= 0
              return (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-surface2 text-muted">
                    <Icon size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text truncate">{m.productoNombre}</p>
                    <p className="text-[11px] text-muted">{info.label} · {formatFecha(m.createdAt)}</p>
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
    </div>
  )
}
