'use client'

// Selector de área y de sucursal (épica roles y permisos, T4): una barra debajo
// del encabezado, solo cuando hay algo para elegir. En el celular el encabezado no
// tiene lugar para dos selectores al lado del título.
//
// - Área: va al inicio de esa área para esta persona; proxy.ts recuerda la última
//   (cookie `area`) y / lleva ahí.
// - Sucursal (Locales): guarda la elegida en la cookie `sucursal` y recarga los
//   datos de la pantalla. El servidor la valida contra las sucursales de la persona.

import { useRouter } from 'next/navigation'
import { useId, useTransition, type ComponentType } from 'react'
import { IconBuildingStore, IconLayoutGrid } from '@tabler/icons-react'
import type { OpcionArea } from '@/lib/permisos/acceso'
import type { Area } from '@/lib/permisos/catalogo'

interface Props {
  areas: OpcionArea[]
  areaActual: Area | null
  sucursales?: { id: string; nombre: string }[]
  sucursalActual?: string | null
  /** Sin borde ni fondo propios (dentro del Sidebar). */
  compacta?: boolean
}

export default function BarraContexto({ areas, areaActual, sucursales = [], sucursalActual = null, compacta = false }: Props) {
  const router = useRouter()
  const [cambiando, startTransition] = useTransition()
  // En Administración hay dos barras (la del celular y la del menú lateral): ids propios.
  const id = useId()
  const conAreas = areas.length > 1
  const conSucursales = sucursales.length > 1
  if (!conAreas && !conSucursales) return null

  function irAArea(clave: string) {
    const destino = areas.find(a => a.clave === clave)
    if (destino) router.push(destino.href)
  }

  function elegirSucursal(sucursalId: string) {
    document.cookie = `sucursal=${encodeURIComponent(sucursalId)}; path=/; max-age=31536000; samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div className={compacta ? 'flex flex-col gap-2' : 'bg-surface border-b border-border px-4 py-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-2'}
      aria-busy={cambiando}>
      {conAreas && (
        <Selector id={`${id}-area`} etiqueta="Área" icono={IconLayoutGrid} valor={areaActual ?? ''} onCambio={irAArea}
          opciones={areas.map(a => ({ value: a.clave, label: a.nombre }))} vacio={areaActual ? undefined : 'Elegí un área'} />
      )}
      {conSucursales && (
        <Selector id={`${id}-sucursal`} etiqueta="Sucursal" icono={IconBuildingStore} valor={sucursalActual ?? ''} onCambio={elegirSucursal}
          opciones={sucursales.map(s => ({ value: s.id, label: s.nombre }))} deshabilitado={cambiando} />
      )}
    </div>
  )
}

function Selector({ id, etiqueta, icono: Icon, valor, opciones, onCambio, vacio, deshabilitado }: {
  id: string
  etiqueta: string
  icono: ComponentType<{ size?: number | string; className?: string }>
  valor: string
  opciones: { value: string; label: string }[]
  onCambio: (v: string) => void
  vacio?: string
  deshabilitado?: boolean
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-semibold text-muted shrink-0 w-20 sm:w-auto">
        <Icon size={16} className="text-accent" /> {etiqueta}
      </label>
      <select id={id} value={valor} onChange={e => onCambio(e.target.value)} disabled={deshabilitado}
        className="min-w-0 flex-1 sm:flex-none sm:w-auto min-h-11 sm:min-h-9 py-1.5 text-sm font-semibold">
        {vacio && <option value="" disabled>{vacio}</option>}
        {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
