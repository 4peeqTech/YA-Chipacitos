'use server'

import { cargarAcceso, sucursalesDeLocales } from '@/lib/permisos/servidor'
import { fallo, ok, type Resultado } from '@/lib/acciones'
import { consultarCerrados, type BusquedaCerrados, type PaginaCerrados } from './consultas'

/** Historial del local: recibidos/cancelados, con filtros y paginado. Solo lee. */
export async function buscarPedidosCerrados(busqueda: BusquedaCerrados): Promise<Resultado<PaginaCerrados>> {
  try {
    const { supabase, acceso } = await cargarAcceso()
    if (!acceso) return fallo(null, 'Tu sesión venció. Volvé a ingresar.')
    // La sucursal elegida (T4); la base igual solo deja leer pedidos de las suyas.
    const { actual } = await sucursalesDeLocales()
    if (!actual) return fallo(null, 'No tenés una sucursal para ver pedidos.')
    const estado = ['recibido', 'cancelado', 'todos'].includes(busqueda.estado) ? busqueda.estado : 'todos'
    return ok(await consultarCerrados(supabase, actual.cuentaLocalId, { ...busqueda, estado }))
  } catch (e) {
    return fallo(e, 'No se pudo cargar el historial. Probá de nuevo.')
  }
}
