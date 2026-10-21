// Consultas de Mis pedidos que se usan desde el server component y desde la
// server action (sin 'use server': acá viven constantes y helpers).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pedido } from '@/lib/types'

export const SELECT_PEDIDO = '*, pedido_items(*)'
export const ESTADOS_EN_CURSO = ['pendiente', 'preparando', 'enviado'] as const
export const ESTADOS_CERRADOS = ['recibido', 'cancelado'] as const
export const PAGINA = 20

export type FiltroCerrados = 'recibido' | 'cancelado' | 'todos'

export interface BusquedaCerrados {
  estado: FiltroCerrados
  /** Número de pedido o parte del nombre de un producto. */
  q?: string
  /** YYYY-MM-DD, inclusive. */
  desde?: string
  hasta?: string
  offset?: number
}

export interface PaginaCerrados { pedidos: Pedido[]; hayMas: boolean }

// Las fechas del filtro son del día en Argentina (UTC-3, sin horario de verano).
export function inicioDia(fecha: string) {
  return `${fecha}T00:00:00-03:00`
}
export function finDia(fecha: string) {
  return `${fecha}T23:59:59.999-03:00`
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Historial (recibidos/cancelados) paginado del lado del servidor con range(). */
export async function consultarCerrados(supabase: SupabaseClient, localId: string, b: BusquedaCerrados): Promise<PaginaCerrados> {
  const offset = Math.max(0, Math.floor(b.offset ?? 0))
  const q = (b.q ?? '').trim()
  const porProducto = !!q && !/^\d+$/.test(q)
  // Búsqueda por producto: un join !inner (alias "coincide") filtra los pedidos
  // que tienen ese producto; pedido_items(*) sigue trayendo todos sus ítems.
  // Orden y paginación quedan del lado del servidor.
  let query = supabase
    .from('pedidos')
    .select(porProducto ? `${SELECT_PEDIDO}, coincide:pedido_items!inner(id)` : SELECT_PEDIDO)
    .eq('local_id', localId)
    .in('estado', b.estado === 'todos' ? [...ESTADOS_CERRADOS] : [b.estado])

  if (b.desde && FECHA.test(b.desde)) query = query.gte('created_at', inicioDia(b.desde))
  if (b.hasta && FECHA.test(b.hasta)) query = query.lte('created_at', finDia(b.hasta))

  if (porProducto) {
    query = query.ilike('coincide.producto_nombre', `%${q.replace(/[%_\\]/g, '')}%`)
  } else if (q) {
    query = query.eq('numero', Number(q))
  }

  // Se pide uno de más para saber si hay otra página.
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGINA)
  if (error) throw error
  // Se descarta el alias del join (solo sirve para filtrar).
  const filas = ((data ?? []) as unknown as (Pedido & { coincide?: unknown })[]).map(p => {
    const copia = { ...p }
    delete copia.coincide
    return copia as Pedido
  })
  return { pedidos: filas.slice(0, PAGINA), hayMas: filas.length > PAGINA }
}
