'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconClipboardList, IconFilterOff } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { calcularResumen } from '@/lib/supervision/calculos'
import { fechaHora } from '@/lib/supervision/formato'
import type { BloqueSupervision, SucursalSupervision, VisitaSupervision } from '@/lib/supervision/tipos'
import { ChipEnCurso, Porcentaje } from './ui'

interface Props {
  sucursales: SucursalSupervision[]
  bloques: BloqueSupervision[]
  visitas: VisitaSupervision[]
}

export function opcionesSucursal(sucursales: SucursalSupervision[]) {
  return [{ value: 'todas', label: 'Todas las sucursales' }, ...sucursales.map(s => ({ value: s.id, label: s.nombre, grupo: s.zona }))]
}

export default function ListaVisitas({ sucursales, bloques, visitas }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const nombre = (id: string) => sucursales.find(s => s.id === id)?.nombre ?? id

  const lista = useMemo(
    () => visitas.filter(v => filtro === 'todas' || v.sucursal_id === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [visitas, filtro],
  )

  return (
    <div className="space-y-3">
      <SelectBuscador value={filtro} onChange={v => setFiltro(v || 'todas')} opciones={opcionesSucursal(sucursales)}
        placeholder="Sucursal" className="sm:max-w-xs" />

      {lista.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          {filtro === 'todas'
            ? <EmptyState icono={IconClipboardList} titulo="Todavía no hay visitas" descripcion="Empezá una desde Nueva visita." />
            : <EmptyState icono={IconFilterOff} titulo="No hay visitas en esta sucursal" />}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {lista.map(v => {
            // La cerrada usa el resumen guardado; la en curso se calcula con lo que lleva.
            const pct = v.estado === 'cerrada' && v.resumen ? v.resumen.pct : calcularResumen(v.respuestas, bloques).pct
            return (
              <li key={v.id}>
                <Link href={`/admin/supervision/${v.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-text">
                      <span className="truncate">{nombre(v.sucursal_id)}</span>
                      {v.estado === 'en_curso' && <ChipEnCurso />}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{fechaHora(v.fecha)} · {v.supervisor_nombre}</p>
                  </div>
                  <Porcentaje pct={pct} className="text-lg" />
                  <IconChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
