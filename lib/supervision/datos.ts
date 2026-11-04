import type { SupabaseClient } from '@supabase/supabase-js'
import type { BloqueSupervision, ItemSupervision, SucursalSupervision, VisitaSupervision } from './tipos'

export const SELECT_VISITA = '*'

/** Sucursales y bloques activos, con sus ítems activos, en orden. */
export async function cargarCatalogo(supabase: SupabaseClient) {
  const [suc, blo, ite] = await Promise.all([
    supabase.from('supervision_sucursales').select('id, nombre, zona, orden').eq('activo', true).order('orden'),
    supabase.from('supervision_bloques').select('id, titulo, referencia, orden').eq('activo', true).order('orden'),
    supabase.from('supervision_items').select('id, bloque_id, texto, orden').eq('activo', true).order('orden'),
  ])
  const error = suc.error ?? blo.error ?? ite.error
  const items = (ite.data ?? []) as ItemSupervision[]
  const bloques: BloqueSupervision[] = ((blo.data ?? []) as Omit<BloqueSupervision, 'items'>[])
    .map(b => ({ ...b, items: items.filter(i => i.bloque_id === b.id) }))
    .filter(b => b.items.length > 0)
  return { sucursales: (suc.data ?? []) as SucursalSupervision[], bloques, error }
}

export async function cargarVisitas(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('supervision_visitas').select(SELECT_VISITA)
    .order('fecha', { ascending: false }).limit(1000)
  return { visitas: (data ?? []) as VisitaSupervision[], error }
}

/** Nombre del usuario y si es admin (solo admin borra visitas; la RLS lo hace cumplir). */
export async function cargarUsuario(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('nombre, rol').eq('id', userId).single()
  return { nombre: (data?.nombre as string | undefined) ?? '', esAdmin: data?.rol === 'admin' }
}
