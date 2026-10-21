'use server'

import { createClient } from '@/lib/supabase/server'
import { fallo, ok, type Resultado } from '@/lib/acciones'
import { consultarCerrados, type BusquedaCerrados, type PaginaCerrados } from './consultas'

/** Historial del local: recibidos/cancelados, con filtros y paginado. Solo lee. */
export async function buscarPedidosCerrados(busqueda: BusquedaCerrados): Promise<Resultado<PaginaCerrados>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallo(null, 'Tu sesión venció. Volvé a ingresar.')
    const estado = ['recibido', 'cancelado', 'todos'].includes(busqueda.estado) ? busqueda.estado : 'todos'
    return ok(await consultarCerrados(supabase, user.id, { ...busqueda, estado }))
  } catch (e) {
    return fallo(e, 'No se pudo cargar el historial. Probá de nuevo.')
  }
}
