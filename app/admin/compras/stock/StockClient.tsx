'use client'

import { useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import SearchInput from '@/components/ui/SearchInput'
import ClearFiltersButton from '@/components/ui/ClearFiltersButton'
import { mensajeError } from '@/lib/errores'

function formatearRelativo(iso: string) {
  const segundos = (Date.now() - new Date(iso).getTime()) / 1000
  if (segundos < 60) return 'recién'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} d`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

interface CompraItem {
  id: string
  nombre: string
  unidad: string
  stock_minimo: number
}

interface StockActual {
  item_id: string
  cantidad: number
  actualizado_en: string
  actualizado_por: string | null
  actualizado_por_nombre: string | null
}

export default function StockClient({
  itemsIniciales,
  stockInicial,
  usuarioId,
  usuarioNombre,
}: {
  itemsIniciales: CompraItem[]
  stockInicial: StockActual[]
  usuarioId: string
  usuarioNombre: string
}) {
  const supabase = createClient()
  const [stockPorItem, setStockPorItem] = useState<Record<string, StockActual>>(
    () => Object.fromEntries(stockInicial.map(s => [s.item_id, s]))
  )
  const [cantidadesForm, setCantidadesForm] = useState<Record<string, string>>(
    () => Object.fromEntries(itemsIniciales.map(i => {
      const stock = stockInicial.find(s => s.item_id === i.id)
      return [i.id, stock ? String(stock.cantidad) : '']
    }))
  )
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)

  const hayFiltros = !!busqueda || soloBajo
  function limpiarFiltros() { setBusqueda(''); setSoloBajo(false) }

  const items = useMemo(() => [...itemsIniciales]
    .filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .filter(i => !soloBajo || (stockPorItem[i.id]?.cantidad ?? 0) < i.stock_minimo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre)), [itemsIniciales, busqueda, soloBajo, stockPorItem])

  async function guardarCantidad(itemId: string) {
    const cantidad = Number(cantidadesForm[itemId])
    if (Number.isNaN(cantidad) || cantidad < 0) { setError('Cantidad inválida'); return }
    setError('')
    setGuardandoId(itemId)

    const cantidadAnterior = stockPorItem[itemId]?.cantidad ?? 0
    const delta = cantidad - cantidadAnterior

    startTransition(async () => {
      const { data, error: err } = await supabase
        .from('compras_stock_actual')
        .upsert(
          { item_id: itemId, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
          { onConflict: 'item_id' }
        )
        .select()
        .single()

      setGuardandoId(null)
      if (err) { setError(mensajeError(err, 'No se pudo guardar el stock del insumo')); return }
      setStockPorItem(prev => ({ ...prev, [itemId]: { ...data, actualizado_por_nombre: usuarioNombre } }))

      if (delta !== 0) {
        await supabase.from('compras_stock_movimientos').insert(
          { item_id: itemId, delta, tipo: 'ajuste_manual', creado_por: usuarioId }
        )
      }
    })
  }

  const inputClass = "w-28 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Stock</h1>
        <p className="text-[#888] text-sm mt-0.5">Cargá la cantidad actual de cada insumo. Se marca en rojo cuando está por debajo del stock mínimo.</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar insumo..." className="w-64" />
        <button
          onClick={() => setSoloBajo(v => !v)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${soloBajo ? 'bg-accent text-black' : 'bg-surface2 text-muted hover:text-text'}`}
        >
          Solo bajo stock
        </button>
        <ClearFiltersButton visible={hayFiltros} onClick={limpiarFiltros} />
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {itemsIniciales.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay insumos activos. Cargalos primero en Insumos.</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-[#888]">Ningún insumo coincide con los filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Stock mínimo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Cantidad actual</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Últ. actualización</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider hidden md:table-cell">Por</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#e8c547] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {items.map(i => {
                  const stock = stockPorItem[i.id]
                  const cantidadGuardada = stock?.cantidad ?? 0
                  const bajo = cantidadGuardada < i.stock_minimo
                  return (
                    <tr key={i.id} className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-3 text-[#f0f0f0] font-medium">{i.nombre}</td>
                      <td className="px-4 py-3 text-[#888]">{i.unidad}</td>
                      <td className="px-4 py-3 text-[#888]">{i.stock_minimo}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          className={inputClass}
                          value={cantidadesForm[i.id] ?? ''}
                          onChange={e => setCantidadesForm(f => ({ ...f, [i.id]: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bajo ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                          {bajo ? 'Bajo' : 'OK'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#888] hidden md:table-cell">{stock ? formatearRelativo(stock.actualizado_en) : '—'}</td>
                      <td className="px-4 py-3 text-[#888] hidden md:table-cell">{stock?.actualizado_por_nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => guardarCantidad(i.id)}
                          disabled={guardandoId === i.id}
                          className="bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-xs py-1.5 px-4 rounded-lg transition-all"
                        >
                          {guardandoId === i.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
