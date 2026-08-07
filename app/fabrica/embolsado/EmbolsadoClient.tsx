'use client'

import { useEffect, useMemo, useState } from 'react'
import { Snowflake, Plus, Trash2, Save, AlertTriangle, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { agruparPoolCongelado, type ProduccionCongelado, type EmbolsadoLinea, type PoolCongelado } from '@/lib/fabrica/pools'
import Card from '@/components/ui/Card'
import { useToasts, ToastStack } from '@/components/ui/Toast'

export interface Parametro {
  id: string
  nombre: string
}

export interface PresentacionParam extends Parametro {
  pesoKg: number
}

interface LineaEditable {
  presentacionId: string
  cantidadKg: number
}

const chipBase = 'px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border'
const chipActive = 'bg-[#e8c547] text-black border-[#e8c547]'
const chipInactive = 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${chipBase} ${active ? chipActive : chipInactive}`}>
      {children}
    </button>
  )
}

function formatKg(kg: number) {
  return `${kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`
}

function poolKey(tamanioId: string, saborId: string) {
  return `${tamanioId}::${saborId}`
}

export default function EmbolsadoClient({
  hoy,
  ayer,
  sabores,
  tamanios,
  presentaciones,
  produccionesIniciales,
  embolsadosIniciales,
}: {
  hoy: string
  ayer: string
  sabores: Parametro[]
  tamanios: Parametro[]
  presentaciones: PresentacionParam[]
  produccionesIniciales: ProduccionCongelado[]
  embolsadosIniciales: EmbolsadoLinea[]
}) {
  const supabase = createClient()
  const toast = useToasts()

  const [dia, setDia] = useState(hoy)
  const [embolsados, setEmbolsados] = useState(embolsadosIniciales)
  const [borradores, setBorradores] = useState<Record<string, LineaEditable[]>>({})
  const [guardando, setGuardando] = useState<Record<string, boolean>>({})

  const nombreSabor = useMemo(() => new Map(sabores.map(s => [s.id, s.nombre])), [sabores])
  const nombreTamanio = useMemo(() => new Map(tamanios.map(t => [t.id, t.nombre])), [tamanios])

  const pools: PoolCongelado[] = useMemo(() => {
    return agruparPoolCongelado(produccionesIniciales, embolsados, dia).map(pool => ({
      ...pool,
      // Un pool que existe solo por embolsados (sin producción del día) no
      // trae nombre legible desde agruparPoolCongelado — se completa acá
      // con el catálogo, que sí lo tiene siempre.
      tamanioNombre: pool.tamanioNombre === '—' ? (nombreTamanio.get(pool.tamanioId) ?? '—') : pool.tamanioNombre,
      saborNombre: pool.saborNombre === '—' ? (nombreSabor.get(pool.saborId) ?? '—') : pool.saborNombre,
    }))
  }, [produccionesIniciales, embolsados, dia, nombreTamanio, nombreSabor])

  // Un pool con toda su masa ya repartida en presentaciones guardadas deja
  // de listarse: sin stock de catálogo no hay nada más que reconciliar
  // sobre él. Tolerancia de 0.01 kg por redondeo, mismo orden de magnitud
  // que `difiereMucho` más abajo.
  const poolsVisibles = useMemo(
    () => pools.filter(pool => Math.abs(pool.restanteKg) > 0.01),
    [pools]
  )

  useEffect(() => {
    setBorradores(prev => {
      const siguiente = { ...prev }
      for (const pool of pools) {
        const key = poolKey(pool.tamanioId, pool.saborId)
        if (!siguiente[key]) {
          siguiente[key] = pool.lineas.map(l => ({ presentacionId: l.presentacionId, cantidadKg: l.cantidadKg }))
        }
      }
      return siguiente
    })
  }, [pools])

  function lineasDePool(key: string, pool: PoolCongelado): LineaEditable[] {
    return borradores[key] ?? pool.lineas.map(l => ({ presentacionId: l.presentacionId, cantidadKg: l.cantidadKg }))
  }

  function agregarLinea(key: string) {
    setBorradores(prev => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { presentacionId: presentaciones[0]?.id ?? '', cantidadKg: 0 }],
    }))
  }

  function actualizarLinea(key: string, idx: number, cambios: Partial<LineaEditable>) {
    setBorradores(prev => ({
      ...prev,
      [key]: (prev[key] ?? []).map((l, i) => (i === idx ? { ...l, ...cambios } : l)),
    }))
  }

  function quitarLinea(key: string, idx: number) {
    setBorradores(prev => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, i) => i !== idx),
    }))
  }

  async function guardarPool(pool: PoolCongelado) {
    const key = poolKey(pool.tamanioId, pool.saborId)
    const lineas = borradores[key] ?? []
    setGuardando(prev => ({ ...prev, [key]: true }))

    const { error } = await supabase.rpc('guardar_embolsado_fabrica', {
      p_fecha: dia,
      p_tamanio_id: pool.tamanioId,
      p_sabor_id: pool.saborId,
      p_lineas: lineas.map(l => ({ presentacion_id: l.presentacionId, cantidad_kg: l.cantidadKg })),
    })

    setGuardando(prev => ({ ...prev, [key]: false }))

    if (error) {
      toast.error(error.message || 'No se pudo guardar el embolsado')
      return
    }

    // Reemplaza en el estado local las líneas de este pool con la versión
    // consolidada que acaba de escribir la RPC (agrupa por presentación,
    // descarta ceros) — mismo criterio con el que el backend reemplaza el pool.
    setEmbolsados(prev => {
      const otras = prev.filter(e => !(e.fecha === dia && e.tamanioId === pool.tamanioId && e.saborId === pool.saborId))
      const consolidadas = new Map<string, number>()
      for (const l of lineas) {
        if (l.cantidadKg <= 0) continue
        consolidadas.set(l.presentacionId, (consolidadas.get(l.presentacionId) ?? 0) + l.cantidadKg)
      }
      const nuevas: EmbolsadoLinea[] = [...consolidadas.entries()].map(([presentacionId, cantidadKg], i) => ({
        id: `${key}-${i}-${Date.now()}`,
        fecha: dia,
        tamanioId: pool.tamanioId,
        saborId: pool.saborId,
        presentacionId,
        presentacionNombre: presentaciones.find(p => p.id === presentacionId)?.nombre ?? '—',
        cantidadKg,
      }))
      return [...otras, ...nuevas]
    })
    setBorradores(prev => {
      const { [key]: _omitida, ...resto } = prev
      return resto
    })

    toast.success('Embolsado guardado')
  }

  return (
    <div className="w-full px-4 py-4 lg:px-8 lg:py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-['Syne'] font-bold text-[#f0f0f0]">
          <Snowflake size={20} className="text-[#e8c547]" /> Embolsado
        </h1>
        <p className="text-[#888] text-xs mt-0.5">Masa de congelado del día, repartida en presentaciones.</p>
      </div>

      <div className="flex gap-2">
        <Chip active={dia === ayer} onClick={() => setDia(ayer)}>Ayer</Chip>
        <Chip active={dia === hoy} onClick={() => setDia(hoy)}>Hoy</Chip>
      </div>

      {pools.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">No hay masa de congelado cargada este día.</p>
        </Card>
      ) : poolsVisibles.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">Toda la masa de este día ya fue embolsada.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {poolsVisibles.map(pool => {
            const key = poolKey(pool.tamanioId, pool.saborId)
            const lineas = lineasDePool(key, pool)
            const sumaLineas = lineas.reduce((acc, l) => acc + (l.cantidadKg || 0), 0)
            const restante = pool.masaKg - sumaLineas
            const difiereMucho = Math.abs(restante) > 0.05

            return (
              <Card key={key} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f0f0f0]">{pool.tamanioNombre} · {pool.saborNombre}</p>
                  <p className="text-xs text-[#888]">{pool.cargas} carga{pool.cargas !== 1 ? 's' : ''}</p>
                </div>
                <p className="flex items-center gap-2 text-xs text-[#666]">
                  {formatKg(pool.masaKg)} de masa disponible
                  <span className="flex items-center gap-1"><Sun size={11} /> {formatKg(pool.masaManana)}</span>
                  <span className="flex items-center gap-1"><Moon size={11} /> {formatKg(pool.masaTarde)}</span>
                </p>

                <div className="space-y-2">
                  {lineas.map((linea, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={linea.presentacionId}
                        onChange={e => actualizarLinea(key, idx, { presentacionId: e.target.value })}
                        className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-2.5 text-xs focus:outline-none focus:border-[#e8c547]"
                      >
                        {presentaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <input
                        type="number" inputMode="decimal" step="0.01" min={0}
                        placeholder="0"
                        value={linea.cantidadKg === 0 ? '' : linea.cantidadKg}
                        onChange={e => actualizarLinea(key, idx, { cantidadKg: Number(e.target.value) })}
                        className="w-24 shrink-0 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-2.5 text-sm text-right focus:outline-none focus:border-[#e8c547]"
                      />
                      <button
                        onClick={() => quitarLinea(key, idx)}
                        aria-label="Quitar línea"
                        className="shrink-0 w-9 h-9 flex items-center justify-center text-[#666] hover:text-red-400 rounded-lg hover:bg-[#1a1a1a] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => agregarLinea(key)}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#888] hover:text-[#e8c547] border border-dashed border-[#2a2a2a] hover:border-[#e8c547] rounded-lg py-2.5 transition-colors"
                  >
                    <Plus size={14} /> Agregar línea
                  </button>
                </div>

                <p className={`flex items-center gap-1.5 text-xs ${difiereMucho ? 'text-amber-400' : 'text-[#666]'}`}>
                  {difiereMucho && <AlertTriangle size={12} />}
                  Embolsado {formatKg(sumaLineas)} de {formatKg(pool.masaKg)} de masa — restante {formatKg(restante)}
                </p>

                <button
                  onClick={() => guardarPool(pool)}
                  disabled={!!guardando[key]}
                  className="w-full flex items-center justify-center gap-2 bg-[#e8c547] hover:opacity-90 text-black font-['Syne'] font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-40"
                >
                  <Save size={15} /> {guardando[key] ? 'Guardando...' : 'Guardar'}
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
