'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ProductoMapeo, Producto } from '@/lib/types'
import Card from '@/components/ui/Card'
import SelectBuscador, { OpcionSelect } from '@/components/ui/SelectBuscador'

interface Props {
  nombresPostberry: string[]
  mapeosIniciales: ProductoMapeo[]
  productos: Pick<Producto, 'id' | 'nombre' | 'tipo' | 'destino'>[]
}

export default function MapeosClient({ nombresPostberry, mapeosIniciales, productos }: Props) {
  const [mapeos, setMapeos] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    mapeosIniciales.forEach(mp => { if (mp.producto_id) m[mp.nombre_posberry] = mp.producto_id })
    return m
  })
  const [guardando, setGuardando] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'mapeados' | 'sin_mapear'>('todos')
  const supabase = createClient()

  const opcionesProductos: OpcionSelect[] = [
    ...productos.filter(p => p.destino === 'fabrica').map(p => ({ value: p.id, label: p.nombre, grupo: '🏭 Fábrica' })),
    ...productos.filter(p => p.destino === 'deposito').map(p => ({ value: p.id, label: p.nombre, grupo: '📦 Depósito' })),
  ]

  async function guardarMapeo(nombrePostberry: string, productoId: string) {
    setGuardando(nombrePostberry)
    const valor = productoId === '' ? null : productoId
    await supabase.from('producto_mapeos').upsert(
      { nombre_posberry: nombrePostberry, producto_id: valor },
      { onConflict: 'nombre_posberry' }
    )
    setMapeos(prev => {
      const next = { ...prev }
      if (!valor) delete next[nombrePostberry]
      else next[nombrePostberry] = valor
      return next
    })
    setGuardando(null)
  }

  const nombresFiltrados = nombresPostberry.filter(n => {
    const matchBusqueda = n.toLowerCase().includes(busqueda.toLowerCase())
    const tieneMapa = !!mapeos[n]
    if (filtro === 'mapeados' && !tieneMapa) return false
    if (filtro === 'sin_mapear' && tieneMapa) return false
    return matchBusqueda
  })

  const totalMapeados = nombresPostberry.filter(n => !!mapeos[n]).length
  const totalSinMapear = nombresPostberry.length - totalMapeados

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-['Syne'] text-2xl font-bold text-[#f0f0f0]">Mapeo de productos</h1>
        <p className="text-sm text-[#888] mt-1">
          Vinculá cada nombre de Posberry con el producto correspondiente del sistema para que la conciliación funcione correctamente.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#f0f0f0]">{nombresPostberry.length}</p>
          <p className="text-xs text-[#888] mt-0.5">Total en Posberry</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#56d68a]">{totalMapeados}</p>
          <p className="text-xs text-[#888] mt-0.5">Mapeados</p>
        </Card>
        <Card className={`p-4 ${totalSinMapear > 0 ? 'border-[#e84210]/40' : ''}`}>
          <p className={`text-2xl font-bold ${totalSinMapear > 0 ? 'text-[#e84210]' : 'text-[#888]'}`}>{totalSinMapear}</p>
          <p className="text-xs text-[#888] mt-0.5">Sin mapear</p>
        </Card>
      </div>

      {totalSinMapear > 0 && (
        <div className="bg-[rgba(240,168,73,.1)] border-l-4 border-[#f0a849] rounded-r-xl px-4 py-3 text-sm text-[#f0a849]">
          ⚠️ Hay {totalSinMapear} producto{totalSinMapear !== 1 ? 's' : ''} de Posberry sin mapear. Las ventas de estos productos no se incluirán en la conciliación.
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar nombre Posberry..."
          className="flex-1 rounded-xl px-4 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          {(['todos', 'mapeados', 'sin_mapear'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                filtro === f ? 'bg-[#e8c547] text-black font-bold' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0]'
              }`}>
              {f === 'todos' ? 'Todos' : f === 'mapeados' ? '✓ Mapeados' : '⚠ Sin mapear'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de mapeos */}
      <Card>
        {nombresFiltrados.length === 0 ? (
          <p className="text-sm text-[#888] text-center py-8">No hay resultados.</p>
        ) : (
          <div>
            {/* Header — solo desktop */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr_auto] items-center gap-4 px-4 py-2.5 bg-[#1a1a1a] border-b border-[#2a2a2a] text-xs font-semibold text-[#e8c547] uppercase tracking-wider">
              <span>Nombre en Posberry</span>
              <span className="text-center">→</span>
              <span>Producto en el sistema</span>
              <span></span>
            </div>

            {nombresFiltrados.map((nombre, i) => {
              const mapeadoId = mapeos[nombre] || ''
              const guardandoEste = guardando === nombre

              const estadoIcon = guardandoEste
                ? <span className="text-[#888] text-xs animate-pulse">…</span>
                : mapeadoId
                  ? <span className="text-[#56d68a] text-base">✓</span>
                  : <span className="text-[#555] text-base">○</span>

              return (
                <div key={nombre}
                  className={`px-4 py-3 ${i < nombresFiltrados.length - 1 ? 'border-b border-[#2a2a2a]' : ''} ${mapeadoId ? '' : 'bg-[rgba(232,66,16,.05)]'}`}>

                  {/* Mobile: apilado */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#f0f0f0]">{nombre}</p>
                        <p className="text-xs text-[#888]">Posberry</p>
                      </div>
                      <div className="w-6 text-center">{estadoIcon}</div>
                    </div>
                    <SelectBuscador
                      value={mapeadoId}
                      onChange={val => guardarMapeo(nombre, val)}
                      opciones={opcionesProductos}
                      placeholderVacio="— Sin mapear —"
                      disabled={guardandoEste}
                    />
                  </div>

                  {/* Desktop: 4 columnas */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr_auto] items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-[#f0f0f0]">{nombre}</p>
                      <p className="text-xs text-[#888]">Posberry</p>
                    </div>
                    <span className="text-[#2a2a2a] text-lg">→</span>
                    <SelectBuscador
                      value={mapeadoId}
                      onChange={val => guardarMapeo(nombre, val)}
                      opciones={opcionesProductos}
                      placeholderVacio="— Sin mapear —"
                      disabled={guardandoEste}
                    />
                    <div className="w-6 text-center">{estadoIcon}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-[#888]">
        Los cambios se guardan automáticamente al seleccionar un producto. Los mapeos se usan al generar conciliaciones.
      </p>
    </div>
  )
}
