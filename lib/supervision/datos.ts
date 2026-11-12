import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BloqueSupervision, EquipoSupervision, ItemSupervision, LugarSupervision, MovimientoEquipo, ParametroSupervision,
  RequerimientoSupervision, VisitaSupervision,
} from './tipos'

export const SELECT_VISITA = '*'

/** Lugares (de todos los tipos) y bloques activos, con sus ítems activos, en orden. */
export async function cargarCatalogo(supabase: SupabaseClient) {
  const [lug, blo, ite] = await Promise.all([
    supabase.from('supervision_lugares').select('id, nombre, zona, orden, tipo, encargado, atributos')
      .eq('activo', true).order('orden'),
    supabase.from('supervision_bloques').select('id, titulo, referencia, orden, tipos').eq('activo', true).order('orden'),
    supabase.from('supervision_items').select('id, bloque_id, texto, orden, condicion, con_monto, parametro')
      .eq('activo', true).order('orden'),
  ])
  const error = lug.error ?? blo.error ?? ite.error
  const items = (ite.data ?? []) as ItemSupervision[]
  const bloques: BloqueSupervision[] = ((blo.data ?? []) as Omit<BloqueSupervision, 'items'>[])
    .map(b => ({ ...b, items: items.filter(i => i.bloque_id === b.id) }))
    .filter(b => b.items.length > 0)
  return { lugares: (lug.data ?? []) as LugarSupervision[], bloques, error }
}

export async function cargarVisitas(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('supervision_visitas').select(SELECT_VISITA)
    .order('fecha', { ascending: false }).limit(1000)
  return { visitas: (data ?? []) as VisitaSupervision[], error }
}

/** Requerimientos (los más nuevos primero). visitaId: solo los que nacieron en esa visita. */
export async function cargarRequerimientos(supabase: SupabaseClient, visitaId?: string) {
  let q = supabase.from('supervision_requerimientos').select('*').order('created_at', { ascending: false }).limit(1000)
  if (visitaId) q = q.eq('visita_id', visitaId)
  const { data, error } = await q
  return { requerimientos: (data ?? []) as RequerimientoSupervision[], error }
}

/** Equipos entregados a mayoristas, con su historial (lo más nuevo primero), y los parámetros. */
export async function cargarEquipos(supabase: SupabaseClient) {
  const [eq, mov, par] = await Promise.all([
    supabase.from('supervision_equipos').select('*').order('created_at'),
    supabase.from('supervision_equipos_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('supervision_parametros').select('clave, valor, descripcion'),
  ])
  return {
    equipos: (eq.data ?? []) as EquipoSupervision[],
    movimientos: (mov.data ?? []) as MovimientoEquipo[],
    parametros: (par.data ?? []) as ParametroSupervision[],
    error: eq.error ?? mov.error ?? par.error,
  }
}

/** Nombre del usuario y si es admin (solo admin borra visitas; la RLS lo hace cumplir). */
export async function cargarUsuario(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('nombre, rol').eq('id', userId).single()
  return { nombre: (data?.nombre as string | undefined) ?? '', esAdmin: data?.rol === 'admin' }
}
