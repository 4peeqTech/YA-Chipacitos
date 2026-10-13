'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ordenarProduccionFilas, type ColumnaProduccion, type ProduccionFila } from '@/lib/fabrica/reportes'
import { rendimientoFeculaMasa } from '@/lib/fabrica/rendimiento'

const COLUMNAS: { key: ColumnaProduccion; label: string; numerica?: boolean }[] = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'turno', label: 'Turno' },
  { key: 'operarioNombre', label: 'Operario' },
  { key: 'saborNombre', label: 'Sabor' },
  { key: 'feculaKg', label: 'Fécula kg', numerica: true },
  { key: 'masaKg', label: 'Masa kg', numerica: true },
  { key: 'rendimiento', label: 'Rend.', numerica: true },
]

// Texto: asc al primer click (A-Z). Fecha y números: desc (más reciente / mayor).
const ASC_INICIAL: ColumnaProduccion[] = ['turno', 'operarioNombre', 'saborNombre']

function formatNum(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function formatFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRend(fecula: number, masa: number) {
  const r = rendimientoFeculaMasa(fecula, masa)
  return r === null ? '—' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export default function ProduccionTabla({ filas }: { filas: ProduccionFila[] }) {
  const [columna, setColumna] = useState<ColumnaProduccion>('fecha')
  const [asc, setAsc] = useState(false)

  const ordenadas = useMemo(() => ordenarProduccionFilas(filas, columna, asc), [filas, columna, asc])
  const totales = useMemo(
    () => filas.reduce((acc, f) => ({ fecula: acc.fecula + f.feculaKg, masa: acc.masa + f.masaKg }), { fecula: 0, masa: 0 }),
    [filas]
  )

  const clickColumna = (key: ColumnaProduccion) => {
    if (key === columna) {
      setAsc(v => !v)
    } else {
      setColumna(key)
      setAsc(ASC_INICIAL.includes(key))
    }
  }

  if (filas.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-[#888]">No hay producción cargada en el período elegido.</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-[#2a2a2a]">
            {COLUMNAS.map(c => {
              const activa = columna === c.key
              const Icon = !activa ? ChevronsUpDown : asc ? ArrowUp : ArrowDown
              return (
                <th key={c.key} className={`px-3 py-2.5 font-semibold text-xs ${c.numerica ? 'text-right' : 'text-left'}`}>
                  <button
                    onClick={() => clickColumna(c.key)}
                    className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors ${activa ? 'text-[#e8c547]' : 'text-[#888] hover:text-[#f0f0f0]'}`}
                  >
                    {c.label} <Icon size={12} />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1a1a1a]">
          {ordenadas.map((f, i) => (
            <tr key={i} className="text-[#f0f0f0]">
              <td className="px-3 py-2 whitespace-nowrap">{formatFecha(f.fecha)}</td>
              <td className="px-3 py-2">{f.turno === 'manana' ? 'Mañana' : 'Tarde'}</td>
              <td className="px-3 py-2">{f.operarioNombre}</td>
              <td className="px-3 py-2">{f.saborNombre}</td>
              <td className="px-3 py-2 text-right">{formatNum(f.feculaKg)}</td>
              <td className="px-3 py-2 text-right">{formatNum(f.masaKg)}</td>
              <td className="px-3 py-2 text-right text-[#888]">{formatRend(f.feculaKg, f.masaKg)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#2a2a2a] font-semibold text-[#f0f0f0]">
            <td className="px-3 py-2.5" colSpan={4}>Total · {filas.length} carga{filas.length !== 1 ? 's' : ''}</td>
            <td className="px-3 py-2.5 text-right">{formatNum(totales.fecula)}</td>
            <td className="px-3 py-2.5 text-right">{formatNum(totales.masa)}</td>
            <td className="px-3 py-2.5 text-right text-[#888]">{formatRend(totales.fecula, totales.masa)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  )
}
