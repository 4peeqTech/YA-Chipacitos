'use client'

import { ArrowDownUp } from 'lucide-react'
import type { OrdenResumen } from '@/lib/fabrica/reportes'

// Selector "Ordenar por" de las listas de reportes. Las opciones de fecha solo
// aparecen cuando la lista está agrupada por día; `cantidadLabel` nombra el
// contador de cada lista (cargas, líneas).
export default function OrdenSelector({
  orden, onChange, esFecha, cantidadLabel,
}: {
  orden: OrdenResumen
  onChange: (o: OrdenResumen) => void
  esFecha: boolean
  cantidadLabel: string
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-[#888] px-1">
      <ArrowDownUp size={13} className="shrink-0" />
      <span className="shrink-0">Ordenar por</span>
      <select
        value={orden}
        onChange={e => onChange(e.target.value as OrdenResumen)}
        className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#e8c547] transition-colors"
      >
        {esFecha && <option value="fecha_desc">Fecha: más reciente</option>}
        {esFecha && <option value="fecha_asc">Fecha: más antigua</option>}
        <option value="kg_desc">Kg: mayor a menor</option>
        <option value="cantidad_desc">{cantidadLabel}: mayor a menor</option>
        {!esFecha && <option value="nombre_asc">Nombre (A-Z)</option>}
      </select>
    </label>
  )
}
