'use client'

import type { ReactNode } from 'react'
import type { OpcionLista } from '@/components/ui/ListaBuscable'
import { TIPO_INFO, type ItemNom, type TipoItem } from '@/lib/nomenclador/tipos'

/** El código interno es la seña del nomenclador: monoespaciado y con el color del tipo. */
export function CodigoChip({ codigo, tipo }: { codigo: string; tipo: TipoItem }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide tabular-nums ${TIPO_INFO[tipo].color}`}>
      {codigo}
    </span>
  )
}

export function BadgeRevisar() {
  return (
    <span className="rounded-full border border-warning/40 px-2 py-0.5 text-2xs font-medium text-warning" title="Cargado desde el Excel: falta que alguien lo revise.">
      A revisar
    </span>
  )
}

export function BadgeArchivado() {
  return <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">Archivado</span>
}

export function ItemLinea({ item, extra }: { item: ItemNom; extra?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CodigoChip codigo={item.codigo} tipo={item.tipo} />
      <span className="truncate text-text">{item.nombre}</span>
      {extra}
    </span>
  )
}

export const botonPrimario =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-9'
export const botonSecundario =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface2 px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent disabled:opacity-50 sm:min-h-9'
export const botonPeligro =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-brand-red/40 px-4 py-2 text-sm font-medium text-brand-red transition-colors hover:bg-danger-bg disabled:opacity-50 sm:min-h-9'

/** Ítems como opciones de ListaBuscable: chip del código, agrupados por tipo y buscables por código y alternativos. */
export function opcionesItems(items: ItemNom[]): OpcionLista[] {
  return items.map(i => ({
    value: i.id,
    label: i.nombre + (i.estado === 'archivado' ? ' (archivado)' : ''),
    grupo: TIPO_INFO[i.tipo].plural,
    buscar: `${i.codigo} ${i.nombres_alternativos.join(' ')}`,
    prefijo: <CodigoChip codigo={i.codigo} tipo={i.tipo} />,
  }))
}
